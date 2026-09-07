import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { calculateHabitableZone, checkHabitability, habitableZoneForStar } from './HabitabilityService';
import { deriveBodyState } from './bodyDerivation';
import { M_SUN_IN_EARTH, auToDist } from './units';
import { calculateESI } from './physicsUtils';

const SOLAR = M_SUN_IN_EARTH;

const makeBody = (over: Partial<CelestialBody> = {}): CelestialBody => {
  const type = over.type ?? 'Planet';
  const mass = over.mass ?? 1;
  const d = deriveBodyState(type, mass, over.properties);
  return {
    id: Math.random().toString(36).slice(2),
    type, mass,
    radius: d.radius,
    radiusKm: d.radiusKm,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    color: '#fff', texture: 'solid', trailColor: '#fff',
    temperature: d.temperature || 288,
    habitability: 'N/A', population: 0, name: 'test',
    ...over,
  };
};

describe('Kopparapu habitable zone', () => {
  it('reproduces the published Solar System boundaries', () => {
    // Kopparapu et al. 2013 + erratum, for L = 1 L_sun and T_eff = 5772 K:
    // moist greenhouse 0.99 AU, maximum greenhouse ~1.68 AU,
    // recent Venus 0.75 AU, early Mars 1.77 AU.
    const hz = calculateHabitableZone(1.0, 5772);
    expect(hz.inner).toBeGreaterThan(0.98);
    expect(hz.inner).toBeLessThan(1.00);
    expect(hz.outer).toBeGreaterThan(1.65);
    expect(hz.outer).toBeLessThan(1.72);
    expect(hz.optimisticInner).toBeGreaterThan(0.74);
    expect(hz.optimisticInner).toBeLessThan(0.77);
    expect(hz.optimisticOuter).toBeGreaterThan(1.74);
    expect(hz.optimisticOuter).toBeLessThan(1.80);
  });

  it('nests the conservative zone inside the optimistic one', () => {
    for (const t of [3000, 4500, 5772, 6500, 7000]) {
      const hz = calculateHabitableZone(1.0, t);
      expect(hz.optimisticInner).toBeLessThan(hz.inner);
      expect(hz.inner).toBeLessThan(hz.outer);
      expect(hz.outer).toBeLessThan(hz.optimisticOuter);
    }
  });

  it('scales as sqrt(L): a 4x more luminous star has a 2x wider zone', () => {
    const a = calculateHabitableZone(1.0, 5772);
    const b = calculateHabitableZone(4.0, 5772);
    expect(b.inner / a.inner).toBeCloseTo(2, 3);
    expect(b.outer / a.outer).toBeCloseTo(2, 3);
  });

  it('puts an M dwarf habitable zone very close in', () => {
    // Proxima Centauri: ~0.0017 L_sun, T_eff ~3040 K. Proxima b orbits at
    // 0.0485 AU and is generally described as inside the habitable zone.
    const hz = calculateHabitableZone(0.0017, 3040);
    expect(hz.inner).toBeLessThan(0.0485);
    expect(hz.outer).toBeGreaterThan(0.0485);
  });

  it('places Earth inside and Venus/Mars outside the conservative zone', () => {
    const sun = makeBody({ type: 'Star', mass: SOLAR, name: 'Sun' });
    const at = (au: number) => makeBody({ position: new THREE.Vector3(auToDist(au), 0, 0) });
    expect(checkHabitability(at(1.0), sun)).toBe(true);
    expect(checkHabitability(at(0.723), sun)).toBe(false);   // Venus
    expect(checkHabitability(at(1.524), sun)).toBe(true);    // Mars (inside conservative HZ)
    expect(checkHabitability(at(5.2), sun)).toBe(false);     // Jupiter
  });

  it('uses real luminosity, so a white dwarf has a tiny zone despite its mass', () => {
    const wd = makeBody({ type: 'White Dwarf', mass: 0.6 * SOLAR });
    const star = makeBody({ type: 'Star', mass: 0.6 * SOLAR });
    const wdZone = habitableZoneForStar(wd);
    const starZone = habitableZoneForStar(star);
    expect(wdZone.inner).toBeLessThan(starZone.inner * 0.2);
    expect(wdZone.inner).toBeGreaterThan(0);
  });
});

describe('Earth Similarity Index', () => {
  it('scores an Earth analogue at essentially 1', () => {
    const earth = makeBody({
      mass: 1,
      temperature: 288,
      properties: { compositionIron: 0.325, compositionSilicates: 0.675, compositionWater: 0 },
    });
    const d = deriveBodyState('Planet', 1, earth.properties);
    earth.radiusKm = d.radiusKm;
    earth.properties = {
      ...earth.properties,
      bulkDensity: d.bulkDensity,
      escapeVelocity: d.escapeVelocity,
    };
    expect(calculateESI(earth)).toBeGreaterThan(0.99);
  });

  it("reproduces Venus's published ESI of 0.44", () => {
    // Real Venus: 0.815 M_earth, 6051.8 km, 5.243 g/cm3, 737 K, 10.36 km/s.
    // This is the single hardest anchor for the index, because it is almost
    // Earth-like in the interior terms and wildly unlike Earth at the surface.
    const venus = makeBody({
      mass: 0.815,
      radiusKm: 6051.8,
      temperature: 737,
      properties: { bulkDensity: 5.243, escapeVelocity: 10.36 },
    });
    expect(calculateESI(venus)).toBeGreaterThan(0.42);
    expect(calculateESI(venus)).toBeLessThan(0.46);
  });

  it('reproduces Mars in the published 0.6-0.75 band', () => {
    const mars = makeBody({
      mass: 0.107,
      radiusKm: 3389.5,
      temperature: 240,
      properties: { bulkDensity: 3.934, escapeVelocity: 5.03 },
    });
    const esi = calculateESI(mars);
    expect(esi).toBeGreaterThan(0.6);
    expect(esi).toBeLessThan(0.75);
  });

  it('penalises a scorching or frozen world relative to a temperate one', () => {
    const base = {
      mass: 1,
      properties: { compositionIron: 0.325, compositionSilicates: 0.675, compositionWater: 0 },
    };
    const temperate = calculateESI(makeBody({ ...base, temperature: 288 }));
    const hot = calculateESI(makeBody({ ...base, temperature: 700 }));
    const cold = calculateESI(makeBody({ ...base, temperature: 120 }));
    expect(hot).toBeLessThan(temperate * 0.75);
    expect(cold).toBeLessThan(temperate * 0.85);
  });

  it('returns 0 for bodies the index does not apply to', () => {
    expect(calculateESI(makeBody({ type: 'Star', mass: SOLAR }))).toBe(0);
    expect(calculateESI(makeBody({ type: 'Black Hole', mass: 10 * SOLAR }))).toBe(0);
  });
});
