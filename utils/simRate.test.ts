import { describe, it, expect } from 'vitest';
import {
  BASE_YEARS_PER_REAL_SECOND,
  BEGINNER_TIME_SCALE,
  MAX_SIM_YEARS_PER_FRAME,
  realSecondsPerEarthYear,
  simElapsedForFrame,
  simYearsPerRealSecond,
} from './simRate';
import { PHYSICS_LIMITS } from './physicsBounds';
import { FIXED_DT, MAX_CATCHUP_STEPS } from './physicsSoA';

describe('simYearsPerRealSecond', () => {
  it('runs one Earth year in ~25 s at 1x in Advanced Mode', () => {
    expect(realSecondsPerEarthYear(1, 'advanced')).toBeCloseTo(25, 6);
    expect(simYearsPerRealSecond(1, 'advanced')).toBeCloseTo(BASE_YEARS_PER_REAL_SECOND, 12);
  });

  it('runs Beginner Mode slower than Advanced by exactly BEGINNER_TIME_SCALE', () => {
    const beginner = simYearsPerRealSecond(1, 'beginner');
    const advanced = simYearsPerRealSecond(1, 'advanced');
    expect(beginner / advanced).toBeCloseTo(BEGINNER_TIME_SCALE, 12);
    expect(beginner).toBeLessThan(advanced);
    // ~71 s per Earth year — slow enough to follow an inner orbit by eye.
    expect(realSecondsPerEarthYear(1, 'beginner')).toBeGreaterThan(60);
  });

  it('is linear in speed, so the slider is monotonic across its range', () => {
    for (const mode of ['beginner', 'advanced'] as const) {
      expect(simYearsPerRealSecond(2, mode)).toBeCloseTo(2 * simYearsPerRealSecond(1, mode), 12);
      expect(simYearsPerRealSecond(4, mode)).toBeGreaterThan(simYearsPerRealSecond(3, mode));
      expect(simYearsPerRealSecond(0.5, mode)).toBeLessThan(simYearsPerRealSecond(1, mode));
    }
  });

  it('preserves sign for reverse playback and is zero at rest', () => {
    expect(simYearsPerRealSecond(-2, 'advanced')).toBeLessThan(0);
    expect(simYearsPerRealSecond(-1, 'advanced')).toBeCloseTo(-simYearsPerRealSecond(1, 'advanced'), 12);
    expect(simYearsPerRealSecond(0, 'advanced')).toBe(0);
  });

  it('returns 0 rather than NaN for a non-finite speed', () => {
    expect(simYearsPerRealSecond(NaN, 'advanced')).toBe(0);
    expect(simYearsPerRealSecond(Infinity, 'beginner')).toBe(0);
  });
});

describe('per-frame step budget', () => {
  const FRAME_60 = 1 / 60;

  /**
   * The bug this whole pacing layer exists to fix: if a frame requests more sim
   * time than MAX_CATCHUP_STEPS can drain, runFixedSteps zeroes the accumulator
   * and throws the remainder away, so every speed above that point behaves
   * identically. Guards a future base-rate bump from silently re-saturating.
   */
  it('keeps the full slider range inside the catch-up budget at 60 fps', () => {
    for (const mode of ['beginner', 'advanced'] as const) {
      for (const speed of [PHYSICS_LIMITS.SPEED_MIN, -1, 0.5, 1, 2, 3, PHYSICS_LIMITS.SPEED_MAX]) {
        const requested = Math.abs(simElapsedForFrame(FRAME_60, speed, mode));
        expect(requested).toBeLessThan(MAX_SIM_YEARS_PER_FRAME);
      }
    }
  });

  it('exposes the budget as the product of the physics constants', () => {
    expect(MAX_SIM_YEARS_PER_FRAME).toBeCloseTo(MAX_CATCHUP_STEPS * FIXED_DT, 12);
  });

  it('scales elapsed time linearly with frame delta', () => {
    expect(simElapsedForFrame(2 * FRAME_60, 1, 'advanced'))
      .toBeCloseTo(2 * simElapsedForFrame(FRAME_60, 1, 'advanced'), 12);
  });
});
