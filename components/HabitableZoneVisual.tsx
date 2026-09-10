import React, { useMemo, useRef } from 'react';

import { useFrame, extend } from '@react-three/fiber';

import { shaderMaterial } from '@react-three/drei';

import * as THREE from 'three';

import { useStore } from '../utils/store';

import { getHabitableZoneInGameUnits } from '../utils/HabitabilityService';

import { CelestialBody } from '../types';

import { scratchV0, toRenderSpace } from '../utils/scratchVectors';

import { getPhysicsBodiesSnapshot } from '../utils/physicsBridge';

import { CURVATURE_WELL_GLSL } from '../utils/curvatureDisplay';

import { createGridWellUniforms, fillGridWellUniforms } from '../utils/gridWells';

import { GRID_RENDER_SAFETY_MAX_DEPTH } from '../utils/displayMode';



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

    // Must track the grid's own well uniforms exactly, or this disc detaches
    // from the surface it is supposed to lie on — both fill them through
    // utils/gridWells.ts.

    uBodiesPeak: new Float32Array(50),

    uBodiesCore: new Float32Array(50),

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

    uniform float uBodiesPeak[50];

    uniform float uBodiesCore[50];

    ${CURVATURE_WELL_GLSL}

    void main() {

      vUv = uv;

      vec3 newPos = position;

      vec4 worldPosition = modelMatrix * vec4(position, 1.0);

      

      // Calculate Gravity Displacement (matching Grid logic)

      float displacement = 0.0;

      for(int i = 0; i < 50; i++) {

        if (i >= uBodyCount) break;

        vec3 bPos = uBodiesPos[i];

        // 3D distance from the orbital-plane slice, exactly as the grid does it.

        float d = distance(vec3(worldPosition.x, 0.0, worldPosition.z), bPos);

        displacement -= wellDepthAt(d, uBodiesPeak[i], uBodiesCore[i]);

      }



      // The grid's render-safety floor, mirrored so the two never diverge.

      displacement = max(displacement, -${GRID_RENDER_SAFETY_MAX_DEPTH.toFixed(1)});

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

  const uiMode = useStore((s) => s.uiMode);



  const zones = useMemo(() => getHabitableZoneInGameUnits(star), [star]);



  const wells = useMemo(createGridWellUniforms, []);



  useFrame((state) => {

    if (!materialRef.current || !meshRef.current || !showHabitable) return;



    materialRef.current.uTime = state.clock.getElapsedTime();

    materialRef.current.uInnerRadius = zones.inner;

    materialRef.current.uOuterRadius = zones.outer;



    const liveStar = getPhysicsBodiesSnapshot().find(b => b.id === star.id);
    meshRef.current.visible = !!liveStar;
    if (!liveStar) return;
    toRenderSpace(scratchV0, liveStar.position, floatingOffset.current);

    materialRef.current.uCenter.copy(scratchV0);

    // The grid's flat level is the orbital plane, y = 0.
    meshRef.current.position.copy(scratchV0).setY(0);



    const count = fillGridWellUniforms(wells, getPhysicsBodiesSnapshot(), floatingOffset.current, uiMode);

    materialRef.current.uBodiesPos = wells.positions;

    materialRef.current.uBodiesMass = wells.masses;

    materialRef.current.uBodiesPeak = wells.peaks;

    materialRef.current.uBodiesCore = wells.cores;

    materialRef.current.uBodyCount = count;

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

