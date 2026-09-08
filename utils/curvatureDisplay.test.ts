import { describe, it, expect } from 'vitest';
import { CURVATURE_DISPLAY_GLSL, curvatureDisplayScale } from './curvatureDisplay';
import { CURVATURE_KNEE, CURVATURE_MAX_DEPTH, curvatureAmountFor } from './displayMode';

const KNEE = CURVATURE_KNEE;
const MAX = CURVATURE_MAX_DEPTH;
const scale = (depth: number, amount = 1) => curvatureDisplayScale(depth, KNEE, amount, MAX);

describe('curvatureDisplayScale', () => {
  it('is the exact identity at amount = 0, so Advanced Mode is unchanged', () => {
    for (const d of [0.5, 12, 250, 9_000, 1e6]) {
      expect(curvatureDisplayScale(d, KNEE, 0, MAX)).toBe(d);
    }
    expect(curvatureAmountFor('advanced')).toBe(0);
    expect(curvatureAmountFor('beginner')).toBe(1);
  });

  it('is near-identity well below the knee, so small wells keep their true shape', () => {
    for (const d of [0.1, 0.5, 1, 2]) {
      expect(scale(d)).toBeGreaterThan(d * 0.9);
      expect(scale(d)).toBeLessThanOrEqual(d);
    }
  });

  it('is monotonic non-decreasing, so deeper is never drawn shallower', () => {
    let prev = -1;
    for (let d = 0; d <= 20_000; d += 37) {
      const v = scale(d);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('never exceeds maxDepth', () => {
    for (const d of [0, 1, KNEE, 1e3, 1e5, 1e9]) {
      expect(scale(d)).toBeLessThanOrEqual(MAX);
    }
  });

  it('brings a Sun-mass well from ~10^4 L* into the visible plane', () => {
    // The raw shader displacement for a 3.3e5 M⊕ primary is order 10^4 L* on a
    // 5000 L* plane — a spike. Compressed it must fit comfortably inside it.
    const raw = 1e4;
    expect(scale(raw)).toBeLessThan(500);
    expect(scale(raw)).toBeGreaterThan(KNEE);
  });

  it('preserves ordering between a star and a planet well', () => {
    const planet = scale(3);
    const star = scale(1e4);
    expect(star).toBeGreaterThan(planet);
    // ...but compresses their ratio enormously, which is the whole point.
    expect(star / planet).toBeLessThan(1e4 / 3);
  });

  it('clamps non-positive and non-finite depths to zero', () => {
    expect(scale(0)).toBe(0);
    expect(scale(-5)).toBe(0);
    expect(scale(NaN)).toBe(0);
  });

  it('falls back to a safe knee when given a non-positive one', () => {
    expect(curvatureDisplayScale(100, 0, 1, MAX)).toBeGreaterThan(0);
    expect(Number.isFinite(curvatureDisplayScale(100, 0, 1, MAX))).toBe(true);
  });

  it('ships a GLSL twin with a matching signature for both shaders', () => {
    expect(CURVATURE_DISPLAY_GLSL).toContain(
      'float curvatureDisplayScale(float depth, float knee, float amount, float maxDepth)',
    );
    expect(CURVATURE_DISPLAY_GLSL).toContain('log(1.0 + depth / k)');
  });
});
