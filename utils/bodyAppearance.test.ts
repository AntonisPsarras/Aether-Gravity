import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  atmosphereTint,
  bodySeed,
  cloudCoverFor,
  compositionOf,
  displayDiskTemperatureK,
  nightLightsFor,
  obliquityDegOf,
  ringVisualFor,
  surfaceVolatilesFor,
} from './bodyAppearance';
import { RING_PARTICLE_DENSITY_GCM3, rocheLimitRadii } from './units';
import { sanitizeProperties } from './physicsBounds';
import { kelvinToRgb } from './physicsUtils';
import type { CelestialBody } from '../types';

const makeBody = (over: Partial<CelestialBody> = {}): CelestialBody => ({
  id: 'test-body',
  type: 'Planet',
  mass: 1,
  radius: 1,
  radiusKm: 6371,
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  color: '#4d7ea8',
  texture: 'rock',
  trailColor: '#4d7ea8',
  temperature: 288,
  habitability: 'N/A',
  population: 0,
  name: 'Test',
  ...over,
});

describe('rocheLimitRadii', () => {
  it('puts Saturn\'s main rings inside the Roche limit', () => {
    // Saturn's bulk density is 0.687 g/cm^3; ring particles are porous ice.
    const limit = rocheLimitRadii(0.687, RING_PARTICLE_DENSITY_GCM3);
    // The A ring's outer edge is at 2.27 R_Saturn.
    expect(limit).toBeGreaterThan(2.27);
    expect(limit).toBeCloseTo(2.72, 1);
  });

  it('places the Earth-Moon Roche limit near the textbook 2.9 R_earth', () => {
    // Earth 5.514 g/cm^3, Moon 3.344 g/cm^3.
    expect(rocheLimitRadii(5.514, 3.344)).toBeCloseTo(2.9, 1);
  });

  it('scales as the cube root of the density ratio', () => {
    const a = rocheLimitRadii(8, 1);
    const b = rocheLimitRadii(1, 1);
    expect(a / b).toBeCloseTo(2, 6);
  });

  it('returns NaN for non-physical densities', () => {
    expect(rocheLimitRadii(0, 1)).toBeNaN();
    expect(rocheLimitRadii(1, 0)).toBeNaN();
  });
});

describe('ring property sanitation', () => {
  it('clamps opacity and edges into renderable ranges', () => {
    const out = sanitizeProperties({
      ringOpacity: 5,
      ringInnerRadius: 0.1,
      ringOuterRadius: 999,
    })!;
    expect(out.ringOpacity).toBe(1);
    expect(out.ringInnerRadius).toBe(1.05);
    expect(out.ringOuterRadius).toBe(12);
  });

  it('pushes the outer edge past the inner one rather than dropping the rings', () => {
    const out = sanitizeProperties({
      ringOpacity: 0.5,
      ringInnerRadius: 4,
      ringOuterRadius: 2,
    })!;
    expect(out.ringOuterRadius!).toBeGreaterThan(out.ringInnerRadius!);
  });

  it('repairs NaN edges', () => {
    const out = sanitizeProperties({
      ringOpacity: 0.5,
      ringInnerRadius: NaN,
      ringOuterRadius: NaN,
    })!;
    expect(Number.isFinite(out.ringInnerRadius!)).toBe(true);
    expect(Number.isFinite(out.ringOuterRadius!)).toBe(true);
  });

  it('leaves bodies without rings alone', () => {
    const out = sanitizeProperties({ atmosphere: 0.3 })!;
    expect(out.ringOpacity).toBeUndefined();
    expect(out.ringInnerRadius).toBeUndefined();
  });
});

describe('ringVisualFor', () => {
  it('returns null when the body has no rings', () => {
    expect(ringVisualFor(makeBody())).toBeNull();
    expect(ringVisualFor(makeBody({ properties: { ringOpacity: 0 } }))).toBeNull();
  });

  it('honours authored edges', () => {
    const ring = ringVisualFor(
      makeBody({
        properties: { ringOpacity: 0.85, ringInnerRadius: 1.24, ringOuterRadius: 2.27 },
      }),
    )!;
    expect(ring.inner).toBeCloseTo(1.24, 6);
    expect(ring.outer).toBeCloseTo(2.27, 6);
    expect(ring.opacity).toBeCloseTo(0.85, 6);
  });

  it('defaults the outer edge to the Roche limit when unauthored', () => {
    const ring = ringVisualFor(
      makeBody({ properties: { ringOpacity: 0.5, bulkDensity: 0.687 } }),
    )!;
    // Saturn-like density -> Roche limit at 2.72 R.
    expect(ring.outer).toBeCloseTo(2.72, 1);
    expect(ring.inner).toBeLessThan(ring.outer);
  });

  it('always keeps the outer edge outside the inner one', () => {
    const ring = ringVisualFor(
      makeBody({
        properties: { ringOpacity: 0.5, ringInnerRadius: 3, ringOuterRadius: 1.2 },
      }),
    )!;
    expect(ring.outer).toBeGreaterThan(ring.inner);
  });
});

describe('surfaceVolatilesFor', () => {
  it('lets Earth be an ocean world despite a zero bulk water fraction', () => {
    // Earth's oceans are ~0.02% of its mass, so compositionWater rounds to 0
    // in the mass-radius model while 71% of the surface is water.
    expect(surfaceVolatilesFor(0.71, 0)).toBeCloseTo(0.71, 6);
  });

  it('drowns an ice-rich world even at a low surface dial', () => {
    expect(surfaceVolatilesFor(0.1, 0.5)).toBeGreaterThan(0.6);
    expect(surfaceVolatilesFor(0.1, 0.9)).toBe(1);
  });

  it('keeps a dry iron world dry', () => {
    expect(surfaceVolatilesFor(0, 0)).toBe(0);
  });
});

describe('cloudCoverFor', () => {
  it('gives Venus effectively total overcast', () => {
    // Venus reads as fully clouded even though the water-loss cutoff at 737 K
    // holds it just under 1 — its real deck is sulfuric acid, which this
    // water-vapour proxy does not model.
    expect(cloudCoverFor(1.0, 0, 737)).toBeGreaterThan(0.85);
  });

  it('gives Earth broken cloud', () => {
    const cover = cloudCoverFor(0.3, surfaceVolatilesFor(0.71, 0), 288);
    expect(cover).toBeGreaterThan(0.15);
    expect(cover).toBeLessThan(0.6);
  });

  it('leaves Mars essentially clear', () => {
    expect(cloudCoverFor(0.02, 0, 210)).toBeLessThan(0.05);
  });

  it('leaves an airless body clear however wet its composition', () => {
    expect(cloudCoverFor(0, 1, 300)).toBe(0);
  });

  it('rises monotonically with atmosphere at fixed temperature', () => {
    const a = cloudCoverFor(0.2, 0.5, 300);
    const b = cloudCoverFor(0.6, 0.5, 300);
    expect(b).toBeGreaterThan(a);
  });

  it('falls off again once the volatiles are gone at high temperature', () => {
    expect(cloudCoverFor(0.5, 0.5, 1500)).toBeLessThan(cloudCoverFor(0.5, 0.5, 500));
  });
});

describe('compositionOf', () => {
  it('falls back to the same defaults as bodyDerivation', () => {
    const c = compositionOf(makeBody());
    expect(c.iron).toBeCloseTo(0.3, 6);
    expect(c.silicates).toBeCloseTo(0.6, 6);
    expect(c.water).toBeCloseTo(0.1, 6);
  });

  it('normalises fractions that do not sum to one', () => {
    const c = compositionOf(
      makeBody({
        properties: { compositionIron: 2, compositionSilicates: 2, compositionWater: 0 },
      }),
    );
    expect(c.iron + c.silicates + c.water).toBeCloseTo(1, 9);
    expect(c.iron).toBeCloseTo(0.5, 6);
  });

  it('survives an all-zero composition', () => {
    const c = compositionOf(
      makeBody({
        properties: { compositionIron: 0, compositionSilicates: 0, compositionWater: 0 },
      }),
    );
    expect(c.iron + c.silicates + c.water).toBeCloseTo(1, 9);
  });
});

describe('bodySeed', () => {
  it('is deterministic across calls', () => {
    expect(bodySeed('solar-system-earth')).toBe(bodySeed('solar-system-earth'));
  });

  it('separates distinct bodies', () => {
    expect(bodySeed('solar-system-earth')).not.toBe(bodySeed('solar-system-mars'));
  });

  it('stays inside the shader-safe range', () => {
    for (const id of ['a', 'body-1', 'solar-system-jupiter', '', 'x'.repeat(64)]) {
      const s = bodySeed(id);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(100);
    }
  });
});

describe('obliquityDegOf', () => {
  it('prefers the real obliquity field', () => {
    expect(obliquityDegOf(makeBody({ properties: { obliquity: 97.77, axialTilt: 12 } })))
      .toBeCloseTo(97.77, 6);
  });

  it('falls back to the legacy axialTilt for older saves', () => {
    expect(obliquityDegOf(makeBody({ properties: { axialTilt: 45 } }))).toBe(45);
  });

  it('defaults to upright', () => {
    expect(obliquityDegOf(makeBody())).toBe(0);
  });
});

describe('nightLightsFor', () => {
  it('is dark on uninhabited worlds', () => {
    expect(nightLightsFor(1e9, 'N/A')).toBe(0);
    expect(nightLightsFor(0, 'HABITABLE')).toBe(0);
  });

  it('rises with population and saturates', () => {
    const small = nightLightsFor(1e5, 'HABITABLE');
    const large = nightLightsFor(1e10, 'HABITABLE');
    expect(large).toBeGreaterThan(small);
    expect(large).toBeLessThanOrEqual(1);
  });
});

describe('atmosphereTint', () => {
  it('makes a temperate atmosphere blue-dominant', () => {
    const [r, , b] = atmosphereTint(0.5, 288);
    expect(b).toBeGreaterThan(r);
  });

  it('makes a hot CO2 atmosphere red-dominant', () => {
    const [r, , b] = atmosphereTint(0, 737);
    expect(r).toBeGreaterThan(b);
  });

  it('shifts a cold volatile-rich atmosphere toward cyan', () => {
    const [, g, b] = atmosphereTint(0.9, 76);
    expect(g).toBeGreaterThan(0.6);
    expect(b).toBeGreaterThan(0.6);
  });
});

describe('displayDiskTemperatureK', () => {
  it('keeps the ordering of the real peak temperatures', () => {
    const cool = displayDiskTemperatureK(1e5);
    const hot = displayDiskTemperatureK(1e7);
    expect(hot).toBeGreaterThan(cool);
  });

  it('lands inside the band where blackbody hue actually varies', () => {
    for (const t of [1e3, 1e5, 1e7, 1e9]) {
      const d = displayDiskTemperatureK(t);
      expect(d).toBeGreaterThanOrEqual(2000);
      expect(d).toBeLessThanOrEqual(12000);
    }
  });

  it('separates a supermassive disk from a stellar-mass one by enough to see', () => {
    // Real peaks: ~5e5 K around a 10^6 M_sun hole, ~8e6 K around a 10 M_sun one.
    const supermassive = displayDiskTemperatureK(4.7e5);
    const stellar = displayDiskTemperatureK(8.4e6);
    expect(stellar - supermassive).toBeGreaterThan(2000);
  });

  it('handles degenerate input', () => {
    expect(displayDiskTemperatureK(0)).toBe(2000);
    expect(displayDiskTemperatureK(NaN)).toBe(2000);
  });
});

/**
 * The GLSL `blackbody` in components/Planet/PlanetShaders.ts and the TS
 * `kelvinToRgb` in utils/physicsUtils.ts are the same Tanner Helland fit
 * written twice: the shader colours the star's disc, the TS value colours its
 * pointLight and the inspector swatch. If they drift, a star's light stops
 * matching the star. This pins the TS side to the fit's reference values.
 */
describe('kelvinToRgb matches the shader blackbody fit', () => {
  const helland = (tempK: number) => {
    const t = Math.min(Math.max(tempK, 1000), 40000) / 100;
    let r: number;
    let g: number;
    let b: number;
    if (t <= 66) {
      r = 255;
      g = 99.4708025861 * Math.log(t) - 161.1195681661;
      b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
    } else {
      r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
      g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
      b = 255;
    }
    return [r, g, b].map((c) => Math.max(0, Math.min(255, c)));
  };

  it('agrees channel-for-channel across the stellar range', () => {
    for (const tempK of [1300, 3000, 3500, 5772, 10000, 20000, 40000]) {
      const { r, g, b } = kelvinToRgb(tempK);
      const [er, eg, eb] = helland(tempK);
      expect(r).toBeCloseTo(er, 3);
      expect(g).toBeCloseTo(eg, 3);
      expect(b).toBeCloseTo(eb, 3);
    }
  });

  it('is red-dominant for cool stars and blue-dominant for hot ones', () => {
    const cool = kelvinToRgb(3000);
    expect(cool.r).toBeGreaterThan(cool.b);
    const hot = kelvinToRgb(25000);
    expect(hot.b).toBeGreaterThan(hot.r);
  });

  it('clamps outside the fit range instead of diverging', () => {
    expect(kelvinToRgb(10)).toEqual(kelvinToRgb(1000));
    expect(kelvinToRgb(1e9)).toEqual(kelvinToRgb(40000));
  });
});
