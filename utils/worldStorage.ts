import { WorldMeta, WorldData, CelestialBodyData, CelestialBody, FolderMeta } from '../types';
import * as THREE from 'three';

const STORAGE_KEYS = {
    INDEX: 'aether:worlds:index',
    FOLDERS: 'aether:worlds:folders',
    DATA_PREFIX: 'aether:worlds:data:',
};

const CURRENT_VERSION = 1;

export const getFolderList = (): FolderMeta[] => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.FOLDERS);
        return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
};

const saveFolderList = (list: FolderMeta[]): void => {
    localStorage.setItem(STORAGE_KEYS.FOLDERS, JSON.stringify(list));
};

export const createFolder = (name: string): string => {
    const folders = getFolderList();
    if (folders.some(f => f.name.toLowerCase() === name.trim().toLowerCase())) {
        throw new Error('A folder with this name already exists.');
    }
    const id = `folder-${Date.now()}`;
    const newFolder: FolderMeta = { id, name: name.trim(), createdAt: Date.now() };
    saveFolderList([...folders, newFolder]);
    return id;
};

export const renameFolder = (id: string, newName: string): void => {
    const folders = getFolderList();
    if (folders.some(f => f.id !== id && f.name.toLowerCase() === newName.trim().toLowerCase())) {
        throw new Error('A folder with this name already exists.');
    }
    const idx = folders.findIndex(f => f.id === id);
    if (idx >= 0) {
        folders[idx].name = newName.trim();
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
        const worlds = JSON.parse(raw) as WorldMeta[];
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

export const getWorld = (id: string): WorldData | null => {
    try {
        const raw = localStorage.getItem(STORAGE_KEYS.DATA_PREFIX + id);
        if (!raw) return null;
        return JSON.parse(raw) as WorldData;
    } catch (e) {
        console.error('Failed to load world:', e);
        return null;
    }
};

export const saveWorld = (world: WorldData): void => {
    try {
        localStorage.setItem(STORAGE_KEYS.DATA_PREFIX + world.id, JSON.stringify(world));
        const list = getWorldList();
        const idx = list.findIndex(w => w.id === world.id);
        if (idx >= 0) {
            list[idx].lastOpenedAt = Date.now();
            saveWorldList(list);
        }
    } catch (e) {
        console.error('Failed to save world:', e);
    }
};

export const createWorld = (name: string, folderId?: string): string => {
    if (isWorldNameTaken(name)) {
        throw new Error('A universe with this name already exists.');
    }
    const id = `world-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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
    if (isWorldNameTaken(newName)) {
        throw new Error('A universe with this name already exists.');
    }
    const list = getWorldList();
    const idx = list.findIndex(w => w.id === id);
    if (idx >= 0) {
        list[idx].name = newName.trim();
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
    return bodies.map(b => ({
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
    }));
};

export const deserializeBodies = (data: CelestialBodyData[]): CelestialBody[] => {
    return data.map(b => ({
        ...b,
        position: new THREE.Vector3(b.position.x, b.position.y, b.position.z),
        velocity: new THREE.Vector3(b.velocity.x, b.velocity.y, b.velocity.z),
    }));
};

export const markWorldOpened = (id: string): void => {
    const list = getWorldList();
    const idx = list.findIndex(w => w.id === id);
    if (idx >= 0) {
        list[idx].lastOpenedAt = Date.now();
        saveWorldList(list);
    }
};