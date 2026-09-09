/**
 * Read-only window onto what is actually *drawn*, for tests.
 *
 * The physics state and the render transform are updated by different code
 * (`utils/physicsSoA.ts` advances the bodies; SpaceCanvas's frame loop writes
 * their meshes), so "physics is correct" is not evidence that "the screen is
 * correct". This exposes the render side so a test can assert the two agree.
 *
 * Mirrors `utils/physicsBridge.ts`: SpaceCanvas registers its live refs, and
 * nothing here mutates them.
 */

import type { MutableRefObject } from 'react';
import type * as THREE from 'three';

let objectsRef: MutableRefObject<Map<string, THREE.Object3D>> | null = null;
let offsetRef: MutableRefObject<THREE.Vector3> | null = null;

export const registerRenderObjects = (
  objects: MutableRefObject<Map<string, THREE.Object3D>>,
  floatingOffset: MutableRefObject<THREE.Vector3>,
): void => {
  objectsRef = objects;
  offsetRef = floatingOffset;
};

export const unregisterRenderObjects = (
  objects: MutableRefObject<Map<string, THREE.Object3D>>,
): void => {
  if (objectsRef === objects) {
    objectsRef = null;
    offsetRef = null;
  }
};

export interface RenderedBody {
  id: string;
  /** Render-space position of the body's group, i.e. world minus floating origin. */
  position: { x: number; y: number; z: number };
}

export interface RenderSnapshot {
  /** Current floating origin. Add it back to compare against physics positions. */
  floatingOffset: { x: number; y: number; z: number };
  bodies: RenderedBody[];
}

export const getRenderSnapshot = (): RenderSnapshot => {
  const offset = offsetRef?.current;
  const bodies: RenderedBody[] = [];
  const map = objectsRef?.current;
  if (map) {
    for (const [id, obj] of map) {
      bodies.push({ id, position: { x: obj.position.x, y: obj.position.y, z: obj.position.z } });
    }
  }
  return {
    floatingOffset: offset
      ? { x: offset.x, y: offset.y, z: offset.z }
      : { x: 0, y: 0, z: 0 },
    bodies,
  };
};
