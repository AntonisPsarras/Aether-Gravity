import { create } from 'zustand';
import { CelestialBody, BodyType, WorldData } from '../types';
import * as THREE from 'three';
import {
  generateSystem,
  findDominantParent,
  findPrimaryStar,
  reconcileBodyDerivedState,
} from './physicsUtils';
import { patchPhysicsBody, replacePhysicsBodies, appendPhysicsBody } from './physicsBridge';
import { G_CONSTANT } from '../constants';
import { buildRealSystem, getRealSystem } from '../content/realSystems';
import { resetAccumulator, resetVerletCache } from './physicsSoA';
import { deserializeBodies, sanitizeWorldSettings } from './worldStorage';
import {
  clampMass,
  clampRadius,
  clampRadiusKm,
  clampSpeed,
  clampStarTemperature,
  clampPositionVector,
  clampVelocityVector,
  sanitizeCelestialBodies,
  sanitizeCelestialBody,
  sanitizeProperties,
} from './physicsBounds';

let uiInteractionSafetyTimer: ReturnType<typeof setTimeout> | null = null;

interface AppState {
  // World State
  bodies: CelestialBody[];
  /** Highlighted body (3D halo + outliner); does not open the inspector. */
  selectedId: string | null;
  /** Body shown in the properties panel (long-press or explicit open). */
  inspectorBodyId: string | null;
  cameraLockedId: string | null;
  worldId: string | null;

  // Settings
  paused: boolean;
  speed: number;
  showGrid: boolean;
  showDust: boolean;
  showHabitable: boolean;
  showStability: boolean;
  historyVersion: number;
  /** Bumped when the camera should snap to the primary star (e.g. after generate). */
  cameraRecenterNonce: number;
  /** Dev-only: energy-drift HUD on the simulation canvas */
  isDebugMode: boolean;
  /** Per-body inspector fields protected from physics→store overwrites while editing */
  inspectorLocks: Record<string, string[]>;
  /** True while the user is actively interacting with a UI slider / input.
   *  Used to disable OrbitControls so panel sliders don't also rotate the camera. */
  isInteractingWithUI: boolean;
  /** User-visible notice when localStorage save fails (quota, etc.). */
  storageNotice: string | null;

  // Actions
  setBodies: (bodies: CelestialBody[] | ((prev: CelestialBody[]) => CelestialBody[])) => void;
  /** Append one body to the live physics array without reverting evolved positions. */
  appendBody: (body: CelestialBody) => void;
  updateBody: (id: string, updates: Partial<CelestialBody>) => void;
  removeBody: (id: string) => void;
  selectBody: (id: string | null) => void;
  openInspector: (id: string | null) => void;
  closeInspector: () => void;
  setCameraLock: (id: string | null) => void;

  // Simulation Controls
  setPaused: (paused: boolean) => void;
  setSpeed: (speed: number) => void;
  toggleGrid: () => void;
  toggleDust: () => void;
  toggleHabitable: () => void;
  toggleStability: () => void;
  toggleDebugMode: () => void;
  lockInspectorFields: (bodyId: string, fields: string[]) => void;
  unlockInspectorFields: (bodyId: string, fields?: string[]) => void;
  setInteractingWithUI: (v: boolean) => void;
  setStorageNotice: (msg: string | null) => void;
  syncBodiesFromPhysics: (physicsBodies: CelestialBody[]) => void;

  // System Actions
  generateNewSystem: () => void;
  loadRealSystem: (systemId: string) => void;
  installBodies: (bodies: CelestialBody[]) => void;
  loadWorld: (data: WorldData) => void;
  /** Clears selection, camera lock, and inspector locks (e.g. when leaving a world). */
  resetSessionUiState: () => void;

  // Helpers
  getSelectedBody: () => CelestialBody | undefined;

  // Numbering
  typeCounts: Record<string, number>;
  getNextNumber: (type: BodyType) => number;
}

export const useStore = create<AppState>((set, get) => ({
  bodies: [],
  selectedId: null,
  inspectorBodyId: null,
  cameraLockedId: null,
  worldId: null,

  paused: false,
  speed: 1.0,
  showGrid: true,
  showDust: true,
  showHabitable: false,
  showStability: false,
  historyVersion: 0,
  cameraRecenterNonce: 0,
  isDebugMode: false,
  inspectorLocks: {},
  isInteractingWithUI: false,
  storageNotice: null,

  typeCounts: {},

  lockInspectorFields: (bodyId, fields) => set((state) => {
    const prev = state.inspectorLocks[bodyId] || [];
    const merged = Array.from(new Set([...prev, ...fields]));
    return { inspectorLocks: { ...state.inspectorLocks, [bodyId]: merged } };
  }),

  unlockInspectorFields: (bodyId, fields) => set((state) => {
    if (!fields || fields.length === 0) {
      const next = { ...state.inspectorLocks };
      delete next[bodyId];
      return { inspectorLocks: next };
    }
    const prev = state.inspectorLocks[bodyId] || [];
    const remaining = prev.filter((f) => !fields.includes(f));
    const next = { ...state.inspectorLocks };
    if (remaining.length === 0) delete next[bodyId];
    else next[bodyId] = remaining;
    return { inspectorLocks: next };
  }),

  syncBodiesFromPhysics: (physicsBodies) => set((state) => {
    const locks = state.inspectorLocks;
    const merged = physicsBodies.map((pb) => {
      const storeBody = state.bodies.find((b) => b.id === pb.id);
      if (!storeBody) {
        return sanitizeCelestialBody({
          ...pb,
          position: pb.position.clone(),
          velocity: pb.velocity.clone(),
        });
      }
      const locked = locks[pb.id];
      if (!locked?.length) {
        return sanitizeCelestialBody({
          ...pb,
          position: pb.position.clone(),
          velocity: pb.velocity.clone(),
        });
      }
      const out: CelestialBody = {
        ...pb,
        position: pb.position.clone(),
        velocity: pb.velocity.clone(),
      };
      if (locked.includes('mass')) out.mass = storeBody.mass;
      if (locked.includes('radius')) out.radius = storeBody.radius;
      if (locked.includes('temperature')) {
        out.temperature = storeBody.temperature;
        out.color = storeBody.color;
      }
      if (locked.includes('properties') || locked.includes('composition')) {
        out.properties = { ...storeBody.properties };
      }
      return sanitizeCelestialBody(out);
    });
    return { bodies: merged };
  }),

  toggleDebugMode: () => set((state) => ({ isDebugMode: !state.isDebugMode })),
  setInteractingWithUI: (v) => {
    if (uiInteractionSafetyTimer) {
      clearTimeout(uiInteractionSafetyTimer);
      uiInteractionSafetyTimer = null;
    }
    set({ isInteractingWithUI: v });
    if (v) {
      // Mobile browsers may miss pointerup/cancel when gestures are interrupted.
      // Auto-clear the interaction lock so camera controls cannot get stuck off.
      uiInteractionSafetyTimer = setTimeout(() => {
        set({ isInteractingWithUI: false });
        uiInteractionSafetyTimer = null;
      }, 1500);
    }
  },

  getNextNumber: (type) => {
    const s = get();
    const currentCount = s.typeCounts[type] || 0;
    const nextCount = currentCount + 1;
    set(state => ({
      typeCounts: { ...state.typeCounts, [type]: nextCount }
    }));
    return nextCount;
  },

  setBodies: (bodiesOrFn) => {
    const state = get();
    const raw = typeof bodiesOrFn === 'function' ? bodiesOrFn(state.bodies) : bodiesOrFn;
    const newBodies = sanitizeCelestialBodies(raw);
    set({ bodies: newBodies });
    replacePhysicsBodies(newBodies);
  },

  appendBody: (body) => {
    const sanitized = sanitizeCelestialBody({
      ...body,
      position: body.position.clone(),
      velocity: body.velocity.clone(),
    });
    const next = appendPhysicsBody(sanitized);
    set({
      bodies: next.map((b) => ({
        ...b,
        position: b.position.clone(),
        velocity: b.velocity.clone(),
      })),
    });
  },

  updateBody: (id, updates) => {
    // Clamp physics-critical scalars before they enter the store so no code
    // path can introduce NaN, Infinity, or non-positive mass/radius.
    if (updates.mass !== undefined) {
      updates = { ...updates, mass: clampMass(updates.mass) };
    }
    if (updates.radius !== undefined) {
      updates = { ...updates, radius: clampRadius(updates.radius) };
    }
    if (updates.temperature !== undefined) {
      updates = { ...updates, temperature: clampStarTemperature(updates.temperature) };
    }
    if (updates.position !== undefined) {
      updates = {
        ...updates,
        position: clampPositionVector(updates.position.clone()),
      };
    }
    if (updates.velocity !== undefined) {
      updates = {
        ...updates,
        velocity: clampVelocityVector(updates.velocity.clone()),
      };
    }
    const touchedPosVel = updates.position !== undefined || updates.velocity !== undefined;
    set((state) => {
    const oldBodies = state.bodies;
    const bodyIndex = oldBodies.findIndex(b => b.id === id);
    if (bodyIndex === -1) return {};

    const body = oldBodies[bodyIndex];
    const mergedProps = updates.properties
      ? sanitizeProperties({ ...body.properties, ...updates.properties })
      : body.properties;
    let newBody: CelestialBody = {
      ...body,
      ...updates,
      properties: mergedProps,
    };

    // A user-supplied physical radius pins the radius; everything else is then
    // solved from mass and that radius rather than from composition.
    if (updates.radiusKm !== undefined && updates.radiusKm !== body.radiusKm) {
      newBody.radiusKm = clampRadiusKm(updates.radiusKm);
      newBody.properties = {
        ...(newBody.properties || {}),
        manualRadius: true,
        manualRadiusKm: newBody.radiusKm,
      };
    }

    // Any change to a primary re-derives every dependent quantity in one place
    // (radius, density, gravity, escape velocity, luminosity, photospheric
    // temperature) and re-classifies the body if its mass has left its type's
    // physical range. See utils/bodyDerivation.ts.
    const primaryChanged =
      updates.mass !== undefined ||
      updates.radiusKm !== undefined ||
      updates.type !== undefined ||
      updates.properties !== undefined;
    if (primaryChanged) {
      reconcileBodyDerivedState(newBody);
      // A user-set temperature must survive the re-derivation.
      if (updates.temperature !== undefined) newBody.temperature = updates.temperature;
    }

    // Cascading Updates Logic
    if (updates.mass !== undefined && updates.mass !== body.mass) {
      // Maintain Orbital Stability of Children
      // If we change this body's mass, its children (satellites) need their velocity adjusted 
      // to maintain their current orbit shape, OR we accept they will spiral.
      // The user prompt asked for "changes in one property (like mass) automatically cascade".
      // Let's adjust children velocities to keep them in stable orbit at current distance.
      // v = sqrt(GM/r). New v = v_old * sqrt(M_new / M_old)
      const massRatio = Math.sqrt(updates.mass / body.mass);

      // We need to update OTHER bodies in the array
      newBody = sanitizeCelestialBody(newBody);
      const updatedBodies = [...oldBodies];
      updatedBodies[bodyIndex] = newBody;

      updatedBodies.forEach((other, idx) => {
        if (idx === bodyIndex) return;
        const parent = findDominantParent(other, updatedBodies);
        if (parent && parent.id === body.id) {
          const relVel = other.velocity.clone().sub(body.velocity);
          relVel.multiplyScalar(massRatio);
          other.velocity.copy(body.velocity).add(relVel);
          clampVelocityVector(other.velocity);
        }
      });

      return { bodies: updatedBodies.map((b) => sanitizeCelestialBody(b)) };
    }

    newBody = sanitizeCelestialBody(newBody);
    const newBodies = [...oldBodies];
    newBodies[bodyIndex] = newBody;
    return { bodies: newBodies };
    });

    const final = get().bodies.find((b) => b.id === id);
    if (!final) return;
    const patch: Partial<CelestialBody> = {
      mass: final.mass,
      radius: final.radius,
      radiusKm: final.radiusKm,
      type: final.type,
      temperature: final.temperature,
      color: final.color,
      texture: final.texture,
      properties: final.properties,
    };
    if (touchedPosVel) {
      patch.position = final.position;
      patch.velocity = final.velocity;
    }
    // The Orbit tab edits satellite elements directly; forward the prescribed
    // orbit so the live moon and its read-only path agree even while paused.
    if ('orbit' in updates) patch.orbit = final.orbit;
    patchPhysicsBody(id, patch);

    if (updates.mass !== undefined) {
      get().bodies.forEach((other) => {
        if (other.id === id) return;
        const dom = findDominantParent(other, get().bodies);
        if (dom?.id === id) patchPhysicsBody(other.id, { velocity: other.velocity });
      });
    }
  },

  removeBody: (id) => {
    set((state) => ({
      bodies: state.bodies.filter((b) => b.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
      inspectorBodyId: state.inspectorBodyId === id ? null : state.inspectorBodyId,
      cameraLockedId: state.cameraLockedId === id ? null : state.cameraLockedId,
      inspectorLocks: (() => {
        if (!state.inspectorLocks[id]) return state.inspectorLocks;
        const next = { ...state.inspectorLocks };
        delete next[id];
        return next;
      })(),
    }));
    replacePhysicsBodies(get().bodies);
  },

  resetSessionUiState: () =>
    set({
      selectedId: null,
      inspectorBodyId: null,
      cameraLockedId: null,
      inspectorLocks: {},
      worldId: null,
      isInteractingWithUI: false,
      storageNotice: null,
    }),

  setStorageNotice: (msg) => set({ storageNotice: msg }),

  selectBody: (id) => set({ selectedId: id }),
  openInspector: (id) => set({ inspectorBodyId: id }),
  closeInspector: () => set({ inspectorBodyId: null }),
  setCameraLock: (id) => set({ cameraLockedId: id }),

  setPaused: (paused) => set({ paused }),
  setSpeed: (speed) => set({ speed: clampSpeed(speed) }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleDust: () => set((state) => ({ showDust: !state.showDust })),
  toggleHabitable: () => set((state) => ({ showHabitable: !state.showHabitable })),
  toggleStability: () => set((state) => ({ showStability: !state.showStability })),

  generateNewSystem: () => {
    get().installBodies(generateSystem());
  },

  /**
   * Load a scientifically-parameterised real system (Solar System, TRAPPIST-1,
   * …) as a starting point. Distinct from `generateNewSystem`, which produces a
   * random one. The resulting bodies are fully editable and saveable like any
   * other world.
   */
  loadRealSystem: (systemId: string) => {
    const system = getRealSystem(systemId);
    if (!system) return;
    get().installBodies(buildRealSystem(system));
  },

  /** Replace the world with `bodies`, recomputing naming counters and camera. */
  installBodies: (bodies: CelestialBody[]) => {
    const star = findPrimaryStar(bodies);

    // Recalculate type counts so newly created bodies keep numbering upward.
    const counts: Record<string, number> = {};
    bodies.forEach(b => {
      const match = b.name.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (!counts[b.type] || num > counts[b.type]) {
          counts[b.type] = num;
        }
      }
    });

    const sanitized = sanitizeCelestialBodies(bodies);
    // Start the simulation clock at zero so satellites, whose mean anomalies
    // are defined against an epoch, begin at the phase the preset specifies.
    // Also drops stale cached accelerations from the previous world.
    resetAccumulator();
    resetVerletCache();
    replacePhysicsBodies(sanitized);

    const state = get();
    set({
      bodies: sanitized,
      selectedId: null,
      inspectorBodyId: null,
      cameraLockedId: star?.id ?? null,
      typeCounts: counts,
      historyVersion: state.historyVersion + 1,
      cameraRecenterNonce: state.cameraRecenterNonce + 1,
    });
  },

  loadWorld: (data) => {
    const loadedBodies = deserializeBodies(data.bodies);
    loadedBodies.forEach((body) => reconcileBodyDerivedState(body));

    // Recalculate type counts from loaded bodies
    const counts: Record<string, number> = {};
    loadedBodies.forEach(b => {
      const match = b.name.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1]);
        if (!counts[b.type] || num > counts[b.type]) {
          counts[b.type] = num;
        }
      }
    });

    const state = get();
    const star =
      loadedBodies.find((b) => b.type === 'Star' || b.type === 'Red Giant') ??
      loadedBodies[0];
    const keepSelection =
      state.selectedId != null &&
      loadedBodies.some((b) => b.id === state.selectedId);

    const settings = sanitizeWorldSettings(data.settings);

    set({
      worldId: data.id,
      bodies: loadedBodies,
      selectedId: keepSelection ? state.selectedId : star?.id ?? null,
      cameraLockedId:
        state.cameraLockedId != null &&
        loadedBodies.some((b) => b.id === state.cameraLockedId)
          ? state.cameraLockedId
          : null,
      inspectorLocks: {},
      speed: settings.speed,
      showGrid: settings.showGrid,
      showDust: settings.showDust,
      showHabitable: settings.showHabitable,
      showStability: settings.showStability,
      typeCounts: counts,
    });
  },

  getSelectedBody: () => {
    const s = get();
    return s.bodies.find(b => b.id === s.selectedId);
  }
}));
