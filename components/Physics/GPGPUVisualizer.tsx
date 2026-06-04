import React from 'react';
import * as THREE from 'three';

/**
 * Visualizer for the optional GPGPUPhysics demo path (not used in the main sim).
 * Kept minimal so the module type-checks; mount only for experiments.
 */
export default function GPGPUBodyVisualizer(_props: {
  count: number;
  texturePos: THREE.Texture | null;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
}): null {
  return null;
}
