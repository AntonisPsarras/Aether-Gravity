import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { useStore } from '../utils/store';
import { getSimTime } from '../utils/physicsSoA';
import { fillParentMap } from '../utils/physicsUtils';
import { sampleOrbitPath } from '../utils/orbitPaths';
import { useEnvironment } from './Environment/EnvironmentContext';

type Props = {
  bodiesRef: React.MutableRefObject<CelestialBody[]>;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
  parentMapRef: React.MutableRefObject<Map<string, CelestialBody | null>>;
};

export default function OrbitPaths({ bodiesRef, floatingOffset, parentMapRef }: Props) {
  const { quality } = useEnvironment();
  const group = useMemo(() => new THREE.Group(), []);
  const lines = useRef(new Map<string, { line: THREE.Line; parentId: string }>());
  const dirty = useRef(true);
  const last = useRef(-Infinity);
  const byId = useRef(new Map<string, CelestialBody>()).current;
  const selected = useStore(s => s.selectedId);
  useEffect(() => useStore.subscribe((s, prev) => {
    if (s.bodies !== prev.bodies || s.historyVersion !== prev.historyVersion) dirty.current = true;
  }), []);
  useEffect(() => { dirty.current = true; }, [quality]);
  useEffect(() => () => {
    lines.current.forEach(({ line }) => { line.geometry.dispose(); (line.material as THREE.Material).dispose(); });
    lines.current.clear(); group.clear();
  }, [group]);
  useFrame(({ clock }) => {
    const live = bodiesRef.current;
    byId.clear();
    for (const body of live) byId.set(body.id, body);
    let refresh = dirty.current || clock.elapsedTime - last.current >= 1 / quality.orbitRefreshHz;
    for (const [id, entry] of lines.current) {
      const body = byId.get(id);
      const parent = body?.parentId ?? parentMapRef.current.get(id)?.id;
      if (!body || parent !== entry.parentId || !byId.has(entry.parentId)) refresh = true;
    }
    if (refresh) {
      // Edits while paused can precede the engine's throttled parent-map update.
      // Use a private map; the visualization never mutates the engine's map.
      const parents = new Map<string, CelestialBody | null>();
      if (dirty.current) fillParentMap(live, parents);
      const source = dirty.current ? parents : parentMapRef.current;
      const retained = new Set<string>();
      for (const body of live) {
        const parent = body.parentId ? byId.get(body.parentId) : source.get(body.id);
        if (!parent) continue;
        const points = sampleOrbitPath(body, parent, quality.orbitSegments, getSimTime());
        if (!points.length) continue;
        retained.add(body.id);
        let entry = lines.current.get(body.id);
        if (!entry) {
          const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
            transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false,
          }));
          line.name = `orbit-estimate:${body.id}`;
          line.raycast = () => {};
          entry = { line, parentId: parent.id };
          lines.current.set(body.id, entry); group.add(line);
        }
        entry.parentId = parent.id;
        const attr = entry.line.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
        if (attr?.array.length === points.length) { attr.copyArray(points); attr.needsUpdate = true; }
        else {
          entry.line.geometry.dispose();
          entry.line.geometry = new THREE.BufferGeometry();
          entry.line.geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
        }
        entry.line.geometry.computeBoundingSphere();
        (entry.line.material as THREE.LineBasicMaterial).color.set(body.trailColor || body.color);
      }
      for (const [id, { line }] of lines.current) if (!retained.has(id)) {
        group.remove(line); line.geometry.dispose(); (line.material as THREE.Material).dispose(); lines.current.delete(id);
      }
      dirty.current = false; last.current = clock.elapsedTime;
    }
    lines.current.forEach(({ line, parentId }, id) => {
      const parent = byId.get(parentId);
      line.visible = !!parent;
      if (parent) line.position.copy(parent.position).sub(floatingOffset.current);
      (line.material as THREE.LineBasicMaterial).opacity = selected === id ? 0.8 : 0.26;
    });
  });
  return <primitive object={group} dispose={null} />;
}
