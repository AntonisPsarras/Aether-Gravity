import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSandboxBody } from './bodyFactory';
import { clonePhysicsBody } from './physicsBridge';
import { angularMomentumOf, pairSofteningSq, scanCollisionsInPlace } from './physicsUtils';
import { resetVerletCache, verletStepInPlace } from './physicsSoA';
import { G_AETHER, M_SUN_IN_EARTH } from './units';
import { contactEscapeSpeed, CONTACT_FRACTION } from './collisionOutcome';
import type { CelestialBody, PhysicsEvent } from '../types';

const body = (id: string, mass: number, x: number, type: CelestialBody['type'] = 'Planet') =>
  createSandboxBody({ id, name: id, type, mass, position: new THREE.Vector3(x, 0, 0), velocity: new THREE.Vector3() });
const momentum = (bs: CelestialBody[]) => bs.reduce((v, b) => v.addScaledVector(b.velocity, b.mass), new THREE.Vector3());
const angular = (bs: CelestialBody[]) => bs.reduce((v, b) => v.add(angularMomentumOf(b)), new THREE.Vector3());
const centre = (bs: CelestialBody[]) => bs.reduce((v, b) => v.addScaledVector(b.position, b.mass), new THREE.Vector3()).divideScalar(bs.reduce((m,b) => m+b.mass,0));
const energy = (bs: CelestialBody[]) => .5 * bs.reduce((e,b) => e+b.mass*b.velocity.lengthSq(),0)
  - G_AETHER*bs[0].mass*bs[1].mass / Math.sqrt(bs[0].position.distanceToSquared(bs[1].position)+pairSofteningSq(bs[0],bs[1]));
afterEach(resetVerletCache);

describe('production numerical invariants', () => {
  it('bounds 100-orbit energy and angular drift and conserves linear momentum', () => {
    const bs = [body('sun',M_SUN_IN_EARTH,0,'Star'),body('earth',1,40)];
    const speed = Math.sqrt(G_AETHER*(bs[0].mass+1)/40);
    bs[0].velocity.z = -speed/(bs[0].mass+1); bs[1].velocity.z = speed*bs[0].mass/(bs[0].mass+1);
    const e0=energy(bs), l0=angular(bs), p0=momentum(bs); let drift=0;
    for(let i=0;i<102400;i++) { verletStepInPlace(bs,1/1024); if(i%128===0) drift=Math.max(drift,Math.abs((energy(bs)-e0)/e0)); }
    // Verlet is second-order; this is the existing 0.1% stable-orbit release bound.
    expect(drift).toBeLessThan(.001);
    // Relative angular tolerance allows accumulated Float64 summation roundoff,
    // well below the second-order truncation bound. Momentum has a zero reference.
    expect(angular(bs).distanceTo(l0)/l0.length()).toBeLessThan(1e-10);
    expect(momentum(bs).distanceTo(p0)).toBeLessThan(1e-8);
  });
  it('retraces collision-free trajectories with a fixed signed timestep', () => {
    const bs=[body('a',1,-20),body('b',2,20)]; bs[0].velocity.z=.3;
    const original=bs.map(clonePhysicsBody);
    for(let i=0;i<4096;i++) verletStepInPlace(bs,1/1024);
    for(let i=0;i<4096;i++) verletStepInPlace(bs,-1/1024);
    for(let i=0;i<2;i++) {
      expect(bs[i].position.distanceTo(original[i].position)).toBeLessThan(1e-10);
      expect(bs[i].velocity.distanceTo(original[i].velocity)).toBeLessThan(1e-10);
    }
  });
  it.each([false,true])('preserves barycentre, mass, momentum and angular accounting on shatter=%s', shatter => {
    const bs=[body('a',1,0),body('b',.7,1.5)];
    bs[0].velocity.set(.4,.2,.1);
    bs[1].velocity.set(.4-(shatter?3:.3)*contactEscapeSpeed(1.7,CONTACT_FRACTION*(bs[0].radius+bs[1].radius)),.2,.1);
    const c0=centre(bs), p0=momentum(bs), l0=angular(bs); const events: PhysicsEvent[]=[];
    scanCollisionsInPlace(bs,events,[]);
    expect(events.some(e=>e.outcome===(shatter?'shatter':'merge'))).toBe(true);
    expect(bs.reduce((m,b)=>m+b.mass,0)).toBeCloseTo(1.7,12);
    expect(centre(bs).distanceTo(c0)).toBeLessThan(1e-10);
    expect(momentum(bs).distanceTo(p0)).toBeLessThan(1e-10);
    expect(angular(bs).distanceTo(l0)).toBeLessThan(1e-10);
  });
  it('accounts for compact losses instead of silently scaling away momentum', () => {
    const bs=[body('a',M_SUN_IN_EARTH*5,0,'Black Hole'),body('b',1,.01)];
    bs[0].velocity.set(1,2,3); bs[1].velocity.set(3,1,2);
    const p0=momentum(bs),l0=angular(bs),m0=bs[0].mass+bs[1].mass;const events: PhysicsEvent[]=[];
    scanCollisionsInPlace(bs,events,[]);
    const loss=events.find(e=>e.type==='gravitational_wave')!;
    expect(loss.mass).toBeGreaterThan(0);
    expect(bs[0].mass+loss.mass!).toBeCloseTo(m0,8);
    expect(momentum(bs).addScaledVector(loss.velocity!,loss.mass!).distanceTo(p0)/p0.length()).toBeLessThan(1e-12);
    expect(angular(bs).add(loss.angularMomentum!).distanceTo(l0)).toBeLessThan(1e-8);
  });
  it('reprimes every acceleration when a new body joins a partially cached system', () => {
    const bs=[body('a',1,-10),body('b',2,10)];verletStepInPlace(bs,.001);
    bs.push(body('c',3,40));const fresh=bs.map(clonePhysicsBody);
    verletStepInPlace(bs,.001);resetVerletCache();verletStepInPlace(fresh,.001);
    for(let i=0;i<bs.length;i++) expect(bs[i].position.distanceTo(fresh[i].position)+bs[i].velocity.distanceTo(fresh[i].velocity)).toBeLessThan(1e-12);
  });
});
