/**
 * User-selectable graphics quality.
 *
 * RENDERING ONLY. Nothing here may reach the integrator, the force law, or any
 * persisted body field. In particular it must never feed `physicsStepPolicy`
 * (utils/physicsSoA.ts): the hardware `DeviceTier` still selects the timestep,
 * so the simulation is bit-identical whichever graphics mode the user picks.
 *
 * Three user-facing modes collapse onto exactly two render profiles:
 *
 *   - `quality`     — the desktop web path, unchanged, on every device.
 *   - `performance` — cheaper but *correct*: same visual features, lower
 *                     resolution/density/sampling. No feature is removed.
 *   - `auto`        — measures sustained framerate and settles on one of the two.
 *
 * Because `auto` resolves to the very same profiles, a device that Auto settles
 * on Quality renders identically to one where the user chose Quality by hand.
 *
 * Why two profiles and not the old (tier × isTouch) pair: `isTouch` was
 * overloaded, driving both input handling and rendering budgets, which made
 * "desktop quality on a phone" unreachable by construction. `detectIsTouch()`
 * now answers input questions only.
 */

/** What the user picks in Settings. Persisted globally across worlds. */
export type GraphicsMode = 'quality' | 'performance' | 'auto';

/** What the renderer actually runs. `auto` resolves into one of these. */
export type RenderProfile = 'quality' | 'performance';

export const GRAPHICS_MODES: readonly GraphicsMode[] = ['quality', 'performance', 'auto'];

export const isGraphicsMode = (v: unknown): v is GraphicsMode =>
  v === 'quality' || v === 'performance' || v === 'auto';

export const isRenderProfile = (v: unknown): v is RenderProfile =>
  v === 'quality' || v === 'performance';

/**
 * Resolve the mode the user chose against what the frame-rate probe measured.
 *
 * `measured` is only consulted for `auto`; an explicit choice is honoured even
 * when the device cannot sustain it, because that is what the user asked for.
 */
export function resolveRenderProfile(mode: GraphicsMode, measured: RenderProfile): RenderProfile {
  if (mode === 'quality') return 'quality';
  if (mode === 'performance') return 'performance';
  return measured;
}

/** The default for someone who has never opened the setting. */
export const DEFAULT_GRAPHICS_MODE: GraphicsMode = 'auto';
