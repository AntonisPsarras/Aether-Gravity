/**
 * Screen-space floor for 3D pick targets.
 *
 * Body hitboxes are authored in *world* units (`visualRadius * 1.5`), which is
 * correct for a mouse and hopeless for a finger: a distant asteroid presents a
 * two-pixel target while every DOM control in the app honours a 44px floor.
 * This computes a scale for the hitbox `Object3D` only — the geometry stays
 * authored at the visual size, so nothing rendered moves.
 */

/** Target pick radius in CSS pixels — 22px radius is the 44px WCAG diameter. */
export const MIN_HIT_RADIUS_PX = 22;

/**
 * Ceiling on the enlargement. Past this the body is a sub-4px speck and a 44px
 * target for it is a lie that will mostly select something else. Uncapped
 * growth is the real hazard: a far enough body would get an unboundedly large
 * world-space sphere and swallow the scene.
 */
export const MAX_HIT_GROWTH = 6;

/**
 * Second, independent cap expressed as a fraction of the camera distance —
 * roughly a 3.5° cone. Bounds the worst case regardless of focal length, so an
 * extreme FOV or viewport cannot produce an implausible finger cone.
 */
export const MAX_HIT_CONE_FRACTION = 0.06;

/**
 * Multiplier that lifts a hitbox of `pixelRadius` CSS px up to `targetPx`.
 * Never shrinks (returns >= 1) and never exceeds `maxGrowth`.
 */
export function screenSpaceHitScale(
  pixelRadius: number,
  targetPx: number = MIN_HIT_RADIUS_PX,
  maxGrowth: number = MAX_HIT_GROWTH,
): number {
  if (!Number.isFinite(pixelRadius) || pixelRadius <= 0) return maxGrowth;
  if (pixelRadius >= targetPx) return 1;
  return Math.min(targetPx / pixelRadius, maxGrowth);
}

/**
 * Clamp a scaled world radius to the cone cap. `worldRadius` is the hitbox
 * radius after `screenSpaceHitScale`; `distance` is camera-to-body.
 */
export function clampHitRadiusToCone(
  worldRadius: number,
  distance: number,
  baseRadius: number,
): number {
  const ceiling = Math.max(baseRadius, distance * MAX_HIT_CONE_FRACTION);
  return Math.min(worldRadius, ceiling);
}
