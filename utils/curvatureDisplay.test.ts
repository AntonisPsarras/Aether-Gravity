import { describe, it, expect } from 'vitest';
import {
  CURVATURE_WELL_GLSL, DISPLAY_DEPTH_GLSL, displayDepth, wellCore, wellCoreRadius,
  wellDepthAt, wellPeak, wellPeakDepth,
} from './curvatureDisplay';
import {
  GRID_RENDER_SAFETY_MAX_DEPTH, WELL_PARAMS_ADVANCED, WELL_PARAMS_BEGINNER, wellParamsFor,
} from './displayMode';
import type { UiMode } from './displayMode';
import { M_JUPITER_IN_EARTH, M_SUN_IN_EARTH, auToDist } from './units';

/** Drawn radius of the Sun, Earth and Jupiter in each mode (bodyVisualRadius). */
const DRAWN = {
  advanced: { sun: 12, earth: 3.375, jupiter: 11.18 },
  beginner: { sun: 15, earth: 7.425, jupiter: 24.6 },
} as const;

const wellFor = (mode: UiMode, mass: number, drawn: number) => {
  const p = wellParamsFor(mode);
  const core = wellCore(drawn, p);
  const peak = wellPeak(mass, core, p);
  return { core, peak, strength: peak * core };
};

/** Drawn depth of a single well at distance d. */
const drawnAt = (mode: UiMode, mass: number, drawn: number, d: number) => {
  const w = wellFor(mode, mass, drawn);
  return displayDepth(wellDepthAt(d, w.peak, w.core), wellParamsFor(mode).displayKnee);
};

describe('displayDepth (the shared depth map)', () => {
  const KNEE = 300;

  it('is the exact identity up to the knee', () => {
    for (const d of [0.001, 1, 50, 299.9, 300]) expect(displayDepth(d, KNEE)).toBe(d);
  });

  it('is C¹ at the knee', () => {
    const e = 1e-4;
    expect((displayDepth(KNEE + e, KNEE) - displayDepth(KNEE, KNEE)) / e).toBeCloseTo(1, 3);
  });

  it('is strictly increasing and never flat above the knee', () => {
    let prev = displayDepth(KNEE, KNEE);
    for (let n = 1; n <= 20; n++) {
      const d = KNEE * 2 ** n;
      const v = displayDepth(d, KNEE);
      expect(v).toBeGreaterThan(prev);
      // Every doubling adds the same knee·ln 2: a log-cone, not a plateau.
      expect(v - prev).toBeCloseTo(KNEE * Math.LN2, 6);
      prev = v;
    }
  });

  it('clamps zero, negative, NaN and infinite depth safely', () => {
    expect(displayDepth(0, KNEE)).toBe(0);
    expect(displayDepth(-5, KNEE)).toBe(0);
    expect(displayDepth(NaN, KNEE)).toBe(0);
    expect(displayDepth(Infinity, KNEE)).toBe(GRID_RENDER_SAFETY_MAX_DEPTH);
    expect(displayDepth(1e300, KNEE)).toBeLessThanOrEqual(GRID_RENDER_SAFETY_MAX_DEPTH);
  });

  it('ships a matching GLSL twin', () => {
    expect(DISPLAY_DEPTH_GLSL).toContain('float displayDepth(float depth, float knee)');
    expect(DISPLAY_DEPTH_GLSL).toContain('k * (1.0 + log(depth / k))');
    expect(DISPLAY_DEPTH_GLSL).toContain(`min(v, ${GRID_RENDER_SAFETY_MAX_DEPTH.toFixed(1)})`);
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

  it('keeps sub-unit cores for compact systems instead of flooring them to 1 L*', () => {
    // TRAPPIST-1 draws its star at ~0.1 L*; a 1 L* floor would flatten its planets' funnel.
    expect(wellDepthAt(1, 10, 0.1)).toBeCloseTo((10 * 0.1) / Math.sqrt(1.01), 6);
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

describe('Advanced Mode: the true potential', () => {
  const p = WELL_PARAMS_ADVANCED;
  const sun = wellFor('advanced', M_SUN_IN_EARTH, DRAWN.advanced.sun);
  const earth = wellFor('advanced', 1, DRAWN.advanced.earth);
  const jupiter = wellFor('advanced', M_JUPITER_IN_EARTH, DRAWN.advanced.jupiter);

  it('gives every body a far-field strength exactly proportional to its mass', () => {
    expect(sun.strength / earth.strength / M_SUN_IN_EARTH).toBeCloseTo(1, 10);
    expect(jupiter.strength / earth.strength / M_JUPITER_IN_EARTH).toBeCloseTo(1, 10);
  });

  it('sinks the sheet 100 L* at 1 AU per solar mass', () => {
    expect(sun.strength / auToDist(1)).toBeCloseTo(100, 9);
  });

  it('draws the whole Solar System on an exactly linear scale', () => {
    expect(sun.peak).toBeLessThan(p.displayKnee);
    expect(displayDepth(sun.peak, p.displayKnee)).toBe(sun.peak);
  });

  it('makes planets physically tiny dents', () => {
    expect(earth.peak).toBeLessThan(0.01);
    expect(jupiter.peak).toBeGreaterThan(0.1);
    expect(jupiter.peak).toBeLessThan(0.5);
  });

  it('keeps black-hole far fields in true proportion and compresses only near the core', () => {
    const hole = wellFor('advanced', 10 * M_SUN_IN_EARTH, 8.5);
    const far = (w: typeof hole) => displayDepth(wellDepthAt(1000, w.peak, w.core), p.displayKnee);
    expect(far(hole) / far(sun)).toBeCloseTo(10, 2);
    const holeCore = displayDepth(hole.peak, p.displayKnee);
    expect(holeCore).toBeGreaterThan(displayDepth(sun.peak, p.displayKnee));
    expect(holeCore).toBeLessThan(hole.peak);
  });

  it('never flattens the sheet under an intermediate-mass hole (pedestal regression)', () => {
    const at = (d: number) => drawnAt('advanced', 3e4 * M_SUN_IN_EARTH, 27.7, d);
    expect(at(300) - at(3000)).toBeGreaterThan(0.5 * p.displayKnee);
  });
});

describe('Beginner Mode: exaggerated wells', () => {
  const MASSES = [1e-3, 0.1, 1, 17, M_JUPITER_IN_EARTH, M_SUN_IN_EARTH, 3 * M_SUN_IN_EARTH, 100 * M_SUN_IN_EARTH, 1e10];
  const p = WELL_PARAMS_BEGINNER;

  it('is strictly increasing in mass and bounded by the ceiling', () => {
    let prev = 0;
    for (const m of MASSES) {
      const v = wellPeakDepth(m, p.amplitude, p.exponent, p.maxDepth);
      expect(v).toBeGreaterThan(prev);
      expect(v).toBeLessThan(p.maxDepth);
      prev = v;
    }
  });

  it('is zero for non-positive or non-finite mass', () => {
    for (const m of [0, -1, NaN, Infinity]) expect(wellPeakDepth(m, 8, 0.25, 260)).toBe(0);
  });

  it('scales the core with drawn radius but never below the legibility floor', () => {
    expect(wellCoreRadius(2, 1.5, 18)).toBe(18);
    expect(wellCoreRadius(20, 1.5, 18)).toBe(30);
    expect(wellCoreRadius(NaN, 1.5, 18)).toBe(18);
  });

  it('makes an Earth-mass dip clearly visible', () => {
    expect(wellFor('beginner', 1, DRAWN.beginner.earth).peak).toBeGreaterThanOrEqual(5);
  });

  it('exaggerates planets relative to the true Sun : Earth ratio of Advanced Mode', () => {
    const ratio = (mode: UiMode) =>
      wellFor(mode, M_SUN_IN_EARTH, DRAWN[mode].sun).peak / wellFor(mode, 1, DRAWN[mode].earth).peak;
    expect(ratio('beginner')).toBeLessThan(50);
    expect(ratio('advanced')).toBeGreaterThan(1e4);
  });

  it("keeps a planet's full dip beside a black hole (superposition)", () => {
    const hole = wellFor('beginner', 3 * M_SUN_IN_EARTH, 12.8);
    const planet = wellFor('beginner', 1, DRAWN.beginner.earth);
    const withPlanet = wellDepthAt(200, hole.peak, hole.core) + wellDepthAt(0, planet.peak, planet.core);
    expect(withPlanet - wellDepthAt(200, hole.peak, hole.core)).toBeCloseTo(planet.peak, 10);
  });
});

describe('both modes in the Solar System', () => {
  for (const mode of ['beginner', 'advanced'] as UiMode[]) {
    const sunAt = (d: number) => drawnAt(mode, M_SUN_IN_EARTH, DRAWN[mode].sun, d);

    it(`leaves the far field flat at the orbital plane in ${mode} mode (pedestal regression)`, () => {
      expect(sunAt(3000)).toBeLessThan(2);
      expect(sunAt(3000)).toBeLessThan(0.02 * sunAt(0));
    });

    it(`draws a funnel much deeper at Earth's orbit than Jupiter's in ${mode} mode`, () => {
      expect(sunAt(auToDist(1))).toBeGreaterThan(3 * sunAt(auToDist(5.2)));
    });
  }
});
