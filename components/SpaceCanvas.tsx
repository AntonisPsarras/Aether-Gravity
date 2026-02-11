
import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree, extend, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Stars, shaderMaterial, Html } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { CelestialBody, BodyType, WaveEvent, PhysicsEvent } from '../types';
import { calculateGravity, checkCollisions, checkEvolution, calculateStabilityMetrics, findDominantParent } from '../utils/physicsUtils';
import { DUST_CONFIG, TEXTURE_IDS, G_CONSTANT, BODY_CONFIGS } from '../constants';
import GPGPUPhysics from './Physics/GPGPUPhysics';
import './Planet/PlanetShaders';
import { useStore } from '../utils/store';
import HabitableZoneVisual from './HabitableZoneVisual';

// --- BASIC SHADERS (Lightweight) ---

const GravityGridMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color(0.1, 0.1, 0.1),
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
  vec3 baseColor = uColor;
  vec3 tidalColor = vec3(0.0, 0.2, 0.4) * vTidalMagnitude * 0.2;
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
  float totalAlpha = max(lineAlpha * 0.4, habAlpha) * fade;
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

extend({ GravityGridMaterial, ShockwaveMaterial, SupernovaMaterial });

const DustSystem = ({ paused, floatingOffset }: { paused: boolean, floatingOffset: React.MutableRefObject<THREE.Vector3> }) => {
  const count = DUST_CONFIG.COUNT;
  const positions = useMemo(() => new Float32Array(count * 3), [count]);
  const colors = useMemo(() => new Float32Array(count * 3), [count]);
  const velocitiesRef = useRef(new Float32Array(count * 3));
  const pointsRef = useRef<THREE.Points>(null);
  const lastOffset = useRef(new THREE.Vector3().copy(floatingOffset.current));
  const { camera } = useThree();
  const bodies = useStore.getState().bodies; // Direct access for dust gravity

  useEffect(() => {
    const velocities = velocitiesRef.current;
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * DUST_CONFIG.AREA;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 2] = (Math.random() - 0.5) * DUST_CONFIG.AREA;
      velocities[i * 3] = (Math.random() - 0.5) * 0.2;
      velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.05;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
      colors[i * 3] = 1; colors[i * 3 + 1] = 1; colors[i * 3 + 2] = 1;
    }
  }, [count, positions, colors]);

  useFrame((state, delta) => {
    if (!pointsRef.current) return;
    if (floatingOffset.current.distanceToSquared(lastOffset.current) > 0.001) {
      const shift = new THREE.Vector3().copy(floatingOffset.current).sub(lastOffset.current);
      for (let i = 0; i < count; i++) {
        positions[i * 3] -= shift.x; positions[i * 3 + 1] -= shift.y; positions[i * 3 + 2] -= shift.z;
      }
      lastOffset.current.copy(floatingOffset.current);
    }
    if (paused) { pointsRef.current.geometry.attributes.position.needsUpdate = true; return; }

    const dt = Math.min(delta, 0.05);
    const velocities = velocitiesRef.current;
    const range = DUST_CONFIG.AREA / 2;
    const cx = camera.position.x;
    const cz = camera.position.z;

    // We grab bodies directly from store ref to avoid re-render loop, 
    // or pass them in. passing in is cleaner for React, but dust is decorative.
    const currentBodies = useStore.getState().bodies;

    for (let i = 0; i < count; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;
      let px = positions[ix], py = positions[iy], pz = positions[iz];

      if (px > cx + range) positions[ix] -= range * 2;
      if (px < cx - range) positions[ix] += range * 2;
      if (pz > cz + range) positions[iz] -= range * 2;
      if (pz < cz - range) positions[iz] += range * 2;

      let ax = 0, ay = 0, az = 0;
      for (const body of currentBodies) {
        if (!body || !body.position) continue;
        const bodyRenderPos = body.position.clone().sub(floatingOffset.current);
        const dx = bodyRenderPos.x - px, dy = bodyRenderPos.y - py, dz = bodyRenderPos.z - pz;
        const distSq = dx * dx + dy * dy + dz * dz + 0.1;
        const f = (G_CONSTANT * body.mass * 0.01) / distSq;
        const d = Math.sqrt(distSq);
        ax += (dx / d) * f; ay += (dy / d) * f; az += (dz / d) * f;
      }

      velocities[ix] += ax * dt; velocities[iy] += ay * dt; velocities[iz] += az * dt;
      positions[ix] += velocities[ix] * dt * 20; positions[iy] += velocities[iy] * dt * 20; positions[iz] += velocities[iz] * dt * 20;
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true;
  });

  return <points ref={pointsRef}><bufferGeometry><bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} /><bufferAttribute attach="attributes-color" count={count} array={colors} itemSize={3} /></bufferGeometry><pointsMaterial vertexColors size={0.8} transparent opacity={0.6} blending={THREE.AdditiveBlending} /></points>;
};

const StabilityOverlay = ({ floatingOffset }: any) => {
  const groupRef = useRef<THREE.Group>(null);
  const [zones, setZones] = useState<{ roche: number, hill: number, pos: THREE.Vector3 } | null>(null);
  const { selectedId, bodies } = useStore();

  useFrame(() => {
    if (!selectedId || !bodies) {
      setZones(null);
      return;
    }

    const body = bodies.find((b: CelestialBody) => b.id === selectedId);
    if (!body) {
      setZones(null);
      return;
    }

    const parent = findDominantParent(body, bodies);
    const metrics = calculateStabilityMetrics(body, parent);

    if (groupRef.current) {
      groupRef.current.position.copy(body.position.clone().sub(floatingOffset.current));
    }

    if (metrics.hill > 0 || metrics.roche > 0) {
      setZones({ roche: metrics.roche, hill: metrics.hill, pos: body.position });
    } else {
      setZones(null);
    }
  });

  if (!zones) return null;

  return (
    <group ref={groupRef}>
      {zones.hill > 0 && (
        <mesh>
          <sphereGeometry args={[zones.hill, 32, 32]} />
          <meshBasicMaterial color="#4ade80" transparent opacity={0.1} wireframe={true} />
        </mesh>
      )}
      {zones.roche > 0 && (
        <mesh>
          <sphereGeometry args={[zones.roche, 32, 32]} />
          <meshBasicMaterial color="#f43f5e" transparent opacity={0.15} wireframe={true} />
        </mesh>
      )}
    </group>
  );
};

const PhysicsEngine = ({ bodiesRef, floatingOffset }: any) => {
  const gridMatRef = useRef<any>(null);
  const gridMeshRef = useRef<THREE.Mesh>(null);
  const [visualEffects, setVisualEffects] = useState<{ id: number, type: string, pos: THREE.Vector3, startTime: number }[]>([]);
  const { camera, controls, clock, scene } = useThree();
  const shaderData = useMemo(() => ({ positions: new Float32Array(50 * 3), masses: new Float32Array(50), radii: new Float32Array(50), types: new Float32Array(50) }), []);

  const { bodies, setBodies, paused, speed, selectBody, cameraLockedId, showGrid, showHabitable } = useStore();

  // Sync ref with store
  useEffect(() => {
    bodiesRef.current = bodies.map(b => ({ ...b, position: b.position.clone(), velocity: b.velocity.clone() }));
  }, [bodies]); // Only sync when bodies change structure/count, or heavy updates. 
  // Actually, for N-body we need persistent ref state that survives renders.
  // The 'bodies' in store is the "Save State" / "UI State".
  // 'bodiesRef' is the "Physics State".
  // We need to write back to store occasionally.

  useFrame((state, delta) => {
    if (camera.position.length() > 50000) {
      const shift = camera.position.clone();
      floatingOffset.current.add(shift);
      camera.position.sub(shift);
      (controls as any).target.sub(shift);
    }
    const currentTime = state.clock.getElapsedTime();
    const dt = (Math.min(delta, 0.1) * speed) / 8;
    setVisualEffects(prev => prev.filter(v => currentTime - v.startTime < 5.0));

    if (!paused && Math.abs(speed) > 0.01 && bodiesRef.current && bodiesRef.current.length > 0) {
      let activeBodies = bodiesRef.current;
      let collisionOccurred = false;
      const newEvents: PhysicsEvent[] = [];
      for (let i = 0; i < 8; i++) {
        if (!activeBodies || activeBodies.length === 0) break;
        activeBodies = calculateGravity(activeBodies, dt);
        const colResult = checkCollisions(activeBodies, currentTime);
        if (colResult.events.length > 0) newEvents.push(...colResult.events);
        if (colResult.merged) { activeBodies = colResult.active; collisionOccurred = true; break; }
      }
      if (activeBodies) {
        const { bodies: evolvedBodies, events: evoEvents } = checkEvolution(activeBodies);
        if (evoEvents.length > 0) newEvents.push(...evoEvents);
        newEvents.forEach(e => {
          if (e.type === 'evolution' || e.type === 'collision' || e.type === 'supernova') setVisualEffects(prev => [...prev, { id: Math.random(), type: e.type === 'collision' ? 'shockwave' : 'supernova', pos: e.position.clone(), startTime: currentTime }]);
        });
        bodiesRef.current = evolvedBodies;

        // Sync back to UI at 60fps might be too heavy if deep comparison, but simple set is okayish.
        // Better: Sync every 10 frames or on pause?
        // For smooth "Orbit" UI updates, we need frequent sync.
        if (state.clock.getElapsedTime() % 1.0 < 0.05 || collisionOccurred || newEvents.length > 0) {
          // We pass a function to avoid clobbering other updates? 
          // Actually just overwriting with physics state is correct.
          setBodies(evolvedBodies);
          if (collisionOccurred) selectBody(null);
        }
      }
    }

    scene.traverse((obj) => {
      if (obj.userData && obj.userData.bodyId && bodiesRef.current) {
        const body = bodiesRef.current.find((b: any) => b && b.id === obj.userData.bodyId);
        if (body && body.position) obj.position.copy(body.position).sub(floatingOffset.current);
      }
    });

    if (cameraLockedId && bodiesRef.current) {
      const target = bodiesRef.current.find((b: any) => b && b.id === cameraLockedId);
      if (target) {
        const ctrl = controls as any;
        const targetRenderPos = target.position.clone().sub(floatingOffset.current);
        const offset = camera.position.clone().sub(ctrl.target);
        if (targetRenderPos.x !== targetRenderPos.x) return; // NaN check
        ctrl.target.lerp(targetRenderPos, 0.1);
        camera.position.lerp(ctrl.target.clone().add(offset), 0.1);
        ctrl.update();
      }
    }

    if (gridMeshRef.current) {
      gridMeshRef.current.position.set(camera.position.x, -20, camera.position.z);
    }

    if (showGrid && gridMatRef.current && bodiesRef.current) {
      let count = 0;
      bodiesRef.current.slice(0, 50).forEach((b: any, i: number) => {
        const renderPos = b.position.clone().sub(floatingOffset.current);
        shaderData.positions[i * 3] = renderPos.x; shaderData.positions[i * 3 + 1] = renderPos.y; shaderData.positions[i * 3 + 2] = renderPos.z;
        shaderData.masses[i] = b.mass; shaderData.radii[i] = b.radius;
        shaderData.types[i] = b.type === 'Black Hole' ? 1.0 : (['Star', 'Red Giant'].includes(b.type) ? 2.0 : 0.0);
        count++;
      });
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
      {showGrid && <mesh ref={gridMeshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -20, 0]}><planeGeometry args={[5000, 5000, 400, 400]} /><gravityGridMaterial ref={gridMatRef} transparent depthWrite={false} side={THREE.DoubleSide} logarithmicDepthBuffer={true} /></mesh>}
      {visualEffects.map(effect => {
        const t = clock.getElapsedTime() - effect.startTime;
        return <group key={effect.id} position={effect.pos.clone().sub(floatingOffset.current)}>{effect.type === 'shockwave' ? <mesh rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[1, 20, 64]} /><shockwaveMaterial transparent uColor={new THREE.Color(1, 1, 1)} uTime={t} logarithmicDepthBuffer={true} /></mesh> : <mesh><sphereGeometry args={[20, 32, 32]} /><supernovaMaterial transparent uColor={new THREE.Color(1, 0.8, 0.4)} uTime={t} logarithmicDepthBuffer={true} /></mesh>}</group>;
      })}
    </>
  );
};

const ObjectCreator = ({ creationMode, setCreationMode, onBodyCreate, floatingOffset }: any) => {
  const [dragStart, setDragStart] = useState<THREE.Vector3 | null>(null);
  const [dragEnd, setDragEnd] = useState<THREE.Vector3 | null>(null);
  const { setBodies } = useStore();

  const getPos = (e: ThreeEvent<PointerEvent>) => new THREE.Vector3(e.point.x, 0, e.point.z);

  const handlePointerUp = (event: ThreeEvent<PointerEvent>) => {
    if (!creationMode || !dragStart) return;
    event.stopPropagation();
    const worldPos = getPos(event);
    if (dragStart.distanceTo(worldPos) > 2.0) {
      const absPos = dragStart.clone().add(floatingOffset.current);
      const config = (BODY_CONFIGS as any)[creationMode] || BODY_CONFIGS['Planet'];
      const velocity = dragStart.clone().sub(worldPos).multiplyScalar(0.15);
      const getNextNumber = useStore.getState().getNextNumber;
      const number = getNextNumber(creationMode);

      const newBody: CelestialBody = {
        id: `created-${creationMode}-${Date.now()}`, type: creationMode, position: absPos, velocity,
        mass: config.massRange[0] + Math.random() * (config.massRange[1] - config.massRange[0]),
        radius: config.radiusRange[0] + Math.random() * (config.radiusRange[1] - config.radiusRange[0]),
        color: config.defaultColor, temperature: 300, habitability: 'N/A', population: 0,
        name: `${creationMode} ${number}`,
        texture: config.visualType === 'rocky' ? 'rock' : 'solid', trailColor: config.defaultColor,
        properties: { rotationPeriod: 24.0, isTidallyLocked: false }
      };
      setBodies(prev => [...prev, newBody]);
      onBodyCreate();
    }
    setDragStart(null); setDragEnd(null); setCreationMode(null);
  };

  const ArrowHelper = () => {
    if (!dragStart || !dragEnd) return null;
    // Arrow shows LAUNCH direction (opposite of drag direction)
    const dragVector = new THREE.Vector3().subVectors(dragEnd, dragStart);
    const launchDirection = dragVector.clone().negate(); // Reverse for launch direction
    const length = launchDirection.length();
    if (length < 0.1) return null;
    const dummy = new THREE.Object3D();
    dummy.position.copy(dragStart);
    dummy.lookAt(dragStart.clone().add(launchDirection));

    return (
      <group position={dragStart} quaternion={dummy.quaternion}>
        <group rotation={[Math.PI / 2, 0, 0]}>
          <mesh position={[0, length / 2, 0]}><cylinderGeometry args={[0.5, 0.5, length, 8]} /><meshBasicMaterial color="#00ffff" opacity={0.6} transparent depthTest={false} /></mesh>
          <mesh position={[0, length, 0]}><coneGeometry args={[1.5, 3.0, 12]} /><meshBasicMaterial color="#00ffff" opacity={0.8} transparent depthTest={false} /></mesh>
        </group>
      </group>
    )
  }

  return (
    <group>
      {creationMode && dragStart && dragEnd && <ArrowHelper />}
      <mesh position={[0, -21, 0]} rotation={[-Math.PI / 2, 0, 0]} onPointerDown={(e) => { if (creationMode) { e.stopPropagation(); setDragStart(getPos(e)); setDragEnd(getPos(e)); } }} onPointerMove={(e) => { if (creationMode && dragStart) setDragEnd(getPos(e)); }} onPointerUp={handlePointerUp} visible={false}>
        <planeGeometry args={[500000, 500000]} /><meshBasicMaterial transparent opacity={0} />
      </mesh>
    </group>
  );
};

const BodyMesh = ({ data, onSelect, creationMode, floatingOffset, isSelected, bodiesRef }: any) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const atmosphereRef = useRef<THREE.Mesh>(null);
  const diskRef = useRef<any>(null);
  const jetsRef = useRef<THREE.Group>(null);
  const ergosphereRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const isPlanet = ['Planet', 'Dwarf', 'Ice Giant'].includes(data.type);
  const isStar = ['Star', 'Red Giant'].includes(data.type);
  const isBlackHole = data.type === 'Black Hole';
  const isNeutronStar = data.type === 'Neutron Star';

  const props = data.properties || {};

  let visualRadius = data.radius;
  let eventHorizonScale = 1.0;

  if (isPlanet) visualRadius = data.radius * 1.35;
  if (isNeutronStar) visualRadius = Math.max(data.radius * 5.0, 3.0);

  if (isBlackHole) {
    const spin = props.spinParameter || 0;
    eventHorizonScale = (1.0 + Math.sqrt(1.0 - spin * spin)) * 0.5;
  }

  // Calculate Oblateness Factor
  // f = 5/4 * (omega^2 * R^3) / (GM)
  // Scaling constants tuned for game visuals
  let oblateness = 0.0;
  if (isStar && props.oblateness !== undefined) {
    oblateness = props.oblateness;
  } else if (isPlanet) {
    const rotPeriod = Math.max(0.1, props.rotationPeriod || 24.0);
    const omega = (2 * Math.PI) / rotPeriod;
    // G ~ 0.8. Mass ~ 10-100. Radius ~ 3. 
    // Constants tuned to produce visible effect for fast spinners
    const term = (omega * omega * Math.pow(data.radius, 3)) / (0.8 * data.mass);
    oblateness = (5.0 / 4.0) * term * 0.05;
    oblateness = Math.min(oblateness, 0.6); // Cap deformation
  }

  // Black Hole scaling handled via transform, others via vertex shader
  const scale = new THREE.Vector3(1, 1, 1);
  if (isBlackHole) {
    scale.set(eventHorizonScale, eventHorizonScale, eventHorizonScale);
  }

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = delta * 1.0;

    if (meshRef.current) {
      (meshRef.current.material as any).uTime = t;
      if (isPlanet && bodiesRef.current) {
        if (props.isTidallyLocked) {
          const parent = findDominantParent(data, bodiesRef.current);
          if (parent) {
            const relPos = parent.position.clone().sub(data.position);
            const angle = Math.atan2(relPos.x, relPos.z);
            meshRef.current.rotation.y = angle;
          }
        } else {
          const rotationSpeed = 5.0 / (props.rotationPeriod || 24.0);
          meshRef.current.rotation.y += rotationSpeed * dt;
        }
      } else {
        meshRef.current.rotation.y += 0.05 * dt;
      }
    }

    if (haloRef.current) (haloRef.current.material as any).uTime = t;
    if (diskRef.current) (diskRef.current.material as any).uTime = t;
    if (ergosphereRef.current) {
      (ergosphereRef.current.material as any).uTime = t;
      (ergosphereRef.current.material as any).uSpin = props.spinParameter || 0;
    }
    if (jetsRef.current) {
      jetsRef.current.rotation.y += 20.0 * dt;
      jetsRef.current.children.forEach((child: any) => {
        if (child.material) child.material.uTime = t;
      });
    }
    if (atmosphereRef.current) {
      const mat = atmosphereRef.current.material as any;
      if (bodiesRef.current) {
        const parent = findDominantParent(data, bodiesRef.current);
        if (parent) {
          const sunDir = parent.position.clone().sub(data.position).normalize();
          mat.uSunDirection = sunDir;
        } else {
          mat.uSunDirection = new THREE.Vector3(1, 0.5, 0.5).normalize();
        }
      }
      mat.uViewVector = camera.position;

      // Use physics ref for smooth center sync
      if (bodiesRef.current) {
        const body = bodiesRef.current.find((b: any) => b && b.id === data.id);
        if (body && body.position) {
          mat.uPlanetCenter = body.position.clone().sub(floatingOffset.current);
        } else {
          mat.uPlanetCenter = data.position.clone().sub(floatingOffset.current);
        }
      } else {
        mat.uPlanetCenter = data.position.clone().sub(floatingOffset.current);
      }

      mat.uOblateness = oblateness; // Sync atmosphere shape
    }
  });

  const atmosRadius = visualRadius * 1.35;

  return (
    <group userData={{ bodyId: data.id }} position={data.position.clone().sub(floatingOffset.current)}>
      <mesh ref={meshRef} onPointerDown={(e) => { e.stopPropagation(); if (!creationMode) onSelect(data.id); }} frustumCulled={!isBlackHole} scale={scale}>
        <sphereGeometry args={[visualRadius, 64, 64]} />
        {isStar ?
          <starSurfaceMaterial uColor={new THREE.Color(data.color)} uSpeed={1.0} uTemperature={data.temperature} uMetallicity={props.metallicity || 0} uConvection={props.convectionScale || 5} uPulsation={props.pulsationSpeed || 0} uLuminosityClass={props.luminosityClass || 0} uFlareActivity={props.flareActivity || 0} uMagnetic={props.magneticIndex || 0} uOblateness={oblateness} logarithmicDepthBuffer={true} /> :
          (isBlackHole ?
            <kerrEventHorizonMaterial uColor={new THREE.Color(0, 0, 0)} uRimColor={new THREE.Color(1.0, 0.4, 0.1)} uMass={data.mass} logarithmicDepthBuffer={true} /> :
            (isNeutronStar ?
              <neutronStarMaterial uColor={new THREE.Color(0.2, 0.5, 1.0)} uMagneticField={1.0} uMass={data.mass} uRadius={data.radius} logarithmicDepthBuffer={true} /> :
              <planetSurfaceMaterial uColor1={new THREE.Color(data.color)} uColor2={new THREE.Color(data.color).multiplyScalar(0.5)} uType={TEXTURE_IDS[data.texture] || 0} uTectonics={props.tectonics || 0} uAtmosphere={props.atmosphere || 0} uWaterLevel={props.waterLevel || 0.5} uMethane={props.methane || 0} uCloudDepth={props.cloudDepth || 0} uAxialTilt={props.axialTilt || 0} uTemperature={data.temperature} uRadius={visualRadius} uOblateness={oblateness} uMass={data.mass} logarithmicDepthBuffer={true} />
            )
          )
        }
      </mesh>

      {/* Invisible Hitbox for easier selection */}
      <mesh onPointerDown={(e) => { e.stopPropagation(); if (!creationMode) onSelect(data.id); }}>
        <sphereGeometry args={[visualRadius * 1.5, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* Selection Halo */}
      {isSelected && (
        <mesh ref={haloRef} scale={scale}>
          <sphereGeometry args={[visualRadius * (isBlackHole ? 1.5 : 1.3), 32, 32]} />
          <selectionHaloMaterial transparent side={THREE.FrontSide} blending={THREE.AdditiveBlending} depthWrite={false} uColor={new THREE.Color(data.color)} />
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

      {isBlackHole && (props.spinParameter || 0) > 0.05 && (
        <mesh ref={ergosphereRef} rotation={[0, 0, 0]}>
          <sphereGeometry args={[visualRadius, 64, 64]} />
          <ergosphereMaterial transparent blending={THREE.AdditiveBlending} side={THREE.DoubleSide} uColor={new THREE.Color(0.2, 0.4, 1.0)} logarithmicDepthBuffer={true} />
        </mesh>
      )}
      {isBlackHole && (
        <mesh ref={diskRef} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[visualRadius * 1.5, visualRadius * 8, 64, 8]} />
          <relativisticDiskMaterial transparent side={THREE.DoubleSide} uColorInner={new THREE.Color(1.0, 0.8, 0.2)} uColorOuter={new THREE.Color(0.6, 0.1, 0.05)} uAccretionRate={props.accretionRate ?? 0.5} uMass={data.mass} logarithmicDepthBuffer={true} />
        </mesh>
      )}
      {isNeutronStar && (
        <group ref={jetsRef}>
          <mesh position={[0, visualRadius * 6, 0]}><coneGeometry args={[visualRadius * 0.5, visualRadius * 12, 16, 4, true]} /><pulsarJetMaterial transparent side={THREE.DoubleSide} uColor={new THREE.Color(0.5, 0.0, 1.0)} blending={THREE.AdditiveBlending} logarithmicDepthBuffer={true} /></mesh>
          <mesh position={[0, -visualRadius * 6, 0]} rotation={[Math.PI, 0, 0]}><coneGeometry args={[visualRadius * 0.5, visualRadius * 12, 16, 4, true]} /><pulsarJetMaterial transparent side={THREE.DoubleSide} uColor={new THREE.Color(0.5, 0.0, 1.0)} blending={THREE.AdditiveBlending} logarithmicDepthBuffer={true} /></mesh>
        </group>
      )}
    </group>
  );
};

const SpaceCanvas: React.FC<any> = ({ creationMode, setCreationMode, onBodyCreate }) => {
  const bodiesRef = useRef<CelestialBody[]>([]);
  const floatingOffset = useRef(new THREE.Vector3(0, 0, 0));
  const { bodies, setBodies, selectedId, selectBody, showDust, showStability, historyVersion } = useStore();

  useEffect(() => {
    // Update physics ref whenever bodies count or major structure changes, or history is manipulated (undo/redo)
    bodiesRef.current = (bodies || []).map(b => ({ ...b, position: b.position.clone(), velocity: b.velocity.clone() }));
  }, [bodies.length, historyVersion]);

  return (
    <Canvas camera={{ position: [0, 150, 250], fov: 45, far: 100000000 }} gl={{ logarithmicDepthBuffer: true, antialias: true } as any} onPointerMissed={() => selectBody(null)}>
      <color attach="background" args={['#050505']} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[100, 100, 100]} intensity={1.5} />
      <Stars radius={300} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
      <PhysicsEngine bodiesRef={bodiesRef} floatingOffset={floatingOffset} />
      <GPGPUPhysics bodies={bodiesRef} count={1024} speed={useStore.getState().speed} paused={useStore.getState().paused} setBodies={setBodies} floatingOffset={floatingOffset} />
      {showDust && <DustSystem paused={useStore.getState().paused} floatingOffset={floatingOffset} />}
      <ObjectCreator creationMode={creationMode} setCreationMode={setCreationMode} onBodyCreate={onBodyCreate} floatingOffset={floatingOffset} />
      {showStability && <StabilityOverlay floatingOffset={floatingOffset} />}
      <group>
        {(bodies || []).map((body: any) => body && <BodyMesh key={body.id} data={body} onSelect={selectBody} creationMode={creationMode} floatingOffset={floatingOffset} isSelected={selectedId === body.id} bodiesRef={bodiesRef} />)}
        {(bodies || []).filter((b: CelestialBody) => ['Star', 'Red Giant'].includes(b.type)).map((star: CelestialBody) => (
          <HabitableZoneVisual key={`hz-${star.id}`} star={star} floatingOffset={floatingOffset} />
        ))}
      </group>
      <OrbitControls makeDefault enablePan={true} minDistance={40} maxDistance={500000} enabled={!creationMode} enableDamping={true} dampingFactor={0.05} rotateSpeed={0.5} />
      <EffectComposer multisampling={0}><Bloom luminanceThreshold={0.5} mipmapBlur intensity={1.2} /><Noise opacity={0.03} /><Vignette darkness={0.3} /></EffectComposer>
    </Canvas>
  );
};

export default SpaceCanvas;
