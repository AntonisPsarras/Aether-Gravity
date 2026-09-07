/**
 * End-to-end checks that the unit system, the force law and the integrator all
 * agree with each other and with reality. The per-formula unit tests live in
 * `bodyDerivation.test.ts` and `relativity.test.ts`; this file verifies that a
 * body actually *moves* the way its displayed numbers say it should.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import {
  G_AETHER,
  M_SUN_IN_EARTH,
  auToDist,
  circularOrbitalSpeed,
  distToAU,
  equilibriumTemperatureFromLuminosity,
  greenhouseFactor,
  orbitalPeriodYears,
  velocityToKmS,
} from './units';
import { deriveBodyState } from './bodyDerivation';
import {
  getOrbitalElements,
  calculateOrbitalState,
  updateEquilibriumTemperatures,
} from './physicsUtils';
import { verletStepInPlace, resetVerletCache } from './physicsSoA';

const SOLAR = M_SUN_IN_EARTH;

const makeBody = (over: Partial<CelestialBody> = {}): CelestialBody => {
  const type = over.type ?? 'Planet';
  const mass = over.mass ?? 1;
  const d = deriveBodyState(type, mass, over.properties);
  return {
    id: Math.random().toString(36).slice(2),
    type,
    mass,
    radius: d.radius,
    radiusKm: d.radiusKm,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    color: '#ffffff',
    texture: 'solid',
    trailColor: '#ffffff',
    temperature: d.temperature || 288,
    habitability: 'N/A',
    population: 0,
    name: 'test',
    ...over,
  };
};

/** Sun at the origin plus a body on a circular orbit of `aAU`. */
const makeSystem = (aAU: number, planetMass = 1) => {
  const r = auToDist(aAU);
  const sun = makeBody({ type: 'Star', mass: SOLAR, name: 'Sun' });
  const planet = makeBody({
    mass: planetMass,
    name: 'Planet',
    position: new THREE.Vector3(r, 0, 0),
    velocity: new THREE.Vector3(0, 0, circularOrbitalSpeed(r, SOLAR + planetMass)),
  });
  return { sun, planet, r };
};

const totalEnergy = (bodies: CelestialBody[]): number => {
  let e = 0;
  for (const b of bodies) e += 0.5 * b.mass * b.velocity.lengthSq();
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const d = bodies[i].position.distanceTo(bodies[j].position);
      e -= (G_AETHER * bodies[i].mass * bodies[j].mass) / d;
    }
  }
  return e;
};

describe('unit system self-consistency', () => {
  it('derives G from SI rather than tuning it', () => {
    expect(G_AETHER).toBeCloseTo(7.5883, 3);
  });

  it('puts one solar mass at ~332954 Earth masses', () => {
    // 1.98847e30 / 5.9722e24, the IAU 2015 nominal values.
    expect(SOLAR).toBeGreaterThan(332900);
    expect(SOLAR).toBeLessThan(333000);
  });

  it("satisfies Kepler's third law: 1 AU around 1 M_sun takes exactly 1 year", () => {
    expect(orbitalPeriodYears(auToDist(1), SOLAR)).toBeCloseTo(1.0, 3);
  });

  it("reproduces Earth's orbital speed of 29.78 km/s", () => {
    const v = circularOrbitalSpeed(auToDist(1), SOLAR);
    expect(velocityToKmS(v)).toBeCloseTo(29.78, 1);
  });

  it("matches Kepler's third law for the other planets", () => {
    // a in AU, sidereal period in years (JPL fact sheets).
    const cases: Array<[number, number]> = [
      [0.38710, 0.24085],   // Mercury
      [0.72333, 0.61520],   // Venus
      [1.52371, 1.88085],   // Mars
      [5.20289, 11.8626],   // Jupiter
      [9.53667, 29.4475],   // Saturn
      [30.0699, 164.791],   // Neptune
    ];
    for (const [aAU, periodYears] of cases) {
      const p = orbitalPeriodYears(auToDist(aAU), SOLAR);
      expect(Math.abs(p - periodYears) / periodYears).toBeLessThan(0.005);
    }
  });
});

describe('integrator fidelity', () => {
  it('holds a circular orbit at 1 AU for a full year with < 0.5% radius drift', () => {
    resetVerletCache();
    const { sun, planet, r } = makeSystem(1);
    const bodies = [sun, planet];
    const dt = 1 / 1024;
    for (let i = 0; i < 1024; i++) verletStepInPlace(bodies, dt);

    const rEnd = planet.position.distanceTo(sun.position);
    expect(Math.abs(rEnd - r) / r).toBeLessThan(0.005);
  });

  it('returns to its starting point after one year (period is right)', () => {
    resetVerletCache();
    const { sun, planet } = makeSystem(1);
    const start = planet.position.clone();
    const bodies = [sun, planet];
    for (let i = 0; i < 1024; i++) verletStepInPlace(bodies, 1 / 1024);
    // Within 1% of one orbital circumference of where it started.
    const circumference = 2 * Math.PI * start.length();
    expect(planet.position.distanceTo(start) / circumference).toBeLessThan(0.01);
  });

  it('conserves total energy to better than 0.1% over 100 orbits', () => {
    resetVerletCache();
    const { sun, planet } = makeSystem(1);
    const bodies = [sun, planet];
    const e0 = totalEnergy(bodies);
    for (let i = 0; i < 100 * 1024; i++) verletStepInPlace(bodies, 1 / 1024);
    const e1 = totalEnergy(bodies);
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(0.001);
  });

  it('is time-reversible: stepping back recovers the starting state', () => {
    resetVerletCache();
    const { sun, planet } = makeSystem(1);
    const start = planet.position.clone();
    const bodies = [sun, planet];
    for (let i = 0; i < 200; i++) verletStepInPlace(bodies, 1 / 1024);
    resetVerletCache();
    for (let i = 0; i < 200; i++) verletStepInPlace(bodies, -1 / 1024);
    expect(planet.position.distanceTo(start)).toBeLessThan(start.length() * 1e-3);
  });

  it('softening no longer swamps close orbits', () => {
    // A body one Earth-Moon distance from its parent must still feel gravity.
    // Under the old flat epsilon^2 = 0.1 the softening length was ~1.2M km,
    // three times the Earth-Moon separation, so the force was mostly cancelled.
    resetVerletCache();
    const earth = makeBody({ mass: 1, name: 'Earth' });
    const moonDist = 384400 / 3739946.7675;   // km -> L*
    const moon = makeBody({
      type: 'Moon',
      mass: 0.0123,
      name: 'Moon',
      position: new THREE.Vector3(moonDist, 0, 0),
    });
    const bodies = [earth, moon];
    const before = moon.velocity.length();
    for (let i = 0; i < 10; i++) verletStepInPlace(bodies, 1 / 4096);
    expect(moon.velocity.length()).toBeGreaterThan(before);
    // And it should be pulled towards Earth, not away.
    expect(moon.velocity.x).toBeLessThan(0);
  });
});

describe('orbital element conversions', () => {
  const parent = makeBody({ type: 'Star', mass: SOLAR, name: 'Sun' });

  it('round-trips state -> elements -> state for a range of eccentricities', () => {
    for (const e of [0, 0.1, 0.5, 0.9]) {
      const a = auToDist(1.5);
      // Both directions must use the same mu = G(M_parent + M_body), so the
      // orbiting body's mass is passed through explicitly.
      const state = calculateOrbitalState(parent, a, e, 23, 45, 67, 89, 1);
      const body = makeBody({ mass: 1, position: state.position, velocity: state.velocity });
      const el = getOrbitalElements(body, parent);
      expect(Math.abs(el.a - a) / a, `a for e=${e}`).toBeLessThan(1e-6);
      expect(Math.abs(el.e - e), `e for e=${e}`).toBeLessThan(1e-6);
      expect(Math.abs(el.i - 23), `i for e=${e}`).toBeLessThan(1e-4);
    }
  });

  it('recovers the phase of a circular orbit instead of snapping to zero', () => {
    // The pre-2.0 code returned nu = 0 for any near-circular orbit, which made
    // the Orbit tab teleport such bodies back to periapsis.
    const a = auToDist(1);
    for (const trueAnomaly of [30, 120, 250]) {
      const state = calculateOrbitalState(parent, a, 0, 15, 40, 0, trueAnomaly);
      const body = makeBody({ position: state.position, velocity: state.velocity });
      const el = getOrbitalElements(body, parent);
      // Shortest angular distance between the two anomalies, in degrees.
      const delta = Math.abs((((el.nu - trueAnomaly) % 360) + 540) % 360 - 180);
      expect(delta, `nu for ${trueAnomaly}`).toBeLessThan(1);
    }
  });
});

describe('temperature model', () => {
  it("gives Earth's 254 K equilibrium temperature at 1 AU with albedo 0.306", () => {
    const t = equilibriumTemperatureFromLuminosity(1, 1, 0.306, 0);
    expect(t).toBeGreaterThan(252);
    expect(t).toBeLessThan(256);
  });

  it('reaches 288 K with a thin greenhouse and Venus-like values with a thick one', () => {
    const earth = equilibriumTemperatureFromLuminosity(1, 1, 0.306, 0.3);
    expect(earth).toBeGreaterThan(283);
    expect(earth).toBeLessThan(293);
    const venus = equilibriumTemperatureFromLuminosity(1, 0.723, 0.77, 1.0);
    expect(venus).toBeGreaterThan(680);
    expect(venus).toBeLessThan(790);
  });

  it('has a bounded greenhouse factor (no runaway at max atmosphere)', () => {
    expect(greenhouseFactor(0)).toBeCloseTo(1, 6);
    expect(greenhouseFactor(1)).toBeLessThan(3.5);
    expect(greenhouseFactor(5)).toBe(greenhouseFactor(1));
  });

  it('falls off as 1/sqrt(distance)', () => {
    const t1 = equilibriumTemperatureFromLuminosity(1, 1, 0, 0);
    const t4 = equilibriumTemperatureFromLuminosity(1, 4, 0, 0);
    expect(t1 / t4).toBeCloseTo(2, 3);
  });

  it('picks the star by luminosity, not by mass', () => {
    // A white dwarf far outmasses a red dwarf but is far dimmer, so a planet
    // sitting between them must take its temperature from the red dwarf.
    const wd = makeBody({ type: 'White Dwarf', mass: 0.6 * SOLAR, name: 'WD' });
    wd.position.set(auToDist(-1), 0, 0);
    const redDwarf = makeBody({ type: 'Star', mass: 0.3 * SOLAR, name: 'M dwarf' });
    redDwarf.position.set(auToDist(1), 0, 0);
    const planet = makeBody({ mass: 1, name: 'p' });
    const bodies = [wd, redDwarf, planet];
    for (let i = 0; i < 60; i++) updateEquilibriumTemperatures(bodies);

    const fromRedDwarf = equilibriumTemperatureFromLuminosity(
      deriveBodyState('Star', 0.3 * SOLAR).luminositySolar, 1, 0.245, 0,
    );
    expect(Math.abs(planet.temperature - fromRedDwarf)).toBeLessThan(10);
  });
});

describe('distance conversions', () => {
  it('round-trips AU', () => {
    expect(distToAU(auToDist(3.7))).toBeCloseTo(3.7, 10);
  });
  it('puts 1 AU at 40 simulation units, preserving the legacy scene scale', () => {
    expect(auToDist(1)).toBeCloseTo(40, 10);
  });
});
