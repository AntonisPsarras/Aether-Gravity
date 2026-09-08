import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../../utils/store';
import { DUST_CONFIG } from '../../constants';
import { useEnvironment } from './EnvironmentContext';

/** Decorative motes only: no mass, forces, GPU compute targets, or simulation writes. */
export default function DecorativeDust({ floatingOffset }: { floatingOffset: React.MutableRefObject<THREE.Vector3> }) {
  const { quality, reducedMotion } = useEnvironment();
  const time = useRef(0);
  const positions = useMemo(() => {
    let seed = 731;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; };
    return Float32Array.from({ length: quality.dustCount * 3 }, () => (random() - 0.5) * DUST_CONFIG.AREA);
  }, [quality.dustCount]);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uOffset: { value: new THREE.Vector3() }, uRange: { value: DUST_CONFIG.AREA },
    uSize: { value: quality.dustSize }, uPixelRatio: { value: 1 },
  }), [quality.dustSize]);
  useFrame(({ gl }, dt) => {
    if (!reducedMotion && !useStore.getState().paused) time.current += Math.min(dt, 0.05) * quality.dustMotion;
    uniforms.uTime.value = time.current;
    uniforms.uOffset.value.copy(floatingOffset.current);
    uniforms.uPixelRatio.value = gl.getPixelRatio();
  });
  return <points name="decorative-dust" frustumCulled={false} raycast={() => {}}>
    <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
    <shaderMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} uniforms={uniforms} vertexShader={`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float uTime,uRange,uSize,uPixelRatio; uniform vec3 uOffset;
      varying float vFade,vSeed;
      void main(){
        vSeed=fract(sin(dot(position,vec3(12.3,4.7,8.2)))*43758.5);
        vec3 drift=vec3(sin(uTime*0.07+vSeed*6.28),sin(uTime*0.04+vSeed*12.0)*0.4,cos(uTime*0.05+vSeed*6.28))*8.0;
        vec3 world=mod(position+drift-uOffset-cameraPosition+uRange*0.5,uRange)-uRange*0.5+cameraPosition;
        vec4 mv=viewMatrix*vec4(world,1.0);
        float distanceToEye=length(mv.xyz);
        vFade=smoothstep(8.0,30.0,distanceToEye)*(1.0-smoothstep(uRange*0.28,uRange*0.49,distanceToEye));
        gl_Position=projectionMatrix*mv;
        gl_PointSize=clamp(uSize*uPixelRatio*(0.6+vSeed)*80.0/max(-mv.z,1.0),1.0,8.0*uPixelRatio);
        #include <logdepthbuf_vertex>
      }`} fragmentShader={`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      varying float vFade,vSeed;
      void main(){
        float r=length(gl_PointCoord-0.5)*2.0;
        float alpha=exp(-r*r*4.0)*(1.0-smoothstep(0.65,1.0,r))*vFade*0.32;
        if(alpha<0.002) discard;
        gl_FragColor=vec4(mix(vec3(0.5,0.65,0.8),vec3(0.9,0.77,0.6),vSeed),alpha);
        #include <logdepthbuf_fragment>
      }`} />
  </points>;
}
