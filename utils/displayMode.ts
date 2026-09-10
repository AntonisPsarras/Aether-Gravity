/**
 * Beginner ⇄ Advanced presentation mode.
 *
 * PRESENTATION ONLY. Nothing in this module may reach the integrator, the force
 * law, `body.radiusKm`, or any persisted field. Mode changes four things and
 * nothing else:
 *
 *   1. how much elapsed time is fed into the fixed-step loop per frame
 *      (`utils/simRate.ts`) — same dt, same trajectory, different wall-clock rate;
 *   2. how deep the spacetime grid dips (`utils/curvatureDisplay.ts`);
 *   3. how large bodies are drawn (`beginnerVisualScale` below);
 *   4. which fields and body types the UI offers.
 *
 * Advanced Mode is the identity for (3): `visualScaleFor('advanced', …)` is
 * exactly 1. It is NOT the identity for (2) any more — see the curvature
 * section below for why the raw path had to go.
 */
import type { BodyType, CelestialBody } from '../types';

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

/** Shared mesh, picking, satellite and camera radius. */
export const bodyVisualRadius = (body: CelestialBody, mode: UiMode): number => {
  const solid = ['Planet', 'Dwarf', 'Ice Giant', 'Gas Giant', 'Moon', 'Asteroid', 'Comet'].includes(body.type);
  const radius = body.type === 'Neutron Star' || body.type === 'Pulsar' ? Math.max(body.radius * 5, 3)
    : body.radius * (solid ? 1.35 : 1);
  return radius * visualScaleFor(mode, body.type);
};

// ---- Curvature grid presentation parameters ----
//
// Every well has the true Newtonian 1/r shape outside a display core; only its
// amplitude (peak depth vs. mass) is compressed. See utils/curvatureDisplay.ts.
// The grid's flat far field sits at y = 0, the orbital plane.
//
// Beginner: bigger planet wells (gentler mass exponent, larger amplitude) and
// wider cores, so a 1 M⊕ dip spans a couple of 20-unit grid cells and is
// visible beside the Sun's funnel. Advanced: a truer mass ratio (p = 1/3),
// narrower cores and a much higher ceiling.

export interface WellParams {
  /** Peak depth of a 1 M⊕ well before the ceiling, L*. */
  amplitude: number;
  /** Mass compression power: peak ∝ m^exponent. */
  exponent: number;
  /** Asymptotic ceiling on any single body's peak depth, L*. */
  maxDepth: number;
  /** Core radius as a multiple of the body's drawn radius. */
  coreFactor: number;
  /** Minimum core radius, L*. Keeps small wells wider than a vertex cell. */
  coreFloor: number;
}

/** Earth ≈ 8, Jupiter ≈ 32, Sun ≈ 136, 3 M☉ hole ≈ 162 L*. */
export const WELL_PARAMS_BEGINNER: WellParams = {
  amplitude: 8, exponent: 0.25, maxDepth: 260, coreFactor: 1.5, coreFloor: 18,
};

/** Earth ≈ 4, Jupiter ≈ 27, Sun ≈ 239, 3 M☉ hole ≈ 323 L*. */
export const WELL_PARAMS_ADVANCED: WellParams = {
  amplitude: 4, exponent: 1 / 3, maxDepth: 900, coreFactor: 1.5, coreFloor: 10,
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
 * Absolute render-safety floor on total well depth, L*, applied in EVERY mode.
 * Each body's own peak is already soft-capped at `maxDepth`, so the sum is
 * bounded by `bodyCount × maxDepth` — this backstops the pile-up case where
 * many heavy bodies overlap, and nothing else.
 */
export const GRID_RENDER_SAFETY_MAX_DEPTH = 20000;

/**
 * The grid also tints by tidal stress, `m / d³`, which has the same unbounded
 * dynamic range as the well depth. Left uncompressed it saturates the whole
 * plane cyan around any compact body, so it goes through the same compressor
 * with its own knee — wider in Advanced, like the depth.
 */
export const TIDAL_KNEE = 0.5;
export const TIDAL_MAX = 2.0;
export const TIDAL_KNEE_ADVANCED = 2.0;
export const TIDAL_MAX_ADVANCED = 8.0;

/** Soft-knee for the tidal tint in the active mode. */
export const tidalKneeFor = (mode: UiMode): number =>
  mode === 'beginner' ? TIDAL_KNEE : TIDAL_KNEE_ADVANCED;

/** Ceiling on the tidal tint in the active mode. */
export const tidalMaxFor = (mode: UiMode): number =>
  mode === 'beginner' ? TIDAL_MAX : TIDAL_MAX_ADVANCED;

// ---- Inspector / creator content gates ----

/** Body types the creation toolbar offers in Beginner Mode, in creation order. */
export const BEGINNER_BODY_TYPES: readonly BodyType[] = [
  'Star', 'Black Hole', 'Planet', 'Ice Giant', 'Gas Giant', 'Moon', 'Asteroid',
];

export const isBeginnerBodyType = (type: BodyType): boolean =>
  BEGINNER_BODY_TYPES.includes(type);
