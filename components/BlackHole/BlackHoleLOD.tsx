import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { DeviceTier } from '../../utils/deviceCapabilities';

type BlackHoleLODProps = {
  radius: number;
  onSelect: () => void;
  interactive: boolean;
  tier: DeviceTier;
};

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShaderHigh = `
precision highp float;

uniform float u_time;
uniform vec2 u_resolution;
uniform sampler2D u_bg_texture;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

mat2 rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);

  vec2 screenUv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  vec2 lensDir = normalize(uv + 1e-5);
  float lensStrength = smoothstep(0.95, 0.08, r) * 0.08;
  vec2 warpedUv = clamp(screenUv + lensDir * lensStrength, 0.0, 1.0);
  vec3 lensedBg = texture2D(u_bg_texture, warpedUv).rgb;

  vec3 accretion = vec3(0.0);
  float density = 0.0;
  vec3 ray = normalize(vec3(uv, 1.2));
  vec3 pos = vec3(uv * 0.15, -0.45);
  float stepLen = 0.06;

  // Small fixed loop for desktop/high-end path only.
  for (int i = 0; i < 24; i++) {
    pos += ray * stepLen;
    vec3 rp = pos;
    rp.xz *= rot(u_time * 0.35 + rp.y * 2.2);
    float radial = length(rp.xz);
    float ring = exp(-pow((radial - 0.7) * 4.2, 2.0));
    float thick = exp(-abs(rp.y) * 8.0);
    float n = hash21(rp.xz * 3.1 + vec2(float(i), u_time * 0.4));
    float d = ring * thick * mix(0.65, 1.15, n);
    density += d * 0.045;
  }

  vec3 hotColor = vec3(0.976, 0.831, 0.137);
  vec3 coldColor = vec3(0.063, 0.078, 0.11);
  float heat = smoothstep(1.0, 0.25, r);
  accretion = mix(coldColor, hotColor, heat) * density * 5.0;

  float horizon = smoothstep(0.24, 0.22, r);
  vec3 color = lensedBg * 0.45 + accretion;
  color = mix(color, vec3(0.0), horizon);

  float diskAlpha = smoothstep(1.25, 0.22, r) * (1.0 - horizon);
  float alpha = clamp(max(diskAlpha, horizon), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

const fragmentShaderLow = `
precision highp float;

uniform float u_time;
varying vec2 vUv;

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float swirl = sin(a * 5.0 - u_time * 2.2) * 0.5 + 0.5;
  float ripple = cos(r * 28.0 - u_time * 1.6) * 0.5 + 0.5;
  float diskMask = smoothstep(1.15, 0.26, r) * (1.0 - smoothstep(0.24, 0.21, r));
  float intensity = diskMask * (0.45 + 0.55 * swirl) * (0.7 + 0.3 * ripple);

  vec3 hotColor = vec3(0.976, 0.831, 0.137);
  vec3 coldColor = vec3(0.063, 0.078, 0.11);
  float heat = smoothstep(1.0, 0.3, r);
  vec3 diskColor = mix(coldColor, hotColor, heat) * intensity * 1.35;

  float horizon = smoothstep(0.24, 0.21, r);
  vec3 color = mix(diskColor, vec3(0.0), horizon);

  float alpha = clamp(max(diskMask, horizon), 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}
`;

function createFallbackBackgroundTexture(): THREE.DataTexture {
  const pixels = new Uint8Array([
    8, 10, 16, 255, 16, 18, 30, 255,
    14, 16, 26, 255, 20, 22, 34, 255,
  ]);
  const texture = new THREE.DataTexture(pixels, 2, 2, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

export default function BlackHoleLOD({ radius, onSelect, interactive, tier }: BlackHoleLODProps): React.ReactElement {
  const meshRef = useRef<THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>>(null);
  const fallbackBgTextureRef = useRef<THREE.DataTexture | null>(null);
  const { size, camera, scene } = useThree();

  if (!fallbackBgTextureRef.current) {
    fallbackBgTextureRef.current = createFallbackBackgroundTexture();
  }

  const highMaterial = useMemo(() => {
    const bgTexture = scene.background instanceof THREE.Texture ? scene.background : fallbackBgTextureRef.current!;
    return new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
        u_resolution: { value: new THREE.Vector2(size.width, size.height) },
        u_bg_texture: { value: bgTexture },
      },
      vertexShader,
      fragmentShader: fragmentShaderHigh,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
  }, [scene.background, size.height, size.width]);

  const lowMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
      },
      vertexShader,
      fragmentShader: fragmentShaderLow,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
  }, []);

  const geometry = useMemo(() => new THREE.PlaneGeometry(radius * 16.0, radius * 16.0, 1, 1), [radius]);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.material = tier === 'low' ? lowMaterial : highMaterial;
    }
  }, [highMaterial, lowMaterial, tier]);

  useEffect(() => {
    return () => {
      geometry.dispose();
      highMaterial.dispose();
      lowMaterial.dispose();
      fallbackBgTextureRef.current?.dispose();
    };
  }, [geometry, highMaterial, lowMaterial]);

  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    mesh.quaternion.copy(camera.quaternion);
    const now = state.clock.elapsedTime;
    highMaterial.uniforms.u_time.value = now;
    highMaterial.uniforms.u_resolution.value.set(size.width, size.height);
    lowMaterial.uniforms.u_time.value = now;

  });

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={highMaterial}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (interactive) onSelect();
      }}
      renderOrder={3}
    />
  );
}
