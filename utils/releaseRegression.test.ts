import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSandboxBody } from './bodyFactory';
import { useStore } from './store';
import { clonePhysicsBody, getPhysicsBodiesSnapshot, registerPhysicsBodiesRef, unregisterPhysicsBodiesRef } from './physicsBridge';
import { captureSimulationSnapshot } from './simulationSnapshot';
import { FIXED_DT, getSimTime, physicsStepPolicy, resetAccumulator, resetVerletCache, runFixedSteps, setSimTime, verletStepInPlace } from './physicsSoA';
import { calculateOrbitalState, getOrbitalElements, pairSofteningSq, scanCollisionsInPlace } from './physicsUtils';
import { elementsFromDegrees, elementsFromState, propagateOrbit } from './keplerOrbit';
import { attachSatellite, propagateSatellites } from './moonSystem';
import { G_AETHER, circularOrbitalSpeed, M_SUN_IN_EARTH, orbitalPeriodYears } from './units';
import { scientificStepLimit } from './scientificStep';
import { simElapsedForFrame } from './simRate';
import type { CelestialBody } from '../types';

const body = (id: string, mass: number, x = 0, vz = 0, type: CelestialBody['type'] = 'Planet') => createSandboxBody({
  id, name: id, type, mass, position: new THREE.Vector3(x, 0, 0), velocity: new THREE.Vector3(0, 0, vz),
});
const fixture = () => [body('sun', M_SUN_IN_EARTH, 0, 0, 'Star'), body('earth', 1, 40, circularOrbitalSpeed(40, M_SUN_IN_EARTH)), body('extra', 1, 400)];
const ref = { current: [] as CelestialBody[] };
function setup() {
  registerPhysicsBodiesRef(ref);
  useStore.getState().installBodies(fixture());
}
afterEach(() => { unregisterPhysicsBodiesRef(ref); resetVerletCache(); resetAccumulator(); });
const quarterOrbit = () => { for (let i = 0; i < 256; i++) verletStepInPlace(ref.current, FIXED_DT); setSimTime(.25); };

describe('live state transactions', () => {
  it('preserves current survivors when deleting an unrelated body', () => {
    setup(); quarterOrbit();
    const earth = clonePhysicsBody(ref.current[1]);
    useStore.getState().removeBody('extra');
    expect(ref.current[1].position.distanceTo(earth.position)).toBe(0);
    expect(ref.current[1].velocity.distanceTo(earth.velocity)).toBe(0);
    expect(getSimTime()).toBe(.25);
  });
  it('rescales current tangential velocity, and matches a freshly primed force step', () => {
    setup(); quarterOrbit();
    const old = ref.current.map(clonePhysicsBody);
    useStore.getState().updateBody('sun', { mass: old[0].mass * 1.01 });
    const expected = old[1].velocity.clone().sub(old[0].velocity)
      .multiplyScalar(Math.sqrt((old[0].mass * 1.01 + old[1].mass) / (old[0].mass + old[1].mass))).add(old[0].velocity);
    expect(ref.current[1].velocity.distanceTo(expected)).toBeLessThan(1e-10);
    const fresh = ref.current.map(clonePhysicsBody);
    verletStepInPlace(ref.current, FIXED_DT);
    resetVerletCache(); verletStepInPlace(fresh, FIXED_DT);
    expect(ref.current[1].position.distanceTo(fresh[1].position)).toBeLessThan(1e-12);
    expect(ref.current[1].velocity.distanceTo(fresh[1].velocity)).toBeLessThan(1e-12);
  });
  it('keeps analytic moon phase across a parent mass edit', () => {
    setup();
    const moon = body('moon', .01, 0, 0, 'Moon');
    attachSatellite(moon, ref.current[1], elementsFromDegrees(.1, .1, 20, 50, 60, 40), 0);
    useStore.getState().appendBody(moon);
    setSimTime(.123);
    propagateSatellites(ref.current, new Map(ref.current.map(b => [b.id, b])), getSimTime());
    const before = ref.current[3].position.clone();
    useStore.getState().updateBody('earth', { mass: 1.1 });
    propagateSatellites(ref.current, new Map(ref.current.map(b => [b.id, b])), getSimTime());
    expect(ref.current[3].position.distanceTo(before)).toBeLessThan(1e-10);
  });
  it('restores bodies and clock together, with independent orbit/property copies', () => {
    setup();
    const moon = body('moon', .01, 0, 0, 'Moon');
    attachSatellite(moon, ref.current[1], elementsFromDegrees(.1, .1, 20, 50, 60, 40), 0);
    useStore.getState().appendBody(moon);
    setSimTime(.123);
    propagateSatellites(ref.current, new Map(ref.current.map(b => [b.id, b])), getSimTime());
    const snapshot = captureSimulationSnapshot();
    ref.current[3].orbit!.m0 += 1;
    ref.current[1].properties!.rotationPeriod = 2;
    quarterOrbit();
    useStore.getState().restoreSimulation(snapshot);
    propagateSatellites(ref.current, new Map(ref.current.map(b => [b.id, b])), getSimTime());
    expect(getSimTime()).toBe(.123);
    expect(ref.current[3].position.distanceTo(snapshot.bodies[3].position)).toBeLessThan(1e-12);
    expect(ref.current[1].properties!.rotationPeriod).toBe(snapshot.bodies[1].properties!.rotationPeriod);
    expect(ref.current[3].orbit).not.toBe(snapshot.bodies[3].orbit);
  });
  it('treats an empty registered world as authoritative', () => {
    registerPhysicsBodiesRef(ref); ref.current = [];
    expect(getPhysicsBodiesSnapshot(fixture())).toHaveLength(0);
    unregisterPhysicsBodiesRef(ref);
    expect(getPhysicsBodiesSnapshot(fixture())).toHaveLength(3);
  });
});

describe('orbital round trips', () => {
  it('preserves state across node quadrants and circular/equatorial/retrograde degeneracies', () => {
    const parent = fixture()[0];
    for (const inclination of [0, 35, 120, 180]) for (const node of [0, 50, 140, 230, 310]) for (const eccentricity of [0, .3]) {
      const original = calculateOrbitalState(parent, 40, eccentricity, inclination, node, 70, 30, 1);
      const child = { ...body('child', 1), ...original };
      const el = getOrbitalElements(child, parent);
      const back = calculateOrbitalState(parent, el.a, el.e, el.i, el.Omega, el.omega, el.nu, 1);
      expect(back.position.distanceTo(original.position)).toBeLessThan(1e-5);
      expect(back.velocity.distanceTo(original.velocity)).toBeLessThan(1e-4);
      const orbit = elementsFromState(original.position, original.velocity, G_AETHER * (parent.mass + 1), 0,
        { h: new THREE.Vector3(), e: new THREE.Vector3(), n: new THREE.Vector3() })!;
      const p = new THREE.Vector3(), v = new THREE.Vector3();
      propagateOrbit(orbit, G_AETHER * (parent.mass + 1), 0, p, v);
      expect(p.distanceTo(original.position)).toBeLessThan(1e-5);
      expect(v.distanceTo(original.velocity)).toBeLessThan(1e-4);
    }
  });
});

describe('sandbox accuracy and pacing', () => {
  it.each(['high', 'low'] as const)('keeps the tight black-hole orbit bound for 1000 periods on %s', tier => {
    const bodies = [body('hole', 1e10, 0, 0, 'Black Hole'), body('planet', 1, 30, circularOrbitalSpeed(30, 1e10))];
    const dt = Math.min(physicsStepPolicy(tier).fixedDt, scientificStepLimit(bodies));
    const energy = () => bodies[1].velocity.clone().sub(bodies[0].velocity).lengthSq() / 2 -
      G_AETHER * (bodies[0].mass + bodies[1].mass) / Math.sqrt(bodies[0].position.distanceToSquared(bodies[1].position) + pairSofteningSq(bodies[0], bodies[1]));
    resetVerletCache();
    const initial = energy(); let worst = 0;
    const steps = Math.ceil(1000 * orbitalPeriodYears(30, 1e10) / dt);
    for (let i = 0; i < steps; i++) {
      verletStepInPlace(bodies, dt);
      if (i % 128 === 0) worst = Math.max(worst, Math.abs((energy() - initial) / initial));
    }
    expect(energy()).toBeLessThan(0);
    expect(worst).toBeLessThan(.001);
    expect(bodies[0].position.distanceTo(bodies[1].position)).toBeLessThan(30.1);
  }, 20000);
  it('limits unbound encounters and repairs coincident contact without non-finite state', () => {
    const bodies = [body('a', 1, 0), body('b', 1, .01, 10000)];
    expect(scientificStepLimit(bodies)).toBeLessThan(FIXED_DT);
    bodies[1].position.set(0, 0, 0);
    resetVerletCache();
    const local = { current: bodies };
    runFixedSteps(local, .001, (bs, dt) => { scanCollisionsInPlace(bs, [], [], dt); return bs; });
    expect(local.current.every(b => [...b.position.toArray(), ...b.velocity.toArray()].every(Number.isFinite))).toBe(true);
  });
  it('matches 30/60/120 fps trajectories through tier changes and reverse playback', () => {
    const run = (fps: number) => {
      resetAccumulator(); resetVerletCache();
      const local = { current: fixture() };
      for (let frame = 0; frame < fps * 12; frame++) {
        const tier = frame < fps * 4 ? 'high' : 'low';
        const speed = frame < fps * 8 ? 1 : -1;
        runFixedSteps(local, simElapsedForFrame(1 / fps, speed, 'advanced', local.current, tier), undefined, tier);
      }
      return { bodies: local.current, time: getSimTime() };
    };
    const baseline = run(30);
    for (const fps of [60, 120]) {
      const actual = run(fps);
      expect(Math.abs(actual.time - baseline.time)).toBeLessThanOrEqual(1 / 512);
      expect(actual.bodies[1].position.distanceTo(baseline.bodies[1].position)).toBeLessThan(.6);
    }
  });
});
