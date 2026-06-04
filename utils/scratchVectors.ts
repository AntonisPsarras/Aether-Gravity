import * as THREE from 'three';

/** Module-scoped scratch vectors for single-threaded useFrame hot paths. */
export const scratchV0 = new THREE.Vector3();
export const scratchV1 = new THREE.Vector3();
export const scratchV2 = new THREE.Vector3();
export const scratchV3 = new THREE.Vector3();

/** out = world - floatingOrigin */
export const toRenderSpace = (
  out: THREE.Vector3,
  world: THREE.Vector3,
  floatingOrigin: THREE.Vector3
): THREE.Vector3 => out.copy(world).sub(floatingOrigin);
