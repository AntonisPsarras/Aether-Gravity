/**
 * Orbit-first moon creation.
 *
 * A moon is not thrown and hoped for: it is placed directly on a bound Kepler
 * orbit about a chosen parent and handed to the rail system in
 * `utils/moonSystem.ts`, exactly like the preset moons.
 *
 * ── Parameterisation ─────────────────────────────────────────────────────────
 * The user sets a start distance `r` and a start speed expressed relative to the
 * local circular speed, f = v / √(μ/r), with the velocity tangential — i.e. the
 * start point is an apsis. That maps onto elements with no approximation:
 *
 *   e = |f² − 1|,   a = r / (2 − f²),   other apsis = r·f² / (2 − f²)
 *
 * f ≥ 1 starts the moon at periapsis, f < 1 at apoapsis, f = 1 is circular, and
 * the orbit is bound iff f < √2. The creator never offers f outside
 * [√(1 − e_max), √(1 + e_max)], so every reachable setting is a closed orbit.
 * Velocity is never computed here: rail moons *are* their elements, and
 * `propagateOrbit` derives the state vector the same way it does for presets.
 *
 * ── Limits ───────────────────────────────────────────────────────────────────
 * Inner: the larger of the rigid-body Roche limit, physical contact, and a
 *   presentation clearance so the drawn moon never sits inside the parent's
 *   drawn sphere. Between the rigid and fluid Roche limits the UI warns rather
 *   than blocks — Phobos, Metis and Adrastea live there.
 * Outer: the Hill-stability fits of Domingos, Yokoyama & Winter (2006, MNRAS
 *   373, 1227) for prograde and retrograde satellites, with the Hill radius
 *   taken at the parent's semi-major axis about its dominant parent; plus a hard
 *   ceiling below the *instantaneous* Hill radius `promoteEscapedMoons` tests,
 *   so a freshly created moon can never be released on its first frame.
 * Display: moon orbits are drawn through `moonOrbitRenderScale` (~10³ ×), so the
 *   full stable range would be drawn around the star itself. The apoapsis is
 *   additionally capped so the drawn ring stays within half the parent–primary
 *   distance. This is presentation only and never loosens a physical bound.
 *
 * ── Size ─────────────────────────────────────────────────────────────────────
 * What counts as a moon is the Moon type's mass range in `BODY_CONFIGS`, the
 * same range `classifyBody` enforces — anything lighter or heavier would be
 * reclassified on its first derivation pass. It is further capped at a tenth of
 * the parent's mass, beyond which the pair is a binary, not planet and moon.
 * The default is Earth's Moon, or the largest the parent can hold.
 *
 * Everything here is pure and node-testable.
 */
import * as THREE from 'three';
import type { BodyType, CelestialBody, OrbitalElements } from '../types';
import { BODY_CONFIGS } from '../constants';
import { createSandboxBody } from './bodyFactory';
import { radiusKmForType } from './bodyDerivation';
import {
  elementsFromDegrees,
  gravitationalParameter,
  meanAnomalyFromTrueAnomaly,
  normalizeAngle,
  periodFromElements,
} from './keplerOrbit';
import { attachSatellite, hillRadius, moonOrbitRenderScale } from './moonSystem';
import { bodyVisualRadius, type UiMode } from './displayMode';
import { findDominantParent, getOrbitalElements, PARENT_DOMINANCE_RATIO } from './physicsUtils';
import { M_EARTH_KG, bulkDensityGcm3, kmToDist, rigidRocheLimitRadii, rocheLimitRadii } from './units';

/** Body types that can host a moon. Stars host planets; small bodies host nothing stable. */
export const MOON_HOST_TYPES: readonly BodyType[] = ['Planet', 'Dwarf', 'Ice Giant', 'Gas Giant'];

/** Largest eccentricity the creator produces. Keeps rings legible and far from parabolic. */
const MOON_MAX_ECCENTRICITY = 0.9;
const MOON_SPEED_MIN = Math.sqrt(1 - MOON_MAX_ECCENTRICITY);
const MOON_SPEED_MAX = Math.sqrt(1 + MOON_MAX_ECCENTRICITY);

/** Default start distance, parent radii — Europa sits at 9.4 R♃, Titan at 20 R♄. */
const DEFAULT_MOON_DISTANCE_RADII = 10;

/** Apoapsis ceiling as a fraction of the instantaneous Hill radius. */
const HILL_RELEASE_MARGIN = 0.95;
/** Drawn apoapsis may reach at most this fraction of the drawn parent–primary distance. */
const DISPLAY_CAP_FRACTION = 0.5;
/** Range ceiling, parent radii, for a host with no primary (no Hill sphere to bound it). */
const ISOLATED_HOST_MAX_RADII = 200;
/** A host must offer at least this ratio rMax/rMin to be worth offering. */
const MIN_USABLE_RANGE = 1.05;

const DEG = 180 / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Critical semi-major axis for long-term satellite stability, as a fraction of
 * the Hill radius — Domingos, Yokoyama & Winter (2006), eqs. 1 and 2.
 * Negative means no stable orbit exists for these eccentricities.
 */
export const hillStabilityFraction = (ePlanet: number, eMoon: number, retrograde: boolean): number =>
  retrograde
    ? 0.9309 * (1 - 1.0764 * ePlanet - 0.9812 * eMoon)
    : 0.4895 * (1 - 1.0305 * ePlanet - 0.2738 * eMoon);

export type MoonMinReason = 'roche' | 'surface' | 'clearance';
export type MoonMaxReason = 'stability' | 'display' | 'isolated';

export interface MoonOrbitLimits {
  /** μ = G(M + m) of the relative orbit, as propagated. */
  mu: number;
  /** Parent's true radius, L*. */
  parentRadius: number;
  /** Drawn-to-true multiplier for this moon's orbit. */
  renderScale: number;
  retrograde: boolean;
  /** Closest admissible approach (periapsis), L*. */
  rMin: number;
  minReason: MoonMinReason;
  /** Fluid Roche limit, L*. Inside it only a cohesive moon survives. */
  fluidRoche: number;
  /** Largest admissible circular radius, L* — the range of the distance control. */
  rMax: number;
  maxReason: MoonMaxReason;
  /** Hill radius at the parent's semi-major axis, L*; Infinity when isolated. */
  hillRadius: number;
  /** Parent's eccentricity about its primary (0 when unbound or isolated). */
  ePlanet: number;
  /** Hard ceiling on apoapsis: Hill release margin, display cap, isolation cap. */
  apoapsisCap: number;
}

/** Limits for a moon of `moon`'s mass and size about `parent`. */
export const moonOrbitLimits = (
  parent: CelestialBody,
  moon: CelestialBody,
  grandparent: CelestialBody | null,
  mode: UiMode,
  retrograde: boolean,
): MoonOrbitLimits => {
  const mu = gravitationalParameter(parent.mass, moon.mass);
  const parentRadius = kmToDist(parent.radiusKm);
  const renderScale = moonOrbitRenderScale(parent, mode, moon);

  const rhoParent = bulkDensityGcm3(parent.mass, parent.radiusKm);
  const rhoMoon = bulkDensityGcm3(moon.mass, moon.radiusKm);
  const rigidRoche = rigidRocheLimitRadii(rhoParent, rhoMoon) * parentRadius;
  const fluidRoche = rocheLimitRadii(rhoParent, rhoMoon) * parentRadius;
  const surface = parentRadius + kmToDist(moon.radiusKm);
  const clearance = (bodyVisualRadius(parent, mode) + bodyVisualRadius(moon, mode)) / renderScale;

  let rMin = surface;
  let minReason: MoonMinReason = 'surface';
  if (rigidRoche > rMin) { rMin = rigidRoche; minReason = 'roche'; }
  if (clearance > rMin) { rMin = clearance; minReason = 'clearance'; }

  let hill = Infinity;
  let hillNow = Infinity;
  let ePlanet = 0;
  let separation = Infinity;
  if (grandparent && grandparent.mass > 0) {
    separation = parent.position.distanceTo(grandparent.position);
    hillNow = hillRadius(parent, grandparent);
    const el = getOrbitalElements(parent, grandparent);
    const bound = Number.isFinite(el.a) && el.a > 0 && el.e < 1;
    // An unbound flyby has no Hill sphere in the usual sense; fall back to the
    // instantaneous one, which is what the release test uses anyway.
    const aParent = bound ? el.a : separation;
    ePlanet = bound ? Math.max(0, el.e) : 0;
    hill = aParent * Math.cbrt(parent.mass / (3 * grandparent.mass));
  }

  const stability = Number.isFinite(hill)
    ? Math.max(0, hillStabilityFraction(ePlanet, 0, retrograde)) * hill
    : Infinity;
  const releaseCap = HILL_RELEASE_MARGIN * hillNow;
  const isolatedCap = Number.isFinite(hill) ? Infinity : ISOLATED_HOST_MAX_RADII * parentRadius;
  const physicalMax = Math.min(stability, releaseCap, isolatedCap);

  // Hosts are free bodies, so their drawn separation is their true separation.
  const displayRaw = Number.isFinite(separation)
    ? (DISPLAY_CAP_FRACTION * separation) / renderScale
    : Infinity;
  // Never let the display erase a physically usable range: a host that can hold
  // a moon always gets at least [rMin, 2·rMin].
  const display = Math.max(displayRaw, 2 * rMin);

  const rMax = Math.min(physicalMax, display);
  const maxReason: MoonMaxReason = display < physicalMax
    ? 'display'
    : Number.isFinite(hill) ? 'stability' : 'isolated';

  return {
    mu,
    parentRadius,
    renderScale,
    retrograde,
    rMin,
    minReason,
    fluidRoche,
    rMax,
    maxReason,
    hillRadius: hill,
    ePlanet,
    apoapsisCap: Math.min(releaseCap, isolatedCap, display),
  };
};

/** The apsis opposite the start point for start distance `r` and speed factor `f`. */
export const oppositeApsis = (r: number, f: number): number => {
  const f2 = f * f;
  return (r * f2) / (2 - f2);
};

/** True iff starting at apsis `r` with speed factor `f` gives an orbit inside every limit. */
export const isOrbitAdmissible = (limits: MoonOrbitLimits, r: number, f: number): boolean => {
  if (!(r > 0) || !(f >= MOON_SPEED_MIN - 1e-12) || !(f <= MOON_SPEED_MAX + 1e-12)) return false;
  const f2 = f * f;
  if (f2 >= 2) return false;
  const other = oppositeApsis(r, f);
  const q = Math.min(r, other);
  const Q = Math.max(r, other);
  const a = 0.5 * (q + Q);
  const e = Math.abs(f2 - 1);
  const tol = 1 + 1e-9;
  if (q * tol < limits.rMin) return false;
  if (Q > limits.apoapsisCap * tol) return false;
  if (
    Number.isFinite(limits.hillRadius) &&
    a > hillStabilityFraction(limits.ePlanet, e, limits.retrograde) * limits.hillRadius * tol
  ) return false;
  return true;
};

/**
 * Admissible speed factors at start distance `r`, as [min, max].
 *
 * On each side of f = 1 every constraint's feasible set is an interval that
 * contains the circular case: the opposite apsis and the eccentricity move
 * monotonically away, and the stability margin either does too (retrograde,
 * and prograde above 1) or only improves (prograde below 1). So each end is
 * found by bisection outward from f = 1.
 */
export const speedFactorRange = (limits: MoonOrbitLimits, r: number): [number, number] => {
  if (!isOrbitAdmissible(limits, r, 1)) return [1, 1];
  const bisect = (ok: number, bad: number) => {
    for (let i = 0; i < 40; i++) {
      const mid = 0.5 * (ok + bad);
      if (isOrbitAdmissible(limits, r, mid)) ok = mid; else bad = mid;
    }
    return ok;
  };
  const hi = isOrbitAdmissible(limits, r, MOON_SPEED_MAX) ? MOON_SPEED_MAX : bisect(1, MOON_SPEED_MAX);
  const lo = isOrbitAdmissible(limits, r, MOON_SPEED_MIN) ? MOON_SPEED_MIN : bisect(1, MOON_SPEED_MIN);
  return [lo, hi];
};

// ---------------------------------------------------------------------------
// Orientation. The creator always uses Ω = 0, so the line of nodes is +X and
// the orbit plane is the XZ reference plane tilted about X by the inclination.
// These mirror `perifocalToWorld` in keplerOrbit.ts for that case.
// ---------------------------------------------------------------------------

export const moonInclinationRad = (tiltDeg: number, retrograde: boolean): number =>
  ((retrograde ? 180 - tiltDeg : tiltDeg) * Math.PI) / 180;

/** Unit vector at in-plane angle `u` from the ascending node. */
const orbitPlanePoint = (u: number, iRad: number, out: THREE.Vector3): THREE.Vector3 =>
  out.set(Math.cos(u), Math.sin(u) * Math.sin(iRad), -Math.sin(u) * Math.cos(iRad));

/** Orbit normal (direction of the angular momentum). */
export const orbitPlaneNormal = (iRad: number, out: THREE.Vector3): THREE.Vector3 =>
  out.set(0, Math.cos(iRad), Math.sin(iRad));

/** In-plane angle of `rel` from the ascending node — the inverse of `orbitPlanePoint`. */
export const inPlaneAngle = (rel: THREE.Vector3, iRad: number): number =>
  normalizeAngle(Math.atan2(rel.y * Math.sin(iRad) - rel.z * Math.cos(iRad), rel.x));

const _dir = new THREE.Vector3();

/** Phase that keeps the start point's world direction when the orbit plane changes. */
export const phaseForPlaneChange = (phase: number, fromIRad: number, toIRad: number): number =>
  inPlaneAngle(orbitPlanePoint(phase, fromIRad, _dir), toIRad);

export interface MoonOrbitSpec {
  /** Start distance (an apsis), true L*. */
  r: number;
  /** Start speed / local circular speed. */
  f: number;
  /** In-plane angle of the start point from the ascending node, rad. */
  phase: number;
  /** Tilt of the orbit plane from the reference plane, degrees 0–90. */
  tiltDeg: number;
  retrograde: boolean;
}

/** Kepler elements for a spec, with the start point at `epoch`. */
export const orbitFromSpec = (spec: MoonOrbitSpec, epoch: number): OrbitalElements => {
  const f = clamp(spec.f, MOON_SPEED_MIN, MOON_SPEED_MAX);
  const f2 = f * f;
  const e = Math.abs(f2 - 1);
  const a = spec.r / (2 - f2);
  const nu = f >= 1 ? 0 : Math.PI;           // periapsis or apoapsis
  const iDeg = moonInclinationRad(spec.tiltDeg, spec.retrograde) * DEG;
  return elementsFromDegrees(
    a, e, iDeg, 0,
    normalizeAngle(spec.phase - nu) * DEG,
    meanAnomalyFromTrueAnomaly(nu, e) * DEG,
    epoch,
  );
};

// ---------------------------------------------------------------------------
// Mass and eligibility
// ---------------------------------------------------------------------------

/** Smallest mass classified as a moon, M⊕ (~4 km of rock; Deimos is 2.5 × 10⁻¹⁰). */
export const MOON_MASS_MIN = BODY_CONFIGS.Moon.massRange[0];
/** Largest mass classified as a moon, M⊕ — about twice Ganymede, the largest known. */
export const MOON_MASS_MAX = BODY_CONFIGS.Moon.massRange[1];
/** Earth's Moon, 7.342 × 10²² kg — the default size. */
export const LUNAR_MASS = 7.342e22 / M_EARTH_KG;

export interface MoonMassRange {
  min: number;
  max: number;
  /** 'type': the moon classification limit binds; 'parent': a tenth of the parent does. */
  maxReason: 'type' | 'parent';
}

/**
 * Admissible moon masses about `parent`. The upper end is also where the
 * mass/distance parent heuristic (`findDominantParent`) stops agreeing with the
 * explicit hierarchy, and where treating the parent as unmoved stops being a
 * fair approximation.
 */
export const moonMassRange = (parent: CelestialBody): MoonMassRange => {
  const parentCap = parent.mass / PARENT_DOMINANCE_RATIO;
  return parentCap < MOON_MASS_MAX
    ? { min: MOON_MASS_MIN, max: parentCap, maxReason: 'parent' }
    : { min: MOON_MASS_MIN, max: MOON_MASS_MAX, maxReason: 'type' };
};

/** `requested` (or the lunar default) clamped into the range `parent` allows. */
export const moonMassFor = (parent: CelestialBody, requested: number | null): number => {
  const { min, max } = moonMassRange(parent);
  const m = requested != null && Number.isFinite(requested) ? requested : LUNAR_MASS;
  return Math.max(min, Math.min(max, m));
};

/** Physical radius of a creator moon of mass `mass`, km (default composition). */
export const moonRadiusKm = (mass: number): number => radiusKmForType('Moon', mass);

/** Real moons spanning the range, for a human-scale size read-out. Masses from JPL. */
const REFERENCE_MOONS: ReadonlyArray<{ name: string; mass: number }> = ([
  ['Deimos', 1.4762e15],
  ['Phobos', 1.0659e16],
  ['Mimas', 3.7493e19],
  ['Enceladus', 1.0802e20],
  ['Charon', 1.586e21],
  ['Triton', 2.1389e22],
  ['Europa', 4.7998e22],
  ['the Moon', 7.342e22],
  ['Io', 8.9319e22],
  ['Titan', 1.3452e23],
  ['Ganymede', 1.4819e23],
] as const).map(([name, kg]) => ({ name, mass: kg / M_EARTH_KG }));

/** "≈ Europa", or "2.0× Ganymede's mass" when no reference is within ×1.5. */
export const describeMoonSize = (mass: number): string => {
  let best = REFERENCE_MOONS[0];
  let bestDistance = Infinity;
  for (const ref of REFERENCE_MOONS) {
    const distance = Math.abs(Math.log(mass / ref.mass));
    if (distance < bestDistance) { bestDistance = distance; best = ref; }
  }
  const ratio = mass / best.mass;
  if (ratio > 1 / 1.5 && ratio < 1.5) return `≈ ${best.name}`;
  return `${ratio < 1 ? ratio.toFixed(2) : ratio.toFixed(1)}× ${best.name}'s mass`;
};

/** The moon a draft would create, before it is bound: mass, radius, density. */
export const makeMoonTemplate = (parent: CelestialBody, mass: number): CelestialBody =>
  createSandboxBody({
    id: 'moon-draft',
    type: 'Moon',
    name: 'Moon',
    mass,
    position: parent.position.clone(),
    velocity: parent.velocity.clone(),
  });

const STELLAR_TYPES: readonly BodyType[] = [
  'Star', 'Red Giant', 'White Dwarf', 'Brown Dwarf', 'Neutron Star', 'Pulsar', 'Black Hole',
];

export type MoonHostStatus =
  | { ok: true; limits: MoonOrbitLimits; grandparent: CelestialBody | null }
  | { ok: false; reason: string };

/** Whether `parent` can hold `moon` on a stable orbit, with the limits if so. */
export const moonHostStatus = (
  parent: CelestialBody,
  moon: CelestialBody,
  bodies: readonly CelestialBody[],
  mode: UiMode,
  retrograde = false,
): MoonHostStatus => {
  if (!MOON_HOST_TYPES.includes(parent.type)) {
    return {
      ok: false,
      reason: STELLAR_TYPES.includes(parent.type)
        ? 'Stars and stellar remnants hold planets, not moons.'
        : 'Moons orbit planets, dwarf planets and giants.',
    };
  }
  if (parent.parentId) {
    return { ok: false, reason: 'It is itself a moon — moons of moons are not modelled.' };
  }
  if (moon.mass * PARENT_DOMINANCE_RATIO > parent.mass) {
    return { ok: false, reason: 'Too light to hold a moon: it must outweigh it at least tenfold.' };
  }
  const grandparent = findDominantParent(parent, bodies as CelestialBody[]);
  const limits = moonOrbitLimits(parent, moon, grandparent, mode, retrograde);
  if (!(limits.rMax >= limits.rMin * MIN_USABLE_RANGE)) {
    const eccentric = hillStabilityFraction(limits.ePlanet, 0, retrograde) <= 0;
    return {
      ok: false,
      reason: eccentric
        ? `Its own orbit is too eccentric (e = ${limits.ePlanet.toFixed(2)}) to keep a moon.`
        : `Too close to ${grandparent?.name ?? 'its primary'}: its stable Hill region lies inside its Roche limit.`,
    };
  }
  return { ok: true, limits, grandparent };
};

// ---------------------------------------------------------------------------
// Draft resolution
// ---------------------------------------------------------------------------

/** The user-editable part of a moon draft. `null` means "use the default". */
export interface MoonDraftInput {
  parentId: string | null;
  r: number | null;
  f: number;
  phase: number | null;
  tiltDeg: number;
  retrograde: boolean;
  /** Requested moon mass, M⊕; clamped per parent. `null` = lunar default. */
  mass: number | null;
}

export interface ResolvedMoonDraft {
  status: 'ready';
  parent: CelestialBody;
  grandparent: CelestialBody | null;
  /** Unbound template: mass, radius and derived properties of the moon-to-be. */
  moon: CelestialBody;
  /** Masses this parent can hold a moon of. */
  massRange: MoonMassRange;
  limits: MoonOrbitLimits;
  /** The draft clamped into the current limits — what Create will build. */
  spec: MoonOrbitSpec;
  speedRange: [number, number];
  periapsis: number;
  apoapsis: number;
  eccentricity: number;
  periodYears: number;
  /** Start speed, L*·T*⁻¹. */
  startSpeed: number;
  insideFluidRoche: boolean;
}

export type MoonDraftResolution =
  | { status: 'no-parent' }
  | { status: 'ineligible'; parent: CelestialBody; reason: string }
  | ResolvedMoonDraft;

/**
 * Resolve a draft against the live bodies. Pure: out-of-range values are
 * clamped in the result, never written back, so limits that drift as the parent
 * orbits (or a mode switch) simply re-clamp.
 */
export const resolveMoonDraft = (
  draft: MoonDraftInput,
  bodies: readonly CelestialBody[],
  mode: UiMode,
  moonTemplate?: CelestialBody,
): MoonDraftResolution => {
  const parent = draft.parentId ? bodies.find((b) => b.id === draft.parentId) : undefined;
  if (!parent) return { status: 'no-parent' };
  const moon = moonTemplate ?? makeMoonTemplate(parent, moonMassFor(parent, draft.mass));
  const host = moonHostStatus(parent, moon, bodies, mode, draft.retrograde);
  if (!host.ok) return { status: 'ineligible', parent, reason: host.reason };

  const { limits, grandparent } = host;
  const r = clamp(draft.r ?? DEFAULT_MOON_DISTANCE_RADII * limits.parentRadius, limits.rMin, limits.rMax);
  const speedRange = speedFactorRange(limits, r);
  const f = clamp(draft.f, speedRange[0], speedRange[1]);
  const iRad = moonInclinationRad(draft.tiltDeg, draft.retrograde);

  // Default start point: the side facing away from the primary, so the ghost
  // moon is not drawn in front of the star.
  let phase = draft.phase;
  if (phase == null) {
    phase = grandparent
      ? inPlaneAngle(_dir.subVectors(parent.position, grandparent.position), iRad)
      : 0;
  }

  const other = oppositeApsis(r, f);
  const periapsis = Math.min(r, other);
  const apoapsis = Math.max(r, other);
  return {
    status: 'ready',
    parent,
    grandparent,
    moon,
    massRange: moonMassRange(parent),
    limits,
    spec: { r, f, phase, tiltDeg: draft.tiltDeg, retrograde: draft.retrograde },
    speedRange,
    periapsis,
    apoapsis,
    eccentricity: Math.abs(f * f - 1),
    periodYears: periodFromElements(0.5 * (periapsis + apoapsis), limits.mu),
    startSpeed: f * Math.sqrt(limits.mu / r),
    insideFluidRoche: periapsis < limits.fluidRoche,
  };
};

/**
 * The moon a resolved draft describes, bound to its parent on rails with its
 * start point at `epoch`. The parent must be the *live* physics body.
 */
export const buildMoonOnOrbit = (
  resolved: ResolvedMoonDraft,
  id: string,
  name: string,
  epoch: number,
): CelestialBody => {
  const moon: CelestialBody = {
    ...resolved.moon,
    id,
    name,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    properties: resolved.moon.properties ? { ...resolved.moon.properties } : undefined,
  };
  attachSatellite(moon, resolved.parent, orbitFromSpec(resolved.spec, epoch), epoch);
  return moon;
};
