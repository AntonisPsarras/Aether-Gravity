import React, { createContext, useContext, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { DeviceTier, environmentQualityForDevice, EnvironmentQuality } from '../CanvasSetup';
import { useReducedMotion as useReducedMotionHook } from '../hooks/useReducedMotion';

/** Re-exported from the shared hooks module; DOM panels need it too. */
export { useReducedMotion } from '../hooks/useReducedMotion';

/** Dim, already blurred radiance field, not a reflection probe or a body texture. */
export function createEnvironmentTexture(width: number) {
  const height = width / 2;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const longitude = x / width * Math.PI * 2;
    const latitude = y / (height - 1) * Math.PI - Math.PI / 2;
    const band = Math.exp(-Math.pow((latitude - Math.sin(longitude * 2) * 0.18) * 3, 2));
    const cloud = band * (0.4 + 0.6 * Math.pow(Math.cos(longitude * 0.5 + 0.7), 2));
    const i = (y * width + x) * 4;
    pixels[i] = 7 + cloud * 40;
    pixels[i + 1] = 9 + cloud * 30;
    pixels[i + 2] = 16 + cloud * 48;
    pixels[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.wrapS = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const EnvironmentContext = createContext<{ quality: EnvironmentQuality; texture: THREE.Texture | null; reducedMotion: boolean }>({
  quality: environmentQualityForDevice('low'), texture: null, reducedMotion: false,
});
export const useEnvironment = () => useContext(EnvironmentContext);

export function EnvironmentProvider({ tier, isTouch, children }: { tier: DeviceTier; isTouch: boolean; children: React.ReactNode }) {
  const quality = useMemo(() => environmentQualityForDevice(tier, isTouch), [tier, isTouch]);
  const reducedMotion = useReducedMotionHook();
  const texture = useMemo(() => createEnvironmentTexture(quality.reflectionResolution), [quality.reflectionResolution]);
  useEffect(() => () => texture.dispose(), [texture]);
  const value = useMemo(() => ({ quality, texture, reducedMotion }), [quality, texture, reducedMotion]);
  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export const environmentReflectionGLSL = `
uniform sampler2D uEnvironment;
uniform float uEnvironmentIntensity;
vec3 environmentLight(vec3 direction) {
  vec3 d = normalize(direction);
  vec2 uv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5);
  return texture2D(uEnvironment, uv).rgb * uEnvironmentIntensity;
}
`;
