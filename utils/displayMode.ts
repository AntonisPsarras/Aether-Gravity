/**
 * Beginner ⇄ Advanced presentation mode.
 *
 * PRESENTATION ONLY. Nothing in this module may reach the integrator, the force
 * law, `body.radiusKm`, or any persisted field. Mode changes four things and
 * nothing else:
 *
 *   1. how much elapsed time is fed into the fixed-step loop per frame
 *      (`utils/simRate.ts`) — same dt, same trajectory, different wall-clock rate;
 *   2. how the spacetime grid draws each body's well (`utils/curvatureDisplay.ts`);
 *   3. how large bodies are drawn (`beginnerVisualScale` below);
 *   4. which fields and body types the UI offers.
 *
 * Advanced Mode is the identity for (3): `visualScaleFor('advanced', …)` is
 * exactly 1. For (2) it draws the true summed Newtonian potential on one
 * linear scale, while Beginner Mode exaggerates every well so planets show.
 */
import type { BodyType, CelestialBody } from '../types';
import { M_SUN_IN_EARTH, auToDist } from './units';

export type UiMode = 'beginner' | 'advanced';

export const UI_MODES: readonly UiMode[] = ['beginner', 'advanced'];

export const isUiMode = (v: unknown): v is UiMode =>
  v === 'beginner' || v === 'advanced';

/**
 * How much larger bodies are drawn in Beginner Mode.
 *
 * `visualRadiusFromKm` already compresses stars ~23× harder than planets
 * (utils/units.ts), so a flat multiplier would blow stars up while barely
 * helping the rocky worlds that actually read as dots. These factors are graded
 * to close that gap: solid bodies gain the most, stars least.
 */
const BEGINNER_SCALE_BY_TYPE: Partial<Record<BodyType, number>> = {
  'Star': 1.25,
  'Red Giant': 1.15,
  'Brown Dwarf': 1.4,
  'Black Hole': 1.5,
  'Neutron Star': 1.5,
  'White Dwarf': 1.5,
  'Pulsar': 1.5,
};

const BEGINNER_SCALE_DEFAULT = 2.2;

/** Beginner-Mode draw-size multiplier for a body type. Never 1 for solid bodies. */
export const beginnerVisualScale = (type: BodyType): number =>
  BEGINNER_SCALE_BY_TYPE[type] ?? BEGINNER_SCALE_DEFAULT;

/**
 * Draw-size multiplier for the active mode. Exactly 1 in Advanced Mode, so the
 * caller can multiply unconditionally without branching per frame.
 */
export const visualScaleFor = (mode: UiMode, type: BodyType): number =>
  mode === 'beginner' ? beginnerVisualScale(type) : 1;

/** Module scope: `bodyVisualRadius` runs per body per frame and must not allocate. */
const SOLID_TYPES: ReadonlySet<BodyType> = new Set<BodyType>([
  'Planet', 'Dwarf', 'Ice Giant', 'Gas Giant', 'Moon', 'Asteroid', 'Comet',
]);

/** Shared mesh, picking, satellite and camera radius. */
export const bodyVisualRadius = (body: CelestialBody, mode: UiMode): number => {
  const solid = SOLID_TYPES.has(body.type);
  const radius = body.type === 'Neutron Star' || body.type === 'Pulsar' ? Math.max(body.radius * 5, 3)
    : body.radius * (solid ? 1.35 : 1);
  return radius * visualScaleFor(mode, body.type);
};

// ---- Curvature grid presentation parameters ----
//
// The grid is an embedding diagram of the Newtonian potential Φ = −Σ G mᵢ/rᵢ,
// the time-curvature term of the weak-field metric that bends paths into
// orbits. Each body contributes depth(d) = K/√(d² + s²): exactly K/d outside a
// display core s, finite inside it as for a real extended body. The flat far
// field sits at y = 0, the orbital plane. See utils/curvatureDisplay.ts.
//
// Advanced — the true potential. K = κ·m with ONE κ for every body, so depths
// are in true mass ratio (Sun : Earth = 332 946 : 1), superposition is exact
// and the equipotentials are the real ones. Planets make almost no dent of
// their own: they ride on the Sun's funnel at the height their orbit really
// sits at. Only depth past `displayKnee` is compressed — in practice, compact
// objects near their cores.
//
// Beginner — deliberate exaggeration. Each peak is a gentle power of mass on a
// soft ceiling and each core is at least `coreFloor` wide, so an Earth-mass
// dimple spans a grid cell and shows beside the Sun's funnel.

export interface WellParams {
  /**
   * 'potential': strength K = kappa·m, the true Newtonian ratios.
   * 'exaggerated': peak = softCeil(amplitude·m^exponent, maxDepth).
   */
  model: 'potential' | 'exaggerated';
  /** Peak depth of a 1 M⊕ well before the ceiling, L* ('exaggerated'). */
  amplitude: number;
  /** Mass compression power: peak ∝ m^exponent ('exaggerated'). */
  exponent: number;
  /** Asymptotic ceiling on one body's peak, L* ('exaggerated'). */
  maxDepth: number;
  /** Well strength per Earth mass, L*² per M⊕ ('potential'). */
  kappa: number;
  /** Core radius as a multiple of the body's drawn radius. */
  coreFactor: number;
  /**
   * Minimum core radius, L*. A LEGIBILITY floor — a dimple narrower than the
   * grid-line spacing bends no line. Sampling resolution is handled separately
   * by the lattice LOD in utils/gridLattice.ts. 0 = none.
   */
  coreFloor: number;
  /** Total depth past which `displayDepth` turns logarithmic, L*. */
  displayKnee: number;
}

/**
 * Advanced Mode's single potential scale: one solar mass sinks the sheet this
 * far at 1 AU, L*. With it the Sun's funnel is ~222 L* at its core, ~91 L* at
 * Earth's orbit and ~19 L* at Jupiter's — all below the knee, so the whole
 * Solar System is drawn on an exactly linear scale.
 */
export const ADVANCED_DEPTH_AT_1AU_PER_SOLAR_MASS = 100;

/** Earth ≈ 8, Jupiter ≈ 32, Sun ≈ 136, 3 M☉ hole ≈ 162 L*. */
export const WELL_PARAMS_BEGINNER: WellParams = {
  model: 'exaggerated',
  amplitude: 8, exponent: 0.25, maxDepth: 260, kappa: 0,
  coreFactor: 1.5, coreFloor: 18,
  // Far above any single well: a render-safety roll-off for pile-ups only.
  displayKnee: 1500,
};

/** κ ≈ 0.0120 L*²/M⊕: Sun ≈ 222 L* at its core, Jupiter ≈ 0.2 L*, Earth ≈ 0.002 L*. */
export const WELL_PARAMS_ADVANCED: WellParams = {
  model: 'potential',
  amplitude: 0, exponent: 1, maxDepth: 0,
  kappa: (ADVANCED_DEPTH_AT_1AU_PER_SOLAR_MASS * auToDist(1)) / M_SUN_IN_EARTH,
  coreFactor: 1.5, coreFloor: 0,
  displayKnee: 300,
};

export const wellParamsFor = (mode: UiMode): WellParams =>
  mode === 'beginner' ? WELL_PARAMS_BEGINNER : WELL_PARAMS_ADVANCED;

/**
 * Depth colour tint strength (0 = off). Grid lines shift toward cyan as the
 * well deepens, so wells stay legible from a top-down camera where vertical
 * displacement is invisible. Strong in Beginner, a hint in Advanced.
 */
export const DEPTH_TINT_BEGINNER = 1.0;
export const DEPTH_TINT_ADVANCED = 0.35;

/** Depth, L*, at which the tint reaches ~63% of full strength. */
export const DEPTH_TINT_SCALE = 45;

export const depthTintFor = (mode: UiMode): number =>
  mode === 'beginner' ? DEPTH_TINT_BEGINNER : DEPTH_TINT_ADVANCED;

/**
 * Absolute render-safety clamp on drawn depth, L*, in every mode.
 * `displayDepth` is logarithmic past the knee, so this only catches
 * non-finite or absurd pile-ups of many heavy bodies on one spot.
 */
export const GRID_RENDER_SAFETY_MAX_DEPTH = 20000;

/**
 * Tidal tint. The grid also glows with the tidal field of the strongest body
 * at each point, m / (d² + s²)^{3/2}. In the Newtonian limit the tidal tensor
 * IS the Riemann curvature, so where depth shows the potential, this shows
 * the curvature proper. It spans ~10 orders of magnitude, so it is mapped on a
 * log scale between these decades (M⊕ / L*³): 10⁻⁴ is about Neptune's
 * distance from the Sun, 10³ the doorstep of a stellar black hole.
 */
export const TIDAL_LOG_MIN = -4;
export const TIDAL_LOG_MAX = 3;
export const TIDAL_TINT_BEGINNER = 0.25;
export const TIDAL_TINT_ADVANCED = 0.5;

export const tidalTintFor = (mode: UiMode): number =>
  mode === 'beginner' ? TIDAL_TINT_BEGINNER : TIDAL_TINT_ADVANCED;

// ---- Inspector / creator content gates ----

/** Body types the creation toolbar offers in Beginner Mode, in creation order. */
export const BEGINNER_BODY_TYPES: readonly BodyType[] = [
  'Star', 'Black Hole', 'Planet', 'Ice Giant', 'Gas Giant', 'Moon', 'Asteroid',
];

export const isBeginnerBodyType = (type: BodyType): boolean =>
  BEGINNER_BODY_TYPES.includes(type);
