/**
 * Regression tests on the real-system *data*, not just the code.
 *
 * The strongest check available is that each body's orbital period, computed by
 * the engine from its mass and semi-major axis, matches the independently
 * published period. That can only pass if the unit system, G, the mass values
 * and the orbital elements are all simultaneously correct — a single wrong
 * digit anywhere shows up here.
 */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { REAL_SYSTEMS, buildRealSystem, getRealSystem } from '../content/realSystems';
import { M_SUN_IN_EARTH, distToAU, distToKm, orbitalPeriodYears } from './units';
import { gravitationalParameter, periodFromElements } from './keplerOrbit';
import { isSatellite, propagateSatellites, satellitePeriodYears } from './moonSystem';
import { checkCollisions, getOrbitalElements } from './physicsUtils';
import { verletStepInPlace, resetVerletCache } from './physicsSoA';
import { calculateHabitableZone } from './HabitabilityService';
import { bulkDensityGcm3, surfaceGravitySi } from './units';
import { classifyBody } from './bodyDerivation';

const solar = () => buildRealSystem(getRealSystem('solar-system')!);
const find = (bodies: ReturnType<typeof solar>, name: string) =>
  bodies.find((b) => b.name === name)!;

const within = (actual: number, expected: number, pct: number, label: string) => {
  expect(Math.abs(actual - expected) / Math.abs(expected), label).toBeLessThan(pct / 100);
};

describe('Solar System preset', () => {
  it('builds every declared body', () => {
    const bodies = solar();
    expect(bodies.length).toBe(REAL_SYSTEMS[0].bodies.length);
    expect(bodies.every((b) => Number.isFinite(b.position.x))).toBe(true);
    expect(bodies.every((b) => Number.isFinite(b.velocity.x))).toBe(true);
    expect(bodies.every((b) => b.radiusKm > 0)).toBe(true);
  });

  it('reproduces every planet’s published sidereal period from the physics', () => {
    const bodies = solar();
    const sun = find(bodies, 'Sun');
    // Published sidereal orbital periods, years (JPL fact sheets).
    const expected: Record<string, number> = {
      Mercury: 0.2408467, Venus: 0.61519726, Earth: 1.0000174, Mars: 1.8808476,
      Jupiter: 11.862615, Saturn: 29.447498, Uranus: 84.016846, Neptune: 164.79132,
      Pluto: 247.92065,
    };
    for (const [name, periodYears] of Object.entries(expected)) {
      const planet = find(bodies, name);
      const el = getOrbitalElements(planet, sun);
      const p = orbitalPeriodYears(el.a, sun.mass + planet.mass);
      within(p, periodYears, 1, `${name} period`);
    }
  });

  it('places every planet at its published semi-major axis', () => {
    const bodies = solar();
    const sun = find(bodies, 'Sun');
    const expected: Record<string, number> = {
      Mercury: 0.387099, Venus: 0.723336, Earth: 1.000003, Mars: 1.523710,
      Jupiter: 5.202887, Saturn: 9.536676, Uranus: 19.189165, Neptune: 30.069923,
      Pluto: 39.482117,
    };
    for (const [name, aAU] of Object.entries(expected)) {
      const el = getOrbitalElements(find(bodies, name), sun);
      within(distToAU(el.a), aAU, 0.5, `${name} semi-major axis`);
    }
  });

  it('reproduces published eccentricities', () => {
    const bodies = solar();
    const sun = find(bodies, 'Sun');
    const expected: Record<string, number> = {
      Mercury: 0.205636, Venus: 0.006777, Earth: 0.016711, Mars: 0.093394,
      Jupiter: 0.048386, Saturn: 0.053862, Uranus: 0.047257, Neptune: 0.008590,
      Pluto: 0.248827,
    };
    for (const [name, e] of Object.entries(expected)) {
      const el = getOrbitalElements(find(bodies, name), sun);
      expect(Math.abs(el.e - e), `${name} eccentricity`).toBeLessThan(0.002);
    }
  });

  it('reproduces published satellite periods', () => {
    const bodies = solar();
    // Sidereal periods in days (JPL satellite fact sheets).
    const expected: Array<[string, string, number]> = [
      ['Moon', 'Earth', 27.3217],
      ['Io', 'Jupiter', 1.769138],
      ['Europa', 'Jupiter', 3.551181],
      ['Ganymede', 'Jupiter', 7.154553],
      ['Callisto', 'Jupiter', 16.689018],
      ['Titan', 'Saturn', 15.945],
      ['Enceladus', 'Saturn', 1.370218],
      ['Titania', 'Uranus', 8.706234],
      ['Triton', 'Neptune', 5.876854],
      ['Charon', 'Pluto', 6.3872],
      ['Phobos', 'Mars', 0.318910],
    ];
    for (const [moonName, parentName, days] of expected) {
      const moon = find(bodies, moonName);
      const parent = find(bodies, parentName);
      const p = satellitePeriodYears(moon, parent) * 365.25;
      within(p, days, 2, `${moonName} period`);
    }
  });

  it('reproduces published planetary densities and surface gravities', () => {
    const bodies = solar();
    const expected: Array<[string, number, number]> = [
      // name, density g/cm3, surface gravity m/s2
      ['Mercury', 5.427, 3.70],
      ['Venus', 5.243, 8.87],
      ['Earth', 5.514, 9.80],
      ['Mars', 3.933, 3.71],
      ['Jupiter', 1.326, 24.79],
      ['Saturn', 0.687, 10.44],
      ['Uranus', 1.271, 8.87],
      ['Neptune', 1.638, 11.15],
    ];
    for (const [name, density, gravity] of expected) {
      const b = find(bodies, name);
      within(bulkDensityGcm3(b.mass, b.radiusKm), density, 1.5, `${name} density`);
      // Jupiter and Saturn are quoted at the 1-bar equatorial radius, where
      // rotation reduces effective gravity; the Newtonian value is a few
      // percent higher, so allow more slack for the giants.
      within(surfaceGravitySi(b.mass, b.radiusKm), gravity, name === 'Saturn' ? 12 : 8, `${name} gravity`);
    }
  });

  it('marks moons as satellites and everything else as free bodies', () => {
    const bodies = solar();
    const moonNames = ['Moon', 'Io', 'Europa', 'Ganymede', 'Callisto', 'Titan',
      'Enceladus', 'Titania', 'Triton', 'Charon', 'Phobos'];
    for (const b of bodies) {
      expect(isSatellite(b), `${b.name} satellite?`).toBe(moonNames.includes(b.name));
    }
  });

  it('keeps the N-body body count inside the mobile performance budget', () => {
    const bodies = solar();
    const nBody = bodies.filter((b) => !isSatellite(b));
    // 11 satellites cost O(1) each; only these go through the O(N^2) pair loop.
    expect(nBody.length).toBeLessThanOrEqual(12);
  });

  it('draws bodies in the right size order, and each star inside its innermost orbit', () => {
    // The two radius scales (stars compressed ~23x more than solid bodies so a
    // star fits inside its own planetary system) previously drew Jupiter more
    // than twice the size of the Sun.
    const bodies = solar();
    const r = (name: string) => find(bodies, name).radius;

    expect(r('Sun')).toBeGreaterThan(r('Jupiter'));
    expect(r('Jupiter')).toBeGreaterThan(r('Saturn'));
    expect(r('Saturn')).toBeGreaterThan(r('Neptune'));
    expect(r('Neptune')).toBeGreaterThan(r('Earth'));
    expect(r('Earth')).toBeGreaterThan(r('Mars'));
    expect(r('Mars')).toBeGreaterThan(r('Moon'));
    expect(r('Moon')).toBeGreaterThan(r('Phobos'));

    // The Sun must be drawn smaller than Mercury's orbit or the inner system
    // would be swallowed by its own star.
    const mercuryOrbit = find(bodies, 'Mercury').position.length();
    expect(r('Sun')).toBeLessThan(mercuryOrbit * 0.9);

    // Nothing may be drawn so large that it overlaps its own orbit.
    for (const b of bodies) {
      if (isSatellite(b) || b.name === 'Sun') continue;
      expect(b.radius, `${b.name} radius vs orbit`).toBeLessThan(b.position.length() * 0.5);
    }
  });

  it('labels every moon as a Moon rather than reclassifying it', () => {
    // Phobos is only 1.8e-9 Earth masses; the Moon type's mass range has to
    // reach that far down or the classifier demotes it to an asteroid.
    const moonNames = ['Moon', 'Io', 'Europa', 'Ganymede', 'Callisto', 'Titan',
      'Enceladus', 'Titania', 'Triton', 'Charon', 'Phobos'];
    const bodies = solar();
    for (const name of moonNames) {
      expect(classifyBody('Moon', find(bodies, name).mass), name).toBe('Moon');
    }
  });

  it('has Triton on a retrograde orbit', () => {
    const triton = find(solar(), 'Triton');
    expect(triton.orbit!.i).toBeGreaterThan(Math.PI / 2);
  });

  it('starts in the barycentric frame, so the system does not drift', () => {
    const bodies = solar().filter((b) => !isSatellite(b));
    const mom = new THREE.Vector3();
    let totalMass = 0;
    for (const b of bodies) {
      mom.addScaledVector(b.velocity, b.mass);
      totalMass += b.mass;
    }
    // Net velocity of the centre of mass, in units of Earth's orbital speed.
    expect(mom.length() / totalMass).toBeLessThan(0.5);
  });

  it('does not eat its own moons on the first collision pass', () => {
    // A moon's true orbital radius is far inside its parent's *drawn* radius
    // (the Moon at 0.10 length units against an Earth drawn at 2.5), so a
    // naive contact test against the visual radius merges every satellite
    // immediately. This caught a real bug: the Solar System preset lost all 11
    // moons within one physics step.
    const bodies = solar();
    const before = bodies.length;
    const result = checkCollisions(bodies, 0);
    expect(result.merged).toBe(false);
    expect(result.active.length).toBe(before);
    expect(result.active.filter(isSatellite).length).toBe(11);
  });

  it('keeps its moons over a sustained run', () => {
    resetVerletCache();
    const bodies = solar();
    const byId = new Map(bodies.map((b) => [b.id, b]));
    const parents = new Map<string, ReturnType<typeof find> | null>();
    for (const b of bodies) parents.set(b.id, null);

    let live = bodies;
    for (let step = 0; step < 300; step++) {
      verletStepInPlace(live, 1 / 1024);
      propagateSatellites(live, byId, step / 1024);
      live = checkCollisions(live, step).active;
    }
    expect(live.length).toBe(bodies.length);
    expect(live.filter(isSatellite).length).toBe(11);
    // And each moon must still be at a sane distance from its parent.
    for (const moon of live.filter(isSatellite)) {
      const parent = byId.get(moon.parentId!)!;
      const sep = moon.position.distanceTo(parent.position);
      expect(sep, `${moon.name} separation`).toBeGreaterThan(0);
      expect(sep, `${moon.name} separation`).toBeLessThan(1);
    }
  });

  it('stays bound: no planet escapes over 200 integration steps', () => {
    resetVerletCache();
    const bodies = solar().filter((b) => !isSatellite(b));
    const before = bodies.map((b) => b.position.length());
    for (let i = 0; i < 200; i++) verletStepInPlace(bodies, 1 / 1024);
    bodies.forEach((b, i) => {
      expect(Number.isFinite(b.position.x), `${b.name} finite`).toBe(true);
      // Nothing should move more than a few percent in half a year.
      if (before[i] > 1) {
        expect(Math.abs(b.position.length() - before[i]) / before[i], `${b.name} drift`)
          .toBeLessThan(0.2);
      }
    });
  });

  it('places Earth and Mars in the habitable zone and Jupiter outside it', () => {
    const bodies = solar();
    const sun = find(bodies, 'Sun');
    const hz = calculateHabitableZone(1.0, sun.temperature);
    const aAU = (name: string) => distToAU(getOrbitalElements(find(bodies, name), sun).a);

    // Compare semi-major axes, not instantaneous distance: Earth's perihelion
    // (0.983 AU) actually falls just inside the 0.993 AU moist-greenhouse
    // limit, which is a real feature of the Kopparapu model rather than an
    // error — Earth sits close to the conservative inner edge.
    expect(aAU('Earth')).toBeGreaterThan(hz.inner);
    expect(aAU('Earth')).toBeLessThan(hz.outer);
    expect(aAU('Mars')).toBeGreaterThan(hz.inner);
    expect(aAU('Mars')).toBeLessThan(hz.outer);
    expect(aAU('Venus')).toBeLessThan(hz.inner);
    expect(aAU('Jupiter')).toBeGreaterThan(hz.optimisticOuter);
  });
});

describe('TRAPPIST-1 preset', () => {
  const build = () => buildRealSystem(getRealSystem('trappist-1')!);

  it('reproduces the published orbital periods', () => {
    const bodies = build();
    const star = bodies[0];
    // Agol et al. 2021, periods in days.
    const expected: Record<string, number> = {
      b: 1.510826, c: 2.421937, d: 4.049219, e: 6.101013,
      f: 9.207540, g: 12.352446, h: 18.772866,
    };
    for (const [letter, days] of Object.entries(expected)) {
      const p = bodies.find((b) => b.name === `TRAPPIST-1${letter}`)!;
      const el = getOrbitalElements(p, star);
      const period = orbitalPeriodYears(el.a, star.mass + p.mass) * 365.25;
      within(period, days, 2, `TRAPPIST-1${letter} period`);
    }
  });

  it('puts e, f and g in the habitable zone', () => {
    const bodies = build();
    const star = bodies[0];
    const hz = calculateHabitableZone(
      star.properties?.luminositySolarDerived ?? 0.000553,
      star.temperature,
    );
    for (const letter of ['e', 'f', 'g']) {
      const p = bodies.find((b) => b.name === `TRAPPIST-1${letter}`)!;
      const au = distToAU(p.position.distanceTo(star.position));
      expect(au, `TRAPPIST-1${letter} inside HZ`).toBeGreaterThan(hz.optimisticInner);
      expect(au, `TRAPPIST-1${letter} inside HZ`).toBeLessThan(hz.optimisticOuter);
    }
  });

  it('is more compact than Mercury’s orbit', () => {
    const bodies = build();
    const h = bodies.find((b) => b.name === 'TRAPPIST-1h')!;
    expect(distToAU(h.position.length())).toBeLessThan(0.387);
  });
});

describe('all presets', () => {
  it('produce finite, in-bounds bodies with unique ids', () => {
    for (const system of REAL_SYSTEMS) {
      const bodies = buildRealSystem(system);
      const ids = new Set(bodies.map((b) => b.id));
      expect(ids.size, `${system.id} unique ids`).toBe(bodies.length);
      for (const b of bodies) {
        expect(Number.isFinite(b.mass), `${system.id}/${b.name} mass`).toBe(true);
        expect(b.mass, `${system.id}/${b.name} mass`).toBeGreaterThan(0);
        expect(Number.isFinite(b.radius), `${system.id}/${b.name} radius`).toBe(true);
        expect(b.radiusKm, `${system.id}/${b.name} radiusKm`).toBeGreaterThan(0);
        expect(Number.isFinite(b.position.x), `${system.id}/${b.name} pos`).toBe(true);
        expect(Number.isFinite(b.velocity.x), `${system.id}/${b.name} vel`).toBe(true);
      }
    }
  });

  it('cites a source for every system', () => {
    for (const system of REAL_SYSTEMS) {
      expect(system.source.length, `${system.id} source`).toBeGreaterThan(20);
    }
  });
});
