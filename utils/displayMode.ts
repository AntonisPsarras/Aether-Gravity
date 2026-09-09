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
import type { BodyType } from '../types';

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

// ---- Curvature grid presentation parameters ----
//
// Both modes compress; they differ only in how hard. Advanced Mode used to pass
// amount 0 (raw physical depth), and that is exactly what broke the grid the
// moment a black hole existed: the minimum black hole is 3 M☉ ≈ 1.0e6 M⊕, whose
// raw well is ~8.7e4 L* at the softening floor and still ~3e3 L* a thousand
// units away, so every vertex in view was dragged below the camera and the mesh
// appeared to vanish. Advanced now gets a knee and a ceiling several times
// Beginner's instead — near-identity for anything of ordinary mass, bending
// only where the raw formula was unrenderable anyway.

/**
 * Soft-knee depth, in L*. Wells shallower than this keep their true shape;
 * deeper ones roll off logarithmically. 25 L* ≈ 0.6 AU of dip, which is about
 * the deepest the 5000 L* grid plane can show without reading as a spike.
 */
export const CURVATURE_KNEE = 25;

/** Asymptotic ceiling on the drawn dip, in L*. Approached, never reached. */
export const CURVATURE_MAX_DEPTH = 220;

/**
 * Advanced Mode's knee and ceiling. Chosen so the raw shape survives wherever
 * it was ever visible and only the pathological end bends: an ordinary planet
 * is drawn within a few percent of its true depth, a star's well sits well
 * inside the plane, and a black hole reads as a deep funnel that is still in
 * frame instead of a mesh that is simply gone. Several times Beginner's
 * values, so Advanced keeps visibly more depth and more dynamic range, which
 * is the point of the mode.
 */
export const CURVATURE_KNEE_ADVANCED = 120;
export const CURVATURE_MAX_DEPTH_ADVANCED = 900;

/**
 * Absolute render-safety floor on total well depth, L*, applied in EVERY mode.
 * The compressor now runs per body and clamps each body's own contribution, so
 * the sum is bounded by `bodyCount × maxDepth` — this backstops the pile-up
 * case where many heavy bodies overlap, and nothing else. It is deliberately
 * far above any single body's ceiling so it never shapes a normal scene.
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

/**
 * Compression strength. 1 in both modes — the raw (0) path is unrenderable in
 * the presence of a black hole. Mode is expressed through the knee and ceiling
 * below, not through this. Kept as a function so the shaders can carry on
 * setting the uniform unconditionally, and so `curvatureDisplayScale` keeps its
 * identity-at-0 contract for callers that genuinely want the raw number.
 */
export const curvatureAmountFor = (_mode: UiMode): number => 1;

/** Soft-knee depth for the active mode, L*. */
export const curvatureKneeFor = (mode: UiMode): number =>
  mode === 'beginner' ? CURVATURE_KNEE : CURVATURE_KNEE_ADVANCED;

/** Per-body ceiling on drawn well depth for the active mode, L*. */
export const curvatureMaxFor = (mode: UiMode): number =>
  mode === 'beginner' ? CURVATURE_MAX_DEPTH : CURVATURE_MAX_DEPTH_ADVANCED;

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
