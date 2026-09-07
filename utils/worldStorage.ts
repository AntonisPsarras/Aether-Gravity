import { WorldMeta, WorldData, CelestialBodyData, CelestialBody, FolderMeta } from '../types';
import * as THREE from 'three';
import {
  clampMass,
  clampRadius,
  clampSpeed,
  clampPositionVector,
  clampVelocityVector,
  sanitizeBodyType,
  sanitizeName,
  sanitizeProperties,
  sanitizeCelestialBody,
  sanitizeCelestialBodies,
  clampRadiusKm,
  PHYSICS_LIMITS,
} from './physicsBounds';
import { G_CONSTANT } from '../constants';
import { M_SUN_IN_EARTH } from './units';
import { reconcileBodyDerivedState } from './physicsUtils';

const STORAGE_KEYS = {
    INDEX: 'aether:worlds:index',
    FOLDERS: 'aether:worlds:folders',
    DATA_PREFIX: 'aether:worlds:data:',
};

/**
 * v1: legacy "game units" — mass 5-150 for planets, 800-2000 for stars, G = 0.8.
 * v2: Aether units — mass in M⊕, G derived from SI, physical `radiusKm` split
 *     from the visual `radius`.
 */
const CURRENT_VERSION = 2;

/** Where a pre-migration copy of each world is kept, in case v2 misbehaves. */
const V1_BACKUP_PREFIX = 'aether:worlds:v1backup:';

/** Maximum character length enforced on all user-visible name fields. */
const MAX_NAME_LENGTH = 64;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v);

const parseFolderList = (raw: unknown): FolderMeta[] => {
  if (!Array.isArray(raw)) return [];
  const out: FolderMeta[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    const name = sanitizeName(item.name);
    const createdAt = safeNum(item.createdAt, Date.now());
    if (!id) continue;
    out.push({ id, name, createdAt });
  }
  return out;
};

const parseWorldMetaList = (raw: unknown): WorldMeta[] => {
  if (!Array.isArray(raw)) return [];
  const out: WorldMeta[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = typeof item.id === 'string' ? item.id : '';
    const name = sanitizeName(item.name);
    const createdAt = safeNum(item.createdAt, Date.now());
    const lastOpenedAt = safeNum(item.lastOpenedAt, createdAt);
    const folderId = typeof item.folderId === 'string' ? item.folderId : undefined;
    if (!id) continue;
    out.push({ id, name, createdAt, lastOpenedAt, folderId });
  }
  return out;
};

export const getFolderList = (): FolderMeta[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.FOLDERS);
        return raw ? parseFolderList(JSON.parse(raw)) : [];
    } catch { return []; }
};

const saveFolderList = (list: FolderMeta[]): void => {
    localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(list));
};

export const createFolder = (name: string): string => {
    if (!name.trim()) throw new Error('Folder name cannot be empty.');
    const trimmed = sanitizeName(name);
    const folders = getFolderList();
    if (folders.some(f => f.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error('A folder with this name already exists.');
    }
    const id = `folder-${Date.now()}`;
    const newFolder: FolderMeta = { id, name: trimmed, createdAt: Date.now() };
    saveFolderList([...folders, newFolder]);
    return id;
};

export const renameFolder = (id: string, newName: string): void => {
    if (!newName.trim()) throw new Error('Folder name cannot be empty.');
    const trimmed = sanitizeName(newName);
    const folders = getFolderList();
    if (folders.some(f => f.id !== id && f.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error('A folder with this name already exists.');
    }
    const idx = folders.findIndex(f => f.id === id);
    if (idx >= 0) {
        folders[idx].name = trimmed;
        saveFolderList(folders);
    }
};

export const deleteFolder = (id: string): void => {
    const folders = getFolderList().filter(f => f.id !== id);
    saveFolderList(folders);
    // Orphan worlds in this folder
    const worlds = getWorldList();
    worlds.forEach(w => { if (w.folderId === id) delete w.folderId; });
    saveWorldList(worlds);
};

export const isWorldNameTaken = (name: string): boolean => {
    const worlds = getWorldList();
    return worlds.some(w => w.name.toLowerCase() === name.trim().toLowerCase());
};

export const getWorldList = (): WorldMeta[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.INDEX);
        if (!raw) return [];
        const worlds = parseWorldMetaList(JSON.parse(raw));
        return worlds.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
    } catch (e) {
        console.error('Failed to load world list:', e);
        return [];
    }
};

const saveWorldList = (list: WorldMeta[]): void => {
    try {
        localStorage.setItem(STORAGE_KEYS.INDEX, JSON.stringify(list));
    } catch (e) {
        console.error('Failed to save world list:', e);
    }
};

export type SaveWorldResult = 'ok' | 'quota' | 'error';

/** Validate persisted world JSON before it enters the simulation store. */
export const parseWorldData = (raw: unknown): WorldData | null => {
    if (!raw || typeof raw !== 'object') return null;
    const d = raw as Partial<WorldData>;
    if (typeof d.id !== 'string' || !d.id) return null;
    if (!Array.isArray(d.bodies)) return null;

    const defaultSettings: WorldData['settings'] = {
        speed: 1,
        showGrid: true,
        showDust: true,
        showHabitable: false,
        showStability: false,
    };

    const sourceVersion = typeof d.version === 'number' ? d.version : 1;

    return {
        id: d.id,
        // The bodies below have been migrated, so the returned document is v2
        // regardless of what was on disk.
        version: CURRENT_VERSION,
        bodies: deserializeBodies(
            Array.isArray(d.bodies) ? (d.bodies as CelestialBodyData[]) : [],
            sourceVersion,
        ).map((b) => ({
            id: b.id,
            type: b.type,
            mass: b.mass,
            radius: b.radius,
            radiusKm: b.radiusKm,
            parentId: b.parentId,
            orbit: b.orbit ? { ...b.orbit } : undefined,
            position: { x: b.position.x, y: b.position.y, z: b.position.z },
            velocity: { x: b.velocity.x, y: b.velocity.y, z: b.velocity.z },
            color: b.color,
            texture: b.texture,
            trailColor: b.trailColor,
            temperature: b.temperature,
            habitability: b.habitability,
            population: b.population,
            name: b.name,
            properties: b.properties ? { ...b.properties } : undefined,
        })),
        settings: sanitizeWorldSettings(d.settings ?? defaultSettings),
    };
};

export const getWorld = (id: string): WorldData | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.DATA_PREFIX + id);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        // The unit-system migration is lossy and one-way, so keep a verbatim
        // copy of the v1 document the first time a world is opened under v2.
        const onDiskVersion = typeof parsed?.version === 'number' ? parsed.version : 1;
        if (onDiskVersion < CURRENT_VERSION) backupV1World(id, raw);
        return parseWorldData(parsed);
    } catch (e) {
        console.error('Failed to load world:', e);
        return null;
    }
};

const backupV1World = (id: string, raw: string): void => {
    try {
        const key = V1_BACKUP_PREFIX + id;
        if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    } catch {
        // A full quota must not block opening the world; the migration is still
        // safe, the user just loses the undo path.
    }
};

export const saveWorld = (world: WorldData): SaveWorldResult => {
    try {
        localStorage.setItem(STORAGE_KEYS.DATA_PREFIX + world.id, JSON.stringify(world));
        const list = getWorldList();
        const idx = list.findIndex(w => w.id === world.id);
        if (idx >= 0) {
            list[idx].lastOpenedAt = Date.now();
            saveWorldList(list);
        }
        return 'ok';
    } catch (e) {
        if (
            e instanceof DOMException &&
            (e.name === 'QuotaExceededError' || e.code === 22)
        ) {
            return 'quota';
        }
        console.error('Failed to save world:', e);
        return 'error';
    }
};

export const createWorld = (name: string, folderId?: string): string => {
    const trimmedName = name.trim() ? sanitizeName(name) : `Universe ${Date.now()}`;
    if (isWorldNameTaken(trimmedName)) {
        throw new Error('A universe with this name already exists.');
    }
    const id = `world-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    name = trimmedName;
    const now = Date.now();

    const meta: WorldMeta = {
        id,
        name: name.trim(),
        createdAt: now,
        lastOpenedAt: now,
        folderId,
    };

    const data: WorldData = {
        id,
        version: CURRENT_VERSION,
        bodies: [],
        settings: {
            speed: 1.0,
            showGrid: true,
            showDust: true,
            showHabitable: false,
            showStability: false,
        },
    };

    const list = getWorldList();
    list.unshift(meta);
    saveWorldList(list);
    localStorage.setItem(STORAGE_KEYS.DATA_PREFIX + id, JSON.stringify(data));

    return id;
};

export const deleteWorld = (id: string): void => {
    try {
        const list = getWorldList().filter(w => w.id !== id);
        saveWorldList(list);
        localStorage.removeItem(STORAGE_KEYS.DATA_PREFIX + id);
    } catch (e) {
        console.error('Failed to delete world:', e);
    }
};

export const renameWorld = (id: string, newName: string): void => {
    if (!newName.trim()) throw new Error('Universe name cannot be empty.');
    const trimmed = sanitizeName(newName);
    if (isWorldNameTaken(trimmed)) {
        throw new Error('A universe with this name already exists.');
    }
    const list = getWorldList();
    const idx = list.findIndex(w => w.id === id);
    if (idx >= 0) {
        list[idx].name = trimmed;
        saveWorldList(list);
    }
};

export const moveWorldToFolder = (worldId: string, folderId?: string): void => {
    const list = getWorldList();
    const idx = list.findIndex(w => w.id === worldId);
    if (idx >= 0) {
        list[idx].folderId = folderId;
        saveWorldList(list);
    }
};

// ---------------------------------------------------------------------------
// v1 → v2 migration
// ---------------------------------------------------------------------------

/** Mass ranges each body type occupied under the legacy arbitrary-unit scale. */
const V1_MASS_RANGES: Record<string, [number, number]> = {
    'Dwarf': [0.1, 5],
    'Planet': [5, 150],
    'Ice Giant': [100, 500],
    'Star': [800, 2000],
    'Red Giant': [800, 3000],
    'Neutron Star': [1500, 2500],
    'Black Hole': [3000, 100000],
};

/** Where those ranges land on the real M⊕ scale. */
const V2_MASS_RANGES: Record<string, [number, number]> = {
    'Dwarf': [1e-3, 0.05],
    'Planet': [0.1, 5],
    'Ice Giant': [10, 40],
    'Star': [0.3 * M_SUN_IN_EARTH, 2 * M_SUN_IN_EARTH],
    'Red Giant': [0.5 * M_SUN_IN_EARTH, 4 * M_SUN_IN_EARTH],
    'Neutron Star': [1.2 * M_SUN_IN_EARTH, 2.1 * M_SUN_IN_EARTH],
    'Black Hole': [5 * M_SUN_IN_EARTH, 100 * M_SUN_IN_EARTH],
};

const V1_G = 0.8;

/**
 * Map a legacy mass onto the real scale by preserving its *relative position*
 * within its type's old range. No single multiplier can work here: the old
 * scale compressed a 10⁶ range of real masses into a 10³ range of game numbers,
 * and did so non-linearly across types (a "Star" at 1000 was meant to be 1 M☉,
 * i.e. 333 000 M⊕, while a "Planet" at 10 was meant to be 1 M⊕).
 */
const migrateMass = (type: string, oldMass: number): number => {
    const oldRange = V1_MASS_RANGES[type];
    const newRange = V2_MASS_RANGES[type];
    if (!oldRange || !newRange) return Math.max(oldMass * 0.1, 1e-6);
    const t = Math.max(0, Math.min(1, (oldMass - oldRange[0]) / (oldRange[1] - oldRange[0])));
    // Interpolate in log space: the new ranges span decades.
    return Math.exp(Math.log(newRange[0]) + t * (Math.log(newRange[1]) - Math.log(newRange[0])));
};

/**
 * Rewrite a v1 body list into v2. Masses are remapped per type, radii are
 * discarded and re-derived (the old ones were arbitrary and used two mutually
 * inconsistent scales), and orbital velocities are rescaled by
 * √(G₂M₂ / G₁M₁) about each body's dominant parent so systems stay bound
 * instead of unravelling at the new G.
 */
export const migrateV1Bodies = (data: CelestialBodyData[]): CelestialBodyData[] => {
    if (!Array.isArray(data) || data.length === 0) return data;

    const oldMasses = new Map<string, number>();
    const migrated = data.map((b) => {
        const type = sanitizeBodyType(b.type);
        const oldMass = safeNum(b.mass, 10);
        oldMasses.set(b.id, oldMass);
        return { ...b, type, mass: migrateMass(type, oldMass) };
    });

    // Velocity rescale about each body's most influential heavier neighbour.
    const velocityScaleFor = (index: number): number => {
        const self = migrated[index];
        let bestInfluence = 0;
        let scale = 1;
        for (let j = 0; j < migrated.length; j++) {
            if (j === index) continue;
            const other = migrated[j];
            if (other.mass <= self.mass) continue;
            const dx = safeNum(other.position?.x, 0) - safeNum(self.position?.x, 0);
            const dy = safeNum(other.position?.y, 0) - safeNum(self.position?.y, 0);
            const dz = safeNum(other.position?.z, 0) - safeNum(self.position?.z, 0);
            const distSq = dx * dx + dy * dy + dz * dz;
            if (!(distSq > 1e-9)) continue;
            const influence = other.mass / distSq;
            if (influence > bestInfluence) {
                bestInfluence = influence;
                const oldParentMass = oldMasses.get(other.id) ?? 1;
                scale = Math.sqrt((G_CONSTANT * other.mass) / (V1_G * Math.max(oldParentMass, 1e-6)));
            }
        }
        return scale;
    };

    // A body with no heavier neighbour (the primary itself) inherits the scale
    // of the most massive body in the system so the barycentre stays put.
    let heaviestIndex = 0;
    for (let i = 1; i < migrated.length; i++) {
        if (migrated[i].mass > migrated[heaviestIndex].mass) heaviestIndex = i;
    }
    const scales = migrated.map((_, i) => velocityScaleFor(i));
    const fallbackScale = scales.find((s, i) => i !== heaviestIndex && s !== 1) ?? 1;

    return migrated.map((b, i) => {
        const scale = scales[i] !== 1 ? scales[i] : fallbackScale;
        return {
            ...b,
            radiusKm: undefined,   // re-derived from mass + type on load
            velocity: {
                x: safeNum(b.velocity?.x, 0) * scale,
                y: safeNum(b.velocity?.y, 0) * scale,
                z: safeNum(b.velocity?.z, 0) * scale,
            },
        };
    });
};

export const serializeBodies = (bodies: CelestialBody[]): CelestialBodyData[] => {
    return sanitizeCelestialBodies(bodies).map(b => ({
        id: b.id,
        type: b.type,
        mass: b.mass,
        radius: b.radius,
        radiusKm: b.radiusKm,
        parentId: b.parentId,
        orbit: b.orbit ? { ...b.orbit } : undefined,
        position: { x: b.position.x, y: b.position.y, z: b.position.z },
        velocity: { x: b.velocity.x, y: b.velocity.y, z: b.velocity.z },
        color: b.color,
        texture: b.texture,
        trailColor: b.trailColor,
        temperature: b.temperature,
        habitability: b.habitability,
        population: b.population,
        name: b.name,
        properties: b.properties ? { ...b.properties } : undefined,
    }));
};

const safeNum = (v: unknown, fallback: number): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return isFinite(n) ? n : fallback;
};

const VALID_HABITABILITY = new Set<CelestialBody['habitability']>([
    'HABITABLE', 'FROZEN', 'BURNING', 'TOXIC', 'STELLAR', 'SINGULARITY', 'STERILIZED', 'N/A',
]);

export const deserializeBodies = (data: CelestialBodyData[], version = CURRENT_VERSION): CelestialBody[] => {
    const source = version < 2 ? migrateV1Bodies(data) : data;
    const bodies = source.slice(0, PHYSICS_LIMITS.MAX_BODIES).map((b) =>
        sanitizeCelestialBody({
            id: typeof b.id === 'string' && b.id ? b.id : `body-${Date.now()}`,
            type: sanitizeBodyType(b.type),
            mass: clampMass(safeNum(b.mass, 1)),
            radius: clampRadius(safeNum(b.radius, 1)),
            radiusKm: clampRadiusKm(safeNum(b.radiusKm, 1)),
            parentId: typeof b.parentId === 'string' ? b.parentId : undefined,
            orbit: sanitizeOrbit(b.orbit),
            temperature: Math.max(0, safeNum(b.temperature, 300)),
            color: typeof b.color === 'string' ? b.color : '#ffffff',
            texture: typeof b.texture === 'string' ? b.texture : 'solid',
            trailColor: typeof b.trailColor === 'string' ? b.trailColor : '#ffffff',
            habitability: VALID_HABITABILITY.has(b.habitability) ? b.habitability : 'N/A',
            population: Math.max(0, Math.floor(safeNum(b.population, 0))),
            name: sanitizeName(b.name),
            properties: sanitizeProperties(b.properties),
            position: clampPositionVector(
                new THREE.Vector3(
                    safeNum(b.position?.x, 0),
                    safeNum(b.position?.y, 0),
                    safeNum(b.position?.z, 0),
                ),
            ),
            velocity: clampVelocityVector(
                new THREE.Vector3(
                    safeNum(b.velocity?.x, 0),
                    safeNum(b.velocity?.y, 0),
                    safeNum(b.velocity?.z, 0),
                ),
            ),
        }),
    );

    // A v1 save carries no physical radius, and its visual radius came from a
    // scale that no longer exists, so both are re-derived from mass and type.
    if (version < 2) bodies.forEach((body) => reconcileBodyDerivedState(body));

    return bodies;
};

/** Validate persisted Keplerian elements. */
const sanitizeOrbit = (orbit: unknown): CelestialBody['orbit'] => {
    if (!isRecord(orbit)) return undefined;
    const a = safeNum(orbit.a, 0);
    if (!(a > 0)) return undefined;
    return {
        a,
        e: Math.max(0, Math.min(0.999, safeNum(orbit.e, 0))),
        i: safeNum(orbit.i, 0),
        lan: safeNum(orbit.lan, 0),
        argp: safeNum(orbit.argp, 0),
        m0: safeNum(orbit.m0, 0),
        epoch: safeNum(orbit.epoch, 0),
    };
};

/** Sanitize persisted simulation settings before applying to the store. */
export const sanitizeWorldSettings = (settings: WorldData['settings']): WorldData['settings'] => ({
    speed: clampSpeed(safeNum(settings?.speed, 1)),
    showGrid: Boolean(settings?.showGrid ?? true),
    showDust: Boolean(settings?.showDust ?? true),
    showHabitable: Boolean(settings?.showHabitable ?? false),
    showStability: Boolean(settings?.showStability ?? false),
});

export const markWorldOpened = (id: string): void => {
    const list = getWorldList();
    const idx = list.findIndex(w => w.id === id);
    if (idx >= 0) {
        list[idx].lastOpenedAt = Date.now();
        saveWorldList(list);
    }
};