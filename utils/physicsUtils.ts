import * as THREE from 'three';
import { CelestialBody, BodyType, PhysicsEvent, WaveEvent } from '../types';
import { G_CONSTANT, COLLISION_PHYSICS, EVOLUTION_THRESHOLDS, BODY_CONFIGS } from '../constants';
import {
  albedoFromComposition,
  equilibriumTemperatureK,
  escapeVelocityKmsFromGame,
  distGameToAU,
  GAME_RADIUS_TO_EARTH,
  luminositySolarFromGameMass,
  massGameToEarth,
  M_EARTH_KG,
  R_EARTH_KM,
  STAR_REFERENCE_MASS_GAME,
  surfaceGravitySiFromGame,
} from './units';
import { scratchV2, scratchV3 } from './scratchVectors';
import { clampMass, clampRadius } from './physicsBounds';

const isValidBody = (b: CelestialBody | null | undefined): b is CelestialBody => {
  return b != null &&
    b.position != null &&
    b.velocity != null &&
    typeof b.mass === 'number' &&
    Number.isFinite(b.mass) &&
    typeof b.radius === 'number' &&
    Number.isFinite(b.radius);
};

// --- Astrophysics Helpers ---

// Densities in g/cm^3 (Approximate)
const DENSITY_IRON = 7.8;
const DENSITY_SILICATE = 3.3;
const DENSITY_WATER = 1.0; 

/** Game radius of a Sun-sized star at reference mass (visual/physics scale). */
const STAR_RADIUS_AT_REF_MASS = 12;

export const calculatePlanetaryPhysics = (mass: number, compIron: number, compSil: number, compWater: number) => {
    const totalVolumeFraction = (compIron / DENSITY_IRON) + (compSil / DENSITY_SILICATE) + (compWater / DENSITY_WATER);
    const bulkDensity = 1 / Math.max(totalVolumeFraction, 1e-6); // g/cm³
    const massKg = massGameToEarth(mass) * M_EARTH_KG;
    const bulkDensityKgM3 = bulkDensity * 1000;
    const volumeM3 = massKg / Math.max(bulkDensityKgM3, 1);
    const radiusM = Math.cbrt((3 * volumeM3) / (4 * Math.PI));
    const radiusGame = (radiusM / 1000) / (GAME_RADIUS_TO_EARTH * R_EARTH_KM);
    const radius = clampRadius(Math.max(0.15, radiusGame));
    return {
        radius,
        bulkDensity,
        surfaceGravity: surfaceGravitySiFromGame(mass, radius),
        escapeVelocity: escapeVelocityKmsFromGame(mass, radius),
    };
};

/** Derive bulk density (g/cm³) from game mass + radius when the user sets radius manually. */
export const densityFromMassAndRadius = (mass: number, radius: number): number => {
    const massKg = massGameToEarth(mass) * M_EARTH_KG;
    const rM = radius * GAME_RADIUS_TO_EARTH * R_EARTH_KM * 1000;
    const volumeM3 = (4 / 3) * Math.PI * Math.pow(Math.max(rM, 1), 3);
    const bulkDensityKgM3 = massKg / Math.max(volumeM3, 1);
    return bulkDensityKgM3 / 1000;
};

export const derivedPropertiesFromMassRadius = (mass: number, radius: number, bulkDensity: number) => ({
    bulkDensity,
    surfaceGravity: surfaceGravitySiFromGame(mass, radius),
    escapeVelocity: escapeVelocityKmsFromGame(mass, radius),
});

/** Main-sequence radius, temperature, and colour from game stellar mass. */
export const deriveStarProperties = (massGame: number) => {
    const x = massGame / STAR_REFERENCE_MASS_GAME;
    const rSun = x <= 0 ? 0.1 : x < 1 ? Math.pow(x, 0.8) : Math.pow(x, 0.57);
    const radius = clampRadius(Math.max(4, Math.min(180, STAR_RADIUS_AT_REF_MASS * rSun)));
    const L = Math.max(1e-8, luminositySolarFromGameMass(massGame));
    const rRatio = Math.max(0.05, radius / STAR_RADIUS_AT_REF_MASS);
    const temperature = Math.max(
        2400,
        Math.min(50000, 5778 * Math.pow(L / (rRatio * rRatio), 0.25)),
    );
    const { r, g, b } = kelvinToRgb(temperature);
    return { radius, temperature, color: rgbToHex(r, g, b), luminositySolar: L };
};

export const deriveNeutronStarRadius = (massGame: number): number =>
    Math.max(0.12, Math.min(0.55, 0.18 * Math.pow(massGame / 2000, 0.15)));

export const deriveBlackHoleRadius = (massGame: number): number =>
    Math.max(1.5, Math.min(80, STAR_RADIUS_AT_REF_MASS * Math.cbrt(massGame / 3000)));

/** Suggest a body type from mass (M⊕) and bulk density (g/cm³); null if current type is acceptable. */
export const suggestBodyType = (type: BodyType, massGame: number, bulkDensityGcm3: number): BodyType | null => {
    const m = massGameToEarth(massGame);
    if (type === 'Black Hole' || type === 'Neutron Star') return null;
    if (m < 0.5 && type !== 'Dwarf') return 'Dwarf';
    if (m >= 0.5 && m < 10 && bulkDensityGcm3 >= 2.5 && type !== 'Planet' && type !== 'Dwarf') return 'Planet';
    if (m >= 10 && m < 50 && bulkDensityGcm3 >= 1 && bulkDensityGcm3 < 3 && type !== 'Ice Giant') return 'Ice Giant';
    return null;
};

/** Refresh derived stellar/compact/terrestrial properties after load or edit. */
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

export const reconcileBodyDerivedState = (body: CelestialBody): void => {
    if (!body) return;
    const props = body.properties || {};
    if (['Planet', 'Dwarf', 'Ice Giant'].includes(body.type)) {
        const iron = props.compositionIron ?? 0.3;
        const sil = props.compositionSilicates ?? 0.6;
        const water = props.compositionWater ?? 0.1;
        if (!props.manualRadius) {
            const phys = calculatePlanetaryPhysics(body.mass, iron, sil, water);
            body.radius = clampRadius(phys.radius);
            body.properties = {
                ...props,
                bulkDensity: phys.bulkDensity,
                surfaceGravity: phys.surfaceGravity,
                escapeVelocity: phys.escapeVelocity,
            };
        } else {
            const rho = densityFromMassAndRadius(body.mass, body.radius);
            const derived = derivedPropertiesFromMassRadius(body.mass, body.radius, rho);
            body.properties = { ...props, ...derived };
        }
    } else if (body.type === 'Star' || body.type === 'Red Giant') {
        const star = deriveStarProperties(body.mass);
        body.radius = clampRadius(star.radius);
        body.temperature = star.temperature;
        body.color = star.color;
        body.properties = { ...props, luminositySolar: star.luminositySolar };
    } else if (body.type === 'Neutron Star') {
        body.radius = clampRadius(deriveNeutronStarRadius(body.mass));
    } else if (body.type === 'Black Hole') {
        body.radius = clampRadius(deriveBlackHoleRadius(body.mass));
    }
};

// --- KEPLERIAN ORBIT MECHANICS ---

export const findDominantParent = (body: CelestialBody, bodies: CelestialBody[]): CelestialBody | null => {
    let bestParent: CelestialBody | null = null;
    let maxInfluence = 0;

    for (let i = 0; i < bodies.length; i++) {
        const other = bodies[i];
        if (other.id === body.id) continue;
        // A parent must be strictly more massive than the candidate, otherwise
        // the "child" is not gravitationally dominated. Without this, two
        // similar-mass bodies would each claim the other as parent and the
        // hierarchy/UI logic breaks.
        if (other.mass <= body.mass) continue;
        const distSq = body.position.distanceToSquared(other.position);
        if (distSq < 0.1) continue;
        // Influence = Mass / Dist^2 (gravitational pull magnitude)
        const influence = other.mass / distSq;
        if (influence > maxInfluence) {
            maxInfluence = influence;
            bestParent = other;
        }
    }

    // Require clear gravitational dominance (approx. Hill-sphere criterion).
    if (bestParent && bestParent.mass < body.mass * 10) return null;

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
    const body = bodies[i];
    let bestParent: CelestialBody | null = null;
    let maxInfluence = 0;
    for (let j = 0; j < bodies.length; j++) {
      if (i === j) continue;
      const other = bodies[j];
      if (other.mass <= body.mass) continue;
      const distSq = body.position.distanceToSquared(other.position);
      if (distSq < 0.1) continue;
      const influence = other.mass / distSq;
      if (influence > maxInfluence) {
        maxInfluence = influence;
        bestParent = other;
      }
    }
    if (bestParent && bestParent.mass < body.mass * 10) bestParent = null;
    map.set(body.id, bestParent);
  }
};

export const buildParentMap = (bodies: CelestialBody[]): Map<string, CelestialBody | null> => {
  const map = new Map<string, CelestialBody | null>();
  fillParentMap(bodies, map);
  return map;
};

export const getOrbitalElements = (body: CelestialBody, parent: CelestialBody) => {
    const mu = G_CONSTANT * parent.mass;
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
    const i = Math.acos(hVec.y / h); // 0 to PI
    
    // Node Vector n = Y x h = (0,1,0) x (hx, hy, hz) = (hz, 0, -hx)
    const nVec = new THREE.Vector3(hVec.z, 0, -hVec.x);
    const n = nVec.length();
    
    // Longitude of Ascending Node Omega (angle between Reference X (1,0,0) and n)
    // cos Omega = nx / n
    let Omega = 0;
    if (n > 0.00001) {
        Omega = Math.acos(nVec.x / n);
        if (nVec.z < 0) Omega = 2 * Math.PI - Omega; // Quadrant check
    }
    
    // Argument of Periapsis omega (angle between n and e)
    // cos omega = n.e / (n*e)
    let omega = 0;
    if (n > 0.00001 && e > 0.00001) {
        const dot = nVec.dot(eVec);
        omega = Math.acos(Math.max(-1, Math.min(1, dot / (n * e))));
        if (eVec.y < 0) omega = 2 * Math.PI - omega; // eVec points below plane?
    }
    
    // True Anomaly nu (angle between e and r)
    let nu = 0;
    if (e > 0.00001) {
        const dot = eVec.dot(rVec);
        nu = Math.acos(Math.max(-1, Math.min(1, dot / (e * r))));
        if (rVec.dot(vVec) < 0) nu = 2 * Math.PI - nu;
    } else {
        // Circular orbit: use angle from node or X axis
        // Simplified: just return angle in plane
        nu = 0; 
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
    nuDeg: number
) => {
    const mu = G_CONSTANT * parent.mass;
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

export const calculateStabilityMetrics = (body: CelestialBody, parent: CelestialBody | null) => {
    if (!parent) return { roche: 0, hill: 0 };
    
    // Hill Sphere (Gravitational Dominance)
    // r_H = a (1-e) cbrt(m / 3M)
    // a(1-e) is periapsis distance. Usually simplified to just distance * cbrt(m/3M)
    const dist = body.position.distanceTo(parent.position);
    const hillRadius = dist * Math.pow(body.mass / (3 * parent.mass), 1/3);
    
    // Roche Limit (Fluid) - Where a satellite orbiting THIS body would break up
    // d = 2.44 * R * cbrt(rho_M / rho_m)
    // We assume a generic moon density ~3.3 (Silicate) if evaluating the limit OF the body.
    const bodyDensity = (body.properties?.bulkDensity || 5.5);
    const moonDensity = 3.3; 
    const rocheLimit = 2.44 * body.radius * Math.pow(bodyDensity / moonDensity, 1/3);
    
    return { roche: rocheLimit, hill: hillRadius };
};

export const calculateTidalLockTime = (body: CelestialBody, parent: CelestialBody | null) => {
    if (!parent || !['Planet', 'Dwarf', 'Ice Giant'].includes(body.type)) return Infinity;

    // t_lock ~ a^6 / (M_parent^2 * R_body^5) (Simplified proportionality)
    // We use a scaler to bring it into "Years" range for the game UI
    
    const dist = body.position.distanceTo(parent.position);
    const a = dist;
    const M = parent.mass;
    const R = body.radius;
    
    // Initial rotation speed (omega) influence is usually linear or squared,
    // here simplified as part of the constant factor assumption for the "current" state
    
    // Safety check
    if (M < 1 || R < 0.1) return Infinity;

    // Empirical scaler for game units
    const SCALER = 5000; 
    
    // Formula: (a^6 * SCALER) / (M^2 * R^5)
    // We clamp the exponent values to avoid Javascript Infinity with massive distances
    const num = Math.pow(a, 6) * SCALER;
    const den = Math.pow(M, 2) * Math.pow(R, 5);
    
    const years = num / (den + 0.001);
    
    return years;
};

export const kelvinToRgb = (k: number): { r: number, g: number, b: number } => {
    let temp = k / 100;
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
      const distSq = dx * dx + dy * dy + dz * dz + 0.1;
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

export const checkCollisions = (bodies: CelestialBody[], _time: number): { active: CelestialBody[], merged: boolean, events: PhysicsEvent[], waveEvents: WaveEvent[] } => {
  if (!bodies || !Array.isArray(bodies) || bodies.length === 0) {
    return { active: bodies || [], merged: false, events: [], waveEvents: [] };
  }

  _collisionRemove.clear();
  const events: PhysicsEvent[] = [];
  const waveEvents: WaveEvent[] = [];
  let merged = false;

  for (let i = 0; i < bodies.length; i++) {
    const b1 = bodies[i];
    if (!isValidBody(b1) || _collisionRemove.has(b1.id)) continue;

    for (let j = i + 1; j < bodies.length; j++) {
      const b2 = bodies[j];
      if (!isValidBody(b2) || _collisionRemove.has(b2.id)) continue;

      const dx = b2.position.x - b1.position.x;
      const dy = b2.position.y - b1.position.y;
      const dz = b2.position.z - b1.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!Number.isFinite(dist)) continue;

      if (dist < (b1.radius + b2.radius) * 0.8) {
        merged = true;
        const totalMass = b1.mass + b2.mass;

        if (totalMass <= 0 || !Number.isFinite(totalMass)) {
          _collisionRemove.add(b2.id);
          continue;
        }

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

        const survivor = b1.mass >= b2.mass ? b1 : b2;
        const consumed = b1.mass >= b2.mass ? b2 : b1;

        const mergedMass = clampMass(totalMass * COLLISION_PHYSICS.MERGER_EFFICIENCY);
        const mergedRadius = clampRadius(
          Math.pow(Math.pow(b1.radius, 3) + Math.pow(b2.radius, 3), 1 / 3),
        );
        if (
          !Number.isFinite(mergedMass) ||
          !Number.isFinite(scratchV2.x) ||
          !Number.isFinite(scratchV3.x) ||
          !Number.isFinite(mergedRadius)
        ) {
          _collisionRemove.add(consumed.id);
          continue;
        }
        survivor.mass = mergedMass;
        survivor.velocity.copy(scratchV2);
        survivor.position.copy(scratchV3);
        survivor.radius = mergedRadius;

        _collisionRemove.add(consumed.id);

        events.push({
          type: 'collision',
          mass: consumed.mass,
          position: scratchV3.clone(),
          velocity: scratchV2.clone(),
        });
      }
    }
  }

  if (!merged || _collisionRemove.size === 0) {
    return { active: bodies, merged: false, events, waveEvents };
  }

  let write = 0;
  for (let read = 0; read < bodies.length; read++) {
    if (!_collisionRemove.has(bodies[read].id)) {
      if (write !== read) bodies[write] = bodies[read];
      write++;
    }
  }
  bodies.length = write;

  return { active: bodies, merged: true, events, waveEvents };
};

export const checkEvolution = (bodies: CelestialBody[]): { bodies: CelestialBody[], events: PhysicsEvent[] } => {
  const events: PhysicsEvent[] = [];

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b) continue;

    if ((b.type === 'Planet' || b.type === 'Ice Giant') && b.mass > EVOLUTION_THRESHOLDS.PLANET_TO_STAR) {
      const star = deriveStarProperties(b.mass);
      events.push({ type: 'evolution', bodyType: 'Star', position: b.position.clone() });
      b.type = 'Star';
      b.color = star.color;
      b.radius = clampRadius(star.radius);
      b.temperature = star.temperature;
      b.texture = 'solid';
      b.properties = { ...b.properties, luminositySolar: star.luminositySolar };
      continue;
    }

    if ((b.type === 'Star' || b.type === 'Red Giant') && b.mass > EVOLUTION_THRESHOLDS.STAR_TO_BLACK_HOLE) {
      const config = BODY_CONFIGS['Black Hole'];
      const bhMass = clampMass(b.mass * 0.5);
      events.push({ type: 'supernova', position: b.position.clone(), radius: 50 });
      b.type = 'Black Hole';
      b.color = config.defaultColor;
      b.radius = clampRadius(deriveBlackHoleRadius(bhMass));
      b.mass = bhMass;
      b.texture = 'solid';
      b.trailColor = '#333';
    }
  }

  return { bodies, events };
};

export const generateSystem = (): CelestialBody[] => {
  const bodies: CelestialBody[] = [];
  const starConfig = BODY_CONFIGS['Star'];
  const starMass = starConfig.massRange[0] + Math.random() * 500;
  const starDerived = deriveStarProperties(starMass);
  const star: CelestialBody = {
    id: `star-${Date.now()}`,
    type: 'Star',
    mass: starMass,
    radius: starDerived.radius,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    color: starDerived.color,
    texture: 'solid',
    trailColor: starDerived.color,
    temperature: starDerived.temperature,
    habitability: 'STELLAR',
    population: 0,
    name: 'Sol Prime',
    properties: { rotationPeriod: 25.0, luminositySolar: starDerived.luminositySolar },
  };
  bodies.push(star);

  const count = 4 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
    const dist = 40 + (i * 35) + Math.random() * 20;
    const orbitalSpeed = Math.sqrt((G_CONSTANT * star.mass) / dist);
    const angle = Math.random() * Math.PI * 2;
    const rand = Math.random();
    let type: BodyType = 'Planet';
    if (rand > 0.8) type = 'Ice Giant';
    else if (rand < 0.2) type = 'Dwarf';

    const config = BODY_CONFIGS[type];
    const mass = config.massRange[0] + Math.random() * (config.massRange[1] - config.massRange[0]);
    const iron = 0.25 + Math.random() * 0.2;
    const sil = 0.45 + Math.random() * 0.2;
    const water = Math.max(0.05, 1 - iron - sil);
    const planetary = calculatePlanetaryPhysics(mass, iron, sil, water);

    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    const vel = new THREE.Vector3(-Math.sin(angle) * orbitalSpeed, 0, Math.cos(angle) * orbitalSpeed);

    bodies.push({
      id: `gen-body-${i}-${Date.now()}`,
      type: type,
      mass: mass,
      radius: planetary.radius,
      position: pos,
      velocity: vel,
      color: config.defaultColor,
      texture: type === 'Ice Giant' ? 'ice' : 'rock',
      trailColor: config.defaultColor,
      temperature: 300,
      habitability: 'N/A',
      population: 0,
      name: `${type} ${i + 1}`,
      properties: {
          compositionIron: iron,
          compositionSilicates: sil,
          compositionWater: water,
          bulkDensity: planetary.bulkDensity,
          surfaceGravity: planetary.surfaceGravity,
          escapeVelocity: planetary.escapeVelocity,
          scaleHeight: 0.12 + Math.random() * 0.18,
          haze: Math.random() * 0.25,
          atmosphere: 0.18 + Math.random() * 0.28,
          rotationPeriod: 24.0 + Math.random() * 24.0,
          isTidallyLocked: false,
      },
    });
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
const STELLAR_TYPES: BodyType[] = ['Star', 'Red Giant', 'Neutron Star'];

export const updateEquilibriumTemperatures = (bodies: CelestialBody[]): void => {
    if (!bodies || bodies.length === 0) return;
    const stars = bodies.filter(b => STELLAR_TYPES.includes(b.type));
    if (stars.length === 0) return;

    for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (!b || STELLAR_TYPES.includes(b.type) || b.type === 'Black Hole') continue;
        if (b.properties?.userTempOverride) continue;

        // Find brightest-perceived star (mass / dist²)
        let bestStar: CelestialBody | null = null;
        let bestFlux = 0;
        let bestDist = 0;
        for (let j = 0; j < stars.length; j++) {
            const s = stars[j];
            const d = b.position.distanceTo(s.position);
            if (d < 0.5) continue;
            const flux = s.mass / (d * d);
            if (flux > bestFlux) {
                bestFlux = flux;
                bestStar = s;
                bestDist = d;
            }
        }
        if (!bestStar) continue;

        const props = b.properties || {};
        const albedo = albedoFromComposition(
            props.compositionIron ?? 0.3,
            props.compositionSilicates ?? 0.6,
            props.compositionWater ?? 0.1,
        );
        const greenhouse = props.atmosphere ?? 0;
        const T = equilibriumTemperatureK(bestStar.mass, bestDist, albedo, greenhouse);
        // Exponential smoothing so user doesn't see instant snaps
        b.temperature = isFinite(b.temperature)
            ? b.temperature * 0.85 + T * 0.15
            : T;
    }
};

export const analyzePlanet = (body: CelestialBody, star: CelestialBody, _systemAge: number) => {
  if (!body || !star) return {};
  const dist = body.position.distanceTo(star.position);
  const luminosity = luminositySolarFromGameMass(star.mass);
  const distAU = Math.max(0.05, distGameToAU(dist));
  const fluxRel = luminosity / (distAU * distAU);
  const chzInner = Math.sqrt(luminosity) * 0.95 * 40;
  const chzOuter = Math.sqrt(luminosity) * 1.37 * 40;
  const isRunaway = fluxRel > 1.5;
  return { fluxRel, dist, chzInner, chzOuter, isRunaway };
};

export const calculateESI = (body: CelestialBody): number => {
  if (body.type !== 'Planet' && body.type !== 'Dwarf' && body.type !== 'Ice Giant') return 0;

  // Earth Reference Values (in Game Units / Scale)
  // Assumed Earth Refs: Radius=2.5, Mass=10.0, Density=5.51, Temp=288K, EscVel=11.2 (scaled)
  const refRadius = 2.5; 
  const refDensity = 5.51;
  const refTemp = 288.0;
  const refEscVel = 11.2;

  const r = body.radius / refRadius;
  const density = (body.properties?.bulkDensity || 5.51) / refDensity;
  const temp = body.temperature / refTemp;
  const escVel = (body.properties?.escapeVelocity || 11.2) / refEscVel;

  // Standard ESI Weights
  const w_r = 0.57;
  const w_d = 1.07;
  const w_e = 0.70;
  const w_t = 5.58;
  const totalWeight = w_r + w_d + w_e + w_t;

  const esi_r = Math.pow(1.0 - Math.abs((r - 1.0) / (r + 1.0)), w_r);
  const esi_d = Math.pow(1.0 - Math.abs((density - 1.0) / (density + 1.0)), w_d);
  const esi_e = Math.pow(1.0 - Math.abs((escVel - 1.0) / (escVel + 1.0)), w_e);
  const esi_t = Math.pow(1.0 - Math.abs((temp - 1.0) / (temp + 1.0)), w_t);

  const esi = Math.pow(esi_r * esi_d * esi_e * esi_t, 1.0 / totalWeight);

  return Math.max(0, Math.min(1, isNaN(esi) ? 0 : esi));
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