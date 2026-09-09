import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CelestialBody } from '../../types';
import { bodyLuminositySolar } from '../../utils/physicsUtils';
import { useStore } from '../../utils/store';
import { toRenderSpace } from '../../utils/scratchVectors';
import { useEnvironment } from './EnvironmentContext';

export type GasRemnant = { position: THREE.Vector3; age: number };
export const gasNoise = `
float hash(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
`;

/** Fill a caller-owned, luminosity-sorted emitter buffer without temporary arrays. */
export function fillHotGasEmitters(bodies: readonly CelestialBody[], out: CelestialBody[], cap: number): void {
  out.length = 0;
  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const luminousGas = body.type === 'Star' || body.type === 'Red Giant' || body.type === 'White Dwarf';
    if (!luminousGas || body.temperature <= 7500) continue;
    const luminosity = bodyLuminositySolar(body);
    let insertAt = out.length;
    while (insertAt > 0 && bodyLuminositySolar(out[insertAt - 1]) < luminosity) insertAt--;
    if (insertAt >= cap) continue;
    const end = Math.min(out.length, cap - 1);
    for (let move = end; move > insertAt; move--) out[move] = out[move - 1];
    out[insertAt] = body;
    if (out.length > cap) out.length = cap;
  }
}
const vertex = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv;
void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
#include <logdepthbuf_vertex>
}`;
const fragment = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime, uSeed, uOpacity, uShell;
uniform int uOctaves;
uniform vec3 uTint;
varying vec2 vUv;
${gasNoise}
void main(){
  vec2 uv=vUv*2.0-1.0;
  float edge=1.0-smoothstep(0.5,1.0,length(uv));
  vec3 p=vec3(uv*2.8,uSeed)+vec3(uTime*0.009,-uTime*0.004,0.0);
  float density=0.0, amplitude=0.5;
  for(int i=0;i<5;i++){ if(i>=uOctaves) break; density+=noise(p)*amplitude; p=p*2.03+vec3(3.1,1.7,4.2); amplitude*=0.5; }
  float filaments=smoothstep(0.25,0.78,density);
  float shell=mix(1.0,0.3+0.7*exp(-pow((length(uv)-0.55)*5.0,2.0)),uShell);
  float alpha=filaments*edge*shell*uOpacity;
  if(alpha<0.002) discard;
  // Absorption lanes plus soft emission; no claim of simulated gas chemistry.
  gl_FragColor=vec4(uTint*(0.5+filaments*0.9),alpha);
#include <logdepthbuf_fragment>
}`;

export function GasClouds({ bodiesRef, floatingOffset, remnants, menu = false }: {
  bodiesRef?: React.MutableRefObject<CelestialBody[]>;
  floatingOffset?: React.MutableRefObject<THREE.Vector3>;
  remnants?: React.MutableRefObject<GasRemnant[]>;
  menu?: boolean;
}) {
  const { quality, reducedMotion } = useEnvironment();
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const time = useRef(0);
  const hotEmitters = useRef<CelestialBody[]>([]);
  const hotRefreshAt = useRef(-Infinity);
  useEffect(() => useStore.subscribe((next, prev) => {
    if (!remnants) return;
    const loaded = next.bodies !== prev.bodies && next.inspectorLocks !== prev.inspectorLocks;
    const replaced = next.bodies !== prev.bodies && !next.bodies.some(b => prev.bodies.some(old => old.id === b.id));
    if (loaded || replaced || next.historyVersion !== prev.historyVersion || next.worldId !== prev.worldId) remnants.current.length = 0;
  }), [remnants]);
  const count = quality.gasBackgroundLayers + (menu ? 0 : quality.gasEmitterCap * quality.gasLocalLayers);
  const uniforms = useMemo(() => Array.from({ length: count }, (_, i) => ({
    uTime: { value: 0 }, uSeed: { value: i * 9.73 + 2.1 },
    uOpacity: { value: quality.gasOpacity }, uShell: { value: 0 },
    uOctaves: { value: quality.gasOctaves }, uTint: { value: new THREE.Color('#536480') },
  })), [count, quality]);
  useFrame(({ camera, clock }, delta) => {
    const paused = !menu && useStore.getState().paused;
    const dt = reducedMotion || paused ? 0 : Math.min(delta, 0.05);
    time.current += dt;
    if (remnants) {
      for (let j = remnants.current.length - 1; j >= 0; j--) {
        remnants.current[j].age += paused ? 0 : Math.min(delta, 0.05);
        if (remnants.current[j].age >= 24) remnants.current.splice(j, 1);
      }
    }
    if (bodiesRef && clock.elapsedTime - hotRefreshAt.current >= 0.5) {
      fillHotGasEmitters(bodiesRef.current, hotEmitters.current, quality.gasEmitterCap);
      hotRefreshAt.current = clock.elapsedTime;
    }
    const hot = hotEmitters.current;
    for (let i = 0; i < count; i++) {
      const mesh = meshes.current[i]; if (!mesh) continue;
      const u = uniforms[i]; u.uTime.value = time.current;
      mesh.quaternion.copy(camera.quaternion);
      if (i < quality.gasBackgroundLayers) {
        // Distant sky: camera-relative, behind local bodies, with separated depth layers.
        const side = i % 2 === 0 ? -1 : 1;
        const size = menu ? 42 : 1500;
        mesh.position.set(side * size * 0.3, (i - 1.5) * size * 0.08, -size * (0.8 + i * 0.12));
        mesh.position.applyQuaternion(camera.quaternion).add(camera.position);
        mesh.scale.set(size, size * 0.7, 1);
        u.uTint.value.set(i % 2 ? '#564953' : '#435d79');
        u.uOpacity.value = quality.gasOpacity * 0.65;
        continue;
      }
      const slot = Math.floor((i - quality.gasBackgroundLayers) / quality.gasLocalLayers);
      const layer = (i - quality.gasBackgroundLayers) % quality.gasLocalLayers;
      const remnant = remnants?.current[slot];
      const star = hot[slot - (remnants?.current.length ?? 0)];
      mesh.visible = !!remnant || !!star;
      if (!mesh.visible) continue;
      if (floatingOffset) {
        toRenderSpace(mesh.position, remnant ? remnant.position : star.position, floatingOffset.current);
      } else {
        mesh.position.copy(remnant ? remnant.position : star.position);
      }
      const age = remnant?.age ?? 0;
      const size = remnant ? 45 + (reducedMotion ? 0 : age * 5) : Math.max(40, star.radius * 8);
      mesh.translateZ((layer - 0.5) * size * 0.12);
      mesh.scale.set(size * (1 + layer * 0.15), size * 0.8, 1);
      u.uShell.value = remnant ? 1 : 0;
      u.uTint.value.set(remnant ? '#ad655b' : star.temperature > 18000 ? '#658cbc' : '#987789');
      u.uOpacity.value = quality.gasOpacity * (remnant ? Math.max(0, 1 - age / 24) : 0.6);
    }
  });
  return <group name="environment-gas">{uniforms.map((u, i) => <mesh key={i} ref={m => { meshes.current[i] = m; }} raycast={() => {}} frustumCulled={false}>
    <planeGeometry args={[1, 1]} />
    <shaderMaterial uniforms={u} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} side={THREE.FrontSide} />
  </mesh>)}</group>;
}
