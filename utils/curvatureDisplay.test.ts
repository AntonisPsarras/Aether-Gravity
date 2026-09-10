import { describe, it, expect } from 'vitest';
import {
  CURVATURE_DISPLAY_GLSL, CURVATURE_WELL_GLSL, curvatureDisplayScale,
  wellCoreRadius, wellDepthAt, wellPeakDepth,
} from './curvatureDisplay';
import { wellParamsFor } from './displayMode';
import type { UiMode } from './displayMode';
import { M_JUPITER_IN_EARTH, M_SUN_IN_EARTH, auToDist } from './units';

// `curvatureDisplayScale` is generic; these are just representative settings.
const KNEE = 25;
const MAX = 220;
const scale = (depth: number, amount = 1) => curvatureDisplayScale(depth, KNEE, amount, MAX);

describe('curvatureDisplayScale (tidal tint compressor)', () => {
  it('is the exact identity at amount = 0', () => {
    for (const d of [0.5, 12, 250, 9_000, 1e6]) {
      expect(curvatureDisplayScale(d, KNEE, 0, MAX)).toBe(d);
    }
  });

  it('is near-identity well below the knee', () => {
    for (const d of [0.1, 0.5, 1, 2]) {
      expect(scale(d)).toBeGreaterThan(d * 0.9);
      expect(scale(d)).toBeLessThanOrEqual(d);
    }
  });

  it('is STRICTLY increasing and never reaches maxDepth', () => {
    let prev = 0;
    for (let e = -1; e <= 12; e++) {
      const v = scale(10 ** e);
      expect(v).toBeGreaterThan(prev);
      expect(v).toBeLessThan(MAX);
      prev = v;
    }
  });

  it('clamps non-positive and non-finite depths to zero', () => {
    expect(scale(0)).toBe(0);
    expect(scale(-5)).toBe(0);
    expect(scale(NaN)).toBe(0);
  });

  it('falls back to a safe knee when given a non-positive one', () => {
    expect(Number.isFinite(curvatureDisplayScale(100, 0, 1, MAX))).toBe(true);
    expect(curvatureDisplayScale(100, 0, 1, MAX)).toBeGreaterThan(0);
  });

  it('ships a GLSL twin with the soft ceiling, not a hard clamp', () => {
    expect(CURVATURE_DISPLAY_GLSL).toContain(
      'float curvatureDisplayScale(float depth, float knee, float amount, float maxDepth)',
    );
    expect(CURVATURE_DISPLAY_GLSL).toContain('maxDepth * (1.0 - exp(-mixed / maxDepth))');
    expect(CURVATURE_DISPLAY_GLSL).not.toContain('min(mixed, maxDepth)');
  });
});

describe('wellDepthAt (the shape of one well)', () => {
  it('equals the peak at the centre', () => {
    expect(wellDepthAt(0, 100, 20)).toBeCloseTo(100, 10);
  });

  it('falls off as the true Newtonian 1/r outside the core', () => {
    const a = wellDepthAt(1000, 100, 20);
    const b = wellDepthAt(2000, 100, 20);
    expect(b / a).toBeCloseTo(0.5, 3);
    // Far field is exactly peak·core / d.
    expect(a * 1000).toBeCloseTo(100 * 20, -1);
  });

  it('decreases monotonically with distance', () => {
    let prev = Infinity;
    for (let d = 0; d <= 5000; d += 25) {
      const v = wellDepthAt(d, 100, 20);
      expect(v).toBeLessThan(prev);
      prev = v;
    }
  });

  it('is zero for a massless body', () => {
    expect(wellDepthAt(10, 0, 20)).toBe(0);
    expect(wellDepthAt(10, NaN, 20)).toBe(0);
  });

  it('ships a matching GLSL twin', () => {
    expect(CURVATURE_WELL_GLSL).toContain('float wellDepthAt(float d, float peak, float core)');
    expect(CURVATURE_WELL_GLSL).toContain('peak * s / sqrt(d * d + s * s)');
  });
});

describe('wellPeakDepth and wellCoreRadius', () => {
  const MASSES = [1e-3, 0.1, 1, 17, M_JUPITER_IN_EARTH, M_SUN_IN_EARTH, 3 * M_SUN_IN_EARTH, 100 * M_SUN_IN_EARTH, 1e10];

  for (const mode of ['beginner', 'advanced'] as UiMode[]) {
    const p = wellParamsFor(mode);
    it(`is strictly increasing in mass and bounded by the ceiling in ${mode} mode`, () => {
      let prev = 0;
      for (const m of MASSES) {
        const v = wellPeakDepth(m, p.amplitude, p.exponent, p.maxDepth);
        expect(v).toBeGreaterThan(prev);
        expect(v).toBeLessThan(p.maxDepth);
        prev = v;
      }
    });
  }

  it('is zero for non-positive or non-finite mass', () => {
    for (const m of [0, -1, NaN, Infinity]) expect(wellPeakDepth(m, 8, 0.25, 260)).toBe(0);
  });

  it('scales the core with drawn radius but never below the floor', () => {
    expect(wellCoreRadius(2, 1.5, 18)).toBe(18);
    expect(wellCoreRadius(20, 1.5, 18)).toBe(30);
    expect(wellCoreRadius(NaN, 1.5, 18)).toBe(18);
  });
});

describe('grid well model in the solar system', () => {
  const MODES: UiMode[] = ['beginner', 'advanced'];
  const peakFor = (mode: UiMode, m: number) => {
    const p = wellParamsFor(mode);
    return wellPeakDepth(m, p.amplitude, p.exponent, p.maxDepth);
  };
  const sunCore = (mode: UiMode) => {
    const p = wellParamsFor(mode);
    return wellCoreRadius(12, p.coreFactor, p.coreFloor);
  };
  const sunAt = (mode: UiMode, d: number) => wellDepthAt(d, peakFor(mode, M_SUN_IN_EARTH), sunCore(mode));

  for (const mode of MODES) {
    it(`leaves the far field flat at the orbital plane in ${mode} mode (pedestal regression)`, () => {
      // The old field-compressed well still sank the plane ~57 L* at 3000 L*.
      expect(sunAt(mode, 3000)).toBeLessThan(0.02 * peakFor(mode, M_SUN_IN_EARTH));
      expect(sunAt(mode, 3000)).toBeLessThan(2);
    });

    it(`draws a funnel that is much deeper at Earth's orbit than Jupiter's in ${mode} mode`, () => {
      // The old curve gave 116 vs 99 in Beginner — which read as flat.
      expect(sunAt(mode, auToDist(1))).toBeGreaterThan(3 * sunAt(mode, auToDist(5.2)));
    });

    it(`keeps a black hole bounded but deeper than the Sun in ${mode} mode`, () => {
      const hole = peakFor(mode, 100 * M_SUN_IN_EARTH);
      expect(hole).toBeGreaterThan(peakFor(mode, M_SUN_IN_EARTH));
      expect(hole).toBeLessThan(wellParamsFor(mode).maxDepth);
    });

    it(`keeps a planet's full dip beside a black hole in ${mode} mode (superposition)`, () => {
      const planetPeak = peakFor(mode, 1);
      const hole = (d: number) => wellDepthAt(d, peakFor(mode, 3 * M_SUN_IN_EARTH), 20);
      const planet = (d: number) => wellDepthAt(d, planetPeak, 18);
      // Planet 200 L* from the hole; measure at the planet's centre.
      const withPlanet = hole(200) + planet(0);
      expect(withPlanet - hole(200)).toBeCloseTo(planetPeak, 10);
    });
  }

  it('makes an Earth-mass dip clearly visible in Beginner Mode', () => {
    // The old model drew Earth's well 0.086 L* deep — sub-pixel.
    expect(peakFor('beginner', 1)).toBeGreaterThanOrEqual(5);
  });

  it('keeps a truer Sun : Earth ratio in Advanced Mode', () => {
    const ratio = (mode: UiMode) => peakFor(mode, M_SUN_IN_EARTH) / peakFor(mode, 1);
    expect(ratio('advanced')).toBeGreaterThan(ratio('beginner'));
    expect(peakFor('advanced', M_SUN_IN_EARTH)).toBeGreaterThan(peakFor('beginner', M_SUN_IN_EARTH));
  });
});
