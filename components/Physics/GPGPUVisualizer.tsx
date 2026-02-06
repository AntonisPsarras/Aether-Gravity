import { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';

const GPGPUBodyMaterial = shaderMaterial(
  {
    uTexturePosition: null,
    uFloatingOffset: new THREE.Vector3(0, 0, 0)
  },
  // Vertex Shader
  `
  uniform sampler2D uTexturePosition;
  uniform vec3 uFloatingOffset;
  attribute vec2 reference;
  
  varying vec3 vColor;
  
  void main() {
    vec4 posMass = texture2D(uTexturePosition, reference);
    vec3 pos = posMass.rgb;
    float mass = posMass.a;
    
    vec3 viewPos = pos - uFloatingOffset;
    
    vec4 mvPosition = modelViewMatrix * vec4(viewPos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    float dist = -mvPosition.z;
    gl_PointSize = (mass * 0.5 + 20.0) / dist; 
    gl_PointSize = clamp(gl_PointSize, 2.0, 50.0);
    
    vColor = vec3(0.5, 0.7, 1.0);
    if(mass > 100.0) vColor = vec3(1.0, 0.8, 0.4); 
    if(mass < 1.0) vColor = vec3(0.4, 0.4, 0.4); 
  }
  `,
  // Fragment Shader
  `
  varying vec3 vColor;
  void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      if(length(coord) > 0.5) discard;
      float d = length(coord);
      float alpha = 1.0 - smoothstep(0.4, 0.5, d);
      gl_FragColor = vec4(vColor, alpha);
  }
  `
);

extend({ GPGPUBodyMaterial });

const GPGPUBodyVisualizer = ({ count, texturePos, floatingOffset }: any) => {
  const materialRef = useRef<any>(null);

  const references = useMemo(() => {
    const size = Math.ceil(Math.sqrt(count));
    const arr = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = (i % size) / size;
      const y = Math.floor(i / size) / size;
      arr[i * 2] = x + (0.5 / size);
      arr[i * 2 + 1] = y + (0.5 / size);
    }
    return arr;
  }, [count]);

  useFrame(() => {
    if (materialRef.current && texturePos) {
      materialRef.current.uTexturePosition = texturePos;
      materialRef.current.uFloatingOffset = floatingOffset.current;
    }
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={new Float32Array(count * 3)} itemSize={3} />
        <bufferAttribute attach="attributes-reference" count={count} array={references} itemSize={2} />
      </bufferGeometry>
      {/* @ts-ignore */}
      <gPGPUBodyMaterial ref={materialRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

export default GPGPUBodyVisualizer;