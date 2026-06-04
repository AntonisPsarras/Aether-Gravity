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
  PHYSICS_LIMITS,
} from './physicsBounds';

const STORAGE_KEYS = {
    INDEX: 'aether:worlds:index',
    FOLDERS: 'aether:worlds:folders',
    DATA_PREFIX: 'aether:worlds:data:',
};

const CURRENT_VERSION = 1;

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

    return {
        id: d.id,
        version: typeof d.version === 'number' ? d.version : CURRENT_VERSION,
        bodies: deserializeBodies(Array.isArray(d.bodies) ? (d.bodies as CelestialBodyData[]) : []).map((b) => ({
            id: b.id,
            type: b.type,
            mass: b.mass,
            radius: b.radius,
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
        return parseWorldData(JSON.parse(raw));
    } catch (e) {
        console.error('Failed to load world:', e);
        return null;
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

export const serializeBodies = (bodies: CelestialBody[]): CelestialBodyData[] => {
    return sanitizeCelestialBodies(bodies).map(b => ({
        id: b.id,
        type: b.type,
        mass: b.mass,
        radius: b.radius,
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

export const deserializeBodies = (data: CelestialBodyData[]): CelestialBody[] => {
    return data.slice(0, PHYSICS_LIMITS.MAX_BODIES).map((b) =>
        sanitizeCelestialBody({
            id: typeof b.id === 'string' && b.id ? b.id : `body-${Date.now()}`,
            type: sanitizeBodyType(b.type),
            mass: clampMass(safeNum(b.mass, 10)),
            radius: clampRadius(safeNum(b.radius, 1)),
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