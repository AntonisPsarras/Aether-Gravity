import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CelestialBody } from '../types';
import {
  sanitizeCelestialBody,
  clampLaunchVelocity,
  clampVelocityVector,
  PHYSICS_LIMITS,
} from './physicsBounds';

const baseBody = (): CelestialBody => ({
  id: 'b1',
  type: 'Planet',
  mass: 10,
  radius: 2,
  position: new THREE.Vector3(0, 0, 0),
  velocity: new THREE.Vector3(0, 0, 0),
  color: '#3b82f6',
  texture: 'rock',
  trailColor: '#3b82f6',
  temperature: 288,
  habitability: 'N/A',
  population: 0,
  name: 'Planet 1',
});

describe('physicsBounds sanitization', () => {
  it('clamps extreme velocity and position on full body sanitize', () => {
    const raw = baseBody();
    raw.velocity.set(9999, 0, 0);
    raw.position.set(9e8, 0, 0);
    const out = sanitizeCelestialBody(raw);
    expect(out.velocity.length()).toBeLessThanOrEqual(PHYSICS_LIMITS.MAX_VELOCITY_MAGNITUDE + 1e-6);
    expect(Math.abs(out.position.x)).toBeLessThanOrEqual(PHYSICS_LIMITS.MAX_POSITION_ABS);
  });

  it('caps drag-launch speed below general velocity max', () => {
    const v = new THREE.Vector3(500, 0, 0);
    const capped = clampLaunchVelocity(v);
    expect(capped.length()).toBeLessThanOrEqual(PHYSICS_LIMITS.MAX_DRAG_LAUNCH_SPEED + 1e-6);
  });

  it('repairs non-finite velocity components', () => {
    const v = new THREE.Vector3(Number.NaN, 1, 0);
    clampVelocityVector(v);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    expect(v.z).toBe(0);
  });

  it('strips control characters from names', () => {
    const out = sanitizeCelestialBody({
      ...baseBody(),
      name: 'Evil\x00Body',
    });
    expect(out.name).toBe('EvilBody');
  });
});
