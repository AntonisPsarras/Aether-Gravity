import * as THREE from 'three';
import { BodyType, CelestialBody } from '../types';
import { TEXTURE_IDS } from '../constants';
import { MAX_SPIN_PARAMETER } from './relativity';

/**
 * Bounds in Aether units: mass in M⊕, distance in L* (0.025 AU), velocity in
 * L* per year (1 unit ≈ 0.1185 km/s), physical radius in km.
 */
export const PHYSICS_LIMITS = {
  /** A comet nucleus is ~4 × 10⁻¹² M⊕; this floor sits comfortably below it. */
  MIN_MASS: 1e-14,
  /** 3 × 10⁴ M☉ — an intermediate-mass black hole. */
  MAX_MASS: 1e10,
  /** Visual radius bounds, L*. */
  MIN_RADIUS: 0.02,
  MAX_RADIUS: 500,
  /** Physical radius bounds, km: sub-km cometary nuclei to a red supergiant. */
  MIN_RADIUS_KM: 0.05,
  MAX_RADIUS_KM: 1e9,
  SPEED_MIN: -2,
  SPEED_MAX: 4,
  MAX_BODIES: 50,
  MAX_NAME_LENGTH: 64,
  /**
   * Max |v| for any body, ≈ 0.12 c. High enough for any bound orbit the sim can
   * produce (Earth's is 251, Mercury's 404) while still catching runaways.
   */
  MAX_VELOCITY_MAGNITUDE: 300_000,
  /** Max |component| for world-space position before recentre. */
  MAX_POSITION_ABS: 5_000_000,
  /** Cap on fling velocity when placing a new body (≈ 8× Earth's orbital speed). */
  MAX_DRAG_LAUNCH_SPEED: 2000,
  STAR_TEMPERATURE_MIN: 1000,
  STAR_TEMPERATURE_MAX: 60_000,
} as const;

const VALID_BODY_TYPES: readonly BodyType[] = [
  'Star', 'Planet', 'Black Hole', 'Dwarf', 'Neutron Star', 'Red Giant', 'Ice Giant',
  'Gas Giant', 'Moon', 'White Dwarf', 'Brown Dwarf', 'Pulsar', 'Asteroid', 'Comet',
];

const safeNum = (v: unknown, fallback: number): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return isFinite(n) ? n : fallback;
};

const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));

export const clampMass = (m: number): number => {
  if (!isFinite(m)) return m > 0 ? PHYSICS_LIMITS.MAX_MASS : PHYSICS_LIMITS.MIN_MASS;
  if (m <= 0) return PHYSICS_LIMITS.MIN_MASS;
  return Math.max(PHYSICS_LIMITS.MIN_MASS, Math.min(PHYSICS_LIMITS.MAX_MASS, m));
};

export const clampRadius = (r: number): number => {
  if (!isFinite(r)) return r > 0 ? PHYSICS_LIMITS.MAX_RADIUS : PHYSICS_LIMITS.MIN_RADIUS;
  if (r <= 0) return PHYSICS_LIMITS.MIN_RADIUS;
  return Math.max(PHYSICS_LIMITS.MIN_RADIUS, Math.min(PHYSICS_LIMITS.MAX_RADIUS, r));
};

/** Clamp a physical radius in km. */
export const clampRadiusKm = (r: number): number => {
  if (!isFinite(r) || r <= 0) return PHYSICS_LIMITS.MIN_RADIUS_KM;
  return Math.max(PHYSICS_LIMITS.MIN_RADIUS_KM, Math.min(PHYSICS_LIMITS.MAX_RADIUS_KM, r));
};

export const clampSpeed = (s: number): number => {
  if (!isFinite(s)) return 1;
  return Math.max(PHYSICS_LIMITS.SPEED_MIN, Math.min(PHYSICS_LIMITS.SPEED_MAX, s));
};

export const sanitizeBodyType = (type: unknown): BodyType =>
  typeof type === 'string' && (VALID_BODY_TYPES as readonly string[]).includes(type)
    ? (type as BodyType)
    : 'Planet';

export const sanitizeName = (name: unknown): string => {
  if (typeof name !== 'string') return 'Body';
  const stripped = name.replace(/[\x00-\x1f\x7f]/g, '').trim();
  const trimmed = stripped.slice(0, PHYSICS_LIMITS.MAX_NAME_LENGTH);
  return trimmed || 'Body';
};

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;

export const sanitizeColor = (color: unknown, fallback = '#ffffff'): string => {
  if (typeof color !== 'string') return fallback;
  const trimmed = color.trim().slice(0, 32);
  return HEX_COLOR_RE.test(trimmed) ? trimmed : fallback;
};

export const sanitizeTexture = (texture: unknown): string => {
  if (typeof texture !== 'string') return 'solid';
  return texture in TEXTURE_IDS ? texture : 'solid';
};

/** Clamp position, velocity, mass, and radius on live physics bodies (no clone). */
export const clampBodiesInPlace = (bodies: CelestialBody[]): void => {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b?.position || !b?.velocity) continue;
    clampPositionVector(b.position);
    clampVelocityVector(b.velocity);
    if (typeof b.mass === 'number') b.mass = clampMass(b.mass);
    if (typeof b.radius === 'number') b.radius = clampRadius(b.radius);
    if (typeof b.radiusKm === 'number') b.radiusKm = clampRadiusKm(b.radiusKm);
  }
};

/** Clamp velocity magnitude; repairs non-finite components. */
export const clampVelocityVector = (
  v: THREE.Vector3,
  maxSpeed: number = PHYSICS_LIMITS.MAX_VELOCITY_MAGNITUDE,
): THREE.Vector3 => {
  if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) {
    v.set(0, 0, 0);
    return v;
  }
  const magSq = v.lengthSq();
  const maxSq = maxSpeed * maxSpeed;
  if (magSq <= maxSq || magSq === 0) return v;
  v.multiplyScalar(maxSpeed / Math.sqrt(magSq));
  return v;
};

/** Clamp each position component to a finite simulation envelope. */
export const clampPositionVector = (p: THREE.Vector3): THREE.Vector3 => {
  const lim = PHYSICS_LIMITS.MAX_POSITION_ABS;
  const x = isFinite(p.x) ? Math.max(-lim, Math.min(lim, p.x)) : 0;
  const y = isFinite(p.y) ? Math.max(-lim, Math.min(lim, p.y)) : 0;
  const z = isFinite(p.z) ? Math.max(-lim, Math.min(lim, p.z)) : 0;
  p.set(x, y, z);
  return p;
};

export const clampStarTemperature = (t: number): number =>
  clamp(safeNum(t, 5800), PHYSICS_LIMITS.STAR_TEMPERATURE_MIN, PHYSICS_LIMITS.STAR_TEMPERATURE_MAX);

/** Velocity cap for drag-to-launch body creation. */
export const clampLaunchVelocity = (v: THREE.Vector3): THREE.Vector3 =>
  clampVelocityVector(v, PHYSICS_LIMITS.MAX_DRAG_LAUNCH_SPEED);

const VALID_HABITABILITY = new Set<CelestialBody['habitability']>([
  'HABITABLE', 'FROZEN', 'BURNING', 'TOXIC', 'STELLAR', 'SINGULARITY', 'STERILIZED', 'N/A',
]);

/**
 * Single ingress sanitizer for store, physics ref, undo stacks, and drag-create.
 * Clones position/velocity so callers can keep immutability elsewhere.
 */
export const sanitizeCelestialBody = (body: CelestialBody): CelestialBody => {
  const position = clampPositionVector(body.position.clone());
  const velocity = clampVelocityVector(body.velocity.clone());
  const temperature = Math.max(0, safeNum(body.temperature, 300));
  return {
    ...body,
    id: typeof body.id === 'string' && body.id ? body.id : `body-${Date.now()}`,
    type: sanitizeBodyType(body.type),
    name: sanitizeName(body.name),
    mass: clampMass(body.mass),
    radius: clampRadius(body.radius),
    radiusKm: clampRadiusKm(body.radiusKm),
    temperature,
    color: sanitizeColor(body.color),
    texture: sanitizeTexture(body.texture),
    trailColor: sanitizeColor(body.trailColor, '#ffffff'),
    habitability: VALID_HABITABILITY.has(body.habitability) ? body.habitability : 'N/A',
    population: Math.max(0, Math.floor(safeNum(body.population, 0))),
    properties: sanitizeProperties(body.properties),
    position,
    velocity,
  };
};

export const sanitizeCelestialBodies = (bodies: CelestialBody[]): CelestialBody[] =>
  bodies.slice(0, PHYSICS_LIMITS.MAX_BODIES).map(sanitizeCelestialBody);

/** Clamp inspector / save-file property numerics to shader-safe ranges. */
export const sanitizeProperties = (
  props: CelestialBody['properties'] | undefined,
): CelestialBody['properties'] | undefined => {
  if (!props || typeof props !== 'object') return undefined;

  const c01 = (v: unknown) => clamp(safeNum(v, 0), 0, 1);
  const out: NonNullable<CelestialBody['properties']> = {};
  if (typeof props.presetId === 'string') out.presetId = props.presetId.slice(0, 64);
  if (typeof props.scienceNote === 'string') out.scienceNote = props.scienceNote.slice(0, 2000);
  if (typeof props.referencePlane === 'string') out.referencePlane = props.referencePlane.slice(0, 200);
  if (Number.isFinite(props.epochJD)) out.epochJD = props.epochJD;
  if (props.physicalCollisions === true) out.physicalCollisions = true;
  if (props.renderRadiusScale !== undefined) out.renderRadiusScale = clamp(safeNum(props.renderRadiusScale, 1), 0.00001, 1);

  if (props.compositionIron !== undefined) out.compositionIron = c01(props.compositionIron);
  if (props.compositionSilicates !== undefined) out.compositionSilicates = c01(props.compositionSilicates);
  if (props.compositionWater !== undefined) out.compositionWater = c01(props.compositionWater);
  if (props.metallicity !== undefined) out.metallicity = c01(props.metallicity);
  if (props.oblateness !== undefined) out.oblateness = clamp(safeNum(props.oblateness, 0), 0, 0.5);
  if (props.convectionScale !== undefined) out.convectionScale = clamp(safeNum(props.convectionScale, 5), 1, 10);
  if (props.massLoss !== undefined) out.massLoss = c01(props.massLoss);
  if (props.pulsationSpeed !== undefined) out.pulsationSpeed = clamp(safeNum(props.pulsationSpeed, 0.5), 0, 5);
  if (props.luminosityClass !== undefined) out.luminosityClass = c01(props.luminosityClass);
  if (props.luminositySolar !== undefined) out.luminositySolar = Math.max(0, safeNum(props.luminositySolar, 1));
  if (props.tectonics !== undefined) out.tectonics = c01(props.tectonics);
  if (props.atmosphere !== undefined) out.atmosphere = c01(props.atmosphere);
  if (props.waterLevel !== undefined) out.waterLevel = c01(props.waterLevel);
  if (props.methane !== undefined) out.methane = c01(props.methane);
  if (props.cloudDepth !== undefined) out.cloudDepth = c01(props.cloudDepth);
  if (props.axialTilt !== undefined) out.axialTilt = clamp(safeNum(props.axialTilt, 0), 0, 180);
  if (props.flareActivity !== undefined) out.flareActivity = c01(props.flareActivity);
  if (props.magneticIndex !== undefined) out.magneticIndex = c01(props.magneticIndex);
  if (props.degeneracy !== undefined) out.degeneracy = c01(props.degeneracy);
  // Thorne limit: photon capture from the disk caps accretion-driven spin at
  // a* = 0.998, so an extremal Kerr hole is not reachable by spinning one up.
  if (props.spinParameter !== undefined) {
    out.spinParameter = clamp(safeNum(props.spinParameter, 0), 0, MAX_SPIN_PARAMETER);
  }
  if (props.accretionRate !== undefined) out.accretionRate = c01(props.accretionRate);
  if (props.obliquity !== undefined) out.obliquity = clamp(safeNum(props.obliquity, 0), 0, 180);
  if (props.ringOpacity !== undefined) out.ringOpacity = c01(props.ringOpacity);
  if (props.ringInnerRadius !== undefined) {
    out.ringInnerRadius = clamp(safeNum(props.ringInnerRadius, 1.4), 1.05, 8);
  }
  if (props.ringOuterRadius !== undefined) {
    out.ringOuterRadius = clamp(safeNum(props.ringOuterRadius, 2.3), 1.05, 12);
  }
  if (props.albedo !== undefined) out.albedo = c01(props.albedo);
  // Pulsars span ~1.4 ms (near the mass-shedding limit) to ~10 s.
  if (props.pulsarPeriodS !== undefined) {
    out.pulsarPeriodS = clamp(safeNum(props.pulsarPeriodS, 1), 0.0014, 100);
  }
  if (props.magneticFieldTG !== undefined) {
    out.magneticFieldTG = clamp(safeNum(props.magneticFieldTG, 1), 0, 1e4);
  }
  if (props.volatileFraction !== undefined) out.volatileFraction = c01(props.volatileFraction);
  if (props.luminositySolarDerived !== undefined) {
    out.luminositySolarDerived = Math.max(0, safeNum(props.luminositySolarDerived, 0));
  }
  if (props.manualRadiusKm !== undefined) out.manualRadiusKm = clampRadiusKm(props.manualRadiusKm);
  if (props.scaleHeight !== undefined) out.scaleHeight = clamp(safeNum(props.scaleHeight, 0.2), 0.01, 1);
  if (props.haze !== undefined) out.haze = c01(props.haze);
  if (props.rotationPeriod !== undefined) out.rotationPeriod = clamp(safeNum(props.rotationPeriod, 24), 0.1, 1000);
  if (props.bulkDensity !== undefined) out.bulkDensity = Math.max(0, safeNum(props.bulkDensity, 5.5));
  if (props.surfaceGravity !== undefined) out.surfaceGravity = Math.max(0, safeNum(props.surfaceGravity, 9.8));
  if (props.escapeVelocity !== undefined) out.escapeVelocity = Math.max(0, safeNum(props.escapeVelocity, 11.2));
  if (props.isTidallyLocked !== undefined) out.isTidallyLocked = Boolean(props.isTidallyLocked);
  if (props.userTempOverride !== undefined) out.userTempOverride = Boolean(props.userTempOverride);
  if (props.manualRadius !== undefined) out.manualRadius = Boolean(props.manualRadius);

  // A ring plane with the outer edge inside the inner edge would render as an
  // empty annulus; push the outer edge out rather than dropping the rings.
  if (out.ringInnerRadius !== undefined || out.ringOuterRadius !== undefined) {
    const inner = out.ringInnerRadius ?? 1.4;
    const outer = out.ringOuterRadius ?? 2.3;
    out.ringInnerRadius = inner;
    out.ringOuterRadius = Math.max(outer, inner + 0.05);
  }

  const hasComposition =
    out.compositionIron !== undefined ||
    out.compositionSilicates !== undefined ||
    out.compositionWater !== undefined;
  if (hasComposition) {
    const iron = out.compositionIron ?? 0.3;
    const sil = out.compositionSilicates ?? 0.6;
    const water = out.compositionWater ?? 0.1;
    const sum = iron + sil + water;
    if (sum < 1e-6) {
      out.compositionIron = 0.3;
      out.compositionSilicates = 0.6;
      out.compositionWater = 0.1;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
};
