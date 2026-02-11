import React, { useMemo, useRef } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../utils/store';
import { getHabitableZoneInGameUnits } from '../utils/HabitabilityService';
import { CelestialBody } from '../types';

const HabitableZoneMaterial = shaderMaterial(
  {
    uTime: 0,
    uInnerRadius: 0,
    uOuterRadius: 0,
    uCenter: new THREE.Vector3(0, 0, 0),
    uBodiesPos: new Float32Array(50 * 3),
    uBodiesMass: new Float32Array(50),
    uBodyCount: 0,
    uColorInner: new THREE.Color(0.8, 0.2, 0.0), // Hot
    uColorOuter: new THREE.Color(0.0, 0.4, 0.8), // Cold
    uColorOptimal: new THREE.Color(0.1, 0.8, 0.3), // Optimal
  },
  // Vertex Shader
  `
    precision highp float;
    varying vec2 vUv;
    varying float vDisplacement;
    varying vec3 vWorldPos;

    uniform float uTime;
    uniform vec3 uBodiesPos[50];
    uniform float uBodiesMass[50];
    uniform int uBodyCount;

    void main() {
      vUv = uv;
      vec3 newPos = position;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      
      // Calculate Gravity Displacement (matching Grid logic)
      float displacement = 0.0;
      for(int i = 0; i < 50; i++) {
        if (i >= uBodyCount) break;
        vec3 bPos = uBodiesPos[i];
        float m = uBodiesMass[i];
        // Distance in XZ plane
        float d = distance(worldPosition.xz, bPos.xz);
        float softeningSq = 1200.0;
        float potential = m / sqrt(d * d + softeningSq);
        displacement -= potential * 3.0; // Same scale as grid
      }
      
      // Apply displacement to Z (which is Up in this plane geometry if rotated)
      // Actually we will render a plane at Y=-20 usually? 
      // The grid is y=-20. The planet plane is y=0.
      // If we want it to sit "on the grid", we should probably position the mesh at y=-20 
      // and apply the same displacement.
      
      newPos.z += displacement;
      
      vWorldPos = (modelMatrix * vec4(newPos, 1.0)).xyz;
      vDisplacement = displacement;
      
      gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(newPos, 1.0);
    }
  `,
  // Fragment Shader
  `
    precision highp float;
    varying vec2 vUv;
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

      // Scanline / Pulse effect
      // float pulse = 0.8 + 0.2 * sin(dist * 0.1 - uTime * 2.0);
      
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
  const { bodies, showHabitable } = useStore();

  // Calculate specific HZ for this star
  const zones = useMemo(() => getHabitableZoneInGameUnits(star), [star.mass, star.temperature]);

  // Shared Physics Data (re-used for displacement)
  const shaderData = useMemo(() => ({
    positions: new Float32Array(50 * 3),
    masses: new Float32Array(50)
  }), []);

  useFrame((state) => {
    if (!materialRef.current || !showHabitable) return;

    // Update Uniforms
    materialRef.current.uTime = state.clock.getElapsedTime();
    materialRef.current.uInnerRadius = zones.inner;
    materialRef.current.uOuterRadius = zones.outer;

    // Center needs to be floating-offset adjusted for shader calculation if we use world coords
    // But since the mesh is positioned relative to camera via floatingOffset parent group...
    // Actually, uniform uCenter expects "World Position" logic?
    // In shader: distance(vWorldPos.xz, uCenter.xz). 
    // vWorldPos comes from modelMatrix. The mesh is placed at (Pos - FL).
    // So uCenter should be (Pos - FL).
    const renderPos = star.position.clone().sub(floatingOffset.current);
    materialRef.current.uCenter = renderPos;

    // Update Gravity Sources
    let count = 0;
    bodies.slice(0, 50).forEach((b, i) => {
      const bRenderPos = b.position.clone().sub(floatingOffset.current);
      shaderData.positions[i * 3] = bRenderPos.x;
      shaderData.positions[i * 3 + 1] = bRenderPos.y;
      shaderData.positions[i * 3 + 2] = bRenderPos.z;
      shaderData.masses[i] = b.mass;
      count++;
    });
    materialRef.current.uBodiesPos = shaderData.positions;
    materialRef.current.uBodiesMass = shaderData.masses;
    materialRef.current.uBodyCount = count;
  });

  if (!showHabitable) return null;

  // We place the mesh at 0,0,0 (relative to group) but it covers the whole area? 
  // No, plane geometry is finite. We need it large enough to cover the star's HZ.
  // We can position the mesh at the star's location and scale it?
  // But displacement calculation assumes World Coords relative to other bodies.
  // If we move the mesh, vWorldPos moves.
  // Easiest is to center mesh at Star and make it large enough.
  const size = zones.outer * 2.5;

  return (
    <mesh ref={meshRef} position={star.position.clone().sub(floatingOffset.current).setY(-20)} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[size, size, 64, 64]} />
      <habitableZoneMaterial ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
};

export default HabitableZoneVisual;
