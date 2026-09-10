import * as THREE from 'three';
import { CelestialBody, BodyType, PhysicsEvent, WaveEvent } from '../types';
import {
  G_CONSTANT,
  COLLISION_PHYSICS,
  EVOLUTION_THRESHOLDS,
  BODY_CONFIGS,
  LUMINOUS_TYPES,
  TERRESTRIAL_TYPES,
} from '../constants';
import {
  albedoFromComposition,
  auToDist,
  bulkDensityGcm3,
  circularOrbitalSpeed,
  distToAU,
  distToKm,
  equilibriumTemperatureFromLuminosity,
  escapeVelocityKms,
  kmToDist,
  luminositySolarFromMass,
  M_SUN_IN_EARTH,
  orbitalPeriodYears,
  R_EARTH_KM,
  surfaceGravitySi,
  visualRadiusFromKm,
} from './units';
import {
  applyDerivedState,
  classifyBody,
  deriveBodyState,
  mixtureDensity,
  terrestrialRadiusKm,
} from './bodyDerivation';
import { isSatellite } from './moonSystem';
import { scratchV2, scratchV3 } from './scratchVectors';
import { PHYSICS_LIMITS, clampMass, clampRadius, clampRadiusKm } from './physicsBounds';
import { MAX_SPIN_PARAMETER } from './relativity';
import {
  CONTACT_FRACTION,
  classifyImpact,
  planFragmentation,
  spawnFragments,
} from './collisionOutcome';

const isValidBody = (b: CelestialBody | null | undefined): b is CelestialBody => {
  return b != null &&
    b.position != null &&
    b.velocity != null &&
    typeof b.mass === 'number' &&
    Number.isFinite(b.mass) &&
    typeof b.radius === 'number' &&
    Number.isFinite(b.radius) &&
    // radiusKm is the sole input to pairSofteningSq; a non-finite one used to
    // NaN-poison every pair it appeared in.
    typeof b.radiusKm === 'number' &&
    Number.isFinite(b.radiusKm);
};

// --- Astrophysics Helpers ---
//
// The mass-radius / mass-luminosity relations themselves live in
// `utils/bodyDerivation.ts`; this module owns the dynamics and the
// system-level passes that use them.

/**
 * Full derived state for a terrestrial body from mass (M⊕) and composition.
 * Returns the physical radius in km alongside the visual radius, so callers
 * cannot accidentally mix the two.
 */
export const calculatePlanetaryPhysics = (
    type: BodyType,
    mass: number,
    compIron: number,
    compSil: number,
    compWater: number,
) => {
    const radiusKm = clampRadiusKm(terrestrialRadiusKm(mass, compIron, compSil, compWater));
    return {
        radiusKm,
        radius: clampRadius(visualRadiusFromKm(type, radiusKm)),
        bulkDensity: bulkDensityGcm3(mass, radiusKm),
        surfaceGravity: surfaceGravitySi(mass, radiusKm),
        escapeVelocity: escapeVelocityKms(mass, radiusKm),
    };
};

/** Uncompressed mixture density (g/cm³) for a composition. */
export const compositionDensity = mixtureDensity;

/** Derived geophysics when the user pins a physical radius directly. */
export const derivedPropertiesFromMassRadiusKm = (mass: number, radiusKm: number) => ({
    bulkDensity: bulkDensityGcm3(mass, radiusKm),
    surfaceGravity: surfaceGravitySi(mass, radiusKm),
    escapeVelocity: escapeVelocityKms(mass, radiusKm),
});

/** Radius, temperature, colour and luminosity for a self-luminous body. */
export const deriveStarProperties = (massEarth: number, type: BodyType = 'Star') => {
    const d = deriveBodyState(type, massEarth);
    const { r, g, b } = kelvinToRgb(d.temperature);
    return {
        radiusKm: d.radiusKm,
        radius: d.radius,
        temperature: d.temperature,
        color: rgbToHex(r, g, b),
        luminositySolar: d.luminositySolar,
    };
};

/**
 * Refresh every derived quantity on a body after a load or an edit, including
 * re-classifying it if its mass has moved outside what its type permits.
 */
export const reconcileBodyDerivedState = (body: CelestialBody): void => {
    if (!body) return;
    applyDerivedState(body);
    body.radius = clampRadius(body.radius);
    body.radiusKm = clampRadiusKm(body.radiusKm);
    if (LUMINOUS_TYPES.includes(body.type) && body.temperature > 0) {
        const { r, g, b } = kelvinToRgb(body.temperature);
        body.color = rgbToHex(r, g, b);
    }
};

/** Primary star for camera framing and hierarchy (prefers explicit selection). */
export const findPrimaryStar = (
  bodies: CelestialBody[],
  selectedId?: string | null,
): CelestialBody | null => {
  if (!bodies?.length) return null;
  if (selectedId) {
    const selected = bodies.find((b) => b.id === selectedId);
    if (selected) return selected;
  }
  return (
    bodies.find((b) => b.type === 'Star' || b.type === 'Red Giant') ??
    bodies[0] ??
    null
  );
};

// --- KEPLERIAN ORBIT MECHANICS ---

/**
 * Minimum mass ratio for one body to be considered the gravitational parent of
 * another. Ten is a conservative stand-in for the Hill-sphere criterion: below
 * it the pair is better described as a binary than as a primary and satellite.
 */
export const PARENT_DOMINANCE_RATIO = 10;

/**
 * The single definition of "is `candidate` a valid parent for `body`". Shared by
 * `findDominantParent` and `fillParentMap` so the two can never disagree.
 */
const parentInfluence = (body: CelestialBody, candidate: CelestialBody): number => {
    if (candidate.id === body.id) return 0;
    if (candidate.mass < body.mass * PARENT_DOMINANCE_RATIO) return 0;
    const distSq = body.position.distanceToSquared(candidate.position);
    if (!(distSq > 1e-9)) return 0;
    return candidate.mass / distSq;   // ∝ gravitational pull
};

export const findDominantParent = (body: CelestialBody, bodies: CelestialBody[]): CelestialBody | null => {
    // An explicit hierarchy (a moon bound to its planet) always wins over the
    // mass/distance heuristic.
    if (body.parentId) {
        for (let i = 0; i < bodies.length; i++) {
            if (bodies[i].id === body.parentId) return bodies[i];
        }
    }
    let bestParent: CelestialBody | null = null;
    let maxInfluence = 0;
    for (let i = 0; i < bodies.length; i++) {
        const influence = parentInfluence(body, bodies[i]);
        if (influence > maxInfluence) {
            maxInfluence = influence;
            bestParent = bodies[i];
        }
    }
    return bestParent;
};

/**
 * Build an id → parent map for every body in one O(N²) pass.
 * Hot-loop callers should reuse `map` via `fillParentMap` instead of allocating each frame.
 */
export const fillParentMap = (
  bodies: CelestialBody[],
  map: Map<string, CelestialBody | null>,
): void => {
  map.clear();
  if (!bodies || bodies.length === 0) return;
  for (let i = 0; i < bodies.length; i++) {
    map.set(bodies[i].id, findDominantParent(bodies[i], bodies));
  }
};

export const buildParentMap = (bodies: CelestialBody[]): Map<string, CelestialBody | null> => {
  const map = new Map<string, CelestialBody | null>();
  fillParentMap(bodies, map);
  return map;
};

export const getOrbitalElements = (body: CelestialBody, parent: CelestialBody) => {
    // Standard gravitational parameter of the RELATIVE two-body orbit,
    // μ = G(M_parent + M_body). Using the parent's mass alone is a good
    // approximation for a planet around a star (Earth contributes 3 parts per
    // million) but badly wrong for a comparable-mass pair: for Alpha Centauri
    // A-B it understates μ by 46%, which makes a bound binary look hyperbolic.
    const mu = G_CONSTANT * (parent.mass + body.mass);
    const rVec = body.position.clone().sub(parent.position);
    const vVec = body.velocity.clone().sub(parent.velocity);
    
    const r = rVec.length();
    const v = vVec.length();

    if (r < 1e-6 || !Number.isFinite(mu) || mu <= 0) {
      return { a: 0, e: 0, i: 0, Omega: 0, omega: 0, nu: 0 };
    }
    
    // Angular Momentum h = r x v
    const hVec = new THREE.Vector3().crossVectors(rVec, vVec);
    const h = hVec.length();

    if (h < 1e-9) {
      return { a: r, e: 0, i: 0, Omega: 0, omega: 0, nu: 0 };
    }
    
    // Eccentricity vector e
    // e = ( (v^2 - mu/r)*r - (r.v)*v ) / mu
    const term1 = rVec.clone().multiplyScalar(v * v - mu / r);
    const term2 = vVec.clone().multiplyScalar(rVec.dot(vVec));
    const eVec = term1.sub(term2).divideScalar(mu);
    const e = eVec.length();
    
    // Mechanical Energy E = v^2/2 - mu/r = -mu / 2a
    const energy = (v * v) / 2 - mu / r;
    let a = -mu / (2 * energy);
    
    // Y-UP coordinate system adjustments:
    // Reference plane is XZ (Ecliptic). Normal is Y (0,1,0).
    // Inclination i = angle between hVec and Y-axis
    const i = Math.acos(Math.max(-1, Math.min(1, hVec.y / h))); // 0 to PI
    
    // Node Vector n = Y x h = (0,1,0) x (hx, hy, hz) = (hz, 0, -hx)
    const nVec = new THREE.Vector3(hVec.z, 0, -hVec.x);
    const n = nVec.length();
    
    // Longitude of Ascending Node Omega (angle between Reference X (1,0,0) and n)
    // cos Omega = nx / n
    let Omega = 0;
    if (n > 0.00001) {
        Omega = Math.acos(Math.max(-1, Math.min(1, nVec.x / n)));
        if (nVec.z > 0) Omega = 2 * Math.PI - Omega; // Quadrant check
    }
    
    // Argument of Periapsis omega (angle between n and e)
    // cos omega = n.e / (n*e)
    let omega = 0;
    if (n > 0.00001 && e > 0.00001) {
        const dot = nVec.dot(eVec);
        omega = Math.acos(Math.max(-1, Math.min(1, dot / (n * e))));
        if (eVec.y < 0) omega = 2 * Math.PI - omega; // eVec points below plane?
    }
    
    if (n <= 0.00001 && e > 0.00001) {
        omega = Math.atan2(-eVec.z * Math.sign(hVec.y), eVec.x);
        if (omega < 0) omega += 2 * Math.PI;
    }

    // True anomaly nu (angle between e and r).
    //
    // For a near-circular orbit the eccentricity vector is numerically
    // meaningless, so the standard degenerate-case handling applies: fall back
    // to the argument of latitude (angle from the ascending node) when the
    // orbit is inclined, or to the true longitude when it is also equatorial.
    // The pre-2.0 code returned 0 here, silently discarding the body's phase
    // and making the Orbit tab snap circular orbits back to periapsis.
    let nu = 0;
    if (e > 1e-5) {
        const dot = eVec.dot(rVec);
        nu = Math.acos(Math.max(-1, Math.min(1, dot / (e * r))));
        if (rVec.dot(vVec) < 0) nu = 2 * Math.PI - nu;
    } else if (n > 1e-5) {
        // Argument of latitude u = angle from ascending node to position.
        nu = Math.acos(Math.max(-1, Math.min(1, nVec.dot(rVec) / (n * r))));
        if (rVec.y < 0) nu = 2 * Math.PI - nu;
    } else {
        // Circular and equatorial: true longitude, measured from +X in the
        // reference plane. Z is negated because the ecliptic is the XZ plane
        // with +Y as the orbit normal.
        nu = Math.atan2(-rVec.z * Math.sign(hVec.y), rVec.x);
        if (nu < 0) nu += 2 * Math.PI;
    }
    
    return { 
        a, // Semi-major axis
        e, // Eccentricity
        i: i * (180/Math.PI), // deg
        Omega: Omega * (180/Math.PI), // deg
        omega: omega * (180/Math.PI), // deg
        nu: nu * (180/Math.PI) // deg
    };
};

export const calculateOrbitalState = (
    parent: CelestialBody,
    a: number,
    e: number,
    iDeg: number,
    OmegaDeg: number,
    omegaDeg: number,
    nuDeg: number,
    /** Mass of the orbiting body; included in μ so the inverse of
     *  `getOrbitalElements` is exact for comparable-mass pairs. */
    bodyMass = 0,
) => {
    const mu = G_CONSTANT * (parent.mass + bodyMass);
    const safeA = Math.max(1e-3, Math.abs(a));
    const safeE = Math.max(0, Math.min(0.999, e));
    const p = safeA * (1 - safeE * safeE);

    if (!Number.isFinite(mu) || mu <= 0 || p <= 1e-6) {
      return {
        position: parent.position.clone(),
        velocity: parent.velocity.clone(),
      };
    }
    
    // Convert to Radians
    const i = iDeg * (Math.PI / 180);
    const Omega = OmegaDeg * (Math.PI / 180);
    const omega = omegaDeg * (Math.PI / 180);
    const nu = nuDeg * (Math.PI / 180);
    
    // 1. Position/Velocity in Perifocal Frame (PQW)
    const r = p / (1 + safeE * Math.cos(nu));
    
    // Position in orbital plane
    // P points to periapsis, Q is 90deg in plane
    const rPQW = new THREE.Vector3(r * Math.cos(nu), r * Math.sin(nu), 0);
    
    // Velocity in orbital plane
    // v = sqrt(mu/p) * [-sin(nu), e + cos(nu), 0]
    const vScale = Math.sqrt(mu / p);
    const vPQW = new THREE.Vector3(
        -Math.sin(nu),
        safeE + Math.cos(nu),
        0
    ).multiplyScalar(vScale);
    
    // 2. Rotation Matrices (3-1-3 sequence for Omega, i, omega)
    
    const applyRotations = (vec: THREE.Vector3) => {
        // Step 1: Rotate by omega around Z
        const xw = vec.x * Math.cos(omega) - vec.y * Math.sin(omega);
        const yw = vec.x * Math.sin(omega) + vec.y * Math.cos(omega);
        const zw = 0;
        
        // Step 2: Rotate by i around X (Line of Nodes)
        const xi = xw;
        const yi = yw * Math.cos(i);
        const zi = yw * Math.sin(i);
        
        // Step 3: Rotate by Omega around Z (The "North Pole")
        const xf = xi * Math.cos(Omega) - yi * Math.sin(Omega);
        const yf = xi * Math.sin(Omega) + yi * Math.cos(Omega);
        const zf = zi;
        
        // Now swap to Y-Up (Three.js default)
        // Ecliptic is XZ. So Standard X,Y (plane) -> Three X,Z. Standard Z (height) -> Three Y.
        return new THREE.Vector3(xf, zf, -yf); // Valid mapping for Y-up normal
    };
    
    const posOffset = applyRotations(rPQW);
    const velOffset = applyRotations(vPQW);
    
    return {
        position: parent.position.clone().add(posOffset),
        velocity: parent.velocity.clone().add(velOffset)
    };
};

/**
 * Hill sphere and Roche limit.
 *
 * Both are returned twice. The `*Km` values are physically true and are what
 * the Inspector displays. The `hill`/`roche` values are in *visual* units for
 * the stability overlay: because bodies are drawn ~1470× larger than life, a
 * true-scale Roche limit would be drawn deep inside its own planet. Scaling the
 * Roche limit through the same visual mapping as the body keeps the ratio
 * between the two correct on screen, which is what the overlay communicates.
 * The Hill sphere is an orbital-scale quantity and is drawn true to scale.
 */
export const calculateStabilityMetrics = (body: CelestialBody, parent: CelestialBody | null) => {
    if (!parent || !(parent.mass > 0)) {
        return { roche: 0, hill: 0, rocheKm: 0, hillKm: 0 };
    }

    // Hill radius r_H = a(1−e)·∛(m / 3M). The pre-2.0 code used the
    // instantaneous separation, which overestimates it for eccentric orbits;
    // the periapsis distance is the correct conservative choice.
    const elements = getOrbitalElements(body, parent);
    const periapsis =
        elements.a > 0 && elements.e < 1
            ? elements.a * (1 - elements.e)
            : body.position.distanceTo(parent.position);
    const hillUnits = periapsis * Math.cbrt(body.mass / (3 * parent.mass));

    // Fluid Roche limit d = 2.44·R·∛(ρ_M/ρ_m) for a satellite orbiting THIS
    // body. The satellite density is taken from a representative icy/rocky
    // moon rather than assumed, and the primary's radius is its true one.
    const primaryDensity = body.properties?.bulkDensity ?? bulkDensityGcm3(body.mass, body.radiusKm);
    const satelliteDensity = 1.9;   // typical icy-rocky moon (Europa 3.0, Tethys 1.0)
    const ratio = Math.cbrt(Math.max(primaryDensity, 1e-6) / satelliteDensity);
    const rocheKm = 2.44 * body.radiusKm * ratio;

    return {
        roche: visualRadiusFromKm(body.type, rocheKm),
        hill: hillUnits,
        rocheKm,
        hillKm: distToKm(hillUnits),
    };
};

/**
 * Time for a satellite's rotation to become tidally locked to its parent, in
 * years, from the standard despinning timescale (Gladman et al. 1996):
 *
 *   t_lock ≈ (ω a⁶ I Q) / (3 G M_p² k₂ R⁵)
 *
 * with I = 0.4 m R² for a uniform sphere. Q (tidal dissipation quality factor)
 * and k₂ (Love number) are material properties; rocky-body values Q ≈ 100 and
 * k₂ ≈ 0.3 are used. Unlike the pre-2.0 version this has no invented scale
 * factor — everything is in SI internally and the answer comes out in years.
 *
 * Sanity: the Moon at its present orbit locks in ~10⁷ yr, and an Earth-mass
 * planet at 0.05 AU around an M dwarf locks in well under 10⁹ yr, both of which
 * match the literature to within the order of magnitude this formula claims.
 */
export const calculateTidalLockTime = (body: CelestialBody, parent: CelestialBody | null): number => {
    if (!parent || !(parent.mass > 0) || !(body.mass > 0)) return Infinity;
    if (body.type === 'Black Hole' || body.type === 'Neutron Star' || body.type === 'Pulsar') {
        return Infinity;
    }

    const G = 6.6743e-11;
    const M_EARTH = 5.9722e24;
    const aM = distToKm(body.position.distanceTo(parent.position)) * 1000;
    const rM = body.radiusKm * 1000;
    const mKg = body.mass * M_EARTH;
    const mParentKg = parent.mass * M_EARTH;
    if (!(aM > 0) || !(rM > 0)) return Infinity;

    // Initial spin: use the body's rotation period if set, else 12 h.
    const periodHours = body.properties?.rotationPeriod ?? 12;
    const omega = (2 * Math.PI) / (Math.max(periodHours, 0.01) * 3600);

    const Q = 100;      // tidal dissipation quality factor (rocky)
    const k2 = 0.3;     // second-degree Love number (rocky)
    const inertia = 0.4 * mKg * rM * rM;

    const numerator = omega * Math.pow(aM, 6) * inertia * Q;
    const denominator = 3 * G * mParentKg * mParentKg * k2 * Math.pow(rM, 5);
    if (!(denominator > 0)) return Infinity;

    const seconds = numerator / denominator;
    return seconds / 3.15576e7;   // → years
};

export const kelvinToRgb = (k: number): { r: number, g: number, b: number } => {
    // Clamped to the range the Tanner Helland fit is defined over, matching the
    // GLSL `blackbody` in components/Planet/PlanetShaders.ts exactly. Without
    // this the two diverge outside 1000-40000 K — log(temp) goes negative below
    // 1000 K and clamps green to 0 — so a star's pointLight would stop matching
    // the colour of its own disc. utils/bodyAppearance.test.ts pins the match.
    const temp = Math.max(1000, Math.min(40000, k)) / 100;
    let r, g, b;

    if (temp <= 66) {
        r = 255;
        g = 99.4708025861 * Math.log(temp) - 161.1195681661;
        if (temp <= 19) {
            b = 0;
        } else {
            b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
        }
    } else {
        r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
        g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
        b = 255;
    }
    
    return {
        r: Math.max(0, Math.min(255, r)),
        g: Math.max(0, Math.min(255, g)),
        b: Math.max(0, Math.min(255, b))
    };
};

export const rgbToHex = (r: number, g: number, b: number): string => {
    return "#" + ((1 << 24) + (Math.round(r) << 16) + (Math.round(g) << 8) + Math.round(b)).toString(16).slice(1);
};

export const getSpectralType = (temp: number): string => {
    if (temp >= 30000) return 'O'; // Blue
    if (temp >= 10000) return 'B'; // Blue-white
    if (temp >= 7500) return 'A';  // White
    if (temp >= 6000) return 'F';  // Yellow-white
    if (temp >= 5200) return 'G';  // Yellow
    if (temp >= 3700) return 'K';  // Orange
    return 'M';                    // Red
};

/**
 * Per-pair Plummer softening ε², in L*².
 *
 * Softening exists to regularise the 1/r² singularity when two bodies nearly
 * coincide. The physically meaningful length for that is the pair's actual
 * size — inside a body the enclosed mass drops and the force falls off, which
 * Plummer softening with ε ≈ R approximates. So ε is the sum of the two
 * *physical* radii, converted to simulation length units.
 *
 * This matters a great deal. The pre-2.0 engine used a flat ε² = 0.1, i.e.
 * ε ≈ 1.2 million km — three times the Earth-Moon distance — so any tightly
 * bound pair had most of its gravity silently cancelled. Using the *visual*
 * radii instead would be nearly as bad in the other direction: a star is drawn
 * at 12 L* against a 40 L* orbit, which would perturb a 1 AU orbit's period by
 * ~2%. With physical radii the correction at 1 AU is 2 × 10⁻⁵ — invisible —
 * while still keeping acceleration finite at contact.
 *
 * Costs two multiplies and an add per pair; no allocation.
 */
const SOFTENING_FLOOR_SQ = 1e-8;

export const pairSofteningSq = (a: CelestialBody, b: CelestialBody): number => {
  // Newtonian point masses outside physical contact for scientific presets.
  if (a.properties?.physicalCollisions || b.properties?.physicalCollisions) return SOFTENING_FLOOR_SQ;
  // Defensive on radiusKm specifically: this runs N²/2 times per step and its
  // result is added to every pair's distSq, so ONE body with a missing or
  // non-finite radiusKm used to turn the entire acceleration buffer into NaN —
  // which clampBodiesInPlace then repaired by zeroing every velocity and
  // collapsing every position to the origin. Falling back to the floor keeps
  // the pair merely unsoftened instead of poisoning the whole system.
  const s = kmToDist((a.radiusKm ?? 0) + (b.radiusKm ?? 0));
  return Number.isFinite(s) ? s * s + SOFTENING_FLOOR_SQ : SOFTENING_FLOOR_SQ;
};

// Reused acceleration buffer to avoid per-step allocations in the hot physics path.
let gravityAccelBuffer = new Float32Array(0);

const ensureGravityBufferSize = (bodyCount: number) => {
  const required = bodyCount * 3;
  if (gravityAccelBuffer.length < required) {
    gravityAccelBuffer = new Float32Array(required);
  } else {
    gravityAccelBuffer.fill(0, 0, required);
  }
};

export const calculateGravityInPlace = (bodies: CelestialBody[], Gt: number): CelestialBody[] => {
  if (!bodies || bodies.length === 0) return [];
  if (!isFinite(Gt) || Gt === 0) return bodies;

  const validBodies = bodies.filter(isValidBody);
  const len = validBodies.length;
  if (len === 0) return validBodies;

  ensureGravityBufferSize(len);

  // Compute accelerations first, then apply to velocities/positions.
  // This keeps integration stable while reusing one typed buffer per step.
  for (let i = 0; i < len; i++) {
    const b1 = validBodies[i];
    const base = i * 3;
    let ax = 0, ay = 0, az = 0;

    for (let j = 0; j < len; j++) {
      if (i === j) continue;
      const b2 = validBodies[j];
      const dx = b2.position.x - b1.position.x;
      const dy = b2.position.y - b1.position.y;
      const dz = b2.position.z - b1.position.z;
      const distSq = dx * dx + dy * dy + dz * dz + pairSofteningSq(b1, b2);
      const invDist = 1 / Math.sqrt(distSq);
      const force = (G_CONSTANT * b2.mass) / distSq;

      ax += dx * invDist * force;
      ay += dy * invDist * force;
      az += dz * invDist * force;
    }

    gravityAccelBuffer[base] = ax;
    gravityAccelBuffer[base + 1] = ay;
    gravityAccelBuffer[base + 2] = az;
  }

  for (let i = 0; i < len; i++) {
    const b = validBodies[i];
    const base = i * 3;
    b.velocity.x += gravityAccelBuffer[base] * Gt;
    b.velocity.y += gravityAccelBuffer[base + 1] * Gt;
    b.velocity.z += gravityAccelBuffer[base + 2] * Gt;
    b.position.addScaledVector(b.velocity, Gt);
  }

  return validBodies;
};

export const calculateGravity = (bodies: CelestialBody[],Gt: number): CelestialBody[] => {
  if (!bodies || bodies.length === 0) return [];
  if (!isFinite(Gt) || Gt === 0) return bodies;

  // Clone to avoid mutation of current state during calculation
  const nextState: CelestialBody[] = bodies
    .filter(isValidBody)
    .map(b => ({
      ...b,
      position: b.position.clone(),
      velocity: b.velocity.clone()
    }));

  // Backward-compatible immutable wrapper for UI/state callers.
  // The actual integration is delegated to the in-place optimized variant.
  return calculateGravityInPlace(nextState, Gt);
};

const _collisionRemove = new Set<string>();
/**
 * Fragments created during the current scan. They are appended to the live array
 * while the outer loop is still running, so without this the very first shatter
 * would cascade: the loop would reach its own debris and collide it against the
 * remnant it just spawned around.
 */
const _spawnedThisScan = new Set<string>();

export const checkCollisions = (bodies: CelestialBody[], _time: number): { active: CelestialBody[], merged: boolean, events: PhysicsEvent[], waveEvents: WaveEvent[] } => {
  const events: PhysicsEvent[] = [];
  const waveEvents: WaveEvent[] = [];
  const merged = scanCollisionsInPlace(bodies, events, waveEvents);
  return { active: bodies || [], merged, events, waveEvents };
};

/** Fragments per impact when the caller does not supply a device-tier budget. */
export const DEFAULT_MAX_FRAGMENTS = 6;

/**
 * Allocation-free collision scan when callers provide reusable event sinks.
 *
 * `dt` is the SIGNED length of the step that has just been integrated. When it is
 * non-zero the contact test is swept over that step rather than sampled at its
 * endpoint — see the comment on the test itself. Passing 0 (the default, and what
 * the immutable `checkCollisions` wrapper does) degenerates to the old endpoint
 * test exactly.
 *
 * `maxFragments` caps how many debris bodies a single destructive impact may
 * create; callers pass their device tier's budget.
 */
export const scanCollisionsInPlace = (
  bodies: CelestialBody[],
  events: PhysicsEvent[],
  waveEvents: WaveEvent[],
  dt: number = 0,
  maxFragments: number = DEFAULT_MAX_FRAGMENTS,
): boolean => {
  if (!bodies || !Array.isArray(bodies) || bodies.length === 0) {
    return false;
  }

  // V8 may replace a Set's backing table on clear(); do not do that on the
  // overwhelmingly common empty/collision-free path.
  if (_collisionRemove.size > 0) _collisionRemove.clear();
  if (_spawnedThisScan.size > 0) _spawnedThisScan.clear();
  const step = Number.isFinite(dt) ? dt : 0;

  for (let i = 0; i < bodies.length; i++) {
    const b1 = bodies[i];
    if (!isValidBody(b1) || _collisionRemove.has(b1.id) || _spawnedThisScan.has(b1.id)) continue;
    // Satellites on Kepler rails never collide. Their true orbital radius is
    // far smaller than their parent's *drawn* radius — the Moon orbits at 0.10
    // length units while Earth is drawn at 2.5 — so contact tests against the
    // visual radius would consume every moon on the first step. They are
    // already excluded from the integrator for the same reason; if one escapes
    // its Hill sphere it is promoted to a free body and becomes collidable.
    //
    // Contact therefore happens at the VISUAL radius, by design. Outcome
    // classification has to use the same frame of reference or it compares
    // quantities sampled ~1000× apart — see `utils/collisionOutcome.ts`.
    if (isSatellite(b1)) continue;

    for (let j = i + 1; j < bodies.length; j++) {
      const b2 = bodies[j];
      if (!isValidBody(b2) || _collisionRemove.has(b2.id) || _spawnedThisScan.has(b2.id)) continue;
      if (isSatellite(b2)) continue;

      // Swept contact test.
      //
      // The endpoint-only test this replaces is what produced the original "they
      // got close and nothing happened, then the app bugged out" bug. A pair of
      // neutron stars has a contact diameter of ~1.6 L* and a mutual escape speed
      // of ~2970 L*/yr, so at dt = 1/1024 yr they move ~2.9 L* per step and pass
      // clean through the contact sphere between two samples. No collision is
      // ever detected; instead the pass-through samples the softened 1/r² force
      // at a separation far inside contact, delivers an enormous impulse, and the
      // body is truncated to MAX_VELOCITY_MAGNITUDE — which is not energy
      // conserving, so it can never fall back and is pinned to the position
      // envelope instead. The user sees a body vanish with no event and no VFX.
      //
      // Verlet has already advanced both bodies, so reconstruct the segment
      // backwards from the endpoint and take the true minimum separation over it:
      //   r(u) = r0 − u·w,  u ∈ [0,1],  w = (v2 − v1)·dt
      // This is a minimum over the segment, not an inflated radius, so it adds no
      // false positives.
      const r0x = b2.position.x - b1.position.x;
      const r0y = b2.position.y - b1.position.y;
      const r0z = b2.position.z - b1.position.z;
      const rvx = b2.velocity.x - b1.velocity.x;
      const rvy = b2.velocity.y - b1.velocity.y;
      const rvz = b2.velocity.z - b1.velocity.z;
      const wx = rvx * step;
      const wy = rvy * step;
      const wz = rvz * step;

      const r0Sq = r0x * r0x + r0y * r0y + r0z * r0z;
      const wSq = wx * wx + wy * wy + wz * wz;
      const r0w = r0x * wx + r0y * wy + r0z * wz;
      let u = wSq > 0 ? r0w / wSq : 0;
      if (!(u > 0)) u = 0; else if (u > 1) u = 1;
      const minSepSq = r0Sq - 2 * u * r0w + u * u * wSq;
      if (!Number.isFinite(minSepSq)) continue;

      const physicalContact = b1.properties?.physicalCollisions || b2.properties?.physicalCollisions;
      const contactRadius = physicalContact
        ? kmToDist(b1.radiusKm + b2.radiusKm)
        : CONTACT_FRACTION * (b1.radius + b2.radius);
      if (minSepSq >= contactRadius * contactRadius) continue;

      const totalMass = b1.mass + b2.mass;
      if (totalMass <= 0 || !Number.isFinite(totalMass)) {
        // Degenerate pair. Removing a body with no event is what let one
        // disappear with nothing on screen; always report it.
        _collisionRemove.add(b2.id);
        events.push({
          type: 'collision',
          outcome: 'merge',
          mass: b2.mass,
          position: b2.position.clone(),
          velocity: b2.velocity.clone(),
          radius: contactRadius,
        });
        continue;
      }

      const relSpeed = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
      const cls = classifyImpact(b1, b2, relSpeed, contactRadius);
      const survivor = cls.primary;
      const consumed = cls.secondary;

      const invTotalMass = 1 / totalMass;

      scratchV2
        .set(b1.velocity.x, b1.velocity.y, b1.velocity.z)
        .multiplyScalar(b1.mass)
        .addScaledVector(b2.velocity, b2.mass)
        .multiplyScalar(invTotalMass);

      scratchV3
        .set(b1.position.x, b1.position.y, b1.position.z)
        .multiplyScalar(b1.mass)
        .addScaledVector(b2.position, b2.mass)
        .multiplyScalar(invTotalMass);

      const productMass = cls.productMass;
      if (
        !Number.isFinite(productMass) ||
        !Number.isFinite(scratchV2.x) ||
        !Number.isFinite(scratchV3.x)
      ) {
        _collisionRemove.add(consumed.id);
        events.push({
          type: 'collision',
          outcome: 'merge',
          mass: consumed.mass,
          position: consumed.position.clone(),
          velocity: consumed.velocity.clone(),
          radius: contactRadius,
        });
        continue;
      }

      // Momentum is conserved exactly (the barycentric velocity above). The mass
      // deficit is energy radiated away by the merger rather than matter that
      // silently disappears, so it is reported as an event.
      const massDeficit = totalMass - productMass;
      const consumedMass = consumed.mass;

      let outcome = cls.outcome;
      let fragmentCount = 0;

      survivor.velocity.copy(scratchV2);
      survivor.position.copy(scratchV3);

      if (outcome === 'shatter') {
        // A fragment is a body, and bodies are a hard-capped resource: the
        // gravity-grid shader uploads fixed 50-element uniform arrays and
        // sanitizeCelestialBodies truncates the tail on the next store resync.
        // The consumed body frees one slot.
        const headroom = PHYSICS_LIMITS.MAX_BODIES - bodies.length + 1;
        const plan = planFragmentation(cls, headroom, maxFragments);
        if (plan) {
          survivor.mass = plan.largestRemnantMass;
          const correction = spawnFragments(cls, plan, scratchV3, scratchV2, bodies);
          // The residual correction applies to the whole product, remnant
          // included, or total momentum would not be conserved.
          survivor.velocity.add(correction);
          fragmentCount = plan.fragmentCount;
          finaliseFragments(bodies, bodies.length - fragmentCount, survivor, scratchV3);
        } else {
          // No room for a debris field worth the name; a clean merge is the
          // honest fallback rather than half-destroying the body.
          outcome = 'merge';
          survivor.mass = productMass;
        }
      } else {
        survivor.mass = productMass;
      }

      if (outcome === 'accrete') {
        applyAccretionSpinUp(survivor, consumedMass);
      }

      // Re-derive radius, type and geophysics from the new mass rather than
      // adding volumes: a merger that crosses a burning or degeneracy threshold
      // must actually change what the body is.
      reconcileBodyDerivedState(survivor);

      _collisionRemove.add(consumed.id);

      events.push({
        type: outcome === 'shatter'
          ? 'fragmentation'
          : (outcome === 'accrete' && cls.tidalDisruption ? 'tde' : 'collision'),
        outcome,
        mass: consumedMass,
        position: scratchV3.clone(),
        velocity: scratchV2.clone(),
        radius: contactRadius,
        count: fragmentCount,
        kineticEnergy: 0.5 * ((b1.mass * b2.mass) / totalMass) * relSpeed * relSpeed,
      });
      if (massDeficit > 0) {
        events.push({
          type: 'gravitational_wave',
          position: scratchV3.clone(),
          mass: massDeficit,
          energy: massDeficit,
        });
      }

      // b1 is only tested for removal on entry to the outer loop. When b2 was the
      // heavier body, b1 is the one that just died — and continuing would keep
      // testing its stale position and stale mass against b3…bn, merging it a
      // second time and creating mass out of nothing.
      if (_collisionRemove.has(b1.id)) break;
    }
  }

  if (_collisionRemove.size === 0) {
    return _spawnedThisScan.size > 0;
  }

  let write = 0;
  for (let read = 0; read < bodies.length; read++) {
    if (!_collisionRemove.has(bodies[read].id)) {
      if (write !== read) bodies[write] = bodies[read];
      write++;
    }
  }
  bodies.length = write;

  return true;
};

/**
 * Give newly spawned fragments their derived state and make sure they are not
 * placed inside the remnant or inside each other. `spawnFragments` cannot do the
 * spacing itself because a fragment's visual radius is only known after its type
 * and mass-radius relation have been resolved.
 */
const finaliseFragments = (
  bodies: CelestialBody[],
  firstIndex: number,
  survivor: CelestialBody,
  centre: THREE.Vector3,
): void => {
  let maxFragRadius = 0;
  for (let i = firstIndex; i < bodies.length; i++) {
    reconcileBodyDerivedState(bodies[i]);
    _spawnedThisScan.add(bodies[i].id);
    if (bodies[i].radius > maxFragRadius) maxFragRadius = bodies[i].radius;
  }

  const count = bodies.length - firstIndex;
  if (count <= 0) return;

  // Clear the remnant, and keep adjacent points on the Fibonacci sphere further
  // apart than their own contact diameter so the debris does not immediately
  // re-collide with itself.
  const required = Math.max(
    CONTACT_FRACTION * (survivor.radius + maxFragRadius) * 1.25,
    0.6 * count * maxFragRadius,
  );

  for (let i = firstIndex; i < bodies.length; i++) {
    const p = bodies[i].position;
    const dx = p.x - centre.x;
    const dy = p.y - centre.y;
    const dz = p.z - centre.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(d > 0) || d >= required) continue;
    const k = required / d;
    p.set(centre.x + dx * k, centre.y + dy * k, centre.z + dz * k);
  }
};

/**
 * Accreted mass carries angular momentum, so a hole that eats something spins up
 * and its disk brightens. The 0.15 coefficient is illustrative rather than
 * derived — the accreted material's actual specific angular momentum depends on
 * the geometry of the encounter, which the sim does not track. The spin is
 * clamped to the Thorne limit (a* = 0.998) by `sanitizeProperties`; that ceiling
 * IS physical, since photons captured from the disk cap accretion-driven spin.
 *
 * `reconcileBodyDerivedState` re-derives the horizon from mass and spin
 * afterwards, so the drawn horizon grows on accretion with no rendering changes.
 */
const applyAccretionSpinUp = (hole: CelestialBody, consumedMass: number): void => {
  if (hole.type !== 'Black Hole' || !(hole.mass > 0)) return;
  const props = hole.properties ?? (hole.properties = {});
  const spin = props.spinParameter ?? 0;
  props.spinParameter = Math.min(
    MAX_SPIN_PARAMETER,
    spin + 0.15 * (consumedMass / hole.mass),
  );
  props.accretionRate = Math.min(1, (props.accretionRate ?? 0) + 0.4);
};

/**
 * Re-derive every body's classification against the real physical thresholds
 * (deuterium burning, hydrogen burning, Chandrasekhar, TOV) and raise an event
 * when one changes. A star above the core-collapse threshold additionally
 * undergoes a supernova, keeping only its remnant mass.
 */
export const checkEvolution = (bodies: CelestialBody[]): { bodies: CelestialBody[], events: PhysicsEvent[] } => {
  const events: PhysicsEvent[] = [];
  checkEvolutionInPlace(bodies, events);
  return { bodies, events };
};

/** Allocation-free evolution scan when the caller owns the event buffer. */
export const checkEvolutionInPlace = (bodies: CelestialBody[], events: PhysicsEvent[]): void => {

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b) continue;

    // Core collapse: a massive star sheds most of its envelope and leaves a
    // neutron star or a black hole depending on where the remnant mass lands.
    if ((b.type === 'Star' || b.type === 'Red Giant') && b.mass > EVOLUTION_THRESHOLDS.CORE_COLLAPSE) {
      // Iron cores of core-collapse progenitors are ~1.4-2.5 M☉ almost
      // independently of the progenitor mass; the rest is ejected.
      const remnantMass = clampMass(
        Math.min(b.mass * 0.15, 3 * M_SUN_IN_EARTH),
      );
      const remnantType: BodyType =
        remnantMass > EVOLUTION_THRESHOLDS.TOV ? 'Black Hole' : 'Neutron Star';
      events.push({ type: 'supernova', position: b.position.clone(), radius: 50 });
      events.push({ type: 'evolution', bodyType: remnantType, position: b.position.clone() });
      b.type = remnantType;
      b.mass = remnantMass;
      b.texture = remnantType === 'Black Hole' ? 'solid' : 'neutron';
      b.trailColor = remnantType === 'Black Hole' ? '#333' : '#60a5fa';
      b.color = BODY_CONFIGS[remnantType].defaultColor;
      reconcileBodyDerivedState(b);
      continue;
    }

    const nextType = classifyBody(b.type, b.mass);
    if (nextType !== b.type) {
      events.push({ type: 'evolution', bodyType: nextType, position: b.position.clone() });
      b.type = nextType;
      b.color = BODY_CONFIGS[nextType].defaultColor;
      reconcileBodyDerivedState(b);
    }
  }

};

export const generateSystem = (): CelestialBody[] => {
  const bodies: CelestialBody[] = [];

  // A 0.6-1.6 M☉ host: the range that gives a recognisable habitable zone.
  const starMass = (0.6 + Math.random() * 1.0) * M_SUN_IN_EARTH;
  const starDerived = deriveStarProperties(starMass);
  const star: CelestialBody = {
    id: `star-${Date.now()}`,
    type: 'Star',
    mass: starMass,
    radius: starDerived.radius,
    radiusKm: starDerived.radiusKm,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    color: starDerived.color,
    texture: 'solid',
    trailColor: starDerived.color,
    temperature: starDerived.temperature,
    habitability: 'STELLAR',
    population: 0,
    name: 'Sol Prime',
    properties: {
      rotationPeriod: 25.0 * 24,
      luminositySolarDerived: starDerived.luminositySolar,
    },
  };
  bodies.push(star);

  // Semi-major axes on a Titius-Bode-like geometric progression, which is what
  // real planet spacing approximates, starting inside the habitable zone.
  const count = 4 + Math.floor(Math.random() * 5);
  let aAU = 0.35 + Math.random() * 0.4;
  for (let i = 0; i < count; i++) {
    aAU *= 1.5 + Math.random() * 0.6;
    const dist = auToDist(aAU);
    const orbitalSpeed = circularOrbitalSpeed(dist, star.mass);
    const angle = Math.random() * Math.PI * 2;

    const rand = Math.random();
    let type: BodyType = 'Planet';
    if (rand > 0.82) type = 'Gas Giant';
    else if (rand > 0.66) type = 'Ice Giant';
    else if (rand < 0.15) type = 'Dwarf';

    const config = BODY_CONFIGS[type];
    // Log-uniform within the type's range: the mass span is now orders of
    // magnitude wide, so a linear draw would cluster at the top.
    const [lo, hi] = config.massRange;
    const mass = Math.exp(Math.log(lo) + Math.random() * (Math.log(hi) - Math.log(lo)));

    const iron = 0.25 + Math.random() * 0.2;
    const sil = 0.45 + Math.random() * 0.2;
    const water = Math.max(0.05, 1 - iron - sil);

    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    const vel = new THREE.Vector3(-Math.sin(angle) * orbitalSpeed, 0, Math.cos(angle) * orbitalSpeed);

    const body: CelestialBody = {
      id: `gen-body-${i}-${Date.now()}`,
      type,
      mass,
      radius: 1,
      radiusKm: 1,
      position: pos,
      velocity: vel,
      color: config.defaultColor,
      texture: type === 'Ice Giant' ? 'ice' : type === 'Gas Giant' ? 'gas' : 'rock',
      trailColor: config.defaultColor,
      temperature: 300,
      habitability: 'N/A',
      population: 0,
      name: `${type} ${i + 1}`,
      properties: {
        compositionIron: iron,
        compositionSilicates: sil,
        compositionWater: water,
        scaleHeight: 0.12 + Math.random() * 0.18,
        haze: Math.random() * 0.25,
        atmosphere: 0.18 + Math.random() * 0.28,
        rotationPeriod: 12.0 + Math.random() * 36.0,
        obliquity: Math.random() * 40,
        isTidallyLocked: false,
      },
    };
    reconcileBodyDerivedState(body);
    bodies.push(body);
  }
  updateEquilibriumTemperatures(bodies);
  return bodies;
};

/**
 * Update equilibrium temperatures for every non-stellar body using
 * Stefan-Boltzmann against the nearest sufficiently-luminous parent
 * (Star / Red Giant / Neutron Star). Mutates `body.temperature` in place.
 *
 * Designed to be called at low rate (a few Hz, not per physics tick) from
 * the engine loop. Skips bodies whose temperatures the user has overridden
 * by giving them an explicit `body.properties.userTempOverride = true`.
 */
const STELLAR_TYPES: readonly BodyType[] = LUMINOUS_TYPES;

/**
 * Luminosity of any self-luminous body in L☉. Main-sequence stars use the
 * mass-luminosity relation; remnants use Stefan-Boltzmann on their own radius
 * and photospheric temperature, which is the only correct route for a white
 * dwarf or a neutron star (whose luminosity has nothing to do with their mass).
 */
export const bodyLuminositySolar = (b: CelestialBody): number => {
    const measured = b.properties?.luminositySolar;
    if (measured !== undefined && Number.isFinite(measured) && measured >= 0) return measured;
    if (b.type === 'Star') return luminositySolarFromMass(b.mass);
    const cached = b.properties?.luminositySolarDerived;
    if (cached !== undefined && Number.isFinite(cached)) return cached;
    return deriveBodyState(b.type, b.mass, b.properties).luminositySolar;
};

export const updateEquilibriumTemperatures = (bodies: CelestialBody[]): void => {
    if (!bodies || bodies.length === 0) return;
    const stars = bodies.filter(b => STELLAR_TYPES.includes(b.type));
    if (stars.length === 0) return;

    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (!b || STELLAR_TYPES.includes(b.type) || b.type === 'Black Hole') continue;
        if (b.properties?.userTempOverride) continue;

        // Fluxes add in a multiple-star system; luminosity overrides are
        // measurements, not estimates from the generic mass relation.
        let totalFlux = 0;
        for (let j = 0; j < stars.length; j++) {
            const s = stars[j];
            const dAU = distToAU(b.position.distanceTo(s.position));
            if (!(dAU > 1e-6)) continue;
            const L = bodyLuminositySolar(s);
            const flux = L / (dAU * dAU);
            totalFlux += flux;
        }
        if (!(totalFlux > 0)) continue;

        const props = b.properties || {};
        const albedo = props.albedo ?? albedoFromComposition(
            props.compositionIron ?? 0.3,
            props.compositionSilicates ?? 0.6,
            props.compositionWater ?? 0.1,
        );
        const greenhouse = props.atmosphere ?? 0;
        const T = equilibriumTemperatureFromLuminosity(totalFlux, 1, albedo, greenhouse);
        // Exponential smoothing so user doesn't see instant snaps
        b.temperature = isFinite(b.temperature)
            ? b.temperature * 0.85 + T * 0.15
            : T;
    }
};

/**
 * Earth Similarity Index (Schulze-Makuch et al. 2011, Astrobiology 11, 1041).
 *
 *   ESI_x    = (1 − |(x − x⊕)/(x + x⊕)|)^w_x
 *   ESI_int  = √(ESI_radius · ESI_density)
 *   ESI_surf = √(ESI_escape · ESI_temperature)
 *   ESI      = √(ESI_int · ESI_surf)
 *
 * Two things were wrong before. First, the radius term was compared against a
 * *game-unit* constant (2.5) while escape velocity was compared against a real
 * one (11.2 km/s), so the terms were on different scales. Second, the four
 * terms were combined as one flat weighted geometric mean rather than the
 * nested interior/surface form, which under-weights temperature badly: Venus
 * came out at 0.69 against its published 0.44.
 */
export const calculateESI = (body: CelestialBody): number => {
  if (!TERRESTRIAL_TYPES.includes(body.type) && body.type !== 'Ice Giant') return 0;

  const refRadiusKm = R_EARTH_KM;   // 6371 km
  const refDensity = 5.514;         // g/cm³
  const refTemp = 288.0;            // K, mean surface
  const refEscVel = 11.186;         // km/s

  const r = body.radiusKm / refRadiusKm;
  const density = (body.properties?.bulkDensity ?? bulkDensityGcm3(body.mass, body.radiusKm)) / refDensity;
  const temp = body.temperature / refTemp;
  const escVel = (body.properties?.escapeVelocity ?? escapeVelocityKms(body.mass, body.radiusKm)) / refEscVel;

  const term = (x: number, weight: number): number =>
    Math.pow(1.0 - Math.abs((x - 1.0) / (x + 1.0)), weight);

  const interior = Math.sqrt(term(r, 0.57) * term(density, 1.07));
  const surface = Math.sqrt(term(escVel, 0.70) * term(temp, 5.58));
  const esi = Math.sqrt(interior * surface);

  return Math.max(0, Math.min(1, Number.isFinite(esi) ? esi : 0));
};

export const calculateRSI = (body: CelestialBody): number => {
    // Rock Similarity Index (Extremophiles)
    if (body.type !== 'Planet' && body.type !== 'Dwarf') return 0;

    const temp = body.temperature;
    // Window: 258K - 395K. Optimal ~326K.
    const optTemp = 326.5;
    const halfWidth = (395 - 258) / 2; 
    
    // Temperature Score (Linear falloff from optimal)
    const tDiff = Math.abs(temp - optTemp);
    let tScore = 0;
    if (tDiff < halfWidth) {
        tScore = 1.0 - (tDiff / halfWidth); 
    }

    // Composition Score (Silicates & Iron vs Volatiles)
    const iron = body.properties?.compositionIron || 0;
    const sil = body.properties?.compositionSilicates || 0;
    const water = body.properties?.compositionWater || 0;
    const compScore = (iron + sil) / (iron + sil + water + 0.001); 

    return Math.max(0, Math.min(1, tScore * compScore));
};

export const calculateDrakeRange = (body: CelestialBody, starType: string) => {
  if (body.habitability === 'HABITABLE') return { low: 1, high: 10000 };
  return { low: 0, high: 0 };
};
