import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { CelestialBody } from '../../types';
import { useStore } from '../../utils/store';
import { bodySeed, obliquityDegOf } from '../../utils/bodyAppearance';
import { toRenderSpace } from '../../utils/scratchVectors';
import { useEnvironment } from './EnvironmentContext';
import { gasNoise } from './GasClouds';

const vertex = `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vNormal,vWorld;
void main(){vUv=uv; vNormal=normalize(mat3(modelMatrix)*normal); vWorld=(modelMatrix*vec4(position,1.0)).xyz;
gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
#include <logdepthbuf_vertex>
}`;
const fragment = `
#include <common>
#include <logdepthbuf_pars_fragment>
uniform float uTime,uStrength,uWind,uDetail; uniform vec3 uColor;
varying vec2 vUv; varying vec3 vNormal,vWorld;
${gasNoise}
void main(){
  vec3 view=normalize(cameraPosition-vWorld);
  float facing=abs(dot(normalize(vNormal),view));
  // Cylindrical noise is seamless around the polar beam.
  vec3 p=vec3(cos(vUv.x*6.283)*2.0,vUv.y*8.0-uTime*1.2,sin(vUv.x*6.283)*2.0);
  float n=mix(0.65,0.4+0.6*noise(p),uDetail);
  float beam=smoothstep(0.0,0.12,vUv.y)*(1.0-smoothstep(0.5,1.0,vUv.y));
  float alpha=mix(beam*pow(facing,0.45)*n,pow(1.0-facing,3.0)*(0.65+0.35*n),uWind)*uStrength;
  if(alpha<0.002) discard;
  gl_FragColor=vec4(uColor*mix(1.6,0.8,uWind),alpha);
#include <logdepthbuf_fragment>
}`;

function RadiationEmitter({ id, bodiesRef, floatingOffset }: {
  id: string; bodiesRef: React.MutableRefObject<CelestialBody[]>;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
}) {
  const { quality, reducedMotion } = useEnvironment();
  const root = useRef<THREE.Group>(null);
  const windMesh = useRef<THREE.Mesh>(null);
  const jets = useRef<THREE.Group>(null);
  const time = useRef(0);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uStrength: { value: 0 },
    uWind: { value: 0 }, uDetail: { value: quality.radiationDetail }, uColor: { value: new THREE.Color() },
  }), [quality.radiationDetail]);
  useFrame((_, delta) => {
    let b: CelestialBody | undefined;
    const liveBodies = bodiesRef.current;
    for (let i = 0; i < liveBodies.length; i++) {
      if (liveBodies[i].id === id) { b = liveBodies[i]; break; }
    }
    if (!root.current || !windMesh.current || !jets.current) return;
    root.current.visible = !!b;
    if (!b) return;
    const p = b.properties;
    const compact = b.type === 'Pulsar' || b.type === 'Neutron Star';
    const bh = b.type === 'Black Hole';
    const wind = !compact && !bh;
    if (!reducedMotion && !useStore.getState().paused) {
      // Display animation only; do not use a physical millisecond period as a flash rate.
      const rate = compact ? Math.min(1.5, 0.3 / Math.max(p?.pulsarPeriodS ?? 1, 0.05)) : 0.5;
      time.current += Math.min(delta, 0.05) * rate * quality.radiationAnimationRate;
    }
    uniforms.uTime.value = time.current;
    uniforms.uWind.value = wind ? 1 : 0;
    uniforms.uColor.value.set(wind ? b.color : bh ? '#86b6dd' : '#a1baff');
    uniforms.uStrength.value = wind
      ? Math.min(0.075, 0.014 + (p?.massLoss ?? 0) * 0.045 + (p?.flareActivity ?? 0) * 0.016)
      : bh ? Math.max(0, Math.min(1, p?.accretionRate ?? 0.5)) * 0.22
      : Math.min(0.22, 0.09 + (p?.magneticFieldTG ?? 1) * 0.015);
    toRenderSpace(root.current.position, b.position, floatingOffset.current);
    root.current.rotation.set(0, bodySeed(b.id) / 100 * Math.PI * 2, THREE.MathUtils.degToRad(obliquityDegOf(b)));
    const radius = compact ? Math.max(b.radius * 5, 3) : b.radius;
    root.current.scale.setScalar(radius);
    windMesh.current.visible = wind;
    jets.current.visible = !wind && uniforms.uStrength.value > 0;
    // Modest magnetic-axis misalignment, illustrative because it is not a stored parameter.
    jets.current.rotation.set(0, time.current, compact ? 0.18 : 0);
  });
  return <group ref={root} name={`radiation:${id}`}>
    <mesh ref={windMesh} scale={1.8} raycast={() => {}}>
      <sphereGeometry args={[1, quality.radiationSegments, quality.radiationSegments]} />
      <shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
    <group ref={jets}>{[1, -1].map(sign => <mesh key={sign} position={[0, sign * 5, 0]} rotation={[sign < 0 ? Math.PI : 0, 0, 0]} raycast={() => {}}>
      <cylinderGeometry args={[0.8, 0.08, 10, quality.radiationSegments, 1, true]} />
      <shaderMaterial uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} side={THREE.DoubleSide} forceSinglePass blending={THREE.AdditiveBlending} />
    </mesh>)}</group>
  </group>;
}

export default function RadiationEffects(props: {
  bodiesRef: React.MutableRefObject<CelestialBody[]>;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
}) {
  const { quality } = useEnvironment();
  const bodies = useStore(s => s.bodies);
  const emitters = useMemo(() => bodies
    .filter(b => ['Pulsar', 'Neutron Star', 'Black Hole', 'Star', 'Red Giant', 'White Dwarf'].includes(b.type))
    .sort((a, b) => Number(['Pulsar', 'Black Hole'].includes(b.type)) - Number(['Pulsar', 'Black Hole'].includes(a.type)))
    .slice(0, quality.radiationEmitterCap), [bodies, quality.radiationEmitterCap]);
  return <group name="environment-radiation">{emitters.map(b => <RadiationEmitter key={b.id} id={b.id} {...props} />)}</group>;
}
