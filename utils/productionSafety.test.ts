import { afterEach, describe, expect, it, vi } from 'vitest';
import { deserializeBodies, parseWorldData, serializeBodies } from './worldStorage';
import { readStorageRaw, writeStorageRawVerified } from './browserStorage';
import { MAX_STORAGE_CHARS, savedNumber } from './worldValidation';
import { manageNativeListener } from './diagnostics';
import { acquireWorld, mutateArchive, ownsWorld } from './worldOwnership';

const body = (id: string) => ({ id, type: 'Planet', mass: 1, radius: 1, radiusKm: 6371,
  position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 } });
const world = (bodies: unknown[] = [body('a')]) => ({ id: 'w', version: 2, bodies });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('hostile persistence boundaries', () => {
  it.each([null, 1, 'body', [], { ...body('a'), position: null }])('rejects malformed body entries %j', bad => {
    expect(parseWorldData(world([bad]))).toBeNull();
  });
  it('rejects duplicates, dangling parents, cycles and oversized lists without truncation', () => {
    for (const bodies of [[body('a'), body('a')], [{ ...body('a'), parentId: 'missing' }],
      [{ ...body('a'), parentId: 'b' }, { ...body('b'), parentId: 'a' }], Array.from({ length: 51 }, (_, i) => body(String(i)))]) {
      expect(parseWorldData(world(bodies))).toBeNull();
    }
  });
  it('refuses to serialize an oversized live universe instead of silently dropping bodies', () => {
    const valid = deserializeBodies(parseWorldData(world())!.bodies)[0];
    expect(() => serializeBodies(Array.from({ length: 51 }, () => valid))).toThrow();
  });
  it('rejects unsupported versions and non-finite orbital elements at the public parser', () => {
    for (const version of [0, -1, 1.5, 3, Infinity, '2']) expect(parseWorldData({ ...world(), version })).toBeNull();
    expect(parseWorldData(world([{ ...body('a'), orbit: { a: 1, e: 0, i: 0, lan: 0, argp: 0, m0: Infinity, epoch: 0 } }]))).toBeNull();
  });
  it('never coerces object values or keeps injected prototype properties', () => {
    const value = { toString() { throw new Error('must not run'); } };
    expect(savedNumber(value, 1)).toBe(1);
    const raw = JSON.parse(JSON.stringify(world()));
    raw.bodies[0].properties = JSON.parse('{"__proto__":{"polluted":true},"atmosphere":0.5}');
    expect(parseWorldData(raw)?.bodies[0].properties).toEqual({ atmosphere: 0.5 });
    expect(Object.prototype).not.toHaveProperty('polluted');
  });
  it('rejects an oversized read and write without touching the existing data', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { getItem: () => 'x'.repeat(MAX_STORAGE_CHARS + 1), setItem });
    expect(() => readStorageRaw('aether:test')).toThrow();
    expect(() => writeStorageRawVerified('aether:test', 'x'.repeat(MAX_STORAGE_CHARS + 1))).toThrow();
    expect(setItem).not.toHaveBeenCalled();
  });
});

describe('asynchronous native ownership', () => {
  it('removes a listener that resolves after unmount exactly once', async () => {
    const remove = vi.fn(async () => {});
    let resolve!: (h: { remove: () => Promise<void> }) => void;
    const cleanup = manageNativeListener(new Promise(r => { resolve = r; }));
    cleanup(); resolve({ remove }); await Promise.resolve(); cleanup();
    expect(remove).toHaveBeenCalledTimes(1);
  });
  it('keeps a world locked until release and fails closed without Web Locks', async () => {
    vi.stubGlobal('navigator', {});
    expect((await acquireWorld('w')).writable).toBe(false);
    await expect(mutateArchive(() => 1)).rejects.toThrow();
    const held = new Set<string>();
    vi.stubGlobal('navigator', { locks: { async request(name: string, options: unknown, callback: (lock: object | null) => Promise<void>) {
      if (held.has(name)) return callback(null);
      held.add(name); try { await callback({}); } finally { held.delete(name); }
    } } });
    const first = await acquireWorld('w');
    expect(first.writable).toBe(true); expect(ownsWorld('w')).toBe(true);
    expect((await acquireWorld('w')).writable).toBe(false);
    first.release(); await Promise.resolve(); await Promise.resolve();
    expect(ownsWorld('w')).toBe(false);
    const second = await acquireWorld('w'); expect(second.writable).toBe(true); second.release();
  });

  it('does not begin an archive mutation before a delayed lock is granted', async () => {
    let grant!: () => void;
    const gate = new Promise<void>(resolve => { grant = resolve; });
    const operation = vi.fn(() => 7);
    vi.stubGlobal('navigator', { locks: {
      request: async (_name: string, callback: () => number) => {
        await gate;
        return callback();
      },
    } });
    const pending = mutateArchive(operation);
    await Promise.resolve();
    expect(operation).not.toHaveBeenCalled();
    grant();
    await expect(pending).resolves.toBe(7);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('serializes concurrent archive writers so each observes the previous commit', async () => {
    let tail = Promise.resolve();
    vi.stubGlobal('navigator', { locks: {
      request: <T>(_name: string, callback: () => T | Promise<T>) => {
        const run = tail.then(callback);
        tail = run.then(() => undefined, () => undefined);
        return run;
      },
    } });
    const metadata: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
    const first = mutateArchive(async () => {
      const next = [...metadata, 'first'];
      await firstGate;
      metadata.splice(0, metadata.length, ...next);
    });
    const second = mutateArchive(() => {
      metadata.splice(0, metadata.length, ...metadata, 'second');
    });
    await Promise.resolve();
    expect(metadata).toEqual([]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(metadata).toEqual(['first', 'second']);
  });
});
