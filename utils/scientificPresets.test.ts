import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildRealSystem, getRealSystem, REAL_SYSTEMS } from '../content/realSystems';
import { scientificStepLimit } from './scientificStep';
import { resetVerletCache, verletStepInPlace, resetAccumulator, runFixedSteps, getSimTime } from './physicsSoA';
import { bodyLuminositySolar, checkCollisions, getOrbitalElements, pairSofteningSq, reconcileBodyDerivedState } from './physicsUtils';
import { isSatellite, propagateSatellites } from './moonSystem';
import { serializeBodies, deserializeBodies, parseWorldData } from './worldStorage';
import { G_AETHER } from './units';
import { bodyVisualRadius } from './displayMode';
import { presetViewFrame, presetViews } from './presetViews';
import { simElapsedForFrame } from './simRate';

const build = (id: string) => buildRealSystem(getRealSystem(id)!);
const energy = (bodies: ReturnType<typeof build>) => {
  let total = 0;
  for (let i = 0; i < bodies.length; i++) {
    total += bodies[i].mass * bodies[i].velocity.lengthSq() / 2;
    for (let j = i + 1; j < bodies.length; j++) total -= G_AETHER * bodies[i].mass * bodies[j].mass / Math.sqrt(bodies[i].position.distanceToSquared(bodies[j].position) + pairSofteningSq(bodies[i], bodies[j]));
  }
  return total;
};

describe('scientific presets', () => {
  it('preserves satellite offsets at initialization and through persistence', () => {
    for (const system of REAL_SYSTEMS) {
      const bodies = deserializeBodies(serializeBodies(buildRealSystem(system)));
      bodies.forEach(reconcileBodyDerivedState);
      const before = bodies.map(b => b.position.clone());
      propagateSatellites(bodies, new Map(bodies.map(b => [b.id, b])), 0);
      for (let i = 0; i < bodies.length; i++) {
        expect(bodies[i].position.distanceTo(before[i])).toBeLessThan(1e-9);
        expect(bodies[i].properties?.presetId).toBe(system.id);
        expect(bodies[i].properties?.physicalCollisions).toBe(true);
        expect(bodies[i].properties?.epochJD).toBe(system.epochJD);
      }
      const free = bodies.filter(b => !isSatellite(b));
      const momentum = free.reduce((v, b) => v.addScaledVector(b.velocity, b.mass), new THREE.Vector3());
      expect(momentum.length() / free.reduce((m, b) => m + b.mass, 0)).toBeLessThan(1e-10);
    }
  });

  it('keeps measured luminosity after derivation and save/load', () => {
    for (const id of ['solar-system', 'trappist-1']) {
      const bodies = deserializeBodies(serializeBodies(build(id)));
      for (const b of bodies.filter(b => b.type === 'Star')) {
        const measured = b.properties!.luminositySolar!;
        reconcileBodyDerivedState(b);
        expect(bodyLuminositySolar(b)).toBe(measured);
        expect(b.properties!.luminositySolarDerived).toBe(measured);
      }
    }
  });

  it('has no false display-radius collisions in either mode', () => {
    for (const system of REAL_SYSTEMS) {
      const bodies = buildRealSystem(system);
      expect(checkCollisions(bodies, 0).active.length).toBe(bodies.length);
      for (const mode of ['beginner', 'advanced'] as const) {
        for (const view of presetViews[system.id]) {
          for (const aspect of [390 / 844, 1280 / 720]) {
            const frame = presetViewFrame(bodies, view, mode, aspect)!;
            expect(frame.distance).toBeGreaterThan(0);
            expect(frame.distance).toBeLessThan(5e6);
          }
        }
        if (system.id === 'trappist-1') {
          for (const b of bodies.slice(1)) {
            const pericentre = getOrbitalElements(b, bodies[0]).a * (1 - getOrbitalElements(b, bodies[0]).e);
            expect(bodyVisualRadius(b, mode) + bodyVisualRadius(bodies[0], mode)).toBeLessThan(pericentre);
          }
        }
      }
    }
  });

  it('uses the same scientific step on low and high tiers, with bounded playback', () => {
    for (const tier of ['low', 'high'] as const) {
      for (const mode of ['beginner', 'advanced'] as const) {
        resetAccumulator(); resetVerletCache();
        const bodies = build('trappist-1');
        const dt = scientificStepLimit(bodies);
        expect(dt).toBeLessThan(1.510826 / 365.25 / 256);
        const ref = { current: bodies };
        let fed = 0;
        for (let i = 0; i < 120; i++) {
          const elapsed = simElapsedForFrame(1 / 30, 4, mode, ref.current, tier);
          fed += elapsed;
          runFixedSteps(ref, elapsed, undefined, tier);
        }
        expect(Math.abs(getSimTime() - fed)).toBeLessThan(dt * 1.1);
        const before = getSimTime();
        runFixedSteps(ref, -dt, undefined, tier);
        expect(getSimTime()).toBeLessThan(before);
      }
    }
  });

  it('preserves the simulation clock in save data and defaults old saves to zero', () => {
    const raw = { id: 'science', version: 2, bodies: serializeBodies(build('trappist-1')), settings: { simTime: 12.5 } };
    expect(parseWorldData(raw)?.settings.simTime).toBe(12.5);
    expect(parseWorldData({ ...raw, settings: {} })?.settings.simTime).toBe(0);
  });

  it('uses synchronous orbital periods and preserves retrograde obliquities', () => {
    const trappist = build('trappist-1');
    const days = [1.510826, 2.421937, 4.049219, 6.101013, 9.207540, 12.352446, 18.772866];
    trappist.slice(1).forEach((b, i) => expect(b.properties!.rotationPeriod! / 24).toBeCloseTo(days[i], 12));
    const solar = build('solar-system');
    for (const name of ['Venus', 'Uranus', 'Pluto']) {
      const b = solar.find(b => b.name === name)!;
      expect(b.properties!.obliquity).toBeGreaterThan(90);
      // Positive spin about the south-pointing axis: no second sign reversal.
      expect(b.properties!.rotationPeriod).toBeGreaterThan(0);
    }
    expect(solar.find(b => b.name === 'Titania')!.orbit!.i).toBeGreaterThan(1);
    expect(solar.find(b => b.name === 'Charon')!.orbit!.i).toBeGreaterThan(Math.PI / 2);
  });

  it('stays bound for 1000 inner orbits with <0.1% energy error and timestep convergence', () => {
    const dt = scientificStepLimit(build('trappist-1'));
    const steps = Math.ceil(1000 * 1.510826 / 365.25 / dt);
    const run = (division: number) => {
      resetVerletCache();
      const bodies = build('trappist-1');
      const e0 = energy(bodies);
      let worst = 0;
      for (let i = 0; i < steps * division; i++) {
        verletStepInPlace(bodies, dt / division);
        if (i % 256 === 0) {
          worst = Math.max(worst, Math.abs((energy(bodies) - e0) / e0));
          expect(checkCollisions(bodies, 0).active.length).toBe(8);
        }
      }
      for (const b of bodies.slice(1)) {
        const orbit = getOrbitalElements(b, bodies[0]);
        expect(orbit.e).toBeLessThan(0.1);
        expect(orbit.a).toBeGreaterThan(0);
      }
      expect(worst).toBeLessThan(0.001);
      return { bodies, worst };
    };
    const coarse = run(1), fine = run(2), reference = run(4);
    const error = (a: typeof coarse, b: typeof coarse) => a.bodies.slice(1).reduce((sum, body, i) => sum + body.position.distanceTo(b.bodies[i + 1].position), 0);
    expect(error(fine, reference)).toBeLessThan(error(coarse, reference) * 0.4);
    console.info('TRAPPIST-1 1000-orbit validation', { dt, steps, maxRelativeEnergyError: coarse.worst, convergenceRatio: error(fine, reference) / error(coarse, reference) });
  }, 60000);
});
