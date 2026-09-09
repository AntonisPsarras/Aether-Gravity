import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody, PhysicsEvent, WaveEvent } from '../types';
import { scanCollisionsInPlace, checkEvolutionInPlace } from './physicsUtils';

const stableBody = (id: string, x: number): CelestialBody => ({
  id, type: 'Planet', name: id, mass: 1, radius: 1, radiusKm: 6371,
  position: new THREE.Vector3(x, 0, 0), velocity: new THREE.Vector3(), color: '#fff',
  texture: 'rock', trailColor: '#fff', temperature: 288, habitability: 'N/A', population: 0,
});

describe('allocation-free physics scan interfaces', () => {
  it('reuse caller-owned event buffers in collision-free steady state', () => {
    const bodies = [stableBody('a', -100), stableBody('b', 100)];
    const events: PhysicsEvent[] = [];
    const waves: WaveEvent[] = [];
    for (let i = 0; i < 1000; i++) {
      expect(scanCollisionsInPlace(bodies, events, waves)).toBe(false);
      checkEvolutionInPlace(bodies, events);
    }
    expect(events).toHaveLength(0);
    expect(waves).toHaveLength(0);
  });
});
