/**
 * Camera easing helpers — pure, node-testable.
 *
 * The pre-existing follow loop used a fixed per-frame `lerp(…, 0.1)`, which
 * converges twice as fast at 120 fps as at 60. Everything here is expressed in
 * terms of a time constant instead, so the motion looks identical regardless of
 * refresh rate.
 *
 * This module is camera framing only. It never touches physics state.
 */

/**
 * Exponential damping toward a target.
 *
 * `lambda` is the rate constant in reciprocal seconds: the remaining distance
 * falls by `1 - e^(-lambda·dt)` each step, so after `t` seconds a fraction
 * `e^(-lambda·t)` of the original gap is left.
 */
export function dampScalar(current: number, target: number, lambda: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return current;
  return target + (current - target) * Math.exp(-lambda * dt);
}

/** Blend factor for one step of `dampScalar`, for use with THREE's `lerp`. */
export function dampFactor(lambda: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return 1 - Math.exp(-lambda * dt);
}

/**
 * Rate constant that closes 99% of the gap in `seconds`.
 * `FLY_TO_LAMBDA` ≈ 7.7, i.e. a ~600 ms fly-to.
 */
export function lambdaForDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 60;
  return Math.log(100) / seconds;
}

/** Fly-to rate constant: ~600 ms to settle. */
export const FLY_TO_LAMBDA = lambdaForDuration(0.6);

/** Camera-lock follow rate constant, matching the old 0.1-per-60fps feel. */
export const FOLLOW_LAMBDA = lambdaForDuration(0.35);

/**
 * Framing distance for a body of the given render radius.
 *
 * Pinned to the value `snapCameraToBody` has always used — changing it would
 * silently change how every recenter and preset load frames the scene.
 */
export function framingDistanceFor(radius: number): number {
  return Math.max(140, radius * 32);
}

/**
 * Squared arrival threshold, scaled to the framing distance so a fly-to across
 * a stellar system and one across a moon system both terminate crisply.
 */
export function arrivalEpsilonSq(distance: number): number {
  const eps = Math.max(0.05, distance * 0.002);
  return eps * eps;
}
