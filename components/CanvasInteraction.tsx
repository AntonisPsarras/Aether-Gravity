import React from 'react';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

/** Kept for compatibility with older imports. */
export const PLACEMENT_LAYER = 10;

/** Interaction rollback: no custom raycaster layer routing. */
export function PlacementRaycastLayer(_: { active: boolean }): null {
  return null;
}

/** Interaction rollback: never disconnect R3F canvas events. */
export function CanvasEventGate(_: { placementActive: boolean }): null {
  return null;
}

/** Compatibility wrapper; prefer direct `OrbitControls` usage. */
export function CanvasOrbitControls(
  props: React.ComponentProps<typeof OrbitControls>
): React.ReactElement {
  return <OrbitControls {...props} />;
}

export function SelectionController({
  bodyObjectsRef: _bodyObjectsRef,
  selectBody: _selectBody,
  placementActive: _placementActive,
}: {
  bodyObjectsRef: React.MutableRefObject<Map<string, THREE.Object3D>>;
  selectBody: (id: string | null) => void;
  placementActive: boolean;
}): null {
  // Selection is now handled by mesh onPointerDown + Canvas onPointerMissed.
  return null;
}
