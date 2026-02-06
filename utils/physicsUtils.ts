import * as THREE from 'three';
import { CelestialBody, BodyType, PhysicsEvent, WaveEvent } from '../types';
import { G_CONSTANT, COLLISION_PHYSICS, EVOLUTION_THRESHOLDS, BODY_CONFIGS } from '../constants';

const isValidBody = (b: CelestialBody | null | undefined): b is CelestialBody => {
  return b != null &&
    b.position != null &&
    b.velocity != null &&
    typeof b.mass === 'number' &&
    !isNaN(b.mass) &&
    typeof b.radius === 'number' &&
    !isNaN(b.radius);
};

// --- Astrophysics Helpers ---

// Densities in g/cm^3 (Approximate)
const DENSITY_IRON = 7.8;
const DENSITY_SILICATE = 3.3;
const DENSITY_WATER = 1.0; 

// Game Unit Scalers
// We need to map real physics to the game's arbitrary units (Mass ~10-100, Radius ~2-5)
const RADIUS_SCALE_FACTOR = 1.8; 

export const calculatePlanetaryPhysics = (mass: number, compIron: number, compSil: number, compWater: number) => {
    const totalVolumeFraction = (compIron / DENSITY_IRON) + (compSil / DENSITY_SILICATE) + (compWater / DENSITY_WATER);
    const bulkDensity = 1 / totalVolumeFraction; // g/cm^3
    const volume = mass / bulkDensity;
    const rawRadius = Math.pow((3 * volume) / (4 * Math.PI), 1/3);
    const radius = rawRadius * RADIUS_SCALE_FACTOR;
    const gravity = (G_CONSTANT * mass) / (radius * radius);
    const escapeVel = Math.sqrt((2 * G_CONSTANT * mass) / radius);

    return {
        radius,
        bulkDensity,
        surfaceGravity: gravity * 10,
        escapeVelocity: escapeVel * 2
    };
};

// --- KEPLERIAN ORBIT MECHANICS ---

export const findDominantParent = (body: CelestialBody, bodies: CelestialBody[]): CelestialBody | null => {
    let bestParent: CelestialBody | null = null;
    let maxInfluence = 0;

    for (const other of bodies) {
        if (other.id === body.id) continue;
        const distSq = body.position.distanceToSquared(other.position);
        if (distSq < 0.1) continue;
        
        // Influence = Mass / Dist^2 (Gravitational pull magnitude)
        const influence = other.mass / distSq;
        
        if (influence > maxInfluence) {
            maxInfluence = influence;
            bestParent = other;
        }
    }
    
    // Threshold to prevent random weak associations in deep space
    // Also, usually parent should be more massive
    if (bestParent && (bestParent as CelestialBody).mass < body.mass * 0.5) return null; // Only orbit heavier things (simplified)

    return bestParent;
};

export const getOrbitalElements = (body: CelestialBody, parent: CelestialBody) => {
    const mu = G_CONSTANT * parent.mass;
    const rVec = body.position.clone().sub(parent.position);
    const vVec = body.velocity.clone().sub(parent.velocity);
    
    const r = rVec.length();
    const v = vVec.length();
    
    // Angular Momentum h = r x v
    const hVec = new THREE.Vector3().crossVectors(rVec, vVec);
    const h = hVec.length();
    
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
    
    // Convert to Radians
    const i = iDeg * (Math.PI / 180);
    const Omega = OmegaDeg * (Math.PI / 180);
    const omega = omegaDeg * (Math.PI / 180);
    const nu = nuDeg * (Math.PI / 180);
    
    // 1. Position/Velocity in Perifocal Frame (PQW)
    // p = a(1-e^2)
    const p = a * (1 - e * e);
    const r = p / (1 + e * Math.cos(nu));
    
    // Position in orbital plane
    // P points to periapsis, Q is 90deg in plane
    const rPQW = new THREE.Vector3(r * Math.cos(nu), r * Math.sin(nu), 0);
    
    // Velocity in orbital plane
    // v = sqrt(mu/p) * [-sin(nu), e + cos(nu), 0]
    const vScale = Math.sqrt(mu / p);
    const vPQW = new THREE.Vector3(
        -Math.sin(nu),
        e + Math.cos(nu),
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

  for (let i = 0; i < nextState.length; i++) {
    const b1 = nextState[i];
    let ax = 0, ay = 0, az = 0;

    for (let j = 0; j < nextState.length; j++) {
      if (i === j) continue;
      const b2 = nextState[j];

      const dx = b2.position.x - b1.position.x;
      const dy = b2.position.y - b1.position.y;
      const dz = b2.position.z - b1.position.z;

      const distSq = dx * dx + dy * dy + dz * dz + 0.1;
      const dist = Math.sqrt(distSq);
      const force = (G_CONSTANT * b2.mass) / distSq;

      ax += (dx / dist) * force;
      ay += (dy / dist) * force;
      az += (dz / dist) * force;
    }

    b1.velocity.x += ax * Gt;
    b1.velocity.y += ay * Gt;
    b1.velocity.z += az * Gt;
  }

  nextState.forEach(body => {
    body.position.addScaledVector(body.velocity, Gt);
  });

  return nextState;
};

export const checkCollisions = (bodies: CelestialBody[], time: number): { active: CelestialBody[], merged: boolean, events: PhysicsEvent[], waveEvents: WaveEvent[] } => {
  if (!bodies || !Array.isArray(bodies)) return { active: [], merged: false, events: [], waveEvents: [] };

  const active = bodies.filter(isValidBody);
  const events: PhysicsEvent[] = [];
  const waveEvents: WaveEvent[] = [];
  let merged = false;
  const toRemove = new Set<string>();

  for (let i = 0; i < active.length; i++) {
    const b1 = active[i];
    if (toRemove.has(b1.id)) continue;

    for (let j = i + 1; j < active.length; j++) {
      const b2 = active[j];
      if (toRemove.has(b2.id)) continue;

      const dist = b1.position.distanceTo(b2.position);
      if (!isFinite(dist)) continue;

      if (dist < (b1.radius + b2.radius) * 0.8) {
        merged = true;
        const totalMass = b1.mass + b2.mass;

        const combinedVel = new THREE.Vector3()
          .addScaledVector(b1.velocity, b1.mass)
          .addScaledVector(b2.velocity, b2.mass)
          .multiplyScalar(1 / totalMass);

        const combinedPos = new THREE.Vector3()
          .addScaledVector(b1.position, b1.mass)
          .addScaledVector(b2.position, b2.mass)
          .multiplyScalar(1 / totalMass);

        const survivor = b1.mass >= b2.mass ? b1 : b2;
        const consumed = b1.mass >= b2.mass ? b2 : b1;

        survivor.mass = totalMass * COLLISION_PHYSICS.MERGER_EFFICIENCY;
        survivor.velocity.copy(combinedVel);
        survivor.position.copy(combinedPos);
        survivor.radius = Math.pow(Math.pow(b1.radius, 3) + Math.pow(b2.radius, 3), 1 / 3);

        toRemove.add(consumed.id);
        
        events.push({
          type: 'collision',
          mass: consumed.mass,
          position: combinedPos.clone(),
          velocity: combinedVel.clone(),
        });
      }
    }
  }

  return {
    active: active.filter(b => !toRemove.has(b.id)),
    merged,
    events,
    waveEvents
  };
};

export const checkEvolution = (bodies: CelestialBody[]): { bodies: CelestialBody[], events: PhysicsEvent[] } => {
  const events: PhysicsEvent[] = [];
  const nextBodies = bodies.map(b => {
    if (!b) return b;

    if ((b.type === 'Planet' || b.type === 'Ice Giant') && b.mass > EVOLUTION_THRESHOLDS.PLANET_TO_STAR) {
      const config = BODY_CONFIGS['Star'];
      events.push({ type: 'evolution', bodyType: 'Star', position: b.position.clone() });
      return { ...b, type: 'Star' as BodyType, color: config.defaultColor, radius: config.radiusRange[0], temperature: 5500, texture: 'solid' };
    }

    if ((b.type === 'Star' || b.type === 'Red Giant') && b.mass > EVOLUTION_THRESHOLDS.STAR_TO_BLACK_HOLE) {
      const config = BODY_CONFIGS['Black Hole'];
      events.push({ type: 'supernova', position: b.position.clone(), radius: 50 });
      return { ...b, type: 'Black Hole' as BodyType, color: config.defaultColor, radius: config.radiusRange[0], mass: b.mass * 0.5, texture: 'solid', trailColor: '#333' };
    }

    return b;
  });

  return { bodies: nextBodies, events };
};

export const generateSystem = (): CelestialBody[] => {
  const bodies: CelestialBody[] = [];
  const starConfig = BODY_CONFIGS['Star'];
  const star: CelestialBody = {
    id: `star-${Date.now()}`,
    type: 'Star',
    mass: starConfig.massRange[0] + Math.random() * 500,
    radius: starConfig.radiusRange[0] + Math.random() * 2,
    position: new THREE.Vector3(0, 0, 0),
    velocity: new THREE.Vector3(0, 0, 0),
    color: starConfig.defaultColor,
    texture: 'solid',
    trailColor: starConfig.defaultColor,
    temperature: 5500,
    habitability: 'STELLAR',
    population: 0,
    name: 'Sol Prime',
    properties: { rotationPeriod: 25.0 }
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
    const radius = config.radiusRange[0] + Math.random() * (config.radiusRange[1] - config.radiusRange[0]);
    const mass = config.massRange[0] + Math.random() * (config.massRange[1] - config.massRange[0]);

    const pos = new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
    const vel = new THREE.Vector3(-Math.sin(angle) * orbitalSpeed, 0, Math.cos(angle) * orbitalSpeed);

    bodies.push({
      id: `gen-body-${i}-${Date.now()}`,
      type: type,
      mass: mass,
      radius: radius,
      position: pos,
      velocity: vel,
      color: config.defaultColor,
      texture: type === 'Ice Giant' ? 'ice' : 'rock',
      trailColor: config.defaultColor,
      temperature: 300 - (dist * 0.5),
      habitability: 'N/A',
      population: 0,
      name: `${type} ${i + 1}`,
      properties: {
          compositionIron: 0.3,
          compositionSilicates: 0.6,
          compositionWater: 0.1,
          scaleHeight: 0.2 + Math.random() * 0.3,
          haze: Math.random() * 0.5,
          atmosphere: 0.5 + Math.random() * 0.5,
          rotationPeriod: 24.0 + Math.random() * 24.0, // Initial random rotation
          isTidallyLocked: false
      }
    });
  }
  return bodies;
};

export const analyzePlanet = (body: CelestialBody, star: CelestialBody, systemAge: number) => {
  if (!body || !star) return {};
  const dist = body.position.distanceTo(star.position);
  const luminosity = Math.pow(star.mass / 1000.0, 3.0);
  const distAU = Math.max(0.1, dist / 40.0);
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