import { create } from 'zustand';
import { CelestialBody, BodyType, WorldData } from '../types';
import * as THREE from 'three';
import { generateSystem, calculatePlanetaryPhysics, findDominantParent } from './physicsUtils';
import { PRESETS, G_CONSTANT } from '../constants';
import { serializeBodies } from './worldStorage';

interface AppState {
  // World State
  bodies: CelestialBody[];
  selectedId: string | null;
  cameraLockedId: string | null;
  worldId: string | null;

  // Settings
  paused: boolean;
  speed: number;
  showGrid: boolean;
  showDust: boolean;
  showHabitable: boolean;
  showStability: boolean;
  showOutliner: boolean;
  historyVersion: number;

  // Actions
  setBodies: (bodies: CelestialBody[] | ((prev: CelestialBody[]) => CelestialBody[])) => void;
  updateBody: (id: string, updates: Partial<CelestialBody>) => void;
  removeBody: (id: string) => void;
  selectBody: (id: string | null) => void;
  setCameraLock: (id: string | null) => void;

  // Simulation Controls
  setPaused: (paused: boolean) => void;
  setSpeed: (speed: number) => void;
  toggleGrid: () => void;
  toggleDust: () => void;
  toggleHabitable: () => void;
  toggleStability: () => void;
  toggleOutliner: () => void;

  // System Actions
  generateNewSystem: () => void;
  loadWorld: (data: WorldData) => void;

  // Helpers
  getSelectedBody: () => CelestialBody | undefined;
}

export const useStore = create<AppState>((set, get) => ({
  bodies: [],
  selectedId: null,
  cameraLockedId: null,
  worldId: null,

  paused: false,
  speed: 1.0,
  showGrid: true,
  showDust: true,
  showHabitable: false,
  showStability: false,
  showOutliner: true,
  historyVersion: 0,

  setBodies: (bodiesOrFn) => set((state) => {
    const newBodies = typeof bodiesOrFn === 'function' ? bodiesOrFn(state.bodies) : bodiesOrFn;
    return { bodies: newBodies };
  }),

  updateBody: (id, updates) => set((state) => {
    const oldBodies = state.bodies;
    const bodyIndex = oldBodies.findIndex(b => b.id === id);
    if (bodyIndex === -1) return {};

    const body = oldBodies[bodyIndex];
    const newBody = { ...body, ...updates };

    // Cascading Updates Logic
    if (updates.mass !== undefined && updates.mass !== body.mass) {
      // 1. Update Radius based on density if not manually set (simplified assumption for now)
      // Actually, we usually want to keep composition and update radius
      if (['Planet', 'Dwarf', 'Ice Giant'].includes(body.type)) {
        const props = body.properties || {};
        const physics = calculatePlanetaryPhysics(
          updates.mass,
          props.compositionIron || 0.3,
          props.compositionSilicates || 0.6,
          props.compositionWater || 0.1
        );
        newBody.radius = physics.radius;
        newBody.properties = {
          ...newBody.properties,
          bulkDensity: physics.bulkDensity,
          surfaceGravity: physics.surfaceGravity,
          escapeVelocity: physics.escapeVelocity
        };
      } else if (body.type === 'Star') {
        // Simplistic mass-radius relation for main sequence: R ~ M^0.8
        const ratio = updates.mass / body.mass;
        newBody.radius = body.radius * Math.pow(ratio, 0.8);
      }

      // 2. Maintain Orbital Stability of Children
      // If we change this body's mass, its children (satellites) need their velocity adjusted 
      // to maintain their current orbit shape, OR we accept they will spiral.
      // The user prompt asked for "changes in one property (like mass) automatically cascade".
      // Let's adjust children velocities to keep them in stable orbit at current distance.
      // v = sqrt(GM/r). New v = v_old * sqrt(M_new / M_old)
      const massRatio = Math.sqrt(updates.mass / body.mass);

      // We need to update OTHER bodies in the array
      const updatedBodies = [...oldBodies];
      updatedBodies[bodyIndex] = newBody;

      updatedBodies.forEach((other, idx) => {
        if (idx === bodyIndex) return;
        const parent = findDominantParent(other, updatedBodies);
        if (parent && parent.id === body.id) {
          // This is a child of the modified body
          // Adjust velocity relative to parent to maintain orbit
          const relVel = other.velocity.clone().sub(body.velocity);
          relVel.multiplyScalar(massRatio);
          other.velocity.copy(body.velocity).add(relVel);
        }
      });

      return { bodies: updatedBodies };
    }

    const newBodies = [...oldBodies];
    newBodies[bodyIndex] = newBody;
    return { bodies: newBodies };
  }),

  removeBody: (id) => set((state) => ({
    bodies: state.bodies.filter(b => b.id !== id),
    selectedId: state.selectedId === id ? null : state.selectedId,
    cameraLockedId: state.cameraLockedId === id ? null : state.cameraLockedId
  })),

  selectBody: (id) => set({ selectedId: id }),
  setCameraLock: (id) => set({ cameraLockedId: id }),

  setPaused: (paused) => set({ paused }),
  setSpeed: (speed) => set({ speed }),
  toggleGrid: () => set((state) => ({ showGrid: !state.showGrid })),
  toggleDust: () => set((state) => ({ showDust: !state.showDust })),
  toggleHabitable: () => set((state) => ({ showHabitable: !state.showHabitable })),
  toggleStability: () => set((state) => ({ showStability: !state.showStability })),
  toggleOutliner: () => set((state) => ({ showOutliner: !state.showOutliner })),

  generateNewSystem: () => set({ bodies: generateSystem(), selectedId: null, cameraLockedId: null }),

  loadWorld: (data) => {
    // Need to deserialize vector data
    const loadedBodies = data.bodies.map(b => ({
      ...b,
      position: new THREE.Vector3(b.position.x, b.position.y, b.position.z),
      velocity: new THREE.Vector3(b.velocity.x, b.velocity.y, b.velocity.z),
    }));

    set({
      worldId: data.id,
      bodies: loadedBodies,
      speed: data.settings.speed,
      showGrid: data.settings.showGrid,
      showDust: data.settings.showDust,
      showHabitable: data.settings.showHabitable,
      showStability: data.settings.showStability
    });
  },

  getSelectedBody: () => {
    const s = get();
    return s.bodies.find(b => b.id === s.selectedId);
  }
}));