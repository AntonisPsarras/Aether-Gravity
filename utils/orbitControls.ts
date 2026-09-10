import * as THREE from 'three';

/**
 * The slice of drei's OrbitControls the canvas code touches. Shared by the
 * slingshot creator, the moon creator's handle drag and BodyMesh's long-press
 * interlock, which live in different modules.
 */
export type OrbitControlsLike = { target: THREE.Vector3; update: () => void; enabled: boolean };

export function isOrbitControlsLike(controls: unknown): controls is OrbitControlsLike {
  if (controls == null || typeof controls !== 'object') return false;
  const c = controls as OrbitControlsLike;
  return c.target instanceof THREE.Vector3 && typeof c.update === 'function' && typeof c.enabled === 'boolean';
}

export function setOrbitControlsEnabled(controls: unknown, enabled: boolean): void {
  if (isOrbitControlsLike(controls)) {
    controls.enabled = enabled;
  }
}
