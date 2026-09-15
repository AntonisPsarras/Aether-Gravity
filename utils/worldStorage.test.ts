import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CelestialBody } from '../types';
import {
  CURRENT_WORLD_VERSION,
  createWorld,
  createFolder,
  moveWorldToFolder,
  deleteFolder,
  getFolderList,
  getWorld,
  getWorldList,
  saveWorld,
  serializeBodies,
  deserializeBodies,
  sanitizeWorldSettings,
  parseWorldData,
  resetWorldStorageStateForTests,
} from './worldStorage';
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
    resetWorldStorageStateForTests();
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

describe('world storage reliability', () => {
  const values = new Map<string, string>();
  let rejectWrites: ((key: string) => Error | null) | null = null;
  let noOpWrites = false;

  beforeEach(() => {
    values.clear();
    rejectWrites = null;
    noOpWrites = false;
    resetWorldStorageStateForTests();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        get length() { return values.size; },
        key: (index: number) => Array.from(values.keys())[index] ?? null,
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => {
          const failure = rejectWrites?.(key);
          if (failure) throw failure;
          if (!noOpWrites) values.set(key, value);
        },
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    resetWorldStorageStateForTests();
  });

  const storedBody = (id = 'planet') => ({
    id,
    type: 'Planet' as const,
    mass: 1,
    radius: 2.5,
    radiusKm: 6371,
    position: { x: 40, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 250 },
    color: '#3b82f6',
    texture: 'rock',
    trailColor: '#3b82f6',
    temperature: 288,
    habitability: 'HABITABLE' as const,
    population: 0,
    name: 'Earth',
    properties: { atmosphere: 0.55, rotationPeriod: 24 },
  });

  const world = (id = 'round-trip') => ({
    id,
    version: 1,
    bodies: [storedBody()],
    settings: {
      speed: 2,
      showGrid: true,
      showDust: false,
      showHabitable: true,
      showStability: false,
      showOrbitPaths: true,
    },
  });

  it('round-trips a complete world and stamps the current schema version', () => {
    values.set('aether:worlds:data:round-trip', JSON.stringify({ ...world(), version: CURRENT_WORLD_VERSION }));
    expect(getWorld('round-trip')?.bodies[0]).toMatchObject({ name: 'Earth', radiusKm: 6371 });
    expect(saveWorld(world())).toBe('ok');

    const persisted = JSON.parse(values.get('aether:worlds:data:round-trip')!);
    expect(persisted.version).toBe(CURRENT_WORLD_VERSION);
    expect(getWorld('round-trip')?.settings).toMatchObject({ speed: 2, showHabitable: true });
  });

  it('preserves malformed JSON rather than overwriting it', () => {
    const raw = '{partial json';
    values.set('aether:worlds:data:broken', raw);
    expect(getWorld('broken')).toBeNull();
    expect(values.get('aether:worlds:data:broken')).toBe(raw);

    values.set('aether:worlds:index', raw);
    expect(getWorldList()).toEqual([]);
    expect(() => createWorld('Must not overwrite')).toThrow(/unreadable/i);
    expect(values.get('aether:worlds:index')).toBe(raw);
  });

  it('rejects archive growth beyond its readable limit without replacing metadata', () => {
    const raw = JSON.stringify(Array.from({ length: 10000 }, (_, i) => ({ id: `f${i}`, name: `Folder ${i}`, createdAt: 1 })));
    values.set('aether:worlds:folders', raw);
    expect(() => createFolder('Overflow')).toThrow();
    expect(values.get('aether:worlds:folders')).toBe(raw);
    expect(getFolderList()).toHaveLength(10000);
  });

  it('rejects stale folder destinations without altering a world archive', () => {
    const id = createWorld('Destination test');
    const before = values.get('aether:worlds:index');
    expect(() => moveWorldToFolder(id, 'deleted-folder')).toThrow();
    expect(values.get('aether:worlds:index')).toBe(before);
    expect(() => createWorld('Invalid destination', 'deleted-folder')).toThrow();
    expect(getWorldList()).toHaveLength(1);
  });

  it('reports quota and read-back verification failures without replacing the previous save', () => {
    const original = JSON.stringify({ ...world('quota-world'), version: CURRENT_WORLD_VERSION });
    values.set('aether:worlds:data:quota-world', original);
    expect(getWorld('quota-world')).not.toBeNull();
    rejectWrites = (key) => key.endsWith('quota-world')
      ? new DOMException('full', 'QuotaExceededError')
      : null;
    expect(saveWorld({ ...world('quota-world'), settings: { ...world().settings, speed: 3 } })).toBe('quota');
    expect(values.get('aether:worlds:data:quota-world')).toBe(original);

    rejectWrites = null;
    noOpWrites = true;
    expect(saveWorld({ ...world('quota-world'), settings: { ...world().settings, speed: 4 } })).toBe('error');
    expect(values.get('aether:worlds:data:quota-world')).toBe(original);
  });

  it('migrates a real v1 shape once, verifies it, and removes the temporary backup', () => {
    const legacy = {
      id: 'legacy', version: 1,
      bodies: [
        { ...storedBody('sun'), type: 'Star', mass: 1000, radius: 12, radiusKm: undefined, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, name: 'Sun' },
        { ...storedBody('earth'), mass: 10, radius: 2.5, radiusKm: undefined, velocity: { x: 0, y: 0, z: 3.8 }, properties: { atmosphere: 0.55, rotationPeriod: 24 } },
      ],
      settings: { speed: 1, showGrid: true, showDust: true, showHabitable: false, showStability: false },
    };
    values.set('aether:worlds:data:legacy', JSON.stringify(legacy));

    const migrated = getWorld('legacy');
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(CURRENT_WORLD_VERSION);
    expect(migrated?.bodies.map((body) => body.id)).toEqual(['sun', 'earth']);
    expect(migrated?.bodies[1].properties).toMatchObject({ atmosphere: 0.55, rotationPeriod: 24 });
    expect(migrated?.bodies[1].mass).not.toBe(10);
    expect(migrated?.bodies[1].velocity.z).not.toBe(3.8);
    expect(migrated?.bodies[1].radiusKm).toBeGreaterThan(0);
    expect(values.has('aether:worlds:v1backup:legacy')).toBe(false);

    const firstMass = migrated!.bodies[1].mass;
    resetWorldStorageStateForTests();
    expect(getWorld('legacy')?.bodies[1].mass).toBeCloseTo(firstMass, 12);
  });

  it('recovers an interrupted migration from its backup and rejects future schemas', () => {
    const legacy = JSON.stringify({ ...world('recover'), version: 1, bodies: [{ ...storedBody(), radiusKm: undefined, mass: 10 }] });
    values.set('aether:worlds:v1backup:recover', legacy);
    expect(getWorld('recover')?.version).toBe(CURRENT_WORLD_VERSION);
    expect(values.has('aether:worlds:v1backup:recover')).toBe(false);

    const futureRaw = JSON.stringify({ ...world('future'), version: CURRENT_WORLD_VERSION + 1 });
    values.set('aether:worlds:data:future', futureRaw);
    expect(getWorld('future')).toBeNull();
    expect(values.get('aether:worlds:data:future')).toBe(futureRaw);
  });

  it('detects an external writer before overwriting its data', () => {
    const initial = JSON.stringify({ ...world('shared'), version: CURRENT_WORLD_VERSION });
    values.set('aether:worlds:data:shared', initial);
    expect(getWorld('shared')).not.toBeNull();
    const external = JSON.stringify({ ...world('shared'), version: CURRENT_WORLD_VERSION, settings: { ...world().settings, speed: 3 } });
    values.set('aether:worlds:data:shared', external);

    expect(saveWorld(world('shared'))).toBe('conflict');
    expect(values.get('aether:worlds:data:shared')).toBe(external);
  });

  it('keeps worlds when deleting a folder', () => {
    values.set('aether:worlds:folders', JSON.stringify([{ id: 'folder', name: 'Lab', createdAt: 1 }]));
    values.set('aether:worlds:index', JSON.stringify([{ id: 'world', name: 'World', createdAt: 1, lastOpenedAt: 1, folderId: 'folder' }]));
    deleteFolder('folder');
    expect(getFolderList()).toEqual([]);
    expect(getWorldList()[0].folderId).toBeUndefined();
  });
});
