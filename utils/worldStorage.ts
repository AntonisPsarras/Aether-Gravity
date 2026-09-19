import { WorldMeta, WorldData, CelestialBodyData, CelestialBody, FolderMeta } from '../types';
import * as THREE from 'three';
import { validWorldShape, validId, MAX_ARCHIVE_ENTRIES, savedNumber } from './worldValidation';
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
import {
  readStorageJson,
  readStorageRaw,
  removeStorageVerified,
  reportStorageIssue,
  storageFailureKind,
  StorageOperationError,
  stringifyStorageJson,
  writeStorageJsonVerified,
  writeStorageRawVerified,
} from './browserStorage';

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
export const CURRENT_WORLD_VERSION = 2;

/** Where a pre-migration copy of each world is kept, in case v2 misbehaves. */
const V1_BACKUP_PREFIX = 'aether:worlds:v1backup:';

let worldIndexHealthy = true;
let folderIndexHealthy = true;
const loadedWorldRaw = new Map<string, string>();
const rememberWorld = (id: string, raw: string): void => {
    // The application opens one editor per tab. Bound retained snapshots to it.
    loadedWorldRaw.clear();
    loadedWorldRaw.set(id, raw);
};

// Annotated on the const, not just the arrow: TypeScript only treats a call as
// never-returning (and so narrows the code after it) when the callee has an
// explicit type annotation on its declaration.
const corrupt: (key: string, message: string) => never = (key, message) => {
  const issue = { kind: 'corrupt' as const, key, message };
  reportStorageIssue(issue);
  throw new StorageOperationError(issue);
};

/** Maximum character length enforced on all user-visible name fields. */
const MAX_NAME_LENGTH = 64;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v);

const parseFolderList = (raw: unknown): FolderMeta[] => {
  if (!Array.isArray(raw)) corrupt(STORAGE_KEYS.FOLDERS, 'The saved folder list is not an array.');
  if (raw.length > MAX_ARCHIVE_ENTRIES) corrupt(STORAGE_KEYS.FOLDERS, 'The folder list is too large.');
  const out: FolderMeta[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) corrupt(STORAGE_KEYS.FOLDERS, 'The saved folder list contains an invalid entry.');
    const id = typeof item.id === 'string' ? item.id : '';
    const name = sanitizeName(item.name);
    const createdAt = safeNum(item.createdAt, Date.now());
    if (!validId(id) || ids.has(id)) corrupt(STORAGE_KEYS.FOLDERS, 'A saved folder has an invalid or duplicate identifier.');
    ids.add(id);
    out.push({ id, name, createdAt });
  }
  return out;
};

const parseWorldMetaList = (raw: unknown): WorldMeta[] => {
  if (!Array.isArray(raw)) corrupt(STORAGE_KEYS.INDEX, 'The saved universe index is not an array.');
  if (raw.length > MAX_ARCHIVE_ENTRIES) corrupt(STORAGE_KEYS.INDEX, 'The universe index is too large.');
  const out: WorldMeta[] = [];
  const ids = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item)) corrupt(STORAGE_KEYS.INDEX, 'The saved universe index contains an invalid entry.');
    const id = typeof item.id === 'string' ? item.id : '';
    const name = sanitizeName(item.name);
    const createdAt = safeNum(item.createdAt, Date.now());
    const lastOpenedAt = safeNum(item.lastOpenedAt, createdAt);
    const folderId = typeof item.folderId === 'string' ? item.folderId : undefined;
    const presetId = typeof item.presetId === 'string' ? item.presetId : undefined;
    if (!validId(id) || ids.has(id)) corrupt(STORAGE_KEYS.INDEX, 'A saved universe has an invalid or duplicate identifier.');
    ids.add(id);
    out.push({ id, name, createdAt, lastOpenedAt, folderId, presetId });
  }
  return out;
};

export const getFolderList = (): FolderMeta[] => {
    try {
        const raw = readStorageJson(STORAGE_KEYS.FOLDERS);
        folderIndexHealthy = true;
        return raw === null ? [] : parseFolderList(raw);
    } catch {
        folderIndexHealthy = false;
        return [];
    }
};

const saveFolderList = (list: FolderMeta[]): void => {
    if (!folderIndexHealthy) corrupt(STORAGE_KEYS.FOLDERS, 'The folder list is unreadable and will not be overwritten.');
    requireArchiveCapacity(STORAGE_KEYS.FOLDERS, list.length);
    writeStorageJsonVerified(STORAGE_KEYS.FOLDERS, list);
};

const requireArchiveCapacity = (key: string, count: number): void => {
    if (count <= MAX_ARCHIVE_ENTRIES) return;
    const issue = { kind: 'quota' as const, key, message: 'The archive entry limit has been reached.' };
    reportStorageIssue(issue);
    throw new StorageOperationError(issue);
};

const requireFolder = (id: string | undefined): void => {
    if (id === undefined) return;
    if (getFolderList().some(folder => folder.id === id)) return;
    const issue = { kind: 'conflict' as const, key: STORAGE_KEYS.FOLDERS, message: 'The destination collection is no longer available.' };
    reportStorageIssue(issue);
    throw new StorageOperationError(issue);
};

const attemptRecovery = (key: string, recover: () => void): void => {
    try { recover(); }
    catch {
        reportStorageIssue({ kind: 'verification', key, message: `Recovery of ${key} failed after an archive operation.` });
    }
};

export const createFolder = (name: string): string => {
    if (!name.trim()) throw new Error('Folder name cannot be empty.');
    const trimmed = sanitizeName(name);
    const folders = getFolderList();
    if (folders.some(f => f.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error('A folder with this name already exists.');
    }
    const id = `folder-${crypto.randomUUID()}`;
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
    const previousFolders = readStorageRaw(STORAGE_KEYS.FOLDERS);
    const previousWorlds = readStorageRaw(STORAGE_KEYS.INDEX);
    const folders = getFolderList().filter(f => f.id !== id);
    const worlds = getWorldList();
    worlds.forEach(w => { if (w.folderId === id) delete w.folderId; });
    try {
        saveWorldList(worlds);
        saveFolderList(folders);
    } catch (error) {
        attemptRecovery(STORAGE_KEYS.INDEX, () => {
            if (previousWorlds === null) removeStorageVerified(STORAGE_KEYS.INDEX);
            else writeStorageRawVerified(STORAGE_KEYS.INDEX, previousWorlds);
        });
        attemptRecovery(STORAGE_KEYS.FOLDERS, () => {
            if (previousFolders === null) removeStorageVerified(STORAGE_KEYS.FOLDERS);
            else writeStorageRawVerified(STORAGE_KEYS.FOLDERS, previousFolders);
        });
        throw error;
    }
};

export const isWorldNameTaken = (name: string): boolean => {
    const worlds = getWorldList();
    return worlds.some(w => w.name.toLowerCase() === name.trim().toLowerCase());
};

export const getWorldList = (): WorldMeta[] => {
    try {
        const raw = readStorageJson(STORAGE_KEYS.INDEX);
        worldIndexHealthy = true;
        if (raw === null) return [];
        const worlds = parseWorldMetaList(raw);
        return worlds.sort((a, b) => (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0));
    } catch {
        worldIndexHealthy = false;
        return [];
    }
};

const saveWorldList = (list: WorldMeta[]): void => {
    if (!worldIndexHealthy) corrupt(STORAGE_KEYS.INDEX, 'The universe index is unreadable and will not be overwritten.');
    requireArchiveCapacity(STORAGE_KEYS.INDEX, list.length);
    writeStorageJsonVerified(STORAGE_KEYS.INDEX, list);
};

export type SaveWorldResult = 'ok' | 'quota' | 'conflict' | 'error';

/** Validate persisted world JSON before it enters the simulation store. */
export const parseWorldData = (raw: unknown): WorldData | null => {
    if (!validWorldShape(raw, CURRENT_WORLD_VERSION)) return null;
    const d = raw as Partial<WorldData>;
    if (typeof d.id !== 'string' || !d.id) return null;
    if (!Array.isArray(d.bodies)) return null;

    const defaultSettings: WorldData['settings'] = {
        speed: 1,
        showGrid: true,
        showDust: true,
        showHabitable: false,
        showStability: false,
        showOrbitPaths: true,
    };

    const sourceVersion = typeof d.version === 'number' ? d.version : 1;

    return {
        id: d.id,
        // The bodies below have been migrated, so the returned document is v2
        // regardless of what was on disk.
        version: CURRENT_WORLD_VERSION,
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

export const getWorld = (id: string, persistMigration = true): WorldData | null => {
    const key = STORAGE_KEYS.DATA_PREFIX + id;
    const backupKey = V1_BACKUP_PREFIX + id;
    try {
        let raw = readStorageRaw(key);
        const leftoverBackup = readStorageRaw(backupKey);

        // A migration interrupted after creating its backup can always restart
        // from that verbatim v1 document.
        if (raw === null && leftoverBackup !== null) raw = leftoverBackup;
        if (raw === null) return null;

        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            if (leftoverBackup === null || leftoverBackup === raw) {
                corrupt(key, `Universe ${id} contains malformed JSON.`);
            }
            try {
                parsed = JSON.parse(leftoverBackup);
                raw = leftoverBackup;
            } catch {
                corrupt(key, `Universe ${id} and its migration backup are both unreadable.`);
            }
        }

        if (!isRecord(parsed)) corrupt(key, `Universe ${id} is not a valid saved record.`);
        const onDiskVersion = typeof parsed.version === 'number' ? parsed.version : 1;
        if (onDiskVersion > CURRENT_WORLD_VERSION) {
            corrupt(key, `Universe ${id} uses unsupported schema version ${onDiskVersion}.`);
        }
        if (parsed.id !== id) corrupt(key, `Universe ${id} has a mismatched internal identifier.`);

        const world = parseWorldData(parsed);
        if (!world) corrupt(key, `Universe ${id} is missing required saved fields.`);
        // A viewer may inspect a legacy world but must not modify its owner's data.
        if (!persistMigration) return world;

        if (onDiskVersion < CURRENT_WORLD_VERSION) {
            const migratedRaw = stringifyStorageJson(key, world);
            backupV1World(id, raw);
            try {
                writeStorageRawVerified(key, migratedRaw);
                const verified = readStorageRaw(key);
                if (verified === null || !parseWorldData(JSON.parse(verified))) {
                    throw new Error('Migrated universe did not validate.');
                }
                removeStorageVerified(backupKey);
                rememberWorld(id, migratedRaw);
                return world;
            } catch (error) {
                // setItem replacement is atomic, but restore explicitly if a
                // hostile/no-op storage implementation failed verification.
                attemptRecovery(key, () => writeStorageRawVerified(key, raw));
                reportStorageIssue({
                    kind: 'migration', key,
                    message: `Universe ${id} could not be migrated safely.`,
                });
                return null;
            }
        }

        if (leftoverBackup !== null) {
            attemptRecovery(backupKey, () => removeStorageVerified(backupKey));
        }
        rememberWorld(id, raw);
        return world;
    } catch {
        return null;
    }
};

const backupV1World = (id: string, raw: string): void => {
    const key = V1_BACKUP_PREFIX + id;
    const existing = readStorageRaw(key);
    if (existing === null) writeStorageRawVerified(key, raw);
    else if (existing !== raw) corrupt(key, `The migration backup for ${id} does not match its legacy save.`);
};

export const saveWorld = (world: WorldData): SaveWorldResult => {
    const key = STORAGE_KEYS.DATA_PREFIX + world.id;
    try {
        const currentRaw = readStorageRaw(key);
        const expectedRaw = loadedWorldRaw.get(world.id);
        if (expectedRaw !== undefined && currentRaw !== expectedRaw) {
            reportStorageIssue({ kind: 'conflict', key, message: `Universe ${world.id} changed outside this session.` });
            return 'conflict';
        }

        const persistedWorld = { ...world, version: CURRENT_WORLD_VERSION };
        const validated = parseWorldData(persistedWorld);
        if (!validated) corrupt(key, 'The universe is structurally invalid and was not saved.');
        const nextRaw = stringifyStorageJson(key, validated);
        if (currentRaw === nextRaw) return 'ok';
        writeStorageRawVerified(key, nextRaw);
        rememberWorld(world.id, nextRaw);
        return 'ok';
    } catch (e) {
        if (storageFailureKind(e) === 'quota') return 'quota';
        return 'error';
    }
};

export const createWorld = (name: string, folderId?: string, presetId?: string): string => {
    requireFolder(folderId);
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
        presetId,
    };

    const data: WorldData = {
        id,
        version: CURRENT_WORLD_VERSION,
        bodies: [],
        settings: {
            speed: 1.0,
            showGrid: true,
            showDust: true,
            showHabitable: false,
            showStability: false,
            showOrbitPaths: true,
        },
    };

    const list = getWorldList();
    list.unshift(meta);
    const dataKey = STORAGE_KEYS.DATA_PREFIX + id;
    const dataRaw = stringifyStorageJson(dataKey, data);
    writeStorageRawVerified(dataKey, dataRaw);
    try {
        saveWorldList(list);
    } catch (error) {
        attemptRecovery(dataKey, () => removeStorageVerified(dataKey));
        throw error;
    }
    rememberWorld(id, dataRaw);

    return id;
};

export const deleteWorld = (id: string): void => {
    const dataKey = STORAGE_KEYS.DATA_PREFIX + id;
    const backupKey = V1_BACKUP_PREFIX + id;
    const previousIndex = readStorageRaw(STORAGE_KEYS.INDEX);
    const previousData = readStorageRaw(dataKey);
    try {
        const list = getWorldList().filter(w => w.id !== id);
        saveWorldList(list);
        removeStorageVerified(dataKey);
        if (readStorageRaw(backupKey) !== null) removeStorageVerified(backupKey);
        loadedWorldRaw.delete(id);
    } catch (error) {
        attemptRecovery(dataKey, () => {
            if (previousData !== null) writeStorageRawVerified(dataKey, previousData);
        });
        attemptRecovery(STORAGE_KEYS.INDEX, () => {
            if (previousIndex === null) removeStorageVerified(STORAGE_KEYS.INDEX);
            else writeStorageRawVerified(STORAGE_KEYS.INDEX, previousIndex);
        });
        throw error;
    }
};

export const renameWorld = (id: string, newName: string): void => {
    if (!newName.trim()) throw new Error('Universe name cannot be empty.');
    const trimmed = sanitizeName(newName);
    if (getWorldList().some(w => w.id !== id && w.name.toLowerCase() === trimmed.toLowerCase())) {
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
    requireFolder(folderId);
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

export const serializeBodies = (bodies: readonly CelestialBody[]): CelestialBodyData[] => {
    if (bodies.length > PHYSICS_LIMITS.MAX_BODIES) corrupt(STORAGE_KEYS.DATA_PREFIX, 'The universe exceeds the supported body count.');
    return sanitizeCelestialBodies(Array.from(bodies)).map(b => ({
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

const safeNum = savedNumber;

const VALID_HABITABILITY = new Set<CelestialBody['habitability']>([
    'HABITABLE', 'FROZEN', 'BURNING', 'TOXIC', 'STELLAR', 'SINGULARITY', 'STERILIZED', 'N/A',
]);

export const deserializeBodies = (data: CelestialBodyData[], version = CURRENT_WORLD_VERSION): CelestialBody[] => {
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
    simTime: safeNum(settings?.simTime, 0),
    speed: clampSpeed(safeNum(settings?.speed, 1)),
    showGrid: Boolean(settings?.showGrid ?? true),
    showDust: Boolean(settings?.showDust ?? true),
    showHabitable: Boolean(settings?.showHabitable ?? false),
    showStability: Boolean(settings?.showStability ?? false),
    // Defaults on for worlds saved before the orbit-path toggle moved into the
    // settings sheet, matching the old hard-coded SpaceCanvas default.
    showOrbitPaths: Boolean(settings?.showOrbitPaths ?? true),
});

export const markWorldOpened = (id: string): void => {
    const list = getWorldList();
    const idx = list.findIndex(w => w.id === id);
    if (idx >= 0) {
        list[idx].lastOpenedAt = Date.now();
        saveWorldList(list);
    }
};

export const resetWorldStorageStateForTests = (): void => {
    worldIndexHealthy = true;
    folderIndexHealthy = true;
    loadedWorldRaw.clear();
};
