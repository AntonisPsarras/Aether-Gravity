import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CelestialBody } from '../types';
import { createWorld, getWorldList, serializeBodies, deserializeBodies, sanitizeWorldSettings, parseWorldData } from './worldStorage';
import { clampMass, clampSpeed, PHYSICS_LIMITS } from './physicsBounds';

describe('world persistence sanitization', () => {
  it('round-trips body properties through serialize/deserialize', () => {
    const body: CelestialBody = {
      id: 'test-1',
      type: 'Planet',
      mass: 4.2,
      radius: 2.5,
      radiusKm: 6371,
      position: new THREE.Vector3(1, 0, 2),
      velocity: new THREE.Vector3(0, 0, 3),
      color: '#3b82f6',
      texture: 'rock',
      trailColor: '#3b82f6',
      temperature: 288,
      habitability: 'N/A',
      population: 0,
      name: 'Planet 1',
      properties: { atmosphere: 0.55, tectonics: 0.3, rotationPeriod: 24 },
    };

    const [restored] = deserializeBodies(serializeBodies([body]));
    expect(restored.properties?.atmosphere).toBe(0.55);
    expect(restored.properties?.tectonics).toBe(0.3);
    expect(restored.properties?.rotationPeriod).toBe(24);
  });

  it('clamps corrupt save data and simulation speed', () => {
    expect(clampMass(Number.POSITIVE_INFINITY)).toBe(PHYSICS_LIMITS.MAX_MASS);
    expect(clampMass(-5)).toBe(PHYSICS_LIMITS.MIN_MASS);
    expect(clampSpeed(Number.NaN)).toBe(1);
    expect(sanitizeWorldSettings({ speed: 99, showGrid: true, showDust: true, showHabitable: false, showStability: false }).speed).toBe(4);
  });

  it('rejects malformed world JSON', () => {
    expect(parseWorldData(null)).toBeNull();
    expect(parseWorldData({ id: 'x' })).toBeNull();
    expect(parseWorldData({ id: 'x', bodies: [], settings: { speed: 2, showGrid: true, showDust: true, showHabitable: false, showStability: false } })?.settings.speed).toBe(2);
  });
});

describe('world metadata', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
  });

  it('records the selected real-system preset without changing world data', () => {
    const id = createWorld('JPL playground', undefined, 'solar-system');
    const [meta] = getWorldList();

    expect(meta).toMatchObject({ id, name: 'JPL playground', presetId: 'solar-system' });
    expect(JSON.parse(values.get(`aether:worlds:data:${id}`) ?? '{}')).not.toHaveProperty('presetId');
  });

  it('keeps legacy and unknown preset metadata backward compatible', () => {
    values.set('aether:worlds:index', JSON.stringify([
      { id: 'legacy', name: 'Legacy', createdAt: 1, lastOpenedAt: 1 },
      { id: 'future', name: 'Future', createdAt: 2, lastOpenedAt: 2, presetId: 'future-system' },
    ]));

    expect(getWorldList().find((world) => world.id === 'legacy')?.presetId).toBeUndefined();
    expect(getWorldList().find((world) => world.id === 'future')?.presetId).toBe('future-system');
  });
});
