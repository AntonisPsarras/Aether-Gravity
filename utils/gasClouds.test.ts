import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { fillHotGasEmitters } from '../components/Environment/GasClouds';

const body = (id: string, type: CelestialBody['type'], mass: number, temperature: number): CelestialBody => ({
  id, type, mass, temperature, name: id, radius: 1, radiusKm: 1,
  position: new THREE.Vector3(), velocity: new THREE.Vector3(), color: '#fff',
  texture: 'solid', trailColor: '#fff', habitability: 'N/A', population: 0,
});

describe('fillHotGasEmitters', () => {
  it('reuses and caps the caller-owned sink without retaining stale entries', () => {
    const sink: CelestialBody[] = [body('stale', 'Planet', 1, 300)];
    fillHotGasEmitters([
      body('cool', 'Star', 1000, 7000),
      body('a', 'White Dwarf', 100000, 12000),
      body('b', 'Star', 330000, 5800),
      body('c', 'Red Giant', 900000, 9000),
    ], sink, 2);
    expect(sink).toHaveLength(2);
    expect(sink.map((item) => item.id)).toEqual(expect.arrayContaining(['a', 'c']));
  });
});
