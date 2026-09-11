import React, { useMemo, useRef } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../utils/store';
import { getHabitableZoneInGameUnits } from '../utils/HabitabilityService';
import { CelestialBody } from '../types';
import { scratchV0, toRenderSpace } from '../utils/scratchVectors';
import { getPhysicsBodiesSnapshot } from '../utils/physicsBridge';
import { CURVATURE_WELL_GLSL, DISPLAY_DEPTH_GLSL } from '../utils/curvatureDisplay';
import { GRID_MAX_BODIES, getGridFrame } from '../utils/gridWells';

const HabitableZoneMaterial = shaderMaterial(
  {
    uInnerRadius: 0,
    uOuterRadius: 0,
    uCenter: new THREE.Vector3(0, 0, 0),
    uColorInner: new THREE.Color(0.8, 0.2, 0.0), // Hot
    uColorOuter: new THREE.Color(0.0, 0.4, 0.8), // Cold
    uColorOptimal: new THREE.Color(0.1, 0.8, 0.3), // Optimal
    // The grid's own per-frame well uniforms (utils/gridWells.ts), uploaded
    // unchanged so this disc lies exactly on the surface the grid draws.
    uBodiesPos: new Float32Array(GRID_MAX_BODIES * 3),
    uBodiesPeak: new Float32Array(GRID_MAX_BODIES),
    uBodiesCore: new Float32Array(GRID_MAX_BODIES),
    uBodyCount: 0,
    uDisplayKnee: 300,
  },
  // Vertex Shader
  `
    precision highp float;
    varying vec3 vWorldPos;

    uniform vec3 uBodiesPos[${GRID_MAX_BODIES}];
    uniform float uBodiesPeak[${GRID_MAX_BODIES}];
    uniform float uBodiesCore[${GRID_MAX_BODIES}];
    uniform int uBodyCount;
    uniform float uDisplayKnee;

    ${CURVATURE_WELL_GLSL}
    ${DISPLAY_DEPTH_GLSL}

    void main() {
      vec3 newPos = position;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);

      // The grid's displacement, term for term: 3D distance from the
      // orbital-plane slice to each well, summed, then the shared depth map.
      float depth = 0.0;
      for (int i = 0; i < ${GRID_MAX_BODIES}; i++) {
        if (i >= uBodyCount) break;
        float d = distance(vec3(worldPosition.x, 0.0, worldPosition.z), uBodiesPos[i]);
        depth += wellDepthAt(d, uBodiesPeak[i], uBodiesCore[i]);
      }

      // Local z is world y (the mesh is rotated flat); wells dip below y = 0.
      newPos.z -= displayDepth(depth, uDisplayKnee);
      vWorldPos = (modelMatrix * vec4(newPos, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
    }
  `,
  // Fragment Shader
  `
    precision highp float;
    varying vec3 vWorldPos;

    uniform vec3 uCenter;
    uniform float uInnerRadius;
    uniform float uOuterRadius;
    uniform vec3 uColorInner;
    uniform vec3 uColorOuter;
    uniform vec3 uColorOptimal;

    void main() {
      float dist = distance(vWorldPos.xz, uCenter.xz);

      // Ring Mask
      float alpha = smoothstep(uInnerRadius * 0.9, uInnerRadius, dist) *
                    (1.0 - smoothstep(uOuterRadius, uOuterRadius * 1.1, dist));
      if (alpha < 0.01) discard;

      // Color Gradient
      float t = (dist - uInnerRadius) / (uOuterRadius - uInnerRadius);
      vec3 color = mix(uColorInner, uColorOptimal, smoothstep(0.0, 0.4, t));
      color = mix(color, uColorOuter, smoothstep(0.6, 1.0, t));

      gl_FragColor = vec4(color, alpha * 0.3);
    }
  `
);

extend({ HabitableZoneMaterial });

interface HabitableZoneVisualProps {
  star: CelestialBody;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
}

const HabitableZoneVisual: React.FC<HabitableZoneVisualProps> = ({ star, floatingOffset }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<any>(null);
  const showHabitable = useStore((s) => s.showHabitable);

  const zones = useMemo(() => getHabitableZoneInGameUnits(star), [star]);

  useFrame(() => {
    const mat = materialRef.current;
    const mesh = meshRef.current;
    if (!mat || !mesh || !showHabitable) return;

    mat.uInnerRadius = zones.inner;
    mat.uOuterRadius = zones.outer;

    // PhysicsEngine publishes this frame's grid state before this runs (it
    // subscribes to the frame loop first), so there is no one-frame lag.
    const liveStar = getPhysicsBodiesSnapshot().find(b => b.id === star.id);
    const frame = getGridFrame();
    mesh.visible = !!liveStar && !!frame;
    if (!liveStar || !frame) return;
    toRenderSpace(scratchV0, liveStar.position, floatingOffset.current);
    mat.uCenter.copy(scratchV0);
    // The grid's flat level is the orbital plane, y = 0.
    mesh.position.copy(scratchV0).setY(0);

    mat.uBodiesPos = frame.positions;
    mat.uBodiesPeak = frame.peaks;
    mat.uBodiesCore = frame.cores;
    mat.uBodyCount = frame.count;
    mat.uDisplayKnee = frame.displayKnee;
  });

  if (!showHabitable) return null;

  const size = zones.outer * 2.5;

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size, 64, 64]} />
      <habitableZoneMaterial ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
};

export default HabitableZoneVisual;
