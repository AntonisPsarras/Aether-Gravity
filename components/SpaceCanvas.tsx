
import React, { useRef, useMemo, useEffect, useLayoutEffect, useState } from 'react';
import { Canvas, useFrame, useThree, extend, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Stars, shaderMaterial, Html } from '@react-three/drei';
import * as THREE from 'three';
import { CelestialBody, BodyType, WaveEvent, PhysicsEvent } from '../types';
import { checkCollisions, checkEvolution, calculateStabilityMetrics, fillParentMap, updateEquilibriumTemperatures, findPrimaryStar, reconcileBodyDerivedState, bodyLuminositySolar } from '../utils/physicsUtils';
import { runFixedSteps, resetVerletCache, resetAccumulator, getSimTime } from '../utils/physicsSoA';
import { propagateSatellites, promoteEscapedMoons, satelliteRenderPosition } from '../utils/moonSystem';
import { scratchV0, scratchV1, scratchV2, scratchV3, toRenderSpace } from '../utils/scratchVectors';
import { TEXTURE_IDS, G_CONSTANT, BODY_CONFIGS, LUMINOUS_TYPES } from '../constants';
import {
  PHYSICS_LIMITS,
  clampLaunchVelocity,
  sanitizeCelestialBody,
  sanitizeCelestialBodies,
} from '../utils/physicsBounds';
import type { DeviceTier } from './CanvasSetup';
import './Planet/PlanetShaders';
import { PlanetSurfaceMaterial } from './Planet/PlanetShaders';
import { useStore } from '../utils/store';
import HabitableZoneVisual from './HabitableZoneVisual';
import BlackHoleRig from './BlackHole/BlackHoleRig';
import { BlackHoleLensCapture, useBlackHoleLensTexture } from './BlackHole/BlackHoleLensCapture';
import { habitabilityToState } from '../utils/habitabilityState';
import {
  atmosphereTint,
  bodySeed,
  cloudCoverFor,
  compositionOf,
  nightLightsFor,
  obliquityDegOf,
  ringVisualFor,
  surfaceVolatilesFor,
  type RingVisual,
} from '../utils/bodyAppearance';
import { surfaceGravitySi } from '../utils/units';
import {
  dampFactor, framingDistanceFor, arrivalEpsilonSq, FLY_TO_LAMBDA, FOLLOW_LAMBDA,
} from '../utils/cameraFly';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useReducedMotion } from './hooks/useReducedMotion';
import { useBodySelectionGesture } from './hooks/useBodySelectionGesture';
import { EnvironmentProvider, useEnvironment } from './Environment/EnvironmentContext';
import { GasClouds, GasRemnant } from './Environment/GasClouds';
import DecorativeDust from './Environment/DecorativeDust';
import RadiationEffects from './Environment/RadiationEffects';
import OrbitPaths from './OrbitPaths';
import DevPhysicsDiagnostics from './DevPhysicsDiagnostics';
import TestMetricsCollector from './TestMetricsCollector';
import { registerPhysicsBodiesRef, unregisterPhysicsBodiesRef } from '../utils/physicsBridge';
import { getE2EConfig, isE2EMode } from '../utils/e2eConfig';
import {
  incrementTestBridgeContextLost,
  setTestBridgeDeviceTier,
} from '../utils/testBridge';
import {
  cancelAllBodyPointerGestures,
  useBodyPointerGesture,
  type BodyGestureKind,
} from '../utils/bodyPointerGesture';
import { createRafScheduler, deferDoubleFrame } from '../utils/deferFrames';
import {
  RendererConfig,
  AdaptivePostFX,
  useDeviceTier,
  exposureForTier,
  gridVisualBoostForDevice,
  detectIsTouch,
} from './CanvasSetup';

/** No-op raycast — opts a mesh out of all picking without removing it. */
const NO_RAYCAST: THREE.Object3D['raycast'] = () => null;

/** Default mesh raycast — use explicitly when toggling back from NO_RAYCAST (undefined does not restore). */
const MESH_RAYCAST: THREE.Object3D['raycast'] = THREE.Mesh.prototype.raycast;

/** Hard cap on simultaneously simulated bodies. Prevents O(N²) blow-up. */
const MAX_BODIES = PHYSICS_LIMITS.MAX_BODIES;

/** Module-scope constants — reused across renders to avoid GC pressure. */
const _UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const _SHOCKWAVE_COLOR = new THREE.Color(1, 1, 1);
const _SUPERNOVA_COLOR = new THREE.Color(1, 0.8, 0.4);

/**
 * Slingshot drag — velocity gain per unit of pull-back distance.
 *
 * Rescaled by 56.2× when the engine moved to real units: a 1 AU circular orbit
 * now runs at 251 units per year instead of the old 4.47, so preserving the
 * previous drag feel means preserving the ratio of launch speed to orbital
 * speed. 0.15 × √(G₂M₂ / G₁M₁) = 8.4.
 */
const LAUNCH_VELOCITY_SCALE = 8.4;
/** Minimum pull distance before a body is spawned. */
const MIN_SLINGSHOT_DRAG = 2.0;

/** Scratch vectors for slingshot indicator — module scope avoids GC in hot paths. */
const _slingshotLaunch = new THREE.Vector3();
const _slingshotYAxis = new THREE.Vector3(0, 1, 0);
const _slingshotQuat = new THREE.Quaternion();
const _bhScaleVec = new THREE.Vector3(1, 1, 1);

/** Shared material colors — avoid per-render `new THREE.Color()` in BodyMesh. */
const _WHITE = new THREE.Color(1, 1, 1);
const _NEUTRON_COLOR = new THREE.Color(0.2, 0.5, 1.0);


// --- BASIC SHADERS (Lightweight) ---

const GravityGridMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color(0.14, 0.16, 0.22),
    uLineGain: 1.0,
    uVisualBoost: 1.0,
    uBodiesPos: new Float32Array(50 * 3),
    uBodiesMass: new Float32Array(50),
    uBodiesRadius: new Float32Array(50),
    uBodiesType: new Float32Array(50),
    uBodyCount: 0,
    uShowHabitable: 0.0,
  },
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>

uniform float uTime;
uniform vec3 uBodiesPos[50];
uniform float uBodiesMass[50];
uniform float uBodiesRadius[50];
uniform float uBodiesType[50];
uniform int uBodyCount;
uniform float uShowHabitable;

varying float vDisplacement;
varying float vTidalMagnitude;
varying float vHabitableZone;
varying float vHabitableDist;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  float displacement = 0.0;
  float maxTidal = 0.0;
  float habFactor = 0.0;
  float habDist = 0.0;

  for(int i = 0; i < 50; i++) {
    if (i >= uBodyCount) break;
    vec3 bPos = uBodiesPos[i];
    float m = uBodiesMass[i];
    float d = distance(worldPosition.xz, bPos.xz);
    float softeningSq = 1200.0;
    float potential = m / sqrt(d * d + softeningSq);
    displacement -= potential * 3.0;
    float tidal = m / (d*d*d + 100.0);
    maxTidal = max(maxTidal, tidal * 1000.0);
    if (uBodiesType[i] > 1.9 && uShowHabitable > 0.5) {
        float relLum = pow(m / 1000.0, 3.0);
        float rInner = sqrt(relLum) * 40.0;
        float rOuter = sqrt(relLum) * 80.0;
        if (d > rInner * 0.8 && d < rOuter * 1.2) {
            habDist = (d - rInner) / (rOuter - rInner);
            habFactor = max(habFactor, smoothstep(rInner * 0.8, rInner, d) * (1.0 - smoothstep(rOuter, rOuter * 1.2, d)));
        }
    }
  }
  vec3 newPos = position;
  newPos.z += displacement;
  vWorldPos = (modelMatrix * vec4(newPos, 1.0)).xyz;
  vDisplacement = displacement;
  vTidalMagnitude = maxTidal;
  vHabitableZone = habFactor;
  vHabitableDist = habDist;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(newPos, 1.0);
  #include <logdepthbuf_vertex>
}`,
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uColor;
uniform float uLineGain;
uniform float uVisualBoost;
varying float vDisplacement;
varying float vTidalMagnitude;
varying float vHabitableZone;
varying float vHabitableDist;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  float gridScale = 20.0;
  vec2 coord = vWorldPos.xz / gridScale;
  vec2 derivative = fwidth(coord);
  vec2 grid = abs(fract(coord - 0.5) - 0.5) / max(derivative, vec2(0.001));
  float line = min(grid.x, grid.y);
  float lineAlpha = 1.0 - min(line, 1.0);
  vec3 baseColor = uColor * uVisualBoost;
  vec3 tidalColor = vec3(0.0, 0.35, 0.65) * vTidalMagnitude * 0.2 * uVisualBoost;
  vec3 finalColor = baseColor + tidalColor;
  
  float habAlpha = 0.0;
  if (vHabitableZone > 0.01) {
      vec3 chzHot = vec3(0.8, 0.2, 0.0);
      vec3 chzOpt = vec3(0.1, 0.8, 0.3);
      vec3 chzCold = vec3(0.0, 0.4, 0.8);
      vec3 zoneColor = mix(chzHot, chzOpt, smoothstep(0.0, 0.4, vHabitableDist));
      zoneColor = mix(zoneColor, chzCold, smoothstep(0.6, 1.0, vHabitableDist));
      finalColor = mix(finalColor, zoneColor, vHabitableZone * 0.5);
      habAlpha = vHabitableZone * 0.15;
  }
  
  float dist = length(vWorldPos.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(1500.0, 4000.0, dist);
  float totalAlpha = max(lineAlpha * 0.4 * uLineGain * uVisualBoost, habAlpha) * fade;
  if (totalAlpha < 0.01) discard;
  gl_FragColor = vec4(finalColor, totalAlpha);
  #include <logdepthbuf_fragment>
}`
);

const ShockwaveMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color(1, 1, 1) },
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`,
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
void main() { 
  float dist = distance(vUv, vec2(0.5)); 
  float ring = smoothstep(0.4, 0.45, dist) * smoothstep(0.5, 0.45, dist); 
  float alpha = ring * max(0.0, 1.0 - uTime); 
  gl_FragColor = vec4(clamp(uColor, 0.0, 5.0), alpha); 
  #include <logdepthbuf_fragment>
}`
);

const SupernovaMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color(1, 0.8, 0.4) },
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vPos; void main() { vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
#include <logdepthbuf_vertex>
}`,
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime; uniform vec3 uColor; varying vec2 vUv; varying vec3 vPos;
float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
void main() { 
  float dist = length(vPos); 
  float core = smoothstep(0.4, 0.0, dist - uTime * 5.0); 
  float shock = smoothstep(0.0, 0.2, dist - uTime * 8.0) * smoothstep(0.4, 0.2, dist - uTime * 8.0); 
  vec3 color = mix(uColor, vec3(1.0), shock); 
  float alpha = (core + shock) * (1.0 - smoothstep(0.0, 5.0, uTime)); 
  gl_FragColor = vec4(color * 2.0, alpha);
  #include <logdepthbuf_fragment>
}`
);

extend({ GravityGridMaterial, ShockwaveMaterial, SupernovaMaterial });

const StabilityOverlay = ({ floatingOffset, bodiesRef, parentMapRef }: {
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
  bodiesRef: React.MutableRefObject<CelestialBody[]>;
  parentMapRef: React.MutableRefObject<Map<string, CelestialBody | null>>;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const hillMeshRef = useRef<THREE.Mesh>(null);
  const rocheMeshRef = useRef<THREE.Mesh>(null);
  const { selectedId } = useStore();

  useFrame(() => {
    const hillMesh = hillMeshRef.current;
    const rocheMesh = rocheMeshRef.current;
    if (!hillMesh || !rocheMesh) return;

    if (!selectedId || !bodiesRef.current) {
      hillMesh.visible = false;
      rocheMesh.visible = false;
      return;
    }

    let body: CelestialBody | undefined;
    const list = bodiesRef.current;
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === selectedId) { body = list[i]; break; }
    }
    if (!body) {
      hillMesh.visible = false;
      rocheMesh.visible = false;
      return;
    }

    const parent = parentMapRef.current.get(body.id) ?? null;
    const metrics = calculateStabilityMetrics(body, parent);

    if (groupRef.current) {
      toRenderSpace(scratchV0, body.position, floatingOffset.current);
      groupRef.current.position.copy(scratchV0);
    }

    const hill = metrics.hill;
    const roche = metrics.roche;
    hillMesh.visible = hill > 0;
    rocheMesh.visible = roche > 0;
    if (hill > 0) hillMesh.scale.setScalar(hill);
    if (roche > 0) rocheMesh.scale.setScalar(roche);
  });

  return (
    <group ref={groupRef}>
      <mesh ref={hillMeshRef} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#4ade80" transparent opacity={0.1} wireframe={true} />
      </mesh>
      <mesh ref={rocheMeshRef} visible={false}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial color="#f43f5e" transparent opacity={0.15} wireframe={true} />
      </mesh>
    </group>
  );
};

type OrbitControlsLike = { target: THREE.Vector3; update: () => void; enabled: boolean };

function isOrbitControlsLike(controls: unknown): controls is OrbitControlsLike {
  if (controls == null || typeof controls !== 'object') return false;
  const c = controls as OrbitControlsLike;
  return c.target instanceof THREE.Vector3 && typeof c.update === 'function' && typeof c.enabled === 'boolean';
}

/** Reset floating origin and snap the orbit camera to a body (spawn-style framing). */
const snapCameraToBody = (
  camera: THREE.Camera,
  controls: OrbitControlsLike,
  target: CelestialBody,
  floatingOffset: THREE.Vector3,
  bodyObjectsRef: React.MutableRefObject<Map<string, THREE.Object3D>>,
) => {
  floatingOffset.set(0, 0, 0);
  bodyObjectsRef.current.clear();

  toRenderSpace(scratchV1, target.position, floatingOffset);
  const dist = framingDistanceFor(target.radius);
  controls.target.set(scratchV1.x, scratchV1.y, scratchV1.z);
  camera.position.set(
    scratchV1.x + dist * 0.22,
    scratchV1.y + dist * 0.42,
    scratchV1.z + dist * 0.88,
  );
  controls.update();
};

/**
 * Eases the camera onto a newly selected body.
 *
 * Selection previously did nothing to the camera — you had to hunt for the
 * body you had just picked in the outliner. This watches `selectedId` so every
 * route into a selection (canvas tap, outliner row, anything future) gets the
 * same motion.
 *
 * The tween is exponential damping keyed on the frame delta, so it feels
 * identical at 60 and 120 fps. It yields immediately to any user input: an
 * OrbitControls drag, a creation drag, or a panel interaction cancels it.
 * Under `prefers-reduced-motion` it does not tween at all — it uses the same
 * instant snap the recenter path has always used.
 */
const CameraFlyTo = ({
  floatingOffset,
  bodyObjectsRef,
}: {
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
  bodyObjectsRef: React.MutableRefObject<Map<string, THREE.Object3D>>;
}) => {
  const selectedId = useStore((s) => s.selectedId);
  const recenterNonce = useStore((s) => s.cameraRecenterNonce);
  const reducedMotion = useReducedMotion();
  const { camera, controls } = useThree();

  const flying = useRef<{ id: string; distance: number } | null>(null);
  const lastRecenter = useRef(recenterNonce);

  useEffect(() => {
    if (!selectedId) { flying.current = null; return; }

    // A recenter is its own framing decision; don't fight it with a fly-to.
    if (recenterNonce !== lastRecenter.current) {
      lastRecenter.current = recenterNonce;
      flying.current = null;
      return;
    }

    const body = useStore.getState().bodies.find((b) => b.id === selectedId);
    if (!body || !isOrbitControlsLike(controls)) return;

    if (reducedMotion) {
      snapCameraToBody(camera, controls, body, floatingOffset.current, bodyObjectsRef);
      return;
    }
    flying.current = { id: selectedId, distance: framingDistanceFor(body.radius) };
  }, [selectedId, recenterNonce, reducedMotion, controls, camera, floatingOffset, bodyObjectsRef]);

  // Any deliberate camera input wins over the tween.
  useEffect(() => {
    if (!isOrbitControlsLike(controls)) return;
    const target = controls as unknown as { addEventListener?: Function; removeEventListener?: Function };
    if (typeof target.addEventListener !== 'function') return;
    const cancel = () => { flying.current = null; };
    target.addEventListener('start', cancel);
    return () => target.removeEventListener?.('start', cancel);
  }, [controls]);

  useFrame((_, dt) => {
    const fly = flying.current;
    if (!fly || !isOrbitControlsLike(controls)) return;
    if (useStore.getState().isInteractingWithUI) return;

    const body = useStore.getState().bodies.find((b) => b.id === fly.id);
    if (!body) { flying.current = null; return; }

    toRenderSpace(scratchV1, body.position, floatingOffset.current);
    if (scratchV1.x !== scratchV1.x) return; // NaN guard

    scratchV3.set(
      scratchV1.x + fly.distance * 0.22,
      scratchV1.y + fly.distance * 0.42,
      scratchV1.z + fly.distance * 0.88,
    );

    const k = dampFactor(FLY_TO_LAMBDA, dt);
    controls.target.lerp(scratchV1, k);
    camera.position.lerp(scratchV3, k);
    controls.update();

    if (camera.position.distanceToSquared(scratchV3) < arrivalEpsilonSq(fly.distance)) {
      controls.target.copy(scratchV1);
      camera.position.copy(scratchV3);
      controls.update();
      flying.current = null;
    }
  });

  return null;
};

/** Snap orbit camera to the primary star after generate / new universe only. */
const CameraRecenter = ({
  floatingOffset,
  bodyObjectsRef,
}: {
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
  bodyObjectsRef: React.MutableRefObject<Map<string, THREE.Object3D>>;
}) => {
  const cameraRecenterNonce = useStore((s) => s.cameraRecenterNonce);
  const { camera, controls } = useThree();

  useEffect(() => {
    if (cameraRecenterNonce === 0) return;

    const raf = createRafScheduler();
    let attempts = 0;
    const maxAttempts = 12;

    const trySnap = () => {
      if (raf.isCancelled()) return;
      attempts += 1;

      if (!isOrbitControlsLike(controls)) {
        if (attempts < maxAttempts) raf.schedule(trySnap);
        return;
      }

      const { bodies, selectedId } = useStore.getState();
      const target = findPrimaryStar(bodies, selectedId);
      if (!target?.position) {
        if (attempts < maxAttempts) raf.schedule(trySnap);
        return;
      }

      snapCameraToBody(
        camera,
        controls,
        target,
        floatingOffset.current,
        bodyObjectsRef,
      );
    };

    const cancelDefer = deferDoubleFrame(trySnap);

    return () => {
      raf.cancel();
      cancelDefer();
    };
  }, [cameraRecenterNonce, controls, camera, floatingOffset, bodyObjectsRef]);

  return null;
};

type VisualEffect = { id: number; type: string; pos: THREE.Vector3; startTime: number };

/** Animates collision/supernova FX via useFrame — no React re-renders per tick. */
const VisualEffectItem = ({
  effect,
  floatingOffset,
}: {
  effect: VisualEffect;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.ShaderMaterial & { uTime: number; uColor: THREE.Color }>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime - effect.startTime;
    if (matRef.current) matRef.current.uTime = t;
    if (groupRef.current) {
      toRenderSpace(scratchV2, effect.pos, floatingOffset.current);
      groupRef.current.position.set(scratchV2.x, scratchV2.y, scratchV2.z);
    }
  });

  if (effect.type === 'shockwave') {
    return (
      <group ref={groupRef}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1, 20, 64]} />
          <shockwaveMaterial
            ref={matRef}
            transparent
            uColor={_SHOCKWAVE_COLOR}
            uTime={0}
            logarithmicDepthBuffer={true}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[20, 32, 32]} />
        <supernovaMaterial
          ref={matRef}
          transparent
          uColor={_SUPERNOVA_COLOR}
          uTime={0}
          logarithmicDepthBuffer={true}
        />
      </mesh>
    </group>
  );
};

const PhysicsEngine = ({
  bodiesRef,
  floatingOffset,
  bodyObjectsRef,
  parentMapRef,
  bodyByIdRef,
  primaryStarIdRef,
  deviceTier,
  gridVisualBoost,
  creationDragActiveRef,
  gasRemnants,
}: {
  bodiesRef: React.MutableRefObject<CelestialBody[]>;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
  bodyObjectsRef: React.MutableRefObject<Map<string, THREE.Object3D>>;
  parentMapRef: React.MutableRefObject<Map<string, CelestialBody | null>>;
  bodyByIdRef: React.MutableRefObject<Map<string, CelestialBody>>;
  primaryStarIdRef: React.MutableRefObject<string | null>;
  deviceTier: import('./CanvasSetup').DeviceTier;
  gridVisualBoost: number;
  creationDragActiveRef: React.MutableRefObject<boolean>;
  gasRemnants: React.MutableRefObject<GasRemnant[]>;
}) => {
  const gridMatRef = useRef<any>(null);
  const gridMeshRef = useRef<THREE.Mesh>(null);
  const visualEffectsRef = useRef<VisualEffect[]>([]);
  const [effectsVersion, setEffectsVersion] = useState(0);
  const lastStoreSyncRef = useRef(0);
  const lastTempUpdateRef = useRef(0);
  const lastParentMapUpdateRef = useRef(0);
  const lastBodyCountRef = useRef(0);
  const { camera, controls } = useThree();
  const shaderData = useMemo(() => ({ positions: new Float32Array(50 * 3), masses: new Float32Array(50), radii: new Float32Array(50), types: new Float32Array(50) }), []);

  const { syncBodiesFromPhysics, paused, speed, selectBody, cameraLockedId, showGrid, showHabitable } = useStore();

  useFrame((state, delta) => {
    // Floating-origin recentre shifts render space; freeze it during slingshot drags
    // so spawn position, mesh, grid, and launch velocity stay aligned.
    if (!creationDragActiveRef.current && camera.position.length() > 50000) {
      scratchV0.copy(camera.position);
      floatingOffset.current.add(scratchV0);
      camera.position.sub(scratchV0);
      if (isOrbitControlsLike(controls)) {
        controls.target.sub(scratchV0);
      }
    }
    const currentTime = state.clock.getElapsedTime();
    // Effective elapsed simulated time this frame, scaled by user speed.
    // Sign of `speed` lets the user run physics in reverse for short bursts.
    const simElapsed = Math.min(delta, 0.1) * speed;

    let effectsChanged = false;
    for (let i = visualEffectsRef.current.length - 1; i >= 0; i--) {
      if (currentTime - visualEffectsRef.current[i].startTime >= 5.0) {
        visualEffectsRef.current.splice(i, 1);
        effectsChanged = true;
      }
    }

    let collisionOccurred = false;
    const newEvents: PhysicsEvent[] = [];

    if (!paused && Math.abs(speed) > 0.01 && bodiesRef.current && bodiesRef.current.length > 0) {
      // Fixed-timestep Velocity-Verlet — deterministic regardless of frame rate.
      // Collision + evolution checks run at each fixed step so contact events
      // are not missed when the user runs at high speed multipliers.
      runFixedSteps(bodiesRef, simElapsed, (bodies) => {
        const colResult = checkCollisions(bodies, currentTime);
        if (colResult.events.length > 0) newEvents.push(...colResult.events);
        if (colResult.merged) {
          collisionOccurred = true;
          return colResult.active;
        }
        return bodies;
      });

      if (bodiesRef.current && bodiesRef.current.length > 0) {
        const { bodies: evolvedBodies, events: evoEvents } = checkEvolution(bodiesRef.current);
        if (evoEvents.length > 0) newEvents.push(...evoEvents);
        bodiesRef.current = evolvedBodies;

        newEvents.forEach(e => {
          if (e.type === 'supernova') {
            gasRemnants.current.unshift({ position: e.position.clone(), age: 0 });
            gasRemnants.current.length = Math.min(gasRemnants.current.length, 2);
          }
          if (e.type === 'evolution' || e.type === 'collision' || e.type === 'supernova') {
            visualEffectsRef.current.push({
              id: Math.random(),
              type: e.type === 'collision' ? 'shockwave' : 'supernova',
              pos: e.position.clone(),
              startTime: currentTime
            });
            effectsChanged = true;
          }
        });

        // Refresh equilibrium temperatures at ~2 Hz — cheap O(N · S) and
        // avoids per-step jitter from changing distances.
        if (currentTime - (lastTempUpdateRef.current ?? 0) > 0.5) {
          updateEquilibriumTemperatures(bodiesRef.current);
          lastTempUpdateRef.current = currentTime;
        }

        // Sync physics state back into the Zustand store at a *throttled*
        // cadence. Position/velocity does NOT need to round-trip through
        // React every frame — body meshes read directly from bodiesRef.
        // We only push when (a) a structural event happened (collision /
        // evolution) or (b) enough time has elapsed for inspector/orbit
        // panels to refresh their derived analytics.
        const shouldSync =
          collisionOccurred ||
          newEvents.length > 0 ||
          currentTime - (lastStoreSyncRef.current ?? 0) > 1.5;
        if (shouldSync) {
          syncBodiesFromPhysics(evolvedBodies);
          lastStoreSyncRef.current = currentTime;
          if (collisionOccurred) {
            selectBody(null);
            useStore.getState().closeInspector();
          }
        }
      }
    }

    // One O(N²) parent pass + id lookup map for the whole frame (BodyMesh, overlays).
    const physicsBodies = bodiesRef.current;
    const bodyCount = physicsBodies?.length ?? 0;
    const bodyCountChanged = bodyCount !== lastBodyCountRef.current;
    if (bodyCountChanged) lastBodyCountRef.current = bodyCount;

    if (physicsBodies && physicsBodies.length > 0 && (bodyCountChanged || bodyByIdRef.current.size === 0 || currentTime - lastParentMapUpdateRef.current > 0.12 || collisionOccurred || newEvents.length > 0)) {
      fillParentMap(physicsBodies, parentMapRef.current);
      const byId = bodyByIdRef.current;
      byId.clear();
      let primaryStarId: string | null = null;
      for (let i = 0; i < physicsBodies.length; i++) {
        const b = physicsBodies[i];
        byId.set(b.id, b);
        if (!primaryStarId && (b.type === 'Star' || b.type === 'Red Giant')) {
          primaryStarId = b.id;
        }
      }
      primaryStarIdRef.current = primaryStarId;
      lastParentMapUpdateRef.current = currentTime;

      // A moon whose parent has merged away, or which has been pushed outside
      // its parent's Hill sphere, stops being a two-body problem and rejoins
      // the N-body integrator.
      const released = promoteEscapedMoons(physicsBodies, byId, parentMapRef.current);
      if (released.length > 0) resetVerletCache();
    } else {
      if (!physicsBodies || physicsBodies.length === 0) {
        parentMapRef.current.clear();
        bodyByIdRef.current.clear();
        primaryStarIdRef.current = null;
      }
    }

    // Place Kepler-propagated satellites at their parent's live position plus
    // an analytic offset. O(1) per moon, allocation-free, and independent of
    // the physics timestep. Runs even while paused so moons stay put.
    if (physicsBodies && physicsBodies.length > 0) {
      propagateSatellites(physicsBodies, bodyByIdRef.current, getSimTime());
    }

    // Update only registered body meshes instead of traversing the full scene graph every frame.
    if (physicsBodies) {
      for (let i = 0; i < physicsBodies.length; i++) {
        const body = physicsBodies[i];
        const obj = bodyObjectsRef.current.get(body.id);
        if (obj && body.position) {
          // A satellite's *true* separation from its parent is far smaller than
          // the parent's exaggerated drawn radius, so it is drawn through the
          // same exaggeration to keep the real orbit-to-radius ratio visible.
          const parent = body.parentId ? bodyByIdRef.current.get(body.parentId) : undefined;
          if (parent && body.orbit) {
            satelliteRenderPosition(body, parent, scratchV1);
            toRenderSpace(scratchV0, scratchV1, floatingOffset.current);
          } else {
            toRenderSpace(scratchV0, body.position, floatingOffset.current);
          }
          obj.position.copy(scratchV0);
        }
      }
    }

    if (effectsChanged) {
      setEffectsVersion((v) => v + 1);
    }

    if (cameraLockedId && !creationDragActiveRef.current && physicsBodies && isOrbitControlsLike(controls)) {
      const target = bodyByIdRef.current.get(cameraLockedId);
      if (target) {
        toRenderSpace(scratchV1, target.position, floatingOffset.current);
        scratchV2.copy(camera.position).sub(controls.target);
        if (scratchV1.x === scratchV1.x) {
          // Exponential damping keyed on the frame delta. The old fixed 0.1
          // alpha converged twice as fast on a 120 Hz display as on a 60 Hz one.
          const k = dampFactor(FOLLOW_LAMBDA, delta);
          controls.target.lerp(scratchV1, k);
          scratchV3.copy(controls.target).add(scratchV2);
          camera.position.lerp(scratchV3, k);
          controls.update();
        }
      }
    }

    if (gridMeshRef.current) {
      gridMeshRef.current.position.set(camera.position.x, -20, camera.position.z);
    }

    if (showGrid && gridMatRef.current && physicsBodies) {
      let count = 0;
      const gridLimit = Math.min(50, physicsBodies.length);
      for (let i = 0; i < gridLimit; i++) {
        const b = physicsBodies[i];
        toRenderSpace(scratchV0, b.position, floatingOffset.current);
        const i3 = i * 3;
        shaderData.positions[i3] = scratchV0.x;
        shaderData.positions[i3 + 1] = scratchV0.y;
        shaderData.positions[i3 + 2] = scratchV0.z;
        shaderData.masses[i] = b.mass;
        shaderData.radii[i] = b.radius;
        shaderData.types[i] = b.type === 'Black Hole' ? 1.0 : (LUMINOUS_TYPES.includes(b.type) ? 2.0 : 0.0);
        count++;
      }
      gridMatRef.current.uBodiesPos = shaderData.positions;
      gridMatRef.current.uBodiesMass = shaderData.masses;
      gridMatRef.current.uBodiesRadius = shaderData.radii;
      gridMatRef.current.uBodiesType = shaderData.types;
      gridMatRef.current.uBodyCount = count;
      gridMatRef.current.uTime = currentTime;
      gridMatRef.current.uShowHabitable = showHabitable ? 1.0 : 0.0;
    }
  });

  return (
    <>
      {/* Low-tier devices get a 150×150 grid (22 k verts vs 160 k) — same visual
          result at any zoom level since the gravity wells are screen-space smooth. */}
      {showGrid && (
        <mesh ref={gridMeshRef} raycast={NO_RAYCAST} rotation={[-Math.PI / 2, 0, 0]} position={[0, -20, 0]}>
          <planeGeometry args={[5000, 5000, deviceTier === 'low' ? 150 : 400, deviceTier === 'low' ? 150 : 400]} />
          <gravityGridMaterial
            ref={gridMatRef}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            logarithmicDepthBuffer={true}
            uLineGain={(deviceTier === 'low' ? 2.4 : 1.0) * Math.sqrt(gridVisualBoost)}
            uVisualBoost={gridVisualBoost}
          />
        </mesh>
      )}
      <group key={effectsVersion}>
      {visualEffectsRef.current.map((effect) => (
        <VisualEffectItem
          key={effect.id}
          effect={effect}
          floatingOffset={floatingOffset}
        />
      ))}
      </group>
    </>
  );
};

/** Mutable drag state read every frame by SlingshotIndicator (no React re-render per move). */
type SlingshotDragState = {
  active: boolean;
  originRender: THREE.Vector3;
  pointerRender: THREE.Vector3;
};

/** Real-time catapult arrow — updated in useFrame so rotation/length track the cursor. */
const SlingshotIndicator = ({
  dragRef,
}: {
  dragRef: React.MutableRefObject<SlingshotDragState>;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const shaftRef = useRef<THREE.Mesh>(null);
  const headRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const group = groupRef.current;
    const shaft = shaftRef.current;
    const head = headRef.current;
    if (!group || !shaft || !head) return;

    const drag = dragRef.current;
    if (!drag.active) {
      group.visible = false;
      return;
    }

    // LaunchVector = origin - pointer (catapult: opposite of drag direction)
    _slingshotLaunch.subVectors(drag.originRender, drag.pointerRender);
    const length = _slingshotLaunch.length();
    if (length < 0.1) {
      group.visible = false;
      return;
    }

    group.visible = true;
    group.position.copy(drag.originRender);
    _slingshotLaunch.multiplyScalar(1 / length);
    _slingshotQuat.setFromUnitVectors(_slingshotYAxis, _slingshotLaunch);
    group.quaternion.copy(_slingshotQuat);

    shaft.scale.set(1, length, 1);
    shaft.position.set(0, length * 0.5, 0);
    head.position.set(0, length, 0);
  });

  return (
    <group ref={groupRef} visible={false}>
      <mesh ref={shaftRef}>
        <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
        <meshBasicMaterial color="#00ffff" opacity={0.6} transparent depthTest={false} />
      </mesh>
      <mesh ref={headRef}>
        <coneGeometry args={[1.5, 3.0, 12]} />
        <meshBasicMaterial color="#00ffff" opacity={0.8} transparent depthTest={false} />
      </mesh>
    </group>
  );
};

const ObjectCreator: React.FC<{
  creationMode: BodyType | null;
  setCreationMode: (mode: BodyType | null) => void;
  onBodyCreate: (snapshot: CelestialBody[]) => void;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
  onDragActiveChange: (active: boolean) => void;
}> = ({
  creationMode,
  setCreationMode,
  onBodyCreate,
  floatingOffset,
  onDragActiveChange,
}) => {
  const appendBody = useStore((s) => s.appendBody);
  const { gl, controls } = useThree();
  const rayHit = useRef(new THREE.Vector3());
  const originWorld = useRef(new THREE.Vector3());
  const isDraggingRef = useRef(false);
  const dragRef = useRef<SlingshotDragState>({
    active: false,
    originRender: new THREE.Vector3(),
    pointerRender: new THREE.Vector3(),
  });

  const readPointerOnPlane = (e: ThreeEvent<PointerEvent>) => {
    rayHit.current.set(e.point.x, 0, e.point.z);
    return rayHit.current;
  };

  const setOrbitControlsEnabled = (enabled: boolean) => {
    if (isOrbitControlsLike(controls)) {
      controls.enabled = enabled;
    }
  };

  const endDrag = () => {
    isDraggingRef.current = false;
    dragRef.current.active = false;
    onDragActiveChange(false);
    setOrbitControlsEnabled(true);
  };

  const releasePointerCapture = (e: ThreeEvent<PointerEvent>) => {
    if (gl.domElement.hasPointerCapture(e.pointerId)) {
      gl.domElement.releasePointerCapture(e.pointerId);
    }
  };

  useEffect(() => {
    return () => {
      if (isDraggingRef.current) {
        endDrag();
      }
    };
  }, []);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!creationMode) return;
    cancelAllBodyPointerGestures();
    event.stopPropagation();
    gl.domElement.setPointerCapture(event.pointerId);

    setOrbitControlsEnabled(false);
    isDraggingRef.current = true;
    onDragActiveChange(true);

    const hit = readPointerOnPlane(event);
    dragRef.current.originRender.copy(hit);
    dragRef.current.pointerRender.copy(hit);
    dragRef.current.active = true;
    originWorld.current.copy(hit).add(floatingOffset.current);
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!creationMode || !isDraggingRef.current) return;
    event.stopPropagation();
    dragRef.current.pointerRender.copy(readPointerOnPlane(event));
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!creationMode || !isDraggingRef.current) return;
    event.stopPropagation();
    releasePointerCapture(event);

    const originRender = dragRef.current.originRender;
    const releaseRender = readPointerOnPlane(event);

    if (originRender.distanceTo(releaseRender) <= MIN_SLINGSHOT_DRAG) {
      endDrag();
      return;
    }

    if (useStore.getState().bodies.length >= MAX_BODIES) {
      endDrag();
      setCreationMode(null);
      return;
    }

    const config = BODY_CONFIGS[creationMode] ?? BODY_CONFIGS.Planet;
    const getNextNumber = useStore.getState().getNextNumber;
    const number = getNextNumber(creationMode);

    // Spawn at pointerdown origin only — never offset by the drag vector.
    const spawnPosition = originWorld.current.clone();
    // LaunchVector = origin - release; passed strictly as initial velocity.
    const launchVelocity = clampLaunchVelocity(
      new THREE.Vector3()
        .subVectors(originRender, releaseRender)
        .multiplyScalar(LAUNCH_VELOCITY_SCALE),
    );

    const snapshot = useStore.getState().bodies.map((b) => ({
      ...b,
      position: b.position.clone(),
      velocity: b.velocity.clone(),
    }));

    // Log-uniform draw within the type's mass range: the ranges now span many
    // orders of magnitude, so a linear draw would always land near the top.
    const [massLo, massHi] = config.massRange;
    const mass = Math.exp(
      Math.log(massLo) + Math.random() * (Math.log(massHi) - Math.log(massLo)),
    );

    const newBody = sanitizeCelestialBody({
      id: `created-${creationMode}-${Date.now()}`,
      type: creationMode,
      position: spawnPosition,
      velocity: launchVelocity,
      mass,
      // Both radii are derived from mass and type immediately below.
      radius: 1,
      radiusKm: 1,
      color: config.defaultColor,
      temperature: 300,
      habitability: 'N/A',
      population: 0,
      name: `${creationMode} ${number}`,
      texture: config.visualType === 'rocky' ? 'rock'
        : config.visualType === 'gaseous' ? 'gas'
        : config.visualType === 'neutron' ? 'neutron' : 'solid',
      trailColor: config.defaultColor,
      properties: {
        rotationPeriod: 24.0,
        isTidallyLocked: false,
        compositionIron: 0.3,
        compositionSilicates: 0.6,
        compositionWater: 0.1,
      },
    });
    reconcileBodyDerivedState(newBody);

    appendBody(newBody);
    resetVerletCache();
    resetAccumulator();

    onBodyCreate(snapshot);
    cancelAllBodyPointerGestures();
    setCreationMode(null);
    endDrag();
  };

  const handlePointerCancel = (event: ThreeEvent<PointerEvent>) => {
    if (!creationMode || !isDraggingRef.current) return;
    event.stopPropagation();
    releasePointerCapture(event);
    endDrag();
  };

  return (
    <group>
      {creationMode && <SlingshotIndicator dragRef={dragRef} />}
      <mesh
        position={[0, -21, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={creationMode ? MESH_RAYCAST : NO_RAYCAST}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        visible={!!creationMode}
      >
        <planeGeometry args={[500000, 500000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
};

// drei's shaderMaterial() exposes uniforms as direct JS properties but TypeScript
// only sees THREE.ShaderMaterial. Declaring the intersection here once removes
// ~15 "Property does not exist" errors throughout this file.
type PlanetSurfaceMat = THREE.ShaderMaterial & {
  uColor1: THREE.Color;
  uColor2: THREE.Color;
  uType: number;
  uTectonics: number;
  uAtmosphere: number;
  uWaterLevel: number;
  uMethane: number;
  uCloudDepth: number;
  uTemperature: number;
  uRadius: number;
  uOblateness: number;
  uMass: number;
  uState: number;
  uEmissiveStrength: number;
  uNorthPole: THREE.Vector3;
  uTime: number;
  uSunDirection: THREE.Vector3;
  uViewVector: THREE.Vector3;
  uPlanetCenter: THREE.Vector3;
  uDensity: number;
  uHaze: number;
  uScaleHeight: number;
  uBoundingRadius: number;
  uPlanetRadius: number;
  uCompIron: number;
  uCompSilicate: number;
  uCompWater: number;
  uSeed: number;
  uQuality: number;
  uCloudCover: number;
  uNightLights: number;
  uRingShadow: number;
  uRingInner: number;
  uRingOuter: number;
  logarithmicDepthBuffer: boolean;
};

function emissiveStrengthForBody(bodyType: string, textureKey: string, temperature: number): number {
  if (['Star', 'Red Giant'].includes(bodyType)) return 1.2;
  if (textureKey === 'lava' || textureKey === 'plasma') return 0.85;
  if (bodyType === 'Ice Giant' || textureKey === 'ice') return 0.05;
  if (temperature > 1200) return 0.22;
  if (temperature > 700) return 0.12;
  return 0.08;
}

/** Caps atmosphere shader inputs so dense generated worlds do not bloom into white orbs. */
function atmosphereVisualParams(rawDensity: number, rawHaze: number, rawScaleHeight: number) {
  return {
    density: Math.min(Math.max(rawDensity, 0), 0.42),
    haze: Math.min(Math.max(rawHaze, 0), 0.28),
    scaleHeight: Math.min(Math.max(rawScaleHeight, 0.12) * 8, 4.5),
  };
}

function applyPlanetSurfaceUniforms(
  mat: PlanetSurfaceMat,
  {
    color,
    textureKey,
    bodyType,
    tectonics,
    atmosphereDensity,
    waterLevel,
    methane,
    cloudDepth,
    temperature,
    visualRadius,
    oblateness,
    mass,
    planetState,
    northPole,
    composition,
    seed,
    quality,
    cloudCover,
    nightLights,
    ring,
  }: {
    color: string;
    textureKey: string;
    bodyType: string;
    tectonics: number;
    atmosphereDensity: number;
    waterLevel: number;
    methane: number;
    cloudDepth: number;
    temperature: number;
    visualRadius: number;
    oblateness: number;
    mass: number;
    planetState: number;
    northPole: THREE.Vector3;
    composition: { iron: number; silicates: number; water: number };
    seed: number;
    quality: number;
    cloudCover: number;
    nightLights: number;
    ring: RingVisual | null;
  }
) {
  mat.uColor1.set(color);
  mat.uColor2.set(color).multiplyScalar(0.5);
  mat.uType = TEXTURE_IDS[textureKey] || 0;
  mat.uCompIron = composition.iron;
  mat.uCompSilicate = composition.silicates;
  mat.uCompWater = composition.water;
  mat.uSeed = seed;
  mat.uQuality = quality;
  mat.uCloudCover = cloudCover;
  mat.uNightLights = nightLights;
  // Rings shadow the planet they orbit; the shader ray-casts against the ring
  // plane using these edges, so a body without rings costs one compare.
  mat.uRingShadow = ring ? Math.min(ring.opacity * 0.85, 0.8) : 0;
  mat.uRingInner = ring ? ring.inner : 1.4;
  mat.uRingOuter = ring ? ring.outer : 2.3;
  mat.uTectonics = tectonics;
  mat.uAtmosphere = atmosphereDensity;
  mat.uWaterLevel = waterLevel;
  mat.uMethane = methane;
  mat.uCloudDepth = cloudDepth;
  mat.uTemperature = temperature;
  mat.uRadius = visualRadius;
  mat.uOblateness = oblateness;
  mat.uMass = mass;
  mat.uState = planetState;
  mat.uEmissiveStrength = emissiveStrengthForBody(bodyType, textureKey, temperature);
  mat.uNorthPole.copy(northPole);
}

function disposeObject3DResources(root: THREE.Object3D | null) {
  if (!root) return;
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) {
      for (let i = 0; i < mat.length; i++) mat[i]?.dispose();
    } else {
      mat?.dispose();
    }
  });
}

const BlackHoleBody = ({
  visualRadius,
  eventHorizonScale,
  spin,
  accretion,
  mass,
}: {
  visualRadius: number;
  eventHorizonScale: number;
  spin: number;
  accretion: number;
  mass: number;
}) => {
  const lensTexture = useBlackHoleLensTexture();
  return (
    <BlackHoleRig
      radius={visualRadius * eventHorizonScale}
      spin={spin}
      accretion={accretion}
      mass={mass}
      lensTexture={lensTexture}
      interactive={false}
      onSelect={() => {}}
    />
  );
};

const BodyMesh = ({
  data,
  onBodyGesture,
  creationMode,
  floatingOffset,
  isSelected,
  bodiesRef,
  parentMapRef,
  bodyByIdRef,
  primaryStarIdRef,
  registerBodyObject,
  deviceTier,
}: {
  data: CelestialBody;
  onBodyGesture: (id: string, kind: BodyGestureKind) => void;
  creationMode: BodyType | null;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
  isSelected: boolean;
  bodiesRef: React.MutableRefObject<CelestialBody[]>;
  parentMapRef: React.MutableRefObject<Map<string, CelestialBody | null>>;
  bodyByIdRef: React.MutableRefObject<Map<string, CelestialBody>>;
  primaryStarIdRef: React.MutableRefObject<string | null>;
  registerBodyObject: (bodyId: string, obj: THREE.Object3D | null) => void;
  deviceTier: DeviceTier;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const environment = useEnvironment();
  const haloRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const localScratch = useRef({
    relPos: new THREE.Vector3(),
    sunDir: new THREE.Vector3(),
    planetCenter: new THREE.Vector3(),
    defaultSun: new THREE.Vector3(1, 0.5, 0.5).normalize(),
  }).current;

  const isPlanet = ['Planet', 'Dwarf', 'Ice Giant', 'Gas Giant', 'Moon', 'Asteroid', 'Comet'].includes(data.type);
  const isStar = ['Star', 'Red Giant', 'White Dwarf', 'Brown Dwarf'].includes(data.type);
  const isBlackHole = data.type === 'Black Hole';
  const isNeutronStar = data.type === 'Neutron Star' || data.type === 'Pulsar';

  const props = data.properties || {};

  let visualRadius = data.radius;
  let eventHorizonScale = 1.0;

  if (isPlanet) visualRadius = data.radius * 1.35;
  if (isNeutronStar) visualRadius = Math.max(data.radius * 5.0, 3.0);

  if (isBlackHole) {
    // Ratio of the Kerr outer horizon to the Schwarzschild radius,
    // r+/R_s = (1 + sqrt(1 - a*^2)) / 2. A maximally spinning hole has a
    // horizon half the size of a static one of the same mass.
    const spin = props.spinParameter || 0;
    eventHorizonScale = (1.0 + Math.sqrt(Math.max(0, 1.0 - spin * spin))) * 0.5;
  }

  /**
   * Rotational flattening f = (a - b)/a.
   *
   * To first order in the rotation parameter q = omega^2 R^3 / GM, a
   * uniform-density body flattens by f = (5/4)q (the Maclaurin spheroid
   * limit). This is now computed in SI from the body's real rotation period,
   * real radius and real mass, rather than from game units with a hardcoded
   * G = 0.8 and a tuning factor of 0.05.
   *
   * Centrally condensed bodies flatten less than the uniform-density limit
   * (Jupiter's measured f is 0.065 against 0.111 from this formula), so a
   * measured value in `properties.oblateness` always wins — the Solar System
   * preset supplies real ones for the giants.
   */
  let oblateness = props.oblateness ?? 0.0;
  if (props.oblateness === undefined && (isPlanet || isStar)) {
    const periodS = Math.max(0.05, props.rotationPeriod || 24.0) * 3600;
    const omega = (2 * Math.PI) / periodS;
    const rM = data.radiusKm * 1000;
    const gm = 6.6743e-11 * data.mass * 5.9722e24;
    if (gm > 0 && rM > 0) {
      const q = (omega * omega * rM * rM * rM) / gm;
      oblateness = Math.min((5.0 / 4.0) * q, 0.5);
    }
  }

  // Black Hole scaling handled via transform, others via vertex shader.
  // Use the module-scope constant for the default case to avoid per-render allocs.
  const scale = isBlackHole
    ? _bhScaleVec.set(eventHorizonScale, eventHorizonScale, eventHorizonScale)
    : _UNIT_SCALE;

  const surfaceSeg = deviceTier === 'low' ? 28 : 48;
  const atmosSeg = deviceTier === 'low' ? 24 : 40;
  const haloSeg = deviceTier === 'low' ? 20 : 32;
  const hitboxSeg = deviceTier === 'low' ? 12 : 16;

  const starColor = useMemo(() => new THREE.Color(data.color), [data.id, data.color]);
  const haloColor = useMemo(() => new THREE.Color(data.color), [data.id, data.color]);

  const atmosRadius = visualRadius * 1.35;
  const atmosphereDensity = props.atmosphere ?? 0;
  const atmosphereVisual = useMemo(
    () => atmosphereVisualParams(atmosphereDensity, props.haze ?? 0.15, props.scaleHeight ?? 0.2),
    [atmosphereDensity, props.haze, props.scaleHeight],
  );
  // Lowered from 0.04: even a trace atmosphere should give a limb glow, which
  // is most of what sells the silhouette of a small world.
  const showAtmosphere = isPlanet && atmosphereVisual.density > 0.012;

  // --- Physics primaries -> shader inputs -----------------------------------
  const composition = useMemo(() => compositionOf(data), [
    props.compositionIron,
    props.compositionSilicates,
    props.compositionWater,
    data,
  ]);
  const seed = useMemo(() => bodySeed(data.id), [data.id]);
  const shaderQuality = deviceTier === 'low' ? 0 : 1;

  /**
   * Surface water coverage. Falls back to zero rather than 0.5 when the body
   * has no authored hydrosphere and no bulk water — otherwise Mercury and Venus
   * inherit half an ocean from the old default.
   */
  const waterLevel = props.waterLevel ?? (composition.water > 0.01 ? 0.5 : 0);
  const volatiles = useMemo(
    () => surfaceVolatilesFor(waterLevel, composition.water),
    [waterLevel, composition.water],
  );
  const cloudCover = useMemo(
    () => (isPlanet ? cloudCoverFor(atmosphereDensity, volatiles, data.temperature) : 0),
    [isPlanet, atmosphereDensity, volatiles, data.temperature],
  );
  const nightLights = useMemo(
    () => nightLightsFor(data.population, data.habitability),
    [data.population, data.habitability],
  );
  const ring = useMemo(() => ringVisualFor(data), [
    props.ringOpacity,
    props.ringInnerRadius,
    props.ringOuterRadius,
    props.bulkDensity,
    data,
  ]);

  // The cloud shell is a second transparent pass per planet, so it is high-tier
  // only; the surface shader draws a flat cloud bed on low instead.
  const showClouds = isPlanet && shaderQuality === 1 && cloudCover > 0.05;

  const isGiant = data.type === 'Gas Giant' || data.type === 'Ice Giant';

  const atmosColor = useMemo(() => {
    // A giant has no surface under its atmosphere — the limb glow is the same
    // cloud deck seen edge-on, so it takes the body's own colour rather than a
    // terrestrial N2/CO2/CH4 sky.
    if (isGiant) return new THREE.Color(data.color).lerp(_WHITE, 0.25);
    const [r, g, b] = atmosphereTint(composition.water, data.temperature);
    return new THREE.Color(r, g, b);
  }, [isGiant, data.color, composition.water, data.temperature]);

  const ringColorInner = useMemo(
    () => new THREE.Color().setRGB(
      0.62 + composition.iron * 0.22,
      0.60 + composition.water * 0.18,
      0.52 + composition.water * 0.30,
    ),
    [composition.iron, composition.water],
  );
  const ringColorOuter = useMemo(
    () => ringColorInner.clone().multiplyScalar(0.78),
    [ringColorInner],
  );

  /**
   * Obliquity of the spin axis, degrees. `properties.obliquity` is the real
   * field the presets populate; `axialTilt` is the legacy ice-giant slider,
   * kept as a fallback for worlds saved before the two were unified.
   */
  const obliquityDeg = obliquityDegOf(data);
  const obliquityRad = (obliquityDeg * Math.PI) / 180;
  /** Stable per-body azimuth so tilted worlds do not all lean the same way. */
  const tiltAzimuth = useMemo(() => (bodySeed(data.id) / 100) * Math.PI * 2, [data.id]);

  const pointerHandlers = useBodyPointerGesture(data.id, !!creationMode, onBodyGesture);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = delta * 1.0;
    const liveBody = bodyByIdRef.current.get(data.id);

    // Direction to the illuminating star, computed once: the surface, cloud
    // shell, ring plane and atmosphere all need the same vector, and they must
    // agree or the terminator, cloud shading and ring shadow drift apart.
    let sunDir = localScratch.defaultSun;
    if (liveBody) {
      const parentBody = parentMapRef.current.get(data.id);
      const starId = primaryStarIdRef.current;
      const star =
        parentBody && ['Star', 'Red Giant'].includes(parentBody.type)
          ? parentBody
          : starId
            ? bodyByIdRef.current.get(starId) ?? null
            : null;
      if (star) {
        localScratch.sunDir.copy(star.position).sub(liveBody.position).normalize();
        sunDir = localScratch.sunDir;
      }
    }

    if (meshRef.current) {
      const meshMaterial = meshRef.current.material as any;
      if (meshMaterial && typeof meshMaterial === 'object') {
        if ('uniforms' in meshMaterial && meshMaterial.uniforms?.uTime) {
          meshMaterial.uniforms.uTime.value = t;
        } else if ('uTime' in meshMaterial) {
          meshMaterial.uTime = t;
        }
      }
      if (isPlanet && liveBody && meshMaterial && 'uSunDirection' in meshMaterial) {
        meshMaterial.uSunDirection = sunDir;

        const nextState = habitabilityToState(
          liveBody.habitability,
          liveBody.properties?.tectonics || 0,
          liveBody.temperature,
        );
        const nextEmissive = emissiveStrengthForBody(liveBody.type, liveBody.texture, liveBody.temperature);
        if (
          Math.abs(meshMaterial.uTemperature - liveBody.temperature) > 2 ||
          meshMaterial.uState !== nextState ||
          meshMaterial.uEmissiveStrength !== nextEmissive
        ) {
          meshMaterial.uTemperature = liveBody.temperature;
          meshMaterial.uState = nextState;
          meshMaterial.uEmissiveStrength = nextEmissive;
        }
      }

      // Spin is about the mesh's own +Y, which the tilt group has already
      // leaned to the real obliquity — so the terminator sweeps a tilted
      // latitude band rather than always tracking the ecliptic.
      let spinRate = 0.05;
      if (isPlanet && liveBody) {
        if (props.isTidallyLocked) {
          const parent = parentMapRef.current.get(data.id);
          if (parent) {
            localScratch.relPos.copy(parent.position).sub(liveBody.position);
            meshRef.current.rotation.y = Math.atan2(localScratch.relPos.x, localScratch.relPos.z);
          }
          spinRate = 0;
        } else {
          spinRate = 5.0 / (props.rotationPeriod || 24.0);
          meshRef.current.rotation.y += spinRate * dt;
        }
      } else {
        // Stars and remnants rotate too; use their own period rather than a
        // flat rate so a fast rotator visibly spins faster than a slow one.
        spinRate = 5.0 / (props.rotationPeriod || 240.0);
        meshRef.current.rotation.y += spinRate * dt;
      }

      // Cloud parallax: the deck super-rotates relative to the surface (Venus
      // does this at ~60x), so a small excess is enough to read as depth.
      if (cloudRef.current) {
        cloudRef.current.rotation.y += (spinRate * 1.18 + 0.012) * dt;
        const cloudMat = cloudRef.current.material as any;
        if (cloudMat && typeof cloudMat === 'object') {
          if ('uTime' in cloudMat) cloudMat.uTime = t;
          if ('uSunDirection' in cloudMat) cloudMat.uSunDirection = sunDir;
          if ('uCover' in cloudMat && liveBody) {
            // Cover tracks live temperature, so a world that is heating up
            // clouds over without waiting for a React render.
            const liveWater = compositionOf(liveBody).water;
            const liveProps = liveBody.properties;
            cloudMat.uCover = cloudCoverFor(
              liveProps?.atmosphere ?? 0,
              surfaceVolatilesFor(liveProps?.waterLevel ?? (liveWater > 0.01 ? 0.5 : 0), liveWater),
              liveBody.temperature,
            );
          }
        }
      }
    }

    if (ringRef.current) {
      const ringMat = ringRef.current.material as any;
      if (ringMat && typeof ringMat === 'object') {
        if ('uTime' in ringMat) ringMat.uTime = t;
        if ('uSunDirection' in ringMat) ringMat.uSunDirection = sunDir;
        // The ring shader ray-casts the planet shadow in world space, so it
        // needs the body's render-space centre every frame.
        if ('uPlanetCenter' in ringMat && groupRef.current) {
          ringMat.uPlanetCenter = groupRef.current.position;
        }
      }
    }

    if (haloRef.current) {
      const haloMaterial = haloRef.current.material as any;
      if (haloMaterial && typeof haloMaterial === 'object') {
        if ('uniforms' in haloMaterial && haloMaterial.uniforms?.uTime) {
          haloMaterial.uniforms.uTime.value = t;
        } else if ('uTime' in haloMaterial) {
          haloMaterial.uTime = t;
        }
      }
    }
    if (atmosphereRef.current) {
      const mat = atmosphereRef.current.material as any;
      if (!mat || typeof mat !== 'object') {
        // skip atmosphere uniform updates this frame
      } else {
      // Same star vector the surface uses — previously this took the *parent*
      // body, so a moon's atmosphere was lit by its planet.
      mat.uSunDirection = sunDir;
      mat.uViewVector = camera.position;

      if (groupRef.current) {
        mat.uPlanetCenter = groupRef.current.position;
      } else if (liveBody) {
        toRenderSpace(localScratch.planetCenter, liveBody.position, floatingOffset.current);
        mat.uPlanetCenter = localScratch.planetCenter;
      }

      mat.uOblateness = oblateness;
      mat.uDensity = atmosphereVisual.density;
      mat.uHaze = atmosphereVisual.haze;
      mat.uScaleHeight = atmosphereVisual.scaleHeight;
      }
    }
  });

  const starLightIntensity = useMemo(() => {
    if (!isStar) return 0;
    const lum = Math.sqrt(Math.max(data.mass, 1) / 1000);
    return 1.8 + lum * 2.2;
  }, [isStar, data.mass]);

  const starLightDistance = useMemo(() => {
    if (!isStar) return 0;
    return Math.max(visualRadius * 30, 120);
  }, [isStar, visualRadius]);

  /**
   * Star brightness and granule size come from the physics, not the palette:
   * luminosity (L☉) sets how bright the disc renders, effective temperature
   * sets its hue, and photospheric surface gravity sets convection cell size.
   */
  const starLuminositySolar = useMemo(
    () => (isStar ? Math.max(bodyLuminositySolar(data), 1e-4) : 1),
    [isStar, data],
  );
  const starSurfaceGravity = useMemo(() => {
    if (!isStar) return 274;
    const g = surfaceGravitySi(data.mass, data.radiusKm);
    return Number.isFinite(g) && g > 0 ? g : 274;
  }, [isStar, data.mass, data.radiusKm]);

  const planetState = useMemo(
    () => habitabilityToState(data.habitability, props.tectonics || 0, data.temperature),
    [data.habitability, props.tectonics, data.temperature]
  );

  /**
   * World-space spin axis.
   *
   * This is no longer a decorative vector: it is exactly the axis the tilt
   * group below rotates the body about, so ice caps, the day/night terminator
   * and the ring plane all agree. For a group with Euler order XYZ and
   * rotation (0, azimuth, obliquity), the local +Y axis maps to
   * Ry(az) * Rz(ob) * (0,1,0).
   */
  const northPole = useMemo(() => {
    const s = Math.sin(obliquityRad);
    const c = Math.cos(obliquityRad);
    return new THREE.Vector3(
      -s * Math.cos(tiltAzimuth),
      c,
      s * Math.sin(tiltAzimuth),
    ).normalize();
  }, [obliquityRad, tiltAzimuth]);

  useEffect(() => {
    if (meshRef.current) {
      const material = meshRef.current.material as THREE.ShaderMaterial;
      if (material.uniforms?.uEnvironment) {
        material.uniforms.uEnvironment.value = environment.texture;
        material.uniforms.uEnvironmentIntensity.value = environment.quality.reflectionIntensity;
      }
    }
  }, [environment, data.id, data.type]);
  const usesPlanetSurface = !isStar && !isNeutronStar;

  const planetSurfaceMaterial = useMemo(() => {
    if (!usesPlanetSurface) return null;
    const mat = new PlanetSurfaceMaterial().clone() as PlanetSurfaceMat;
    mat.logarithmicDepthBuffer = true;
    return mat;
  }, [data.id, usesPlanetSurface]);

  useEffect(() => {
    if (!planetSurfaceMaterial) return;
    applyPlanetSurfaceUniforms(planetSurfaceMaterial, {
      color: data.color,
      textureKey: data.texture,
      bodyType: data.type,
      tectonics: props.tectonics || 0,
      atmosphereDensity: atmosphereVisual.density,
      waterLevel,
      methane: props.methane || 0,
      cloudDepth: props.cloudDepth || 0,
      temperature: data.temperature,
      visualRadius,
      oblateness,
      mass: data.mass,
      planetState,
      northPole,
      composition,
      seed,
      quality: shaderQuality,
      cloudCover,
      nightLights,
      ring,
    });
  }, [
    planetSurfaceMaterial,
    data.color,
    data.texture,
    data.type,
    data.temperature,
    data.mass,
    props.tectonics,
    waterLevel,
    props.methane,
    props.cloudDepth,
    atmosphereVisual.density,
    visualRadius,
    oblateness,
    planetState,
    northPole,
    composition,
    seed,
    shaderQuality,
    cloudCover,
    nightLights,
    ring,
  ]);

  useEffect(() => {
    if (!planetSurfaceMaterial) return;
    return () => {
      planetSurfaceMaterial.dispose();
    };
  }, [planetSurfaceMaterial]);

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const live = bodiesRef.current.find((b) => b.id === data.id) ?? data;
    if (live.position) {
      toRenderSpace(scratchV0, live.position, floatingOffset.current);
      group.position.copy(scratchV0);
    }
    registerBodyObject(data.id, group);
    return () => registerBodyObject(data.id, null);
  }, [data.id, registerBodyObject, bodiesRef, floatingOffset, data]);

  useEffect(() => {
    return () => {
      disposeObject3DResources(groupRef.current);
    };
  }, []);

  return (
    <group ref={groupRef} userData={{ bodyId: data.id }}>
      {isStar && (
        <pointLight
          color={data.color}
          intensity={starLightIntensity}
          distance={starLightDistance}
          decay={2}
        />
      )}
      {/*
        Tilt group. Everything that belongs to the body's rotating frame — the
        surface, its cloud deck, its atmosphere and its ring plane — hangs off
        here, so a real obliquity leans all of them together and the spin below
        stays about the tilted axis rather than world +Y.
      */}
      <group rotation={[0, tiltAzimuth, obliquityRad]}>
        {!isBlackHole && (
          <mesh
            ref={meshRef}
            material={usesPlanetSurface ? planetSurfaceMaterial! : undefined}
            raycast={NO_RAYCAST}
            frustumCulled={true}
            scale={scale}
          >
            <sphereGeometry args={[visualRadius, surfaceSeg, surfaceSeg]} />
            {isStar ?
              <starSurfaceMaterial attach="material" uColor={starColor} uSpeed={1.0} uTemperature={data.temperature} uMetallicity={props.metallicity || 0} uConvection={props.convectionScale || 5} uPulsation={props.pulsationSpeed || 0} uLuminosityClass={props.luminosityClass || 0} uFlareActivity={props.flareActivity || 0} uMagnetic={props.magneticIndex || 0} uOblateness={oblateness} uLuminosity={starLuminositySolar} uSurfaceGravity={starSurfaceGravity} logarithmicDepthBuffer={true} /> :
              (isNeutronStar ?
                <neutronStarMaterial attach="material" uColor={_NEUTRON_COLOR} uMagneticField={1.0} uMass={data.mass} uRadius={data.radius} logarithmicDepthBuffer={true} /> :
                null
              )
            }
          </mesh>
        )}

        {showClouds && (
          <mesh ref={cloudRef} scale={scale} renderOrder={1} raycast={NO_RAYCAST}>
            <sphereGeometry args={[visualRadius * 1.02, surfaceSeg, surfaceSeg]} />
            <planetCloudMaterial
              transparent
              depthWrite={false}
              blending={THREE.NormalBlending}
              uCover={cloudCover}
              uSeed={seed}
              uQuality={shaderQuality}
              uOblateness={oblateness}
              uAtmosphere={atmosphereVisual.density}
              logarithmicDepthBuffer={true}
            />
          </mesh>
        )}

        {ring && (
          <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2} raycast={NO_RAYCAST}>
            <ringGeometry
              args={[
                visualRadius * ring.inner,
                visualRadius * ring.outer,
                deviceTier === 'low' ? 48 : 96,
                1,
              ]}
            />
            <planetRingMaterial
              transparent
              side={THREE.DoubleSide}
              depthWrite={false}
              blending={THREE.NormalBlending}
              uInner={ring.inner}
              uOuter={ring.outer}
              uOpacity={ring.opacity}
              uColorInner={ringColorInner}
              uColorOuter={ringColorOuter}
              uPlanetRadius={visualRadius}
              uSeed={seed}
              uQuality={shaderQuality}
              logarithmicDepthBuffer={true}
            />
          </mesh>
        )}

        {showAtmosphere && (
          <mesh ref={atmosphereRef} scale={scale} renderOrder={3} raycast={NO_RAYCAST}>
            <sphereGeometry args={[atmosRadius, atmosSeg, atmosSeg]} />
            <planetAtmosphereMaterial
              transparent
              side={THREE.BackSide}
              depthWrite={false}
              blending={THREE.NormalBlending}
              uColor={atmosColor}
              uBoundingRadius={atmosRadius}
              uPlanetRadius={visualRadius}
              uDensity={atmosphereVisual.density}
              uHaze={atmosphereVisual.haze}
              uScaleHeight={atmosphereVisual.scaleHeight}
              uOblateness={oblateness}
              uSteps={deviceTier === 'low' ? 4 : 8}
              logarithmicDepthBuffer={true}
            />
          </mesh>
        )}
      </group>

      {isBlackHole && (
        <group rotation={[0, tiltAzimuth, obliquityRad]}>
        <BlackHoleBody
          visualRadius={visualRadius}
          eventHorizonScale={eventHorizonScale}
          spin={props.spinParameter ?? 0}
          accretion={props.accretionRate ?? 0.5}
          mass={data.mass}
        />
        </group>
      )}

      {/* Invisible hitbox for forgiving tap/click body selection. */}
      <mesh
        userData={{ bodyId: data.id }}
        raycast={creationMode ? NO_RAYCAST : MESH_RAYCAST}
        onPointerDown={pointerHandlers.onPointerDown}
        onPointerUp={pointerHandlers.onPointerUp}
        onPointerOut={pointerHandlers.onPointerOut}
        onPointerLeave={pointerHandlers.onPointerLeave}
        onPointerCancel={pointerHandlers.onPointerCancel}
      >
        <sphereGeometry args={[visualRadius * 1.5, hitboxSeg, hitboxSeg]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Selection Halo */}
      {isSelected && (
        <mesh ref={haloRef} scale={scale} raycast={NO_RAYCAST}>
          <sphereGeometry args={[visualRadius * (isBlackHole ? 1.5 : 1.3), haloSeg, haloSeg]} />
          <selectionHaloMaterial transparent side={THREE.FrontSide} blending={THREE.AdditiveBlending} depthWrite={false} uColor={haloColor} />
        </mesh>
      )}


      <Html position={[0, visualRadius * (isBlackHole ? 3 : 2), 0]} center distanceFactor={150} style={{ pointerEvents: 'none' }}>
        <div className={`transition-opacity duration-300 ${isSelected ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex flex-col items-center">
            <div className="text-[10px] font-mono font-bold text-white bg-black/60 px-2 py-1 rounded backdrop-blur-md border border-white/20 whitespace-nowrap shadow-[0_0_15px_rgba(0,0,0,0.5)]">
              {data.name}
            </div>
            <div className="w-px h-4 bg-white/20"></div>
          </div>
        </div>
      </Html>


    </group>
  );
};

/** Narrow-viewport breakpoint — matches Tailwind `md` and inspector/outliner layout. */
const NARROW_VIEWPORT_PX = 768;
const NARROW_VIEWPORT_QUERY = `(max-width: ${NARROW_VIEWPORT_PX - 1}px)`;

/** Baseline orbit speeds on desktop-width canvases. */
const ORBIT_ROTATE_SPEED = 0.35;
const ORBIT_PAN_SPEED = 0.65;

/** Multiplier applied to rotate/pan on narrow screens for shorter swipe travel. */
const NARROW_VIEWPORT_SENSITIVITY = 1.75;

const AdaptiveOrbitControls = ({ enabled }: { enabled: boolean }) => {
  // Measured against the *window*, not the canvas. The canvas now insets when
  // the desktop rails open, so a canvas-width test would flip rotate/pan speed
  // by 1.75x the moment a panel opened — which is exactly the "narrow screen,
  // shorter swipe travel" heuristic being applied to a screen that is not
  // narrow. "Narrow" here means phone, which is what this constant always meant.
  const isNarrowViewport = useMediaQuery(NARROW_VIEWPORT_QUERY);
  const sensitivity = isNarrowViewport ? NARROW_VIEWPORT_SENSITIVITY : 1;

  return (
    <OrbitControls
      makeDefault
      enablePan={true}
      minDistance={40}
      maxDistance={500000}
      enabled={enabled}
      enableDamping={true}
      dampingFactor={0.028}
      rotateSpeed={ORBIT_ROTATE_SPEED * sensitivity}
      zoomSpeed={0.55}
      panSpeed={ORBIT_PAN_SPEED * sensitivity}
      screenSpacePanning={false}
      minPolarAngle={Math.PI * 0.05}
      maxPolarAngle={Math.PI * 0.92}
      touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }}
    />
  );
};

const SpaceCanvas: React.FC<{
  creationMode: BodyType | null;
  setCreationMode: (mode: BodyType | null) => void;
  onBodyCreate: (snapshot: CelestialBody[]) => void;
}> = ({ creationMode, setCreationMode, onBodyCreate }) => {
  const isTouchDevice = detectIsTouch();
  const deviceTier = useDeviceTier();
  const e2eConfig = getE2EConfig();
  const canvasDpr =
    e2eConfig.dpr != null ? ([e2eConfig.dpr, e2eConfig.dpr] as [number, number]) : ([1, 2] as [number, number]);
  const [creationDragging, setCreationDragging] = useState(false);
  const [gpuEffectsOk, setGpuEffectsOk] = useState(true);
  const [glEpoch, setGlEpoch] = useState(0);
  const [showOrbitPaths, setShowOrbitPaths] = useState(true);
  const gasRemnants = useRef<GasRemnant[]>([]);
  const effectiveTier = gpuEffectsOk ? deviceTier : 'low';

  useEffect(() => {
    setTestBridgeDeviceTier(effectiveTier);
  }, [effectiveTier]);
  const exposure = exposureForTier(effectiveTier, isTouchDevice);
  const gridVisualBoost = gridVisualBoostForDevice(
    effectiveTier,
    isTouchDevice,
    gpuEffectsOk,
  );
  const bodiesRef = useRef<CelestialBody[]>([]);
  const creationDragActiveRef = useRef(false);
  const floatingOffset = useRef(new THREE.Vector3(0, 0, 0));
  const bodyObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const parentMapRef = useRef<Map<string, CelestialBody | null>>(new Map());
  const bodyByIdRef = useRef<Map<string, CelestialBody>>(new Map());
  const primaryStarIdRef = useRef<string | null>(null);
  const {
    bodies, selectedId, selectBody, openInspector, closeInspector,
    showDust, showStability, historyVersion, isInteractingWithUI,
  } = useStore();

  const handleCreationDragChange = React.useCallback((active: boolean) => {
    creationDragActiveRef.current = active;
    setCreationDragging(active);
  }, []);

  // Shared with the outliner so the two selection surfaces cannot drift apart.
  const handleBodyGesture = useBodySelectionGesture();

  const handleCanvasPointerMissed = React.useCallback(() => {
    cancelAllBodyPointerGestures();
    if (creationMode) return;
    selectBody(null);
    closeInspector();
  }, [creationMode, selectBody, closeInspector]);

  useEffect(() => {
    cancelAllBodyPointerGestures();
  }, [creationMode]);
  const hasBlackHole = useMemo(
    () => (bodies || []).some((b: CelestialBody) => b?.type === 'Black Hole'),
    [bodies]
  );
  const habitableZoneStars = useMemo(
    () => (bodies || []).filter((b: CelestialBody) => b && ['Star', 'Red Giant'].includes(b.type)),
    [bodies]
  );

  const bodiesSignature = useMemo(
    () => (bodies || []).map((b) => b.id).join('|'),
    [bodies],
  );

  useEffect(() => {
    registerPhysicsBodiesRef(bodiesRef);
    return () => unregisterPhysicsBodiesRef(bodiesRef);
  }, []);

  useEffect(() => {
    const clearUiInteractionLock = () => useStore.getState().setInteractingWithUI(false);
    window.addEventListener('pointerup', clearUiInteractionLock, { passive: true });
    window.addEventListener('pointercancel', clearUiInteractionLock, { passive: true });
    window.addEventListener('touchend', clearUiInteractionLock, { passive: true });
    window.addEventListener('touchcancel', clearUiInteractionLock, { passive: true });
    window.addEventListener('blur', clearUiInteractionLock);
    document.addEventListener('visibilitychange', clearUiInteractionLock);
    return () => {
      window.removeEventListener('pointerup', clearUiInteractionLock);
      window.removeEventListener('pointercancel', clearUiInteractionLock);
      window.removeEventListener('touchend', clearUiInteractionLock);
      window.removeEventListener('touchcancel', clearUiInteractionLock);
      window.removeEventListener('blur', clearUiInteractionLock);
      document.removeEventListener('visibilitychange', clearUiInteractionLock);
    };
  }, []);

  useEffect(() => {
    // Sync physics whenever body identities change (generate, undo, load) — not only count.
    // Reset the integrator's cached accelerations + timestep accumulator so a
    // freshly loaded world doesn't get hit with a stale a(t) from the old one.
    const currentBodies = useStore.getState().bodies;
    bodiesRef.current = sanitizeCelestialBodies(
      (currentBodies || []).map((b) => ({
        ...b,
        position: b.position.clone(),
        velocity: b.velocity.clone(),
      })),
    );
    resetVerletCache();
    resetAccumulator();
  }, [bodiesSignature, historyVersion]);

  const registerBodyObject = React.useCallback((bodyId: string, obj: THREE.Object3D | null) => {
    if (obj) {
      bodyObjectsRef.current.set(bodyId, obj);
    } else {
      bodyObjectsRef.current.delete(bodyId);
    }
  }, []);

  return (
    <div data-testid="sim-canvas" className="absolute inset-0">
    <Canvas
      key={glEpoch}
      dpr={canvasDpr}
      style={{ touchAction: 'none', width: '100%', height: '100%' }}
      camera={{ position: [0, 150, 250], fov: 45, far: 100000000 }}
      gl={{
        logarithmicDepthBuffer: true,
        antialias: !isTouchDevice,
        powerPreference: isTouchDevice ? 'low-power' : 'high-performance',
      } as any}
      onPointerMissed={handleCanvasPointerMissed}
    >
      <RendererConfig
        exposure={exposure}
        managePixelRatio={false}
        onContextLost={() => {
          incrementTestBridgeContextLost();
          setGpuEffectsOk(false);
        }}
        onContextRestored={() => {
          setGpuEffectsOk(true);
          setGlEpoch((n) => n + 1);
        }}
      />
      <EnvironmentProvider tier={effectiveTier} isTouch={isTouchDevice}>
      <BlackHoleLensCapture
        enabled={hasBlackHole && effectiveTier !== 'low' && gpuEffectsOk}
        lowQuality={effectiveTier === 'low'}
      >
        <color attach="background" args={['#050505']} />
        <ambientLight intensity={0.06} />
        <directionalLight position={[100, 100, 100]} intensity={0.35} />
        <Stars
          radius={300}
          depth={50}
          count={effectiveTier === 'low' ? 2000 : isTouchDevice ? 3500 : 5000}
          factor={4}
          saturation={0}
          fade
          speed={1}
        />
        <CameraRecenter floatingOffset={floatingOffset} bodyObjectsRef={bodyObjectsRef} />
        <CameraFlyTo floatingOffset={floatingOffset} bodyObjectsRef={bodyObjectsRef} />
        {isE2EMode() && <TestMetricsCollector />}
        <PhysicsEngine
          bodiesRef={bodiesRef}
          floatingOffset={floatingOffset}
          bodyObjectsRef={bodyObjectsRef}
          parentMapRef={parentMapRef}
          bodyByIdRef={bodyByIdRef}
          primaryStarIdRef={primaryStarIdRef}
          deviceTier={deviceTier}
          gridVisualBoost={gridVisualBoost}
          creationDragActiveRef={creationDragActiveRef}
          gasRemnants={gasRemnants}
        />
        <DevPhysicsDiagnostics bodiesRef={bodiesRef} />
        <GasClouds bodiesRef={bodiesRef} floatingOffset={floatingOffset} remnants={gasRemnants} />
        {showDust && <DecorativeDust floatingOffset={floatingOffset} />}
        {showOrbitPaths && <OrbitPaths bodiesRef={bodiesRef} floatingOffset={floatingOffset} parentMapRef={parentMapRef} />}
        <ObjectCreator
          creationMode={creationMode}
          setCreationMode={setCreationMode}
          onBodyCreate={onBodyCreate}
          floatingOffset={floatingOffset}
          onDragActiveChange={handleCreationDragChange}
        />
        {showStability && (
          <StabilityOverlay
            floatingOffset={floatingOffset}
            bodiesRef={bodiesRef}
            parentMapRef={parentMapRef}
          />
        )}
        <group>
          {(bodies || []).map((body: CelestialBody) => body && (
            <BodyMesh
              key={body.id}
              data={body}
              onBodyGesture={handleBodyGesture}
              creationMode={creationMode}
              floatingOffset={floatingOffset}
              isSelected={selectedId === body.id}
              bodiesRef={bodiesRef}
              parentMapRef={parentMapRef}
              bodyByIdRef={bodyByIdRef}
              primaryStarIdRef={primaryStarIdRef}
              registerBodyObject={registerBodyObject}
              deviceTier={effectiveTier}
            />
          ))}
          {habitableZoneStars.map((star: CelestialBody) => (
            <HabitableZoneVisual key={`hz-${star.id}`} star={star} floatingOffset={floatingOffset} />
          ))}
        </group>
        <RadiationEffects bodiesRef={bodiesRef} bodyObjectsRef={bodyObjectsRef} />
        <AdaptiveOrbitControls enabled={!creationDragging && !isInteractingWithUI} />
        {gpuEffectsOk && <AdaptivePostFX tier={deviceTier} isTouch={isTouchDevice} />}
      </BlackHoleLensCapture>
      </EnvironmentProvider>
    </Canvas>
    <div className="absolute top-24 left-1/2 -translate-x-1/2 z-10 w-max max-w-[calc(100%-1.5rem)] rounded-lg border border-white/10 bg-black/65 px-3 py-1 text-[11px] text-slate-300 pointer-events-auto">
      <label className="flex min-h-[2.75rem] items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={showOrbitPaths} onChange={e => setShowOrbitPaths(e.target.checked)} />
        Orbit estimates — instantaneous two-body approximation.
      </label>
      {showOrbitPaths && <p className="pb-1 text-[10px] text-slate-400">Moon paths use the existing exaggerated display scale.</p>}
    </div>
    </div>
  );
};

export default SpaceCanvas;
