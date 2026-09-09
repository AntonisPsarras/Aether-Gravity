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
 * Advanced Mode is the identity for (2) and (3): `curvatureAmountFor('advanced')`
 * is 0 and `visualScaleFor('advanced', …)` is exactly 1, so the Advanced-Mode
 * render path is bit-for-bit what it was before this mode existed.
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

/**
 * Soft-knee depth, in L*. Wells shallower than this keep their true shape;
 * deeper ones roll off logarithmically. 25 L* ≈ 0.6 AU of dip, which is about
 * the deepest the 5000 L* grid plane can show without reading as a spike.
 */
export const CURVATURE_KNEE = 25;

/** Hard ceiling on the drawn dip, in L*. */
export const CURVATURE_MAX_DEPTH = 220;

/**
 * Absolute render-safety ceiling on well depth, L*, applied in EVERY mode —
 * including Advanced Mode's raw/uncompressed path, which is otherwise
 * deliberately unclamped (see `curvatureDisplayScale`'s identity contract).
 * A body near `PHYSICS_LIMITS.MAX_MASS` digs a well of order 10⁸-10⁹ L* by the
 * raw formula — far past the camera's far clip plane — which pushes grid
 * vertices out of the renderable frustum and makes the mesh appear to vanish.
 * 20,000 L* sits comfortably above any physically-plausible star's raw well
 * (~10⁴ L*, see `curvatureDisplay.ts`), so it never touches normal bodies; it
 * only stops pathological masses from breaking the render.
 */
export const GRID_RENDER_SAFETY_MAX_DEPTH = 20000;

/**
 * The grid also tints by tidal stress, `m / d³`, which has the same unbounded
 * dynamic range as the well depth. In Advanced Mode the high-stress vertices
 * are dragged thousands of units below the frame and are simply never seen;
 * once the depth is compressed they come back into view and saturate the whole
 * plane cyan. So the tint is put through the same compressor, with its own
 * knee, and Beginner Mode keeps the calmer read it is supposed to have.
 */
export const TIDAL_KNEE = 0.5;
export const TIDAL_MAX = 2.0;

/** 0 = raw physical depth (Advanced), 1 = fully compressed (Beginner). */
export const curvatureAmountFor = (mode: UiMode): number =>
  mode === 'beginner' ? 1 : 0;

// ---- Inspector / creator content gates ----

/** Body types the creation toolbar offers in Beginner Mode, in creation order. */
export const BEGINNER_BODY_TYPES: readonly BodyType[] = [
  'Star', 'Black Hole', 'Planet', 'Ice Giant', 'Gas Giant', 'Moon', 'Asteroid',
];

export const isBeginnerBodyType = (type: BodyType): boolean =>
  BEGINNER_BODY_TYPES.includes(type);
