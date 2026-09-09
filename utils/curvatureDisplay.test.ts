import { describe, it, expect } from 'vitest';
import { CURVATURE_DISPLAY_GLSL, curvatureDisplayScale } from './curvatureDisplay';
import {
  CURVATURE_KNEE, CURVATURE_MAX_DEPTH,
  curvatureAmountFor, curvatureKneeFor, curvatureMaxFor,
} from './displayMode';
import type { UiMode } from './displayMode';

const KNEE = CURVATURE_KNEE;
const MAX = CURVATURE_MAX_DEPTH;
const scale = (depth: number, amount = 1) => curvatureDisplayScale(depth, KNEE, amount, MAX);

/** What the shader now draws for one body, in the given mode. */
const drawnFor = (mode: UiMode, depth: number) =>
  curvatureDisplayScale(depth, curvatureKneeFor(mode), curvatureAmountFor(mode), curvatureMaxFor(mode));

describe('curvatureDisplayScale', () => {
  it('is the exact identity at amount = 0', () => {
    for (const d of [0.5, 12, 250, 9_000, 1e6]) {
      expect(curvatureDisplayScale(d, KNEE, 0, MAX)).toBe(d);
    }
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

  it('never plateaus: the ceiling is asymptotic, never actually reached', () => {
    // A hard `min(x, maxDepth)` flattened every vertex past the ceiling into
    // one disc with a hard crease at its rim — the flatness bug in miniature.
    for (const d of [1e4, 1e6, 1e9, 1e12]) {
      expect(scale(d)).toBeLessThan(MAX);
    }
  });

  it('is STRICTLY increasing even far past the ceiling', () => {
    let prev = 0;
    for (let e = 2; e <= 12; e++) {
      const v = scale(10 ** e);
      expect(v).toBeGreaterThan(prev);
      prev = v;
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
    // The soft ceiling must be in the GLSL twin too, or the shader plateaus
    // while the TS reference does not.
    expect(CURVATURE_DISPLAY_GLSL).toContain('maxDepth * (1.0 - exp(-mixed / maxDepth))');
    expect(CURVATURE_DISPLAY_GLSL).not.toContain('min(mixed, maxDepth)');
  });
});

describe('per-mode compression contract', () => {
  it('compresses in both modes — the raw path is unrenderable near a black hole', () => {
    expect(curvatureAmountFor('beginner')).toBe(1);
    expect(curvatureAmountFor('advanced')).toBe(1);
  });

  it('gives Advanced Mode a strictly wider knee and ceiling than Beginner', () => {
    expect(curvatureKneeFor('advanced')).toBeGreaterThan(curvatureKneeFor('beginner'));
    expect(curvatureMaxFor('advanced')).toBeGreaterThan(curvatureMaxFor('beginner'));
  });

  it('draws every well deeper in Advanced Mode than in Beginner', () => {
    for (const raw of [1, 50, 3_000, 8.7e4]) {
      expect(drawnFor('advanced', raw)).toBeGreaterThan(drawnFor('beginner', raw));
    }
  });

  it('keeps an ordinary planet well within a few percent of its true depth in Advanced', () => {
    const raw = 50;
    expect(drawnFor('advanced', raw)).toBeGreaterThan(raw * 0.8);
    expect(drawnFor('advanced', raw)).toBeLessThanOrEqual(raw);
  });

  it('keeps a black hole funnel inside the grid plane in both modes', () => {
    // A 3 M☉ hole (~1.0e6 M⊕) digs a raw well of ~8.7e4 L*. Uncompressed that
    // dragged every vertex in view past the camera and the mesh vanished.
    const blackHole = 8.7e4;
    for (const mode of ['beginner', 'advanced'] as UiMode[]) {
      expect(drawnFor(mode, blackHole)).toBeLessThanOrEqual(curvatureMaxFor(mode));
      expect(drawnFor(mode, blackHole)).toBeLessThan(1_000);
    }
  });
});

describe('per-body compression keeps small wells visible beside a black hole', () => {
  // The shader sums already-compressed per-body wells. This is the regression:
  // compressing the SUM instead let the hole's pedestal flatten everything.
  const perBodySum = (mode: UiMode, raws: number[]) =>
    raws.reduce((acc, raw) => acc + drawnFor(mode, raw), 0);
  const compressedSum = (mode: UiMode, raws: number[]) =>
    drawnFor(mode, raws.reduce((a, b) => a + b, 0));

  const BLACK_HOLE = 8.7e4;
  const STAR = 3_000;
  const PLANET = 50;

  for (const mode of ['beginner', 'advanced'] as UiMode[]) {
    it(`preserves a planet's own dip next to a black hole in ${mode} mode`, () => {
      const withPlanet = perBodySum(mode, [BLACK_HOLE, STAR, PLANET]);
      const without = perBodySum(mode, [BLACK_HOLE, STAR]);
      // The planet must still contribute essentially its whole solo well.
      expect(withPlanet - without).toBeCloseTo(drawnFor(mode, PLANET), 6);
      expect(withPlanet - without).toBeGreaterThan(PLANET * 0.5);
    });

    it(`beats compressing the summed potential in ${mode} mode`, () => {
      const oldWithPlanet = compressedSum(mode, [BLACK_HOLE, STAR, PLANET]);
      const oldWithout = compressedSum(mode, [BLACK_HOLE, STAR]);
      // The old path erased the planet: its contribution rounded to nothing.
      expect(oldWithPlanet - oldWithout).toBeLessThan(1);
      const newContribution =
        perBodySum(mode, [BLACK_HOLE, STAR, PLANET]) - perBodySum(mode, [BLACK_HOLE, STAR]);
      expect(newContribution).toBeGreaterThan((oldWithPlanet - oldWithout) * 10);
    });
  }
});
