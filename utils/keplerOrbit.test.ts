import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import {
  elementsFromDegrees,
  elementsFromState,
  gravitationalParameter,
  meanAnomalyFromTrueAnomaly,
  normalizeAngle,
  periodFromElements,
  propagateOrbit,
  solveKepler,
  trueAnomalyFromEccentric,
} from './keplerOrbit';
import {
  captureAsSatellite,
  hillRadius,
  isSatellite,
  moonOrbitRenderScale,
  promoteEscapedMoons,
  propagateSatellites,
  satellitePeriodYears,
} from './moonSystem';
import { deriveBodyState } from './bodyDerivation';
import { M_SUN_IN_EARTH, auToDist, kmToDist } from './units';

const SOLAR = M_SUN_IN_EARTH;

const makeBody = (over: Partial<CelestialBody> = {}): CelestialBody => {
  const type = over.type ?? 'Planet';
  const mass = over.mass ?? 1;
  const d = deriveBodyState(type, mass, over.properties);
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    type, mass,
    radius: d.radius,
    radiusKm: d.radiusKm,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    color: '#fff', texture: 'solid', trailColor: '#fff',
    temperature: 288, habitability: 'N/A', population: 0, name: 'test',
    ...over,
  };
};

const scratch = () => ({
  h: new THREE.Vector3(), e: new THREE.Vector3(), n: new THREE.Vector3(),
});

describe("Kepler's equation solver", () => {
  it('is exact for a circular orbit', () => {
    for (const m of [0, 1, 3, 6]) {
      expect(solveKepler(m, 0)).toBeCloseTo(normalizeAngle(m), 12);
    }
  });

  it('satisfies M = E - e sin E to 1e-9 across the eccentricity range', () => {
    for (const e of [0, 0.1, 0.4, 0.7, 0.9, 0.95, 0.99]) {
      for (let k = 0; k < 16; k++) {
        const M = (k / 16) * 2 * Math.PI;
        const E = solveKepler(M, e);
        expect(Math.abs(E - e * Math.sin(E) - M), `e=${e} M=${M}`).toBeLessThan(1e-9);
      }
    }
  });

  it('round-trips true anomaly through mean anomaly', () => {
    for (const e of [0, 0.2, 0.6, 0.9]) {
      for (const nuDeg of [10, 90, 200, 330]) {
        const nu = (nuDeg * Math.PI) / 180;
        const M = meanAnomalyFromTrueAnomaly(nu, e);
        const back = trueAnomalyFromEccentric(solveKepler(M, e), e);
        expect(normalizeAngle(back)).toBeCloseTo(normalizeAngle(nu), 8);
      }
    }
  });
});

describe('orbit propagation', () => {
  it('round-trips elements -> state -> elements', () => {
    const mu = gravitationalParameter(SOLAR);
    const pos = new THREE.Vector3();
    const vel = new THREE.Vector3();
    for (const e of [0, 0.05, 0.4, 0.8]) {
      const orbit = elementsFromDegrees(auToDist(2), e, 25, 60, 110, 200);
      propagateOrbit(orbit, mu, 0, pos, vel);
      const back = elementsFromState(pos, vel, mu, 0, scratch());
      expect(back, `e=${e}`).not.toBeNull();
      expect(Math.abs(back!.a - orbit.a) / orbit.a, `a e=${e}`).toBeLessThan(1e-8);
      expect(Math.abs(back!.e - orbit.e), `e e=${e}`).toBeLessThan(1e-8);
      expect(Math.abs(back!.i - orbit.i), `i e=${e}`).toBeLessThan(1e-8);

      // For a circular orbit periapsis is undefined, so omega and M are not
      // separately observable — only their sum, the mean argument of latitude.
      // Asserting them individually would be asserting a convention, not physics.
      const sumIn = normalizeAngle(orbit.argp + orbit.m0);
      const sumOut = normalizeAngle(back!.argp + back!.m0);
      const delta = Math.abs(normalizeAngle(sumOut - sumIn + Math.PI) - Math.PI);
      expect(delta, `omega+M e=${e}`).toBeLessThan(1e-7);

      if (e > 1e-6) {
        expect(Math.abs(normalizeAngle(back!.m0) - normalizeAngle(orbit.m0)), `M e=${e}`)
          .toBeLessThan(1e-7);
      }
    }
  });

  it('returns to its start after exactly one period', () => {
    const mu = gravitationalParameter(SOLAR);
    const orbit = elementsFromDegrees(auToDist(1.5), 0.3, 10, 0, 0, 45);
    const period = periodFromElements(orbit.a, mu);
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    propagateOrbit(orbit, mu, 0, p0);
    propagateOrbit(orbit, mu, period, p1);
    expect(p0.distanceTo(p1)).toBeLessThan(orbit.a * 1e-8);
  });

  it('conserves the orbit: radius stays between periapsis and apoapsis', () => {
    const mu = gravitationalParameter(SOLAR);
    const orbit = elementsFromDegrees(auToDist(1), 0.6, 30, 40, 50, 0);
    const peri = orbit.a * (1 - orbit.e);
    const apo = orbit.a * (1 + orbit.e);
    const p = new THREE.Vector3();
    for (let k = 0; k < 64; k++) {
      propagateOrbit(orbit, mu, k / 64, p);
      expect(p.length()).toBeGreaterThanOrEqual(peri - 1e-6);
      expect(p.length()).toBeLessThanOrEqual(apo + 1e-6);
    }
  });

  it('gives an unbound state no elements', () => {
    const mu = gravitationalParameter(SOLAR);
    const pos = new THREE.Vector3(auToDist(1), 0, 0);
    const vel = new THREE.Vector3(0, 0, 1e6);   // far above escape velocity
    expect(elementsFromState(pos, vel, mu, 0, scratch())).toBeNull();
  });

  it('reproduces the sidereal period of the Moon', () => {
    // Semi-major axis 384 399 km, Earth + Moon mass -> 27.32 days.
    const orbit = elementsFromDegrees(kmToDist(384399), 0.0549, 5.145, 0, 0, 0);
    const mu = gravitationalParameter(1, 0.0123);
    const periodDays = periodFromElements(orbit.a, mu) * 365.25;
    expect(periodDays).toBeGreaterThan(27.0);
    expect(periodDays).toBeLessThan(27.6);
  });

  it('reproduces the orbital period of Io', () => {
    // 421 700 km around Jupiter -> 1.769 days.
    const orbit = elementsFromDegrees(kmToDist(421700), 0.0041, 0.05, 0, 0, 0);
    const periodDays = periodFromElements(orbit.a, gravitationalParameter(317.83, 0.015)) * 365.25;
    expect(periodDays).toBeGreaterThan(1.74);
    expect(periodDays).toBeLessThan(1.80);
  });
});

describe('satellite system', () => {
  const buildEarthMoon = () => {
    const earth = makeBody({ id: 'earth', mass: 1, name: 'Earth' });
    earth.position.set(auToDist(1), 0, 0);
    earth.velocity.set(0, 0, 29.78 / 0.11849);   // roughly Earth's orbital speed
    const moon = makeBody({
      id: 'moon', type: 'Moon', mass: 0.0123, name: 'Moon',
      parentId: 'earth',
      orbit: elementsFromDegrees(kmToDist(384399), 0.0549, 5.145, 0, 0, 0),
    });
    return { earth, moon };
  };

  it('recognises a satellite', () => {
    const { earth, moon } = buildEarthMoon();
    expect(isSatellite(moon)).toBe(true);
    expect(isSatellite(earth)).toBe(false);
  });

  it('places the moon at the right true distance from its parent', () => {
    const { earth, moon } = buildEarthMoon();
    const byId = new Map([[earth.id, earth], [moon.id, moon]]);
    propagateSatellites([earth, moon], byId, 0);
    const sep = moon.position.distanceTo(earth.position);
    expect(Math.abs(sep - kmToDist(384399)) / kmToDist(384399)).toBeLessThan(0.06);
  });

  it('carries the parent’s orbital velocity, so it follows it around the star', () => {
    const { earth, moon } = buildEarthMoon();
    const byId = new Map([[earth.id, earth], [moon.id, moon]]);
    propagateSatellites([earth, moon], byId, 0);
    // The moon's speed must be dominated by Earth's, not by its own orbit.
    expect(moon.velocity.length()).toBeGreaterThan(earth.velocity.length() * 0.9);
    expect(moon.velocity.length()).toBeLessThan(earth.velocity.length() * 1.1);
  });

  it('reports the true period, not the exaggerated render geometry', () => {
    const { earth, moon } = buildEarthMoon();
    const days = satellitePeriodYears(moon, earth) * 365.25;
    expect(days).toBeGreaterThan(27.0);
    expect(days).toBeLessThan(27.6);
  });

  it('inflates the drawn orbit by exactly the parent radius exaggeration', () => {
    const { earth } = buildEarthMoon();
    const scale = moonOrbitRenderScale(earth);
    // Earth is drawn at 2.5 units against a true 6371 km = 0.0017 units.
    expect(scale).toBeGreaterThan(1000);
    // The drawn orbit-to-radius ratio must equal the true one (60 for the Moon).
    const trueRatio = kmToDist(384399) / kmToDist(earth.radiusKm);
    const drawnRatio = (kmToDist(384399) * scale) / earth.radius;
    expect(drawnRatio).toBeCloseTo(trueRatio, 6);
    expect(drawnRatio).toBeGreaterThan(50);
  });

  it('captures a free body onto rails without moving it', () => {
    const earth = makeBody({ id: 'earth', mass: 1 });
    const rock = makeBody({ id: 'rock', type: 'Asteroid', mass: 1e-6 });
    rock.position.set(kmToDist(100000), 0, 0);
    // A circular orbit at that distance.
    const mu = gravitationalParameter(1, 1e-6);
    rock.velocity.set(0, 0, Math.sqrt(mu / kmToDist(100000)));

    expect(captureAsSatellite(rock, earth, 0)).toBe(true);
    expect(isSatellite(rock)).toBe(true);

    const before = rock.position.clone();
    propagateSatellites([earth, rock], new Map([['earth', earth], ['rock', rock]]), 0);
    expect(rock.position.distanceTo(before)).toBeLessThan(before.length() * 1e-6);
  });

  it('refuses to capture an unbound body', () => {
    const earth = makeBody({ id: 'earth', mass: 1 });
    const rock = makeBody({ id: 'rock', type: 'Asteroid', mass: 1e-6 });
    rock.position.set(kmToDist(100000), 0, 0);
    rock.velocity.set(0, 0, 1e6);
    expect(captureAsSatellite(rock, earth, 0)).toBe(false);
    expect(isSatellite(rock)).toBe(false);
  });

  it('promotes a moon whose parent has disappeared', () => {
    const { moon } = buildEarthMoon();
    const promoted = promoteEscapedMoons([moon], new Map(), new Map());
    expect(promoted).toEqual(['moon']);
    expect(isSatellite(moon)).toBe(false);
  });

  it('promotes a moon pushed outside its parent Hill sphere', () => {
    const sun = makeBody({ id: 'sun', type: 'Star', mass: SOLAR });
    const { earth, moon } = buildEarthMoon();
    // Earth's Hill radius is ~0.01 AU; put the moon well beyond it.
    moon.orbit!.a = auToDist(0.05);
    const byId = new Map([['sun', sun], ['earth', earth], ['moon', moon]]);
    const parents = new Map<string, CelestialBody | null>([['earth', sun]]);
    expect(promoteEscapedMoons([sun, earth, moon], byId, parents)).toEqual(['moon']);
    expect(isSatellite(moon)).toBe(false);
  });

  it('keeps a moon inside the Hill sphere on rails', () => {
    const sun = makeBody({ id: 'sun', type: 'Star', mass: SOLAR });
    const { earth, moon } = buildEarthMoon();
    const byId = new Map([['sun', sun], ['earth', earth], ['moon', moon]]);
    const parents = new Map<string, CelestialBody | null>([['earth', sun]]);
    expect(promoteEscapedMoons([sun, earth, moon], byId, parents)).toEqual([]);
    expect(isSatellite(moon)).toBe(true);
  });

  it("computes Earth's Hill radius as roughly 0.01 AU", () => {
    const sun = makeBody({ id: 'sun', type: 'Star', mass: SOLAR });
    const earth = makeBody({ id: 'earth', mass: 1 });
    earth.position.set(auToDist(1), 0, 0);
    const rH = hillRadius(earth, sun);
    expect(rH).toBeGreaterThan(auToDist(0.008));
    expect(rH).toBeLessThan(auToDist(0.012));
  });
});
