/**
 * How wall-clock time maps to simulated time.
 *
 * This is a pacing layer, not physics: it only sets how much elapsed simulated
 * time is handed to `runFixedSteps` each frame. The timestep (`FIXED_DT`), the
 * integrator, and the force law are untouched, so a trajectory is identical
 * between modes — only the rate at which it is traversed differs.
 *
 * Background: before this module existed, `SpaceCanvas` fed
 * `min(delta, 0.1) * speed` years straight into the loop. At 60 fps and
 * speed = 1 that is 0.0167 yr/frame, but `runFixedSteps` can only drain
 * `MAX_CATCHUP_STEPS * FIXED_DT = 0.0078 yr` before it zeroes the accumulator
 * and discards the rest. Every slider position above ~0.48x therefore produced
 * the *same* ~0.47 yr/s — an Earth year in 2.1 seconds — and the rate scaled
 * with the display's refresh rate. Choosing a base rate that keeps the whole
 * slider under the step budget fixes both problems at once.
 */
import type { UiMode } from './displayMode';
import { FIXED_DT, MAX_CATCHUP_STEPS } from './physicsSoA';

/**
 * Simulated years consumed per real second at speed = 1 in Advanced Mode —
 * 25 real seconds per Earth year. Inner planets read clearly at a relaxed
 * pace while Jupiter (11.9 yr) still visibly moves over a few minutes.
 *
 * Also chosen so the entire slider stays inside the per-frame step budget at
 * 60 fps: 4x → 0.16 yr/s → 0.0027 yr/frame → 2.7 of the 8 available steps,
 * comfortably under the cap that made higher slider positions saturate before
 * this module existed. `simRate.test.ts` guards this.
 */
export const BASE_YEARS_PER_REAL_SECOND = 0.04;

/**
 * Beginner Mode runs at ~71 real seconds per Earth year at 1x. Slow enough to
 * watch an inner planet sweep out an orbit and see the velocity change at
 * periapsis, without being so slow that nothing appears to happen.
 */
export const BEGINNER_TIME_SCALE = 0.35;

/** Sim-years consumed per real second at the given slider position and mode. */
export const simYearsPerRealSecond = (speed: number, mode: UiMode): number => {
  if (!isFinite(speed)) return 0;
  const modeScale = mode === 'beginner' ? BEGINNER_TIME_SCALE : 1;
  return speed * BASE_YEARS_PER_REAL_SECOND * modeScale;
};

/**
 * Simulated years to advance for one rendered frame.
 * `delta` is the frame time in real seconds, already capped by the caller.
 */
export const simElapsedForFrame = (delta: number, speed: number, mode: UiMode): number =>
  delta * simYearsPerRealSecond(speed, mode);

/** Real seconds one Earth year takes on screen. Used by the settings UI copy. */
export const realSecondsPerEarthYear = (speed: number, mode: UiMode): number => {
  const rate = Math.abs(simYearsPerRealSecond(speed, mode));
  return rate > 0 ? 1 / rate : Infinity;
};

/** The most simulated time one frame can actually consume, in years. */
export const MAX_SIM_YEARS_PER_FRAME = MAX_CATCHUP_STEPS * FIXED_DT;
