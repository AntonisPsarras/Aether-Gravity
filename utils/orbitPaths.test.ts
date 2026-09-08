import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { sampleOrbitPath } from './orbitPaths';
import { elementsFromDegrees, gravitationalParameter, propagateOrbit } from './keplerOrbit';
import { satelliteRenderPosition } from './moonSystem';
import { findDominantParent } from './physicsUtils';

const body = (overrides: Partial<CelestialBody> = {}): CelestialBody => ({
  id: 'body', type: 'Planet', mass: 1, radius: 0.01, radiusKm: 6371,
  position: new THREE.Vector3(), velocity: new THREE.Vector3(),
  color: '#fff', texture: 'rock', trailColor: '#fff', temperature: 288,
  habitability: 'N/A', population: 0, name: 'test', ...overrides,
});
const parent = () => body({ id: 'parent', mass: 1000 });
const point = (points: Float32Array, i: number) => new THREE.Vector3().fromArray(points, i * 3);

describe('read-only orbit estimates', () => {
  it.each([0, 35, 120, 180])('closes a circular orbit at inclination %s', inclination => {
    const p = parent(), b = body();
    const orbit = elementsFromDegrees(40, 0, inclination, 25, 80, 0);
    propagateOrbit(orbit, gravitationalParameter(p.mass, b.mass), 0, b.position, b.velocity);
    const before = JSON.stringify([b, p]);
    const path = sampleOrbitPath(b, p, 128, 0);
    expect(path.length).toBe(129 * 3);
    expect(point(path, 0).distanceTo(point(path, 128))).toBeLessThan(1e-5);
    for (let i = 0; i < 129; i++) expect(point(path, i).length()).toBeCloseTo(40, 4);
    expect(JSON.stringify([b, p])).toBe(before);
  });

  it('preserves periapsis and apoapsis for an eccentric free body', () => {
    const p = parent(), b = body();
    const orbit = elementsFromDegrees(40, 0.8, 0, 0, 90, 30);
    propagateOrbit(orbit, gravitationalParameter(p.mass, b.mass), 0, b.position, b.velocity);
    const path = sampleOrbitPath(b, p, 128, 0);
    expect(point(path, 0).length()).toBeCloseTo(8, 4);
    expect(point(path, 64).length()).toBeCloseTo(72, 4);
  });

  it.each([1, 1.2])('draws finite forward escape arcs at escape-speed factor %s', factor => {
    const p = parent(), b = body({ position: new THREE.Vector3(40, 0, 0) });
    b.velocity.z = Math.sqrt(2 * gravitationalParameter(p.mass, b.mass) / 40) * factor;
    const path = sampleOrbitPath(b, p, 128, 0);
    expect(path.length).toBeGreaterThan(6);
    expect([...path].every(Number.isFinite)).toBe(true);
    expect(point(path, 0).distanceTo(b.position)).toBeLessThan(1e-4);
    expect(point(path, 1).z).toBeGreaterThan(0);
    expect(point(path, path.length / 3 - 1).length()).toBeLessThanOrEqual(100001);
    expect(point(path, 0).distanceTo(point(path, path.length / 3 - 1))).toBeGreaterThan(1);
  });

  it('omits radial, coincident and non-finite states', () => {
    const p = parent();
    expect(sampleOrbitPath(body(), p, 128, 0).length).toBe(0);
    expect(sampleOrbitPath(body({ position: new THREE.Vector3(40, 0, 0), velocity: new THREE.Vector3(1, 0, 0) }), p, 128, 0).length).toBe(0);
    expect(sampleOrbitPath(body({ position: new THREE.Vector3(NaN, 0, 0) }), p, 128, 0).length).toBe(0);
  });

  it('aligns persisted satellite paths with the existing exaggerated render transform', () => {
    const p = parent(); p.position.set(100, 20, -50);
    const b = body({ parentId: p.id, orbit: elementsFromDegrees(0.1, 0.2, 40, 20, 10, 65) });
    propagateOrbit(b.orbit!, gravitationalParameter(p.mass, b.mass), 3, b.position, b.velocity);
    b.position.add(p.position); b.velocity.add(p.velocity);
    const path = sampleOrbitPath(b, p, 128, 3);
    const drawn = satelliteRenderPosition(b, p, new THREE.Vector3());
    expect(point(path, 0).add(p.position).distanceTo(drawn)).toBeLessThan(1e-4);
  });

  it('responds to orbital edits and resolves a changed explicit parent', () => {
    const p = parent(), other = parent(); other.id = 'other'; other.position.x = 100;
    const b = body({ parentId: p.id, orbit: elementsFromDegrees(0.1, 0.1, 0, 0, 0, 0) });
    const first = sampleOrbitPath(b, p, 64, 0);
    b.orbit = { ...b.orbit!, a: 0.2 };
    expect(point(sampleOrbitPath(b, p, 64, 0), 0).length()).toBeCloseTo(point(first, 0).length() * 2, 4);
    b.parentId = other.id;
    expect(findDominantParent(b, [b, p, other])).toBe(other);
    expect(sampleOrbitPath(b, other, 64, 0).length).toBe(65 * 3);
  });
});
