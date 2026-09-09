import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { bodyRenderPosition } from './renderPosition';
import { satelliteRenderPosition } from './moonSystem';
import { toRenderSpace } from './scratchVectors';

const body = (over: Partial<CelestialBody>): CelestialBody => ({
  id: 'b',
  name: 'B',
  type: 'Planet',
  mass: 1,
  radius: 1,
  radiusKm: 6371,
  color: '#fff',
  temperature: 288,
  habitability: 'N/A',
  position: new THREE.Vector3(),
  velocity: new THREE.Vector3(),
  ...over,
} as CelestialBody);

const parentBody = () =>
  body({
    id: 'p',
    name: 'P',
    type: 'Gas Giant',
    mass: 318,
    radius: 12,
    radiusKm: 69911,
    position: new THREE.Vector3(100, 0, -50),
  });

describe('bodyRenderPosition', () => {
  it('places a free body at world position minus the floating origin', () => {
    const b = body({ position: new THREE.Vector3(10, 20, 30) });
    const offset = new THREE.Vector3(1, 2, 3);
    const out = new THREE.Vector3();

    expect(bodyRenderPosition(out, b, undefined, offset)).toBe(out);
    expect(out.toArray()).toEqual(
      toRenderSpace(new THREE.Vector3(), b.position, offset).toArray(),
    );
  });

  it('ignores a parent when the body is not on Kepler rails', () => {
    const parent = parentBody();
    const b = body({ parentId: parent.id, position: new THREE.Vector3(101, 0, -50) });
    const offset = new THREE.Vector3();
    const out = new THREE.Vector3();

    bodyRenderPosition(out, b, parent, offset);
    expect(out.toArray()).toEqual([101, 0, -50]);
  });

  it('draws a satellite through the parent orbit exaggeration, then shifts the origin', () => {
    const parent = parentBody();
    const b = body({
      id: 'moon',
      parentId: parent.id,
      orbit: { a: 0.003, e: 0.01, i: 0, lan: 0, argp: 0, m0: 0, epoch: 0 },
      position: new THREE.Vector3(100.4, 0, -50),
    } as Partial<CelestialBody>);
    const offset = new THREE.Vector3(5, -1, 2);
    const out = new THREE.Vector3();

    bodyRenderPosition(out, b, parent, offset);

    const expected = satelliteRenderPosition(b, parent, new THREE.Vector3()).sub(offset);
    expect(out.x).toBeCloseTo(expected.x, 10);
    expect(out.y).toBeCloseTo(expected.y, 10);
    expect(out.z).toBeCloseTo(expected.z, 10);
    // The exaggeration must actually do something, or this test proves nothing.
    expect(out.distanceTo(parent.position.clone().sub(offset))).toBeGreaterThan(0.4);
  });

  it('does not mutate the body or the floating origin', () => {
    const parent = parentBody();
    const b = body({
      parentId: parent.id,
      orbit: { a: 0.003, e: 0, i: 0, lan: 0, argp: 0, m0: 0, epoch: 0 },
      position: new THREE.Vector3(100.4, 0, -50),
    } as Partial<CelestialBody>);
    const offset = new THREE.Vector3(5, -1, 2);

    bodyRenderPosition(new THREE.Vector3(), b, parent, offset);

    expect(b.position.toArray()).toEqual([100.4, 0, -50]);
    expect(parent.position.toArray()).toEqual([100, 0, -50]);
    expect(offset.toArray()).toEqual([5, -1, 2]);
  });
});
