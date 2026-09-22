import { captureSimulationSnapshot, type SimulationSnapshot } from '../utils/simulationSnapshot';

import React, { useRef, useMemo, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree, extend, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Stars, shaderMaterial, Html } from '@react-three/drei';
import * as THREE from 'three';
import { CelestialBody, BodyType, WaveEvent, PhysicsEvent } from '../types';
import { scanCollisionsInPlace, checkEvolutionInPlace, calculateStabilityMetrics, fillParentMap, updateEquilibriumTemperatures, findPrimaryStar, bodyLuminositySolar } from '../utils/physicsUtils';
import { runFixedSteps, resetVerletCache, resetAccumulator, getSimTime, setSimTime } from '../utils/physicsSoA';
import { propagateSatellites, promoteEscapedMoons } from '../utils/moonSystem';
import { scratchV0, scratchV1, scratchV2, scratchV3, toRenderSpace } from '../utils/scratchVectors';
import { bodyRenderPosition } from '../utils/renderPosition';
import { createSandboxBody, sampleMassForType } from '../utils/bodyFactory';
import { pickMoonParent } from '../utils/moonDraft';
import { isOrbitControlsLike, setOrbitControlsEnabled, type OrbitControlsLike } from '../utils/orbitControls';
import MoonCreator from './MoonCreator';
import { TEXTURE_IDS } from '../constants';
import {
  PHYSICS_LIMITS,
  clampLaunchVelocity,
  sanitizeCelestialBodies,
} from '../utils/physicsBounds';
import type { DeviceTier } from './CanvasSetup';
import './Planet/PlanetShaders';
import { PlanetSurfaceMaterial } from './Planet/PlanetShaders';
import { useStore } from '../utils/store';
import { CURVATURE_WELL_GLSL, DISPLAY_DEPTH_GLSL } from '../utils/curvatureDisplay';
import {
  GRID_MAX_BODIES, GRID_MAX_DISCS, GridFrameBuilder, publishGridFrame, type GridWellFrame,
} from '../utils/gridWells';
import {
  buildDiscLatticeGeometry,
  buildPrimaryLatticeGeometry,
  PRIMARY_DISC_COVERAGE_FLOOR,
} from '../utils/gridLattice';
import {
  DEPTH_TINT_BEGINNER, DEPTH_TINT_SCALE, TIDAL_LOG_MAX, TIDAL_LOG_MIN, TIDAL_TINT_BEGINNER,
  depthTintFor, tidalTintFor,
  type UiMode,
} from '../utils/displayMode';
import { simElapsedForFrame, simulationPacingScale } from '../utils/simRate';
import { presetViewFrame } from '../utils/presetViews';
import { bodyVisualRadius } from '../utils/displayMode';
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
import { clonePhysicsBody, getPhysicsBodiesSnapshot, registerPhysicsBodiesRef, unregisterPhysicsBodiesRef } from '../utils/physicsBridge';
import { registerRenderObjects, unregisterRenderObjects } from '../utils/renderBridge';
import { getE2EConfig, isE2EMode } from '../utils/e2eConfig';
import {
  incrementTestBridgeContextLost,
  setTestBridgeGraphics,
} from '../utils/testBridge';
import {
  cancelAllBodyPointerGestures,
  hasActiveBodyPointerGesture,
  useBodyPointerGesture,
  wasBodyGestureJustReleased,
  type BodyGestureKind,
} from '../utils/bodyPointerGesture';
import {
  clampHitRadiusToCone,
  screenSpaceHitScale,
} from '../utils/hitTarget';
import { createRafScheduler, deferDoubleFrame } from '../utils/deferFrames';
import {
  RendererConfig,
  AdaptivePostFX,
  DeviceCapabilityProbe,
  useDeviceTier,
  environmentQualityForDevice,
  physicsBudgetForTier,
  profileForTier,
  renderTierFor,
  exposureForTier,
  gridVisualBoostForDevice,
  detectIsTouch,
} from './CanvasSetup';
import { resolveRenderProfile, type RenderProfile } from '../utils/graphicsQuality';

/** No-op raycast — opts a mesh out of all picking without removing it. */
const NO_RAYCAST: THREE.Object3D['raycast'] = () => null;

/** Default mesh raycast — use explicitly when toggling back from NO_RAYCAST (undefined does not restore). */
const MESH_RAYCAST: THREE.Object3D['raycast'] = THREE.Mesh.prototype.raycast;

/** Radial padding on the invisible pick sphere, in multiples of the visual radius. */
const HITBOX_RADIUS_FACTOR = 1.5;

/** Hard cap on simultaneously simulated bodies. Prevents O(N²) blow-up. */
const MAX_BODIES = PHYSICS_LIMITS.MAX_BODIES;

/** Module-scope constants — reused across renders to avoid GC pressure. */
const _UNIT_SCALE = new THREE.Vector3(1, 1, 1);

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

/** Base grid-line spacing, L* — the spacing drawn at the default Solar System framing. */
const GRID_LINE_BASE = 20;
/**
 * Lines closer than this on screen (device pixels) hand over to the next
 * coarser level (×4); lines further apart bring in the next finer one.
 */
const GRID_LINE_TARGET_PX = 12;
/** Finest and coarsest line levels: 20·4⁻⁴ ≈ 0.08 L* (TRAPPIST-1 scale) to 20·4⁶ ≈ 82 000 L*. */
const GRID_LINE_LOD_MIN = -4;
const GRID_LINE_LOD_MAX = 6;

/**
 * The spacetime grid. One shader program draws both kinds of lattice from
 * utils/gridLattice.ts:
 *
 *  - the PRIMARY lattice (uIsDisc = 0): a polar mesh in world units, centred
 *    by its mesh position on the strongest well. It remains a low-opacity
 *    fallback below every secondary disc instead of being carved away;
 *  - up to GRID_MAX_DISCS SECONDARY lattices (uIsDisc = 1): unit discs whose
 *    ring parameter t (position.y) becomes r = c·sinh(t·U) here, so one static
 *    geometry serves a disc whose radius changes every frame.
 *
 * Both evaluate the same displacement — the summed wells through
 * `displayDepth` — so they meet through an overlap-safe, resolution-aware
 * seam. No uniform or vertex position depends on the camera: the surface is
 * a function of the bodies alone. The camera only drives the horizon fade and
 * the fwidth-based line width and line level, neither of which moves the
 * surface.
 */
const GravityGridMaterial = shaderMaterial(
  {
    uColor: new THREE.Color(0.14, 0.16, 0.22),
    uLineGain: 1.0,
    uVisualBoost: 1.0,
    uBodiesPos: new Float32Array(GRID_MAX_BODIES * 3),
    uBodiesMass: new Float32Array(GRID_MAX_BODIES),
    // Per-body peak depth and core radius after lattice LOD, L* — built once
    // per frame by utils/gridWells.ts and shared with the habitable zone.
    uBodiesPeak: new Float32Array(GRID_MAX_BODIES),
    uBodiesCore: new Float32Array(GRID_MAX_BODIES),
    uBodyCount: 0,
    uDisplayKnee: 300,
    uTidalGain: TIDAL_TINT_BEGINNER,
    // Depth colour tint (Beginner default; re-uploaded per frame).
    uDepthTint: DEPTH_TINT_BEGINNER,
    uDepthTintScale: DEPTH_TINT_SCALE,
    uLineLevels: 2,
    // Lattice role. A disc carries its ring profile; the primary keeps a
    // coverage-safe fallback under detail discs.
    uIsDisc: 0,
    uDiscU: 1,
    uDiscCoreScale: 1,
    uDiscCenter: new THREE.Vector2(),
    uDiscRadius: 0,
    uPrimaryDiscCount: 0,
    uPrimaryDiscCenter: new Float32Array(GRID_MAX_DISCS * 2),
    uPrimaryDiscRadius: new Float32Array(GRID_MAX_DISCS),
    uPrimaryDiscGuard: new Float32Array(GRID_MAX_DISCS),
    uPrimaryCoverageFloor: PRIMARY_DISC_COVERAGE_FLOOR,
    uDiscGuard: 1,
  },
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>

uniform vec3 uBodiesPos[${GRID_MAX_BODIES}];
uniform float uBodiesMass[${GRID_MAX_BODIES}];
uniform float uBodiesPeak[${GRID_MAX_BODIES}];
uniform float uBodiesCore[${GRID_MAX_BODIES}];
uniform int uBodyCount;
uniform float uDisplayKnee;
uniform float uIsDisc;
uniform float uDiscU;
uniform float uDiscCoreScale;

${CURVATURE_WELL_GLSL}
${DISPLAY_DEPTH_GLSL}

varying float vDisplacement;
varying float vTidal;
varying vec3 vWorldPos;

void main() {
  vec3 local = position;
  if (uIsDisc > 0.5) {
    float u = position.y * uDiscU;
    float r = uDiscCoreScale * 0.5 * (exp(u) - exp(-u));
    local = vec3(position.x * r, 0.0, position.z * r);
  }
  // The mesh only translates, so this is the lattice point on the orbital
  // plane (y = 0) in render space.
  vec3 w = (modelMatrix * vec4(local, 1.0)).xyz;
  w.y = 0.0;
  // Distances are measured in 3D from the orbital-plane point to each body,
  // so a body above or below the plane digs a correspondingly shallower dip,
  // as the true potential does. Summed, so superposition holds.
  float depth = 0.0;
  float tidal = 0.0;
  for (int i = 0; i < ${GRID_MAX_BODIES}; i++) {
    if (i >= uBodyCount) break;
    vec3 dv = w - uBodiesPos[i];
    float d2 = dot(dv, dv);
    float s = uBodiesCore[i];
    depth += wellDepthAt(sqrt(d2), uBodiesPeak[i], s);
    // Tidal field of the strongest body: the Newtonian limit of curvature.
    float q = d2 + s * s;
    tidal = max(tidal, uBodiesMass[i] / (q * sqrt(q)));
  }
  float displacement = -displayDepth(depth, uDisplayKnee);
  vec3 p = vec3(w.x, displacement, w.z);
  vWorldPos = p;
  vDisplacement = displacement;
  // log10 of the tidal field, mapped onto [0, 1] between the tint decades.
  vTidal = clamp((log2(max(tidal, 1e-30)) * 0.30103 - (${TIDAL_LOG_MIN.toFixed(1)})) / ${(TIDAL_LOG_MAX - TIDAL_LOG_MIN).toFixed(1)}, 0.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}`,
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uColor;
uniform float uLineGain;
uniform float uVisualBoost;
uniform float uDepthTint;
uniform float uDepthTintScale;
uniform float uTidalGain;
uniform float uLineLevels;
uniform float uIsDisc;
uniform vec2 uDiscCenter;
uniform float uDiscRadius;
uniform float uDiscGuard;
uniform int uPrimaryDiscCount;
uniform vec2 uPrimaryDiscCenter[${GRID_MAX_DISCS}];
uniform float uPrimaryDiscRadius[${GRID_MAX_DISCS}];
uniform float uPrimaryDiscGuard[${GRID_MAX_DISCS}];
uniform float uPrimaryCoverageFloor;
varying float vDisplacement;
varying float vTidal;
varying vec3 vWorldPos;

// Anti-aliased lines every 'spacing' L* in world x and z.
float gridLines(vec2 xz, vec2 fw, float spacing) {
  vec2 g = abs(fract(xz / spacing - 0.5) - 0.5) * spacing / max(fw, vec2(1e-6));
  return 1.0 - min(min(g.x, g.y), 1.0);
}

// 1 inside a detail disc, smoothly falling to 0 across its shared guard band.
float discSeamBlend(float d, float radius, float guard) {
  if (d >= radius) return 0.0;
  float safeGuard = max(1e-6, min(guard, radius));
  return 1.0 - smoothstep(radius - safeGuard, radius, d);
}

void main() {
  vec2 xz = vWorldPos.xz;
  // Derivatives first: they need the whole pixel quad, before any discard.
  vec2 fw = fwidth(xz);

  // The detail lattice fades over the primary through one shared guard band.
  // The primary never discards this area: that fallback is what prevents a
  // low-density mobile disc from exposing a black hole in the grid.
  float coverage = 1.0;
  if (uIsDisc > 0.5) {
    coverage = discSeamBlend(distance(xz, uDiscCenter), uDiscRadius, uDiscGuard);
    if (coverage <= 0.0) discard;
  } else {
    for (int j = 0; j < ${GRID_MAX_DISCS}; j++) {
      if (j >= uPrimaryDiscCount) break;
      float blend = discSeamBlend(
        distance(xz, uPrimaryDiscCenter[j]),
        uPrimaryDiscRadius[j],
        uPrimaryDiscGuard[j]
      );
      coverage = min(coverage, mix(1.0, uPrimaryCoverageFloor, blend));
    }
  }

  // Zoom-adaptive, world-anchored lines. Spacing is ${GRID_LINE_BASE}·4^k L*,
  // chosen so lines stay about ${GRID_LINE_TARGET_PX} px apart. The finer
  // level fades out as it crowds, and every coarse line is also a fine line,
  // so the hand-over is continuous. Levels choose which lines are drawn; they
  // never move a line.
  float px = max(max(fw.x, fw.y), 1e-6);
  float lod = clamp(0.5 * log2(px * ${GRID_LINE_TARGET_PX.toFixed(1)} / ${GRID_LINE_BASE.toFixed(1)}), ${GRID_LINE_LOD_MIN.toFixed(1)}, ${GRID_LINE_LOD_MAX.toFixed(1)});
  float lineAlpha;
  if (uLineLevels > 1.5) {
    float k = floor(lod);
    float s0 = ${GRID_LINE_BASE.toFixed(1)} * exp2(2.0 * k);
    lineAlpha = max(gridLines(xz, fw, 4.0 * s0), gridLines(xz, fw, s0) * (1.0 - (lod - k)));
  } else {
    lineAlpha = gridLines(xz, fw, ${GRID_LINE_BASE.toFixed(1)} * exp2(2.0 * floor(lod + 0.5)));
  }

  vec3 baseColor = uColor * uVisualBoost;
  // Curvature tint: the log tidal field, strongest near compact masses.
  vec3 tidalColor = vec3(0.0, 0.35, 0.65) * vTidal * uTidalGain * uVisualBoost;
  vec3 finalColor = baseColor + tidalColor;

  // Depth tint: lines brighten toward cyan as the well deepens, so wells read
  // even from straight above, where vertical displacement is invisible.
  float wellT = uDepthTint * (1.0 - exp(-max(-vDisplacement, 0.0) / uDepthTintScale));
  finalColor = mix(finalColor, vec3(0.30, 0.72, 1.0) * min(uVisualBoost, 1.3), wellT * 0.75);

  float dist = length(vWorldPos.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(2500.0, 7000.0, dist);
  float totalAlpha = lineAlpha * 0.4 * uLineGain * uVisualBoost * (1.0 + wellT * 0.9) * fade * coverage;
  if (totalAlpha < 0.01) discard;
  gl_FragColor = vec4(finalColor, totalAlpha);
  #include <logdepthbuf_fragment>
}`
);

/** Per-frame uniforms every grid lattice shares. */
const setGridBodyUniforms = (mat: any, frame: GridWellFrame, mode: UiMode, lineLevels: number): void => {
  mat.uBodiesPos = frame.positions;
  mat.uBodiesMass = frame.masses;
  mat.uBodiesPeak = frame.peaks;
  mat.uBodiesCore = frame.cores;
  mat.uBodyCount = frame.count;
  mat.uDisplayKnee = frame.displayKnee;
  mat.uDepthTint = depthTintFor(mode);
  mat.uTidalGain = tidalTintFor(mode);
  mat.uLineLevels = lineLevels;
};

/**
 * Expanding shockwave ring, drawn on a unit quad.
 *
 * The pre-existing version placed the ring in a FIXED UV band (0.4-0.5) and only
 * faded its alpha, so it never actually expanded — and it was drawn on a
 * single-sided `ringGeometry` rotated flat, making it invisible from below the
 * ecliptic. Between that and a 1-second fade it was easy to miss a merger
 * entirely, which is half of "two bodies touched and nothing happened".
 *
 * Now the ring radius is driven by uTime, both faces are drawn, and the quad
 * costs 2 triangles instead of 64 ring segments. `uSpeed` sets how fast the
 * front sweeps out and `uWidth` its thickness — a wide, fast ring reads as a
 * flash, a narrow slow one as a gravitational-wave ripple, so one material
 * covers both.
 */
const ShockwaveMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color(1, 1, 1), uSpeed: 1, uWidth: 0.12, uIntensity: 1, uDuration: 1 },
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
uniform float uTime, uSpeed, uWidth, uIntensity, uDuration; uniform vec3 uColor; varying vec2 vUv;
void main() {
  float t = clamp(uTime / max(uDuration, 0.0001), 0.0, 1.0);
  float d = distance(vUv, vec2(0.5)) * 2.0;
  float r = clamp(uTime * uSpeed, 0.0, 1.0);
  float ring = smoothstep(r - uWidth, r, d) * smoothstep(r + uWidth, r, d);
  float alpha = ring * (1.0 - smoothstep(0.0, 1.0, t)) * uIntensity;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(clamp(uColor, 0.0, 5.0) * uIntensity, alpha);
  #include <logdepthbuf_fragment>
}`
);

/**
 * Luminous shell for a supernova or a black-hole accretion flare, on a UNIT
 * sphere whose radius is animated by the group's scale.
 *
 * The previous version compared `length(vPos)` against a time-swept front on a
 * radius-20 sphere — but every vertex of a sphere sits at the same radius, so
 * that comparison was constant across the whole surface and the "shock front"
 * could never be seen sweeping. Driving the radius from the group scale and
 * spending the shader on a limb-brightened, mottled shell is both cheaper and
 * actually legible. `uDirection` flips the envelope so the same material serves
 * an outward-blasting supernova and an inward-collapsing accretion flare.
 */
const SupernovaMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color(1, 0.8, 0.4), uIntensity: 1, uDuration: 5, uDirection: 1 },
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
void main() {
  vPos = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`,
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime, uIntensity, uDuration, uDirection; uniform vec3 uColor;
varying vec3 vPos; varying vec3 vNormal; varying vec3 vView;
float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }
void main() {
  float t = clamp(uTime / max(uDuration, 0.0001), 0.0, 1.0);
  // Fast rise, long tail for a blast; mirrored for an inward collapse.
  float phase = uDirection > 0.0 ? t : 1.0 - t;
  float env = sin(3.14159265 * pow(clamp(phase, 0.0, 1.0), 0.35)) * (1.0 - t);
  // Limb brightening: an optically thin shell is brightest where the line of
  // sight is tangent to it.
  float rim = 1.0 - abs(dot(normalize(vNormal), normalize(vView)));
  float mottle = 0.7 + 0.6 * random(vPos.xy * 7.0 + vPos.z);
  float alpha = (0.2 + 0.8 * rim * rim) * env * mottle * uIntensity;
  if (alpha < 0.004) discard;
  vec3 color = mix(uColor, vec3(1.0), rim * 0.6);
  gl_FragColor = vec4(color * 2.0, alpha);
  #include <logdepthbuf_fragment>
}`
);

/**
 * Debris burst for a destructive impact.
 *
 * Modelled on `Environment/DecorativeDust`: every particle's trajectory is a
 * closed-form function of `uTime` and its own seed, evaluated in the vertex
 * shader, so the CPU writes exactly one uniform per frame regardless of particle
 * count and the geometry is shared by every live burst. The debris BODIES a
 * shatter produces are real simulated bodies; this is the accompanying spark and
 * dust, which is why it only needs to last ~1.6 s.
 */
const DebrisMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color(1, 0.75, 0.5), uSpeed: 1, uSize: 4, uPixelRatio: 1, uIntensity: 1, uDuration: 1.6, uSeed: 0 },
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float uTime, uSpeed, uSize, uPixelRatio, uDuration, uSeed;
varying float vFade, vSeed;
void main() {
  // The position attribute is a unit direction; the seed rides along with it.
  vSeed = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719)) + uSeed) * 43758.5453);
  float t = clamp(uTime / max(uDuration, 0.0001), 0.0, 1.0);
  // Ballistic-looking ease-out: fast ejection, then coasting.
  float travel = uSpeed * (1.0 - pow(1.0 - t, 2.5)) * (0.35 + 1.3 * vSeed);
  vec3 world = position * travel;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  vFade = 1.0 - t;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uPixelRatio * (0.5 + vSeed) * 60.0 / max(-mv.z, 1.0), 1.0, 10.0 * uPixelRatio);
  #include <logdepthbuf_vertex>
}`,
  `precision highp float;
#include <common>
#include <logdepthbuf_pars_fragment>
uniform vec3 uColor; uniform float uIntensity;
varying float vFade, vSeed;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float alpha = exp(-r * r * 4.0) * (1.0 - smoothstep(0.65, 1.0, r)) * vFade * vFade * uIntensity;
  if (alpha < 0.004) discard;
  // Hot sparks cooling to dust as they slow.
  gl_FragColor = vec4(mix(uColor, vec3(1.0, 0.95, 0.85), vSeed * vFade), alpha);
  #include <logdepthbuf_fragment>
}`
);

extend({ GravityGridMaterial, ShockwaveMaterial, SupernovaMaterial, DebrisMaterial });

const StabilityOverlay = ({ floatingOffset, bodiesRef, parentMapRef }: {
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
  bodiesRef: React.MutableRefObject<CelestialBody[]>;
  parentMapRef: React.MutableRefObject<Map<string, CelestialBody | null>>;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const hillMeshRef = useRef<THREE.Mesh>(null);
  const rocheMeshRef = useRef<THREE.Mesh>(null);
  const selectedId = useStore((s) => s.selectedId);

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

/**
 * A body as it is *now*. Store positions only sync on collision/evolution
 * events (see PhysicsEngine), so camera framing must read the physics array or
 * it targets wherever the body was at the last sync.
 */
const liveBodyById = (id: string): CelestialBody | undefined =>
  getPhysicsBodiesSnapshot().find((b) => b.id === id)
  ?? useStore.getState().bodies.find((b) => b.id === id);

/**
 * Reset floating origin and snap the orbit camera to a body (spawn-style framing).
 *
 * This deliberately does *not* touch `bodyObjectsRef`. That registry is owned by
 * BodyMesh's mount/unmount and is the only handle PhysicsEngine has on the body
 * meshes; clearing it here froze every body in place for the life of the world
 * (physics kept advancing, the meshes did not). Moving the origin needs no
 * invalidation — the next physics frame rewrites every registered mesh position.
 */
const snapCameraToBody = (
  camera: THREE.Camera,
  controls: OrbitControlsLike,
  target: CelestialBody,
  floatingOffset: THREE.Vector3,
  distScale = 1,
) => {
  floatingOffset.set(0, 0, 0);

  toRenderSpace(scratchV1, target.position, floatingOffset);
  const { uiMode } = useStore.getState();
  bodyRenderPosition(scratchV1, target, target.parentId ? liveBodyById(target.parentId) : undefined, floatingOffset, uiMode);
  const dist = (target.properties?.presetId ? Math.max(0.2, bodyVisualRadius(target, uiMode) * 6) : framingDistanceFor(target.radius)) * distScale;
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
}: {
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
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

    const body = liveBodyById(selectedId);
    if (!body || !isOrbitControlsLike(controls)) return;

    // Touch screens sit much closer to their whole viewport than a desktop
    // monitor, so the same framing distance reads as uncomfortably tight —
    // back off so the tapped body leaves room for its label and surroundings.
    const distScale = detectIsTouch() ? 3.4 : 1;

    if (reducedMotion) {
      snapCameraToBody(camera, controls, body, floatingOffset.current, distScale);
      return;
    }
    flying.current = {
      id: selectedId,
      distance: (body.properties?.presetId ? Math.max(0.2, bodyVisualRadius(body, useStore.getState().uiMode) * 6) : framingDistanceFor(body.radius)) * distScale,
    };
  }, [selectedId, recenterNonce, reducedMotion, controls, camera, floatingOffset]);

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

    const body = liveBodyById(fly.id);
    if (!body) { flying.current = null; return; }

    bodyRenderPosition(scratchV1, body, body.parentId ? liveBodyById(body.parentId) : undefined, floatingOffset.current, useStore.getState().uiMode);
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
/** Camera position and orbit target, carried across a WebGL context rebuild. */
interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
}

/**
 * Preserves the view across a `<Canvas>` remount.
 *
 * Switching graphics mode changes context-creation attributes, which forces a
 * new context and therefore a brand-new camera built from the `camera` prop's
 * defaults. Without this the user would tap "Quality" and be teleported back to
 * the default overview, losing whatever they were looking at. The ref lives in
 * `SpaceCanvas`, outside the Canvas, so it survives the unmount that writes it.
 */
const CameraPoseBridge = ({ store }: { store: React.MutableRefObject<CameraPose | null> }): null => {
  const { camera, controls } = useThree();

  useEffect(() => {
    const saved = store.current;
    if (saved && isOrbitControlsLike(controls)) {
      camera.position.set(saved.position[0], saved.position[1], saved.position[2]);
      controls.target.set(saved.target[0], saved.target[1], saved.target[2]);
      controls.update();
    }
    return () => {
      if (!isOrbitControlsLike(controls)) return;
      store.current = {
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
      };
    };
  }, [camera, controls, store]);

  return null;
};

const CameraRecenter = ({
  floatingOffset,
}: {
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
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

      const state = useStore.getState();
      const frame = presetViewFrame(bodies, state.guidedView, state.uiMode, (camera as THREE.PerspectiveCamera).aspect || 1);
      if (frame) {
        floatingOffset.current.copy(frame.centre);
        controls.target.set(0, 0, 0);
        camera.position.set(0, frame.distance * 0.85, frame.distance * 0.53);
        controls.update();
        useStore.setState({ cameraLockedId: null });
      } else snapCameraToBody(camera, controls, target, floatingOffset.current);
    };

    const cancelDefer = deferDoubleFrame(trySnap);

    return () => {
      raf.cancel();
      cancelDefer();
    };
  }, [cameraRecenterNonce, controls, camera, floatingOffset]);

  return null;
};

/**
 * One transient effect. `kind` selects the geometry/material; `scale` sizes it to
 * the event that produced it and `intensity` scales its brightness, so a single
 * material serves several outcomes.
 */
type VisualEffectKind = 'shockwave' | 'wave' | 'debris' | 'accretion' | 'supernova';
type VisualEffect = {
  id: number;
  kind: VisualEffectKind;
  pos: THREE.Vector3;
  startTime: number;
  scale: number;
  intensity: number;
  color: THREE.Color;
  /** Accretion only: jet axis. */
  jets: boolean;
};

/**
 * Per-kind lifetimes, seconds. The previous flat 5.0 s reap kept a shockwave
 * mounted and drawn for four seconds after its shader had already faded to zero.
 */
const EFFECT_LIFETIME: Record<VisualEffectKind, number> = {
  shockwave: 1.2,
  wave: 2.5,
  debris: 1.6,
  accretion: 2.0,
  supernova: 5.0,
};

const _MERGE_COLOR = new THREE.Color(1, 1, 1);
const _COLLAPSE_COLOR = new THREE.Color(1, 0.72, 0.42);
const _WAVE_COLOR = new THREE.Color(0.62, 0.78, 1);
const _DEBRIS_COLOR = new THREE.Color(1, 0.62, 0.34);
/** The same disk blue RadiationEffects uses, so accretion reads as one system. */
const _ACCRETION_COLOR = new THREE.Color('#86b6dd');

/**
 * Unit directions shared by EVERY debris burst. Allocating a per-collision
 * Float32Array would be a GC spike in a cascade, and per-burst variation comes
 * from the `uSeed` uniform instead.
 */
const useDebrisGeometry = (count: number) =>
  useMemo(() => {
    const dirs = new Float32Array(count * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const z = count === 1 ? 0 : 1 - (2 * i) / (count - 1);
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const theta = golden * i;
      dirs[i * 3] = r * Math.cos(theta);
      dirs[i * 3 + 1] = r * Math.sin(theta);
      dirs[i * 3 + 2] = z;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(dirs, 3));
    return geo;
  }, [count]);

/** Animates collision/supernova FX via useFrame — no React re-renders per tick. */
const VisualEffectItem = ({
  effect,
  floatingOffset,
  debrisGeometry,
  shellSegments,
}: {
  effect: VisualEffect;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
  debrisGeometry: THREE.BufferGeometry;
  shellSegments: number;
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const shellRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.ShaderMaterial & { uTime: number; uPixelRatio: number }>(null);
  const jetRef = useRef<THREE.Group>(null);
  const jetMatsRef = useRef<(THREE.ShaderMaterial & { uTime: number })[]>([]);
  const duration = EFFECT_LIFETIME[effect.kind];

  useFrame((state, _delta) => {
    const t = state.clock.elapsedTime - effect.startTime;
    if (matRef.current) {
      matRef.current.uTime = t;
      if ('uPixelRatio' in matRef.current) {
        matRef.current.uPixelRatio = state.gl.getPixelRatio();
      }
    }
    if (groupRef.current) {
      // Same floating-origin transform every other object in the scene uses, so
      // the effect stays pinned to where the impact happened after a recentre.
      toRenderSpace(scratchV2, effect.pos, floatingOffset.current);
      groupRef.current.position.set(scratchV2.x, scratchV2.y, scratchV2.z);
    }
    // The shell's radius is animated by scale rather than in the shader: on a
    // sphere every vertex has the same radius, so a shader-side "front" cannot
    // sweep across it.
    if (shellRef.current) {
      const u = Math.min(1, Math.max(0, t / duration));
      const grow = effect.kind === 'accretion' ? 1 - 0.85 * u : 0.05 + 0.95 * Math.pow(u, 0.45);
      shellRef.current.scale.setScalar(Math.max(0.02, grow) * effect.scale);
    }
    if (jetRef.current) {
      const u = Math.min(1, Math.max(0, t / duration));
      jetRef.current.scale.set(1, 0.2 + 1.6 * u, 1);
      for (let i = 0; i < jetMatsRef.current.length; i++) {
        const m = jetMatsRef.current[i];
        if (m) m.uTime = t;
      }
    }
  });

  if (effect.kind === 'shockwave' || effect.kind === 'wave') {
    // A gravitational-wave ripple is the same ring, slower, wider and fainter.
    const wave = effect.kind === 'wave';
    return (
      <group ref={groupRef} scale={effect.scale}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
          <planeGeometry args={[2, 2]} />
          <shockwaveMaterial
            ref={matRef}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            uColor={effect.color}
            uTime={0}
            uSpeed={wave ? 0.45 : 1.0}
            uWidth={wave ? 0.22 : 0.14}
            uIntensity={effect.intensity}
            uDuration={duration}
            logarithmicDepthBuffer={true}
          />
        </mesh>
      </group>
    );
  }

  if (effect.kind === 'debris') {
    return (
      <group ref={groupRef}>
        <points geometry={debrisGeometry} frustumCulled={false} raycast={NO_RAYCAST}>
          <debrisMaterial
            ref={matRef}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            uColor={effect.color}
            uTime={0}
            uSpeed={effect.scale}
            uIntensity={effect.intensity}
            uDuration={duration}
            uSeed={effect.id}
            logarithmicDepthBuffer={true}
          />
        </points>
      </group>
    );
  }

  const accretion = effect.kind === 'accretion';
  return (
    <group ref={groupRef}>
      <mesh ref={shellRef} raycast={NO_RAYCAST}>
        <sphereGeometry args={[1, shellSegments, shellSegments]} />
        <supernovaMaterial
          ref={matRef}
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          blending={THREE.AdditiveBlending}
          uColor={effect.color}
          uTime={0}
          uIntensity={effect.intensity}
          uDuration={duration}
          uDirection={accretion ? -1 : 1}
          logarithmicDepthBuffer={true}
        />
      </mesh>
      {accretion && effect.jets && (
        // Relativistic jets along the spin axis. Same two-cone construction as
        // Environment/RadiationEffects, so a jet from an accretion event and a
        // jet from a steady-state pulsar look like the same phenomenon.
        <group ref={jetRef}>
          {[1, -1].map((sign, i) => (
            <mesh
              key={sign}
              position={[0, sign * effect.scale * 2.2, 0]}
              rotation={[sign > 0 ? 0 : Math.PI, 0, 0]}
              raycast={NO_RAYCAST}
            >
              <cylinderGeometry args={[effect.scale * 0.5, effect.scale * 0.05, effect.scale * 4, 8, 1, true]} />
              <supernovaMaterial
                ref={(m: (THREE.ShaderMaterial & { uTime: number }) | null) => {
                  if (m) jetMatsRef.current[i] = m;
                }}
                transparent
                depthWrite={false}
                side={THREE.DoubleSide}
                blending={THREE.AdditiveBlending}
                uColor={effect.color}
                uTime={0}
                uIntensity={effect.intensity * 0.8}
                uDuration={duration}
                uDirection={1}
                logarithmicDepthBuffer={true}
              />
            </mesh>
          ))}
        </group>
      )}
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
  physicsTier,
  renderProfile,
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
  /**
   * HARDWARE tier. The ONLY tier in this component allowed to reach the
   * integrator — `simElapsedForFrame`, `runFixedSteps`, `simulationPacingScale`
   * and the fragment budget. Never derived from the user's graphics mode, so
   * the simulation is identical in Quality, Performance and Auto.
   */
  physicsTier: import('./CanvasSetup').DeviceTier;
  /** PICTURE only. Must never be passed to anything in the list above. */
  renderProfile: RenderProfile;
  gridVisualBoost: number;
  creationDragActiveRef: React.MutableRefObject<boolean>;
  gasRemnants: React.MutableRefObject<GasRemnant[]>;
}) => {
  const gridPrimaryMatRef = useRef<any>(null);
  const gridPrimaryMeshRef = useRef<THREE.Mesh>(null);
  const gridDiscMatRefs = useRef<any[]>([]);
  const gridDiscMeshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const visualEffectsRef = useRef<VisualEffect[]>([]);
  // The effect list lives in a ref so useFrame can mutate it without a render;
  // this counter is only a re-render trigger for when the set actually changes.
  const [, setEffectsVersion] = useState(0);
  const lastTempUpdateRef = useRef(0);
  const lastParentMapUpdateRef = useRef(0);
  const lastBodyCountRef = useRef(0);
  const lastBodyArrayRef = useRef<CelestialBody[] | null>(null);
  const { camera, controls } = useThree();
  // One grid frame per render frame, built from body state only and shared
  // with HabitableZoneVisual through utils/gridWells.ts.
  const gridFrame = useMemo(() => new GridFrameBuilder(), []);

  const syncBodiesFromPhysics = useStore((s) => s.syncBodiesFromPhysics);
  const cameraLockedId = useStore((s) => s.cameraLockedId);
  const showGrid = useStore((s) => s.showGrid);
  const eventBufferRef = useRef<PhysicsEvent[]>([]);
  const waveEventBufferRef = useRef<WaveEvent[]>([]);
  const stepStateRef = useRef({ collisionOccurred: false });

  // Rendering budgets follow the chosen picture...
  const effectQuality = useMemo(
    () => environmentQualityForDevice(renderProfile),
    [renderProfile],
  );
  // ...while the fragment budget follows the hardware, because it changes how
  // many BODIES a collision creates and therefore what the simulation does.
  const physicsBudget = useMemo(() => physicsBudgetForTier(physicsTier), [physicsTier]);
  const debrisGeometry = useDebrisGeometry(effectQuality.debrisParticles);
  useEffect(() => () => {
    debrisGeometry.dispose();
  }, [debrisGeometry]);

  // Static lattice geometry for this tier's budget (utils/gridLattice.ts). The
  // disc geometry is a unit disc shared by every secondary lattice.
  const gridGeometry = useMemo(() => {
    const table = gridFrame.setBudget(effectQuality);
    return {
      primary: buildPrimaryLatticeGeometry(table),
      disc: buildDiscLatticeGeometry(effectQuality.gridDiscRings, effectQuality.gridDiscSpokes),
    };
  }, [gridFrame, effectQuality]);
  useEffect(() => () => {
    gridGeometry.primary.dispose();
    gridGeometry.disc.dispose();
  }, [gridGeometry]);
  useEffect(() => () => publishGridFrame(null), []);
  const effectIdRef = useRef(0);

  const fixedStepCallback = useCallback((bodies: CelestialBody[], dt: number) => {
    // `dt` is the step that was just integrated. Passing it makes the contact
    // test sweep the step instead of sampling its endpoint, which is what stops
    // fast close approaches tunnelling through each other undetected.
    if (scanCollisionsInPlace(
      bodies,
      eventBufferRef.current,
      waveEventBufferRef.current,
      dt,
      physicsBudget.maxFragmentsPerImpact,
    )) {
      resetVerletCache();
      stepStateRef.current.collisionOccurred = true;
    }
    const beforeEvolution = eventBufferRef.current.length;
    checkEvolutionInPlace(bodies, eventBufferRef.current);
    if (eventBufferRef.current.length !== beforeEvolution) resetVerletCache();
    return bodies;
  }, [physicsBudget.maxFragmentsPerImpact]);

  /**
   * Append an effect, evicting the oldest past the tier's concurrency cap. The
   * previous code had no cap at all, so a collision cascade could mount an
   * unbounded number of shader meshes at once.
   */
  const pushEffect = useCallback((
    kind: VisualEffectKind,
    pos: THREE.Vector3,
    startTime: number,
    scale: number,
    intensity: number,
    color: THREE.Color,
    jets = false,
  ) => {
    const list = visualEffectsRef.current;
    while (list.length >= effectQuality.maxConcurrentEffects) list.shift();
    list.push({
      id: ++effectIdRef.current,
      kind,
      pos: pos.clone(),
      startTime,
      scale: Number.isFinite(scale) && scale > 0 ? Math.min(scale, 400) : 8,
      intensity: intensity * effectQuality.effectIntensity,
      color,
      jets,
    });
  }, [effectQuality.maxConcurrentEffects, effectQuality.effectIntensity]);

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
    // Store updates are synchronous; React's frame subscription can still have
    // last render's props for one tick after pause/speed/mode changes.
    const { paused, speed, uiMode } = useStore.getState();
    // Elapsed simulated time this frame. `simElapsedForFrame` owns the mapping
    // from real seconds to sim-years (utils/simRate.ts) — the speed slider is a
    // multiplier on a base rate, not a raw years-per-second. Sign of `speed`
    // lets the user run physics in reverse for short bursts. Beginner Mode
    // consumes time more slowly; the timestep and integrator are identical.
    const simElapsed = simElapsedForFrame(Math.min(delta, 0.1), speed, uiMode, bodiesRef.current, physicsTier);

    let effectsChanged = false;
    for (let i = visualEffectsRef.current.length - 1; i >= 0; i--) {
      const fx = visualEffectsRef.current[i];
      // Per-kind lifetimes: a 1.2 s shockwave used to stay mounted and drawn for
      // a further 3.8 s after its shader had faded to nothing.
      if (currentTime - fx.startTime >= EFFECT_LIFETIME[fx.kind]) {
        visualEffectsRef.current.splice(i, 1);
        effectsChanged = true;
      }
    }

    const newEvents = eventBufferRef.current;
    newEvents.length = 0;
    waveEventBufferRef.current.length = 0;
    stepStateRef.current.collisionOccurred = false;
    let collisionOccurred = false;

    if (!paused && Math.abs(speed) > 0.01 && bodiesRef.current && bodiesRef.current.length > 0) {
      // Fixed-timestep Velocity-Verlet — deterministic regardless of frame rate.
      // Collision + evolution checks run at each fixed step so contact events
      // are not missed when the user runs at high speed multipliers.
      runFixedSteps(bodiesRef, simElapsed, fixedStepCallback, physicsTier);
      collisionOccurred = stepStateRef.current.collisionOccurred;

      if (bodiesRef.current && bodiesRef.current.length > 0) {
        const evolvedBodies = bodiesRef.current;
        bodiesRef.current = evolvedBodies;

        // Exhaustive over PhysicsEvent['type']. The previous drain only branched
        // on three of the six, so `gravitational_wave` — emitted on EVERY merger
        // — was produced with a real payload and then silently dropped, and the
        // declared `fragmentation` and `tde` types had no handler at all. Any
        // future type now trips the default rather than disappearing.
        for (let eventIndex = 0; eventIndex < newEvents.length; eventIndex++) {
          const e = newEvents[eventIndex];
          // Contact events size their effect from the contact radius, so a
          // planetary impact and a stellar merger read at their own scales.
          const contact = Number.isFinite(e.radius as number) && (e.radius ?? 0) > 0
            ? (e.radius as number)
            : 8;
          switch (e.type) {
            case 'supernova':
              gasRemnants.current.unshift({ position: e.position.clone(), age: 0 });
              gasRemnants.current.length = Math.min(gasRemnants.current.length, 2);
              pushEffect('supernova', e.position, currentTime, e.radius ?? 50, 1, _COLLAPSE_COLOR);
              effectsChanged = true;
              break;
            case 'evolution':
              pushEffect('supernova', e.position, currentTime, 30, 0.7, _COLLAPSE_COLOR);
              effectsChanged = true;
              break;
            case 'collision':
              if (e.outcome === 'accrete') {
                // Accretion flare collapses inward onto the horizon; jets only
                // where the tier can afford the two extra draw calls.
                pushEffect('accretion', e.position, currentTime, contact * 1.5, 1.2,
                  _ACCRETION_COLOR, effectQuality.jetEnabled);
              } else {
                // A merger that crosses a collapse threshold is drawn hot, on the
                // same frame the supernova that follows it is raised.
                const collapse = e.outcome === 'collapse';
                pushEffect('shockwave', e.position, currentTime, contact * 6,
                  collapse ? 2 : 1, collapse ? _COLLAPSE_COLOR : _MERGE_COLOR);
              }
              effectsChanged = true;
              break;
            case 'tde':
              // Tidal disruption: the victim is shredded outside the horizon, so
              // it gets debris as well as the accretion flare.
              pushEffect('accretion', e.position, currentTime, contact * 1.5, 1.2,
                _ACCRETION_COLOR, effectQuality.jetEnabled);
              pushEffect('debris', e.position, currentTime, contact * 4, 1, _ACCRETION_COLOR);
              effectsChanged = true;
              break;
            case 'fragmentation':
              pushEffect('debris', e.position, currentTime, contact * 5, 1.1, _DEBRIS_COLOR);
              pushEffect('shockwave', e.position, currentTime, contact * 4, 0.8, _DEBRIS_COLOR);
              effectsChanged = true;
              break;
            case 'gravitational_wave':
              // A large, slow, faint second ring trailing the merge flash.
              pushEffect('wave', e.position, currentTime, contact * 18, 0.3, _WAVE_COLOR);
              effectsChanged = true;
              break;
            default: {
              if (import.meta.env.DEV) {
                const unhandled: never = e.type;
                console.warn('[SpaceCanvas] physics event with no VFX handler:', unhandled);
              }
              break;
            }
          }
        }

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
          newEvents.length > 0;
        if (shouldSync) {
          // `syncBodiesFromPhysics` prunes the selection, the inspector target
          // and the camera lock when — and only when — that specific body no
          // longer exists. This used to deselect unconditionally on any
          // collision anywhere in the system, which closed the user's inspector
          // for an unrelated event while leaving `cameraLockedId` dangling: the
          // follow loop then looked up a dead id every frame and silently did
          // nothing, freezing the camera with no way back but re-locking.
          syncBodiesFromPhysics(evolvedBodies);
        }
      }
    }

    // The scientific step cache may have refreshed while draining this frame.
    // Publish the resulting rate fraction separately from persisted world data
    // so the control bar can explain a temporary close-encounter slowdown.
    useStore.getState().setScientificPacingScale(
      paused || Math.abs(speed) <= 0.01
        ? 1
        : simulationPacingScale(speed, uiMode, bodiesRef.current, physicsTier),
    );

    // One O(N²) parent pass + id lookup map for the whole frame (BodyMesh, overlays).
    const physicsBodies = bodiesRef.current;
    const bodyCount = physicsBodies?.length ?? 0;
    const bodyArrayChanged = physicsBodies !== lastBodyArrayRef.current;
    lastBodyArrayRef.current = physicsBodies;
    const bodyCountChanged = bodyCount !== lastBodyCountRef.current;
    if (bodyCountChanged) lastBodyCountRef.current = bodyCount;

    if (physicsBodies && physicsBodies.length > 0 && (bodyArrayChanged || bodyCountChanged || bodyByIdRef.current.size === 0 || currentTime - lastParentMapUpdateRef.current > 0.12 || collisionOccurred || newEvents.length > 0)) {
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
          const parent = body.parentId ? bodyByIdRef.current.get(body.parentId) : undefined;
          bodyRenderPosition(scratchV0, body, parent, floatingOffset.current, uiMode);
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
        bodyRenderPosition(scratchV1, target, bodyByIdRef.current.get(target.parentId ?? ''), floatingOffset.current, uiMode);
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

    // Spacetime grid. One frame of wells, anchors and LOD cores, built from
    // body state alone — never the camera, so the curvature cannot change with
    // the viewing angle — and shared with the habitable-zone disc.
    const { showGrid: gridOn, showHabitable } = useStore.getState();
    if ((gridOn || showHabitable) && physicsBodies) {
      const frame = gridFrame.update(physicsBodies, floatingOffset.current, uiMode, currentTime);
      publishGridFrame(frame);
      const primaryMat = gridPrimaryMatRef.current;
      const primaryMesh = gridPrimaryMeshRef.current;
      if (gridOn && primaryMat && primaryMesh) {
        const L = frame.layout;
        const lineLevels = effectQuality.gridLineLevels;
        // The flat far field sits at y = 0, the orbital plane; wells dip below it.
        primaryMesh.position.set(L.primaryX, 0, L.primaryZ);
        setGridBodyUniforms(primaryMat, frame, uiMode, lineLevels);
        primaryMat.uPrimaryDiscCount = L.discCount;
        primaryMat.uPrimaryDiscCenter = frame.discCenters;
        primaryMat.uPrimaryDiscRadius = frame.discRadii;
        primaryMat.uPrimaryDiscGuard = frame.discGuards;
        primaryMat.uPrimaryCoverageFloor = PRIMARY_DISC_COVERAGE_FLOOR;
        for (let j = 0; j < GRID_MAX_DISCS; j++) {
          const mesh = gridDiscMeshRefs.current[j];
          const mat = gridDiscMatRefs.current[j];
          if (!mesh || !mat) continue;
          mesh.visible = j < L.discCount;
          if (!mesh.visible) continue;
          mesh.position.set(L.discX[j], 0, L.discZ[j]);
          setGridBodyUniforms(mat, frame, uiMode, lineLevels);
          mat.uDiscU = L.discU[j];
          mat.uDiscCoreScale = L.discCoreScale[j];
          mat.uDiscCenter.set(L.discX[j], L.discZ[j]);
          mat.uDiscRadius = L.discRadius[j];
          mat.uDiscGuard = L.discGuard[j];
        }
      }
    } else {
      publishGridFrame(null);
    }

  });

  return (
    <>
      {/* The spacetime grid: a primary polar lattice riding the strongest well,
          plus up to GRID_MAX_DISCS disc lattices on other wells that need the
          resolution (utils/gridLattice.ts). Per-tier budgets live in
          environmentQualityForDevice. frustumCulled is off because the
          displacement leaves the flat geometry's bounds. */}
      {showGrid && (
        <>
          <mesh ref={gridPrimaryMeshRef} raycast={NO_RAYCAST} geometry={gridGeometry.primary} frustumCulled={false}>
            <gravityGridMaterial
              ref={gridPrimaryMatRef}
              transparent
              depthWrite={false}
              side={THREE.DoubleSide}
              uLineGain={Math.sqrt(gridVisualBoost)}
              uVisualBoost={gridVisualBoost}
            />
          </mesh>
          {Array.from({ length: GRID_MAX_DISCS }, (_, j) => (
            <mesh
              key={j}
              ref={(m: THREE.Mesh | null) => { gridDiscMeshRefs.current[j] = m; }}
              raycast={NO_RAYCAST}
              geometry={gridGeometry.disc}
              frustumCulled={false}
              visible={false}
            >
              <gravityGridMaterial
                ref={(m: any) => { gridDiscMatRefs.current[j] = m; }}
                transparent
                depthWrite={false}
                side={THREE.DoubleSide}
                uIsDisc={1}
                uLineGain={Math.sqrt(gridVisualBoost)}
                uVisualBoost={gridVisualBoost}
              />
            </mesh>
          ))}
        </>
      )}
      {/* No key on this group: React reconciles the children by effect.id
          already, and keying the wrapper forced every live effect to unmount and
          remount — resetting its refs and restarting its material — whenever any
          other effect was added or reaped. */}
      <group>
      {visualEffectsRef.current.map((effect) => (
        <VisualEffectItem
          key={effect.id}
          effect={effect}
          floatingOffset={floatingOffset}
          debrisGeometry={debrisGeometry}
          shellSegments={effectQuality.compactShellSegments}
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
  onBodyCreate: (snapshot: SimulationSnapshot, createdBody: CelestialBody) => void;
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
  const { gl, controls, camera } = useThree();
  const placementRay = useMemo(() => new THREE.Raycaster(), []);
  const placementPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, 1, 0), 21), []);
  const pointerNdc = useMemo(() => new THREE.Vector2(), []);
  const rayHit = useRef(new THREE.Vector3());
  const originWorld = useRef(new THREE.Vector3());
  const isDraggingRef = useRef(false);
  const activePointer = useRef<number | null>(null);
  const dragRef = useRef<SlingshotDragState>({
    active: false,
    originRender: new THREE.Vector3(),
    pointerRender: new THREE.Vector3(),
  });

  const readPointerOnPlane = (e: ThreeEvent<PointerEvent>) => {
    // R3F captured intersections can belong to another pointer's last raycast.
    // Project the owning pointer explicitly onto the placement plane instead.
    const rect = gl.domElement.getBoundingClientRect();
    pointerNdc.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1);
    placementRay.setFromCamera(pointerNdc, camera);
    placementRay.ray.intersectPlane(placementPlane, rayHit.current);
    rayHit.current.y = 0;
    return rayHit.current;
  };

  const endDrag = () => {
    const id = activePointer.current;
    activePointer.current = null;
    isDraggingRef.current = false;
    if (id !== null && gl.domElement.hasPointerCapture(id)) gl.domElement.releasePointerCapture(id);
    dragRef.current.active = false;
    onDragActiveChange(false);
    setOrbitControlsEnabled(controls, true);
  };

  const releasePointerCapture = (e: ThreeEvent<PointerEvent>) => {
    if (gl.domElement.hasPointerCapture(e.pointerId)) {
      gl.domElement.releasePointerCapture(e.pointerId);
    }
  };

  useEffect(() => {
    const abort = () => { if (isDraggingRef.current) endDrag(); };
    const hidden = () => { if (document.hidden) abort(); };
    window.addEventListener('blur', abort);
    document.addEventListener('visibilitychange', hidden);
    const lost = (event: PointerEvent) => { if (event.pointerId === activePointer.current) abort(); };
    gl.domElement.addEventListener('lostpointercapture', lost);
    return () => {
      window.removeEventListener('blur', abort);
      document.removeEventListener('visibilitychange', hidden);
      gl.domElement.removeEventListener('lostpointercapture', lost);
      abort();
    };
  }, [gl]);
  useEffect(() => { if (!creationMode && isDraggingRef.current) endDrag(); }, [creationMode]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    if (!creationMode || activePointer.current !== null) return;
    activePointer.current = event.pointerId;
    cancelAllBodyPointerGestures();
    event.stopPropagation();
    gl.domElement.setPointerCapture(event.pointerId);

    setOrbitControlsEnabled(controls, false);
    isDraggingRef.current = true;
    onDragActiveChange(true);

    const hit = readPointerOnPlane(event);
    dragRef.current.originRender.copy(hit);
    dragRef.current.pointerRender.copy(hit);
    dragRef.current.active = true;
    originWorld.current.copy(hit).add(floatingOffset.current);
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    if (!creationMode || !isDraggingRef.current || activePointer.current !== event.pointerId) return;
    event.stopPropagation();
    dragRef.current.pointerRender.copy(readPointerOnPlane(event));
  };

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!creationMode || !isDraggingRef.current || activePointer.current !== event.pointerId) return;
    event.stopPropagation();
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

    const snapshot = captureSimulationSnapshot(useStore.getState().bodies);

    const newBody = createSandboxBody({
      id: `created-${creationMode}-${Date.now()}`,
      type: creationMode,
      name: `${creationMode} ${number}`,
      mass: sampleMassForType(creationMode),
      position: spawnPosition,
      velocity: launchVelocity,
    });

    appendBody(newBody);
    resetVerletCache();
    const retainedTime = getSimTime();
    resetAccumulator();
    setSimTime(retainedTime);

    onBodyCreate(snapshot, newBody);
    cancelAllBodyPointerGestures();
    setCreationMode(null);
    endDrag();
  };

  const handlePointerCancel = (event: ThreeEvent<PointerEvent>) => {
    if (!creationMode || !isDraggingRef.current || activePointer.current !== event.pointerId) return;
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

const BodyMesh = React.memo(({
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
  const stellarSelectionRingRef = useRef<THREE.Mesh>(null);
  const { camera, size: viewportSize, controls } = useThree();
  const hitboxRef = useRef<THREE.Mesh>(null);
  /**
   * Only touch input needs the screen-space pick floor — a mouse is precise and
   * enlarging targets for it would only make dense systems ambiguous.
   * `detectIsTouch()` honours `?e2e=1&touch=1`, which is how the gesture spec
   * opts in. Skipped in creation mode, where the hitbox is NO_RAYCAST anyway.
   */
  const touchHitTargets = detectIsTouch() && !creationMode;
  // Narrow selector: re-renders this mesh only when the mode itself flips.
  const uiMode = useStore((s) => s.uiMode);
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

  /**
   * Beginner Mode draws bodies larger so a system reads as a system rather than
   * scattered dots. Exactly 1 in Advanced Mode. This must never be written back
   * into `data.radius`: collision detection reads the visual radius on purpose
   * (utils/physicsUtils.ts), so leaking it here would change the physics.
   */
  let visualRadius = bodyVisualRadius(data, uiMode);
  let eventHorizonScale = 1.0;


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
  // Keep the shell mounted on low tier so projected-size LOD can reveal it for
  // a close/selected body without a React render. Invisible meshes do not draw.
  const showClouds = isPlanet && cloudCover > 0.05;

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

  /**
   * Long-press interlock.
   *
   * Deliberately NOT disabled at pointerdown: OrbitControls would never see the
   * down event, so `_rotateStart` would stay unseeded and re-enabling later
   * leaves the camera dead until release — which breaks dragging the camera
   * from a body, common on a phone where a gas giant fills half the viewport.
   * Disabling only once the press has actually resolved into a long press is
   * enough, because the gesture's movement slop already cancels anything that
   * turned into a drag.
   *
   * Restores the *captured* value, never a hard `true`: AdaptiveOrbitControls
   * owns `enabled` via `!creationDragging && !isInteractingWithUI`, and forcing
   * it true would re-enable the camera mid-creation-drag.
   */
  const prevOrbitEnabledRef = useRef<boolean | null>(null);
  const pressLifecycle = useMemo(() => ({
    onLongPressStart: () => {
      prevOrbitEnabledRef.current = isOrbitControlsLike(controls) ? controls.enabled : null;
      setOrbitControlsEnabled(controls, false);
    },
    onPressEnd: () => {
      const previous = prevOrbitEnabledRef.current;
      prevOrbitEnabledRef.current = null;
      if (previous != null) setOrbitControlsEnabled(controls, previous);
    },
  }), [controls]);

  const pointerHandlers = useBodyPointerGesture(
    data.id,
    !!creationMode,
    onBodyGesture,
    pressLifecycle,
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = delta * 1.0;
    const liveBody = bodyByIdRef.current.get(data.id);
    let detailedVisual = deviceTier === 'high' || isSelected;
    if (groupRef.current && camera instanceof THREE.PerspectiveCamera) {
      const distance = Math.max(camera.position.distanceTo(groupRef.current.position), 1e-3);
      const focalPixels = viewportSize.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5));
      if (!detailedVisual) {
        detailedVisual = (visualRadius / distance) * focalPixels >= environment.quality.detailedBodyPixelRadius;
      }

      // Screen-space floor on the pick target. Hitboxes are authored in world
      // units, so a distant body is a two-pixel target for a finger. Scaling
      // the invisible mesh's Object3D leaves the geometry — and therefore
      // everything rendered — untouched. `viewportSize` is CSS pixels, which is
      // the right unit for a touch target: do not apply DPR.
      if (touchHitTargets && hitboxRef.current) {
        const baseRadius = visualRadius * HITBOX_RADIUS_FACTOR;
        const pixelRadius = (baseRadius / distance) * focalPixels;
        const scaled = baseRadius * screenSpaceHitScale(pixelRadius);
        const clamped = clampHitRadiusToCone(scaled, distance, baseRadius);
        hitboxRef.current.scale.setScalar(clamped / baseRadius);
      }
    }

    // Direction to the illuminating star, computed once: the surface, cloud
    // shell, ring plane and atmosphere all need the same vector, and they must
    // agree or the terminator, cloud shading and ring shadow drift apart.
    let sunDir = localScratch.defaultSun;
    if (liveBody) {
      const parentBody = parentMapRef.current.get(data.id);
      const starId = primaryStarIdRef.current;
      const star =
        parentBody && (parentBody.type === 'Star' || parentBody.type === 'Red Giant')
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
        if ('uQuality' in meshMaterial) meshMaterial.uQuality = detailedVisual ? 1 : 0;

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
          if (props.presetId) meshRef.current.rotation.y = getSimTime() * 8766 / (props.rotationPeriod || 24) * Math.PI * 2;
          else meshRef.current.rotation.y += spinRate * dt;
        }
      } else {
        // Stars and remnants rotate too; use their own period rather than a
        // flat rate so a fast rotator visibly spins faster than a slow one.
        spinRate = 5.0 / (props.rotationPeriod || 240.0);
        if (props.presetId) meshRef.current.rotation.y = getSimTime() * 8766 / (props.rotationPeriod || 24) * Math.PI * 2;
        else meshRef.current.rotation.y += spinRate * dt;
      }

      // Cloud parallax: the deck super-rotates relative to the surface (Venus
      // does this at ~60x), so a small excess is enough to read as depth.
      if (cloudRef.current) {
        cloudRef.current.visible = detailedVisual;
        cloudRef.current.rotation.y += (spinRate * 1.18 + 0.012) * dt;
        const cloudMat = cloudRef.current.material as any;
        if (cloudMat && typeof cloudMat === 'object') {
          if ('uTime' in cloudMat) cloudMat.uTime = t;
          if ('uQuality' in cloudMat) cloudMat.uQuality = detailedVisual ? 1 : 0;
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
        if ('uQuality' in ringMat) ringMat.uQuality = detailedVisual ? 1 : 0;
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
    if (stellarSelectionRingRef.current) {
      // RingGeometry is authored in the XY plane. Mirroring the camera's
      // quaternion keeps the marker screen-facing instead of turning it into
      // another atmosphere-like globe as the camera moves around the star.
      stellarSelectionRingRef.current.quaternion.copy(camera.quaternion);
      const pulse = environment.reducedMotion ? 1 : 1 + Math.sin(t * 3.2) * 0.035;
      stellarSelectionRingRef.current.scale.setScalar(pulse);
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
      mat.uSteps = detailedVisual ? 8 : 4;
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
      // Same helper the per-frame loop uses, so a moon does not mount at its
      // true separation and jump into the exaggerated frame one frame later.
      const parent = live.parentId ? bodyByIdRef.current.get(live.parentId) : undefined;
      bodyRenderPosition(scratchV0, live, parent, floatingOffset.current, uiMode);
      group.position.copy(scratchV0);
    }
    registerBodyObject(data.id, group);
    return () => registerBodyObject(data.id, null);
  }, [data.id, registerBodyObject, bodiesRef, bodyByIdRef, floatingOffset, uiMode, data]);

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

      {/* Invisible hitbox for forgiving tap/click body selection.
          On touch this mesh is *scaled* per frame to hold a 44px screen-space
          floor (see the useFrame above); the geometry stays at the visual size.
          Overlap between enlarged hitboxes is not a problem: R3F sorts
          intersections by distance and `onPointerDown` stops propagation, so
          only the nearest one responds. Do not remove that stopPropagation. */}
      <mesh
        ref={hitboxRef}
        userData={{ bodyId: data.id }}
        raycast={creationMode ? NO_RAYCAST : MESH_RAYCAST}
        onPointerDown={pointerHandlers.onPointerDown}
        onPointerUp={pointerHandlers.onPointerUp}
        onPointerOut={pointerHandlers.onPointerOut}
        onPointerLeave={pointerHandlers.onPointerLeave}
        onPointerCancel={pointerHandlers.onPointerCancel}
      >
        <sphereGeometry args={[visualRadius * HITBOX_RADIUS_FACTOR, hitboxSeg, hitboxSeg]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Selection marker: stellar bodies use a camera-facing ring so their
          highlight cannot be mistaken for a translucent atmosphere. */}
      {isSelected && isStar && (
        <mesh
          ref={stellarSelectionRingRef}
          name={`selection-marker:ring:${data.id}`}
          raycast={NO_RAYCAST}
          renderOrder={20}
        >
          <ringGeometry args={[visualRadius * 1.38, visualRadius * 1.5, deviceTier === 'low' ? 40 : 64]} />
          <meshBasicMaterial
            color={haloColor}
            transparent
            opacity={0.72}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            depthTest={false}
            toneMapped={false}
          />
        </mesh>
      )}
      {isSelected && !isStar && (
        <mesh ref={haloRef} name={`selection-marker:halo:${data.id}`} scale={scale} raycast={NO_RAYCAST}>
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
});

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
      minDistance={0.05}
      maxDistance={5000000}
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
  onBodyCreate: (snapshot: SimulationSnapshot, createdBody: CelestialBody) => void;
}> = ({ creationMode, setCreationMode, onBodyCreate }) => {
  // NOTE: `detectIsTouch()` is deliberately absent here. It still answers INPUT
  // questions (hit-target sizing at L1938, creation-drag scale at L659), but it
  // no longer chooses render budgets: a user asking for maximum graphics on a
  // phone is not asking for a lower-resolution scene, and keying quality off
  // touch is what made desktop parity unreachable on mobile.
  const detectedTier = useDeviceTier();
  const e2eConfig = getE2EConfig();
  const storedGraphicsMode = useStore((s) => s.graphicsMode);
  const graphicsMode = e2eConfig.graphics ?? storedGraphicsMode;
  /**
   * The HARDWARE tier. Refined once by the WebGL-limits probe and never by
   * frame timing or by the user's graphics mode. This is the only value allowed
   * to reach the integrator (`physicsStepPolicy`), so the simulation is
   * identical whichever picture the user asked for.
   */
  const [physicsTier, setPhysicsTier] = useState<DeviceTier>(detectedTier);
  /**
   * Auto's live verdict. Seeded from hardware, then earned by frame timing.
   * Kept in the store rather than locally so the settings panel can show which
   * profile Auto has actually settled on.
   */
  const autoProfile = useStore((s) => s.autoRenderProfile);
  const setAutoProfile = useStore((s) => s.setAutoRenderProfile);
  const [creationDragging, setCreationDragging] = useState(false);
  const [gpuEffectsOk, setGpuEffectsOk] = useState(true);
  const [glEpoch, setGlEpoch] = useState(0);
  const gasRemnants = useRef<GasRemnant[]>([]);

  const renderProfile: RenderProfile = !gpuEffectsOk
    ? 'performance'
    : e2eConfig.tier
      ? profileForTier(e2eConfig.tier)
      : resolveRenderProfile(graphicsMode, autoProfile);

  /**
   * `antialias` and `powerPreference` are context-CREATION attributes, so
   * changing them tears down and rebuilds the WebGL context. That is acceptable
   * when the user taps a mode themselves; it is not acceptable as a spontaneous
   * mid-simulation black flash. So the context follows the user's EXPLICIT
   * choice only — in Auto it stays pinned to the hardware seed and the auto
   * controller never triggers a teardown.
   *
   * The cost is small: post-processing renders the scene into its own
   * framebuffer with `multisampling={0}`, so the context's MSAA flag barely
   * reaches the composited image. `powerPreference` is the attribute that
   * actually matters here.
   */
  const contextProfile: RenderProfile = e2eConfig.tier
    ? profileForTier(e2eConfig.tier)
    : graphicsMode === 'auto'
      ? profileForTier(detectedTier)
      : renderProfile;

  /** Survives the context rebuild above; see `CameraPoseBridge`. */
  const cameraPoseRef = useRef<CameraPose | null>(null);

  /** The legacy tier axis, for render call sites still written in those terms. */
  const renderTier = renderTierFor(renderProfile);

  const canvasDpr: [number, number] = e2eConfig.dpr != null
    ? [e2eConfig.dpr, e2eConfig.dpr]
    : renderProfile === 'performance' ? [1, 1.5] : [1, 2];
  const renderQuality = useMemo(
    () => environmentQualityForDevice(renderProfile),
    [renderProfile],
  );
  const handleHardwareTier = useCallback((tier: DeviceTier) => {
    if (!e2eConfig.tier) setPhysicsTier(tier);
  }, [e2eConfig.tier]);
  const handleAutoProfile = useCallback((profile: RenderProfile) => {
    setAutoProfile(profile);
  }, [setAutoProfile]);

  // Seed Auto from the hardware guess before the controller has spoken, so the
  // first frames are not spent on the wrong profile.
  useEffect(() => {
    if (graphicsMode === 'auto') setAutoProfile(profileForTier(physicsTier));
    // Only on a hardware-tier refinement, never on the controller's own verdict.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [physicsTier]);

  useEffect(() => {
    setTestBridgeGraphics(renderTierFor(renderProfile), renderProfile, graphicsMode, physicsTier);
  }, [renderProfile, graphicsMode, physicsTier]);
  const exposure = exposureForTier(renderProfile);
  const gridVisualBoost = gridVisualBoostForDevice(gpuEffectsOk);
  const bodiesRef = useRef<CelestialBody[]>([]);
  const creationDragActiveRef = useRef(false);
  const floatingOffset = useRef(new THREE.Vector3(0, 0, 0));
  const bodyObjectsRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const parentMapRef = useRef<Map<string, CelestialBody | null>>(new Map());
  const bodyByIdRef = useRef<Map<string, CelestialBody>>(new Map());
  const primaryStarIdRef = useRef<string | null>(null);
  const bodies = useStore((s) => s.bodies);
  const selectedId = useStore((s) => s.selectedId);
  const selectBody = useStore((s) => s.selectBody);
  const closeInspector = useStore((s) => s.closeInspector);
  const showDust = useStore((s) => s.showDust);
  const showStability = useStore((s) => s.showStability);
  const showOrbitPaths = useStore((s) => s.showOrbitPaths);

  const isInteractingWithUI = useStore((s) => s.isInteractingWithUI);

  const handleCreationDragChange = React.useCallback((active: boolean) => {
    creationDragActiveRef.current = active;
    setCreationDragging(active);
  }, []);

  // Moon mode is not a throw: the slingshot plane stays off and body hitboxes
  // stay pickable, because picking a parent is how the moon flow starts.
  const launchMode = creationMode === 'Moon' ? null : creationMode;

  // Shared with the outliner so the two selection surfaces cannot drift apart.
  const selectionGesture = useBodySelectionGesture();
  const moonModeRef = useRef(false);
  moonModeRef.current = creationMode === 'Moon';
  // One stable callback for every (memoised) BodyMesh, so entering Moon mode
  // does not re-render them all. In Moon mode a tap — or a hold, which must not
  // open the inspector over the moon sheet — picks the moon's parent.
  const handleBodyGesture = useCallback((id: string, kind: BodyGestureKind) => {
    if (moonModeRef.current) {
      pickMoonParent(id);
      return;
    }
    selectionGesture(id, kind);
  }, [selectionGesture]);

  const handleCanvasPointerMissed = React.useCallback(() => {
    // A press that began on a body owns its own release. Bodies move every
    // physics frame, so the finger often lifts over empty space — which used to
    // land here and clear the selection and inspector the press had just
    // opened. This guard has to run *before* the cancel below, which was
    // itself destroying the gesture that was mid-dispatch.
    if (hasActiveBodyPointerGesture() || wasBodyGestureJustReleased()) return;
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

  useLayoutEffect(() => {
    // Seed only on mount. Store actions update the registered live world synchronously.
    bodiesRef.current = sanitizeCelestialBodies(useStore.getState().bodies.map(clonePhysicsBody));
    resetVerletCache();
    registerPhysicsBodiesRef(bodiesRef);
    return () => unregisterPhysicsBodiesRef(bodiesRef);
  }, []);

  useEffect(() => {
    registerRenderObjects(bodyObjectsRef, floatingOffset);
    return () => unregisterRenderObjects(bodyObjectsRef);
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

  // BodyMesh's mount/unmount is the *only* writer of this registry. PhysicsEngine
  // reads it every frame to place the meshes, so anything else emptying it (a
  // camera snap used to) silently freezes every body on screen.
  const registerBodyObject = React.useCallback((bodyId: string, obj: THREE.Object3D | null) => {
    if (obj) {
      bodyObjectsRef.current.set(bodyId, obj);
    } else {
      bodyObjectsRef.current.delete(bodyId);
    }
  }, []);

  return (
    <div
      data-testid="sim-canvas"
      className="absolute inset-0"
      /* Android WebView's own ~500ms hold opens a text-selection callout and
         emits a pointercancel that silently killed our long press. Bound on
         this wrapper rather than gl.domElement so it needs no {passive:false}
         native listener and survives the key={glEpoch} canvas remount on
         context loss. The canvas has no context menu of its own to lose. */
      onContextMenu={(e) => e.preventDefault()}
    >
    <Canvas
      key={`${glEpoch}:${contextProfile}`}
      dpr={canvasDpr}
      style={{ touchAction: 'none', width: '100%', height: '100%' }}
      camera={{ position: [0, 150, 250], fov: 45, near: 0.001, far: 100000000 }}
      gl={{
        logarithmicDepthBuffer: true,
        // Keyed on the PROFILE, not on touch. A phone set to Quality gets the
        // same context attributes desktop does, which is what makes Quality on
        // mobile the desktop path rather than merely a closer approximation.
        antialias: contextProfile === 'quality',
        powerPreference: contextProfile === 'quality' ? 'high-performance' : 'low-power',
      } as any}
      onPointerMissed={handleCanvasPointerMissed}
    >
      {!e2eConfig.tier && (
        <DeviceCapabilityProbe
          initialTier={detectedTier}
          onHardwareTier={handleHardwareTier}
          // Frame-time observation runs only in Auto. An explicit choice is the
          // user's to keep, even on a device that cannot sustain it.
          onProfileChange={graphicsMode === 'auto' ? handleAutoProfile : undefined}
        />
      )}
      <CameraPoseBridge store={cameraPoseRef} />
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
      <EnvironmentProvider profile={renderProfile}>
      <BlackHoleLensCapture
        enabled={hasBlackHole && gpuEffectsOk}
        resolution={renderQuality.blackHoleCaptureResolution}
        captureInterval={renderQuality.blackHoleCaptureInterval}
      >
        <color attach="background" args={['#050505']} />
        <ambientLight intensity={0.06} />
        <directionalLight position={[100, 100, 100]} intensity={0.35} />
        <Stars
          radius={300}
          depth={50}
          count={renderProfile === 'quality' ? 5000 : 3500}
          factor={4}
          saturation={0}
          fade
          speed={1}
        />
        <CameraRecenter floatingOffset={floatingOffset} />
        <CameraFlyTo floatingOffset={floatingOffset} />
        {isE2EMode() && <TestMetricsCollector />}
        <PhysicsEngine
          bodiesRef={bodiesRef}
          floatingOffset={floatingOffset}
          bodyObjectsRef={bodyObjectsRef}
          parentMapRef={parentMapRef}
          bodyByIdRef={bodyByIdRef}
          primaryStarIdRef={primaryStarIdRef}
          physicsTier={physicsTier}
          renderProfile={renderProfile}
          gridVisualBoost={gridVisualBoost}
          creationDragActiveRef={creationDragActiveRef}
          gasRemnants={gasRemnants}
        />
        <DevPhysicsDiagnostics bodiesRef={bodiesRef} />
        <GasClouds bodiesRef={bodiesRef} floatingOffset={floatingOffset} remnants={gasRemnants} />
        {showDust && <DecorativeDust floatingOffset={floatingOffset} />}
        {showOrbitPaths && <OrbitPaths bodiesRef={bodiesRef} floatingOffset={floatingOffset} parentMapRef={parentMapRef} />}
        <ObjectCreator
          creationMode={launchMode}
          setCreationMode={setCreationMode}
          onBodyCreate={onBodyCreate}
          floatingOffset={floatingOffset}
          onDragActiveChange={handleCreationDragChange}
        />
        {creationMode === 'Moon' && (
          <MoonCreator
            bodiesRef={bodiesRef}
            floatingOffset={floatingOffset}
            onDragActiveChange={handleCreationDragChange}
            deviceTier={renderTier}
          />
        )}
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
              creationMode={launchMode}
              floatingOffset={floatingOffset}
              isSelected={selectedId === body.id}
              bodiesRef={bodiesRef}
              parentMapRef={parentMapRef}
              bodyByIdRef={bodyByIdRef}
              primaryStarIdRef={primaryStarIdRef}
              registerBodyObject={registerBodyObject}
              deviceTier={renderTier}
            />
          ))}
          {habitableZoneStars.map((star: CelestialBody) => (
            <HabitableZoneVisual key={`hz-${star.id}`} star={star} floatingOffset={floatingOffset} />
          ))}
        </group>
        <RadiationEffects bodiesRef={bodiesRef} floatingOffset={floatingOffset} />
        <AdaptiveOrbitControls enabled={!creationDragging && !isInteractingWithUI} />
        {gpuEffectsOk && <AdaptivePostFX profile={renderProfile} />}
      </BlackHoleLensCapture>
      </EnvironmentProvider>
    </Canvas>
    {/* The orbit-estimate toggle used to float here over the canvas. It now
        lives in the settings sheet (components/SettingsPanel.tsx) with the rest
        of the display options, backed by `showOrbitPaths` in the store. */}
    </div>
  );
};

export default SpaceCanvas;
