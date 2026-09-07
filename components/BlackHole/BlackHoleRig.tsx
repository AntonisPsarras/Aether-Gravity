import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { registerBlackHoleVisual } from './BlackHoleLensCapture';
import { diskEfficiency, iscoRadiusRg } from '../../utils/relativity';

export type BlackHoleRigProps = {
  radius: number;
  spin: number;
  accretion: number;
  mass: number;
  onSelect: () => void;
  interactive: boolean;
  lensTexture?: THREE.Texture | null;
};

type QualityTier = 'high' | 'low';

const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

const horizonVertex = `
varying vec3 vNormal;
varying vec3 vViewPosition;
varying vec3 vWorldPos;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const horizonFragmentHigh = `
precision highp float;
uniform float u_time;
uniform float u_spin;
uniform float u_accretion;
uniform vec3 u_rimColor;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  float ndotv = max(dot(normal, viewDir), 0.0);
  float rim = pow(1.0 - ndotv, 4.0);
  float pulse = 0.85 + 0.15 * sin(u_time * 3.0 + u_spin * 6.28);
  vec3 rimGlow = u_rimColor * rim * (0.6 + u_accretion * 0.8) * pulse;
  vec3 core = vec3(0.0);
  gl_FragColor = vec4(core + rimGlow, 1.0);
}
`;

const horizonFragmentLow = `
precision highp float;
uniform float u_spin;
uniform vec3 u_rimColor;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  float rim = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
  gl_FragColor = vec4(u_rimColor * rim * (0.35 + u_spin * 0.25), 1.0);
}
`;

const diskVertex = `
varying vec2 vUv;
varying vec3 vLocalPos;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vLocalPos = position;
  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const diskFragmentHigh = `
precision highp float;
uniform float u_time;
uniform float u_spin;
uniform float u_accretion;
uniform sampler2D u_bg_texture;
uniform vec2 u_resolution;
/** Inner edge of the disk as a fraction of the quad: the ISCO. */
uniform float u_inner;
varying vec2 vUv;
varying vec3 vLocalPos;
varying vec3 vWorldPos;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

mat2 rot2(float a) {
  float s = sin(a), c = cos(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  float r = length(uv);
  if (r > 1.05) discard;

  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 diskNormal = vec3(0.0, 1.0, 0.0);
  vec3 tangent = normalize(cross(diskNormal, viewDir) + vec3(1e-4, 0.0, 0.0));
  vec3 bitangent = cross(diskNormal, tangent);

  vec3 accretion = vec3(0.0);
  float density = 0.0;
  vec3 marchOrigin = vec3(uv.x, 0.0, uv.y) * 0.4;
  vec3 marchDir = normalize(tangent * 0.3 + bitangent * 0.15 + diskNormal * sign(dot(viewDir, diskNormal)));

  for (int i = 0; i < 12; i++) {
    vec3 p = marchOrigin + marchDir * (float(i) * 0.07);
    p.xz *= rot2(u_time * (0.25 + u_spin * 0.5) + p.y * 1.5);
    float radial = length(p.xz);
    // Brightest annulus sits just outside the ISCO, where the disk is hottest.
    float ringR = clamp(u_inner * 2.4, 0.28, 0.72);
    float ring = exp(-pow((radial - ringR) * 3.5, 2.0));
    float thick = exp(-abs(p.y) * 10.0);
    float n = hash21(p.xz * 4.0 + vec2(float(i), u_time * 0.3));
    density += ring * thick * mix(0.5, 1.2, n) * 0.055;
  }

  vec3 hotColor = vec3(0.98, 0.83, 0.14);
  vec3 coldColor = vec3(0.06, 0.08, 0.11);
  float heat = smoothstep(1.0, 0.2, r);
  accretion = mix(coldColor, hotColor, heat) * density * (4.0 + u_accretion * 6.0);

  // Relativistic Doppler beaming. Material at radius r orbits at
  // beta ~ 1/sqrt(r/r_g); the observed intensity of an approaching element
  // scales as the Doppler factor cubed for a thin disk. The approaching side
  // is genuinely brighter than the receding one, which is the defining visual
  // signature of an accretion disk. Replaces a sinusoid scaled by spin.
  float angle = atan(uv.y, uv.x);
  float orbitR = max(r / max(u_inner, 0.02), 1.0);
  float beta = clamp(0.5 / sqrt(orbitR), 0.0, 0.85);
  float cosPhi = cos(angle + u_time * 0.2);
  float gamma = 1.0 / sqrt(max(1.0 - beta * beta, 1e-4));
  float doppler = 1.0 / (gamma * (1.0 - beta * cosPhi));
  accretion *= clamp(doppler * doppler * doppler, 0.15, 6.0);

  vec2 screenUv = gl_FragCoord.xy / max(u_resolution, vec2(1.0));
  vec2 lensDir = normalize(uv + 1e-5);
  float lensAmt = smoothstep(0.9, 0.15, r) * 0.06 * (1.0 + u_spin);
  vec3 lensedBg = texture2D(u_bg_texture, clamp(screenUv + lensDir * lensAmt, 0.0, 1.0)).rgb;
  float starNoise = hash21(floor(screenUv * 180.0)) * hash21(floor(screenUv * 220.0 + 10.0));
  lensedBg += vec3(starNoise) * 0.15 * smoothstep(0.5, 0.0, r);

  float innerHole = smoothstep(u_inner * 1.15, u_inner, r);
  vec3 color = lensedBg * 0.25 + accretion;
  color = mix(color, vec3(0.0), innerHole);

  float alpha = smoothstep(1.0, 0.2, r) * (1.0 - innerHole);
  alpha = clamp(alpha + innerHole * 0.95, 0.0, 1.0);
  if (alpha < 0.02) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

const parallaxDiskFragment = `
precision highp float;
uniform float u_time;
uniform float u_spin;
uniform float u_accretion;
uniform float u_parallax;
uniform float u_layer;
uniform float u_inner;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec2 parallax = viewDir.xz * u_parallax;
  vec2 uv = vUv * 2.0 - 1.0 + parallax;
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float swirl = sin(a * 5.0 - u_time * (2.0 + u_spin) + u_layer * 0.7) * 0.5 + 0.5;
  float ripple = cos(r * (26.0 + u_layer * 4.0) - u_time * 1.5) * 0.5 + 0.5;
  float diskMask = smoothstep(1.12, u_inner * 1.4, r) * (1.0 - smoothstep(u_inner * 1.2, u_inner, r));
  float intensity = diskMask * (0.4 + 0.6 * swirl) * (0.65 + 0.35 * ripple);

  vec3 hotColor = vec3(0.98, 0.83, 0.14);
  vec3 coldColor = vec3(0.06, 0.08, 0.11);
  float heat = smoothstep(1.0, 0.25, r);
  vec3 diskColor = mix(coldColor, hotColor, heat) * intensity * (1.1 + u_accretion);

  float horizon = smoothstep(u_inner * 1.2, u_inner, r);
  vec3 color = mix(diskColor, vec3(0.0), horizon);
  float alpha = clamp(max(diskMask, horizon * 0.9), 0.0, 1.0) * (0.55 + u_layer * 0.15);
  if (alpha < 0.03) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

const ergosphereVertex = horizonVertex;
const ergosphereFragment = `
precision highp float;
uniform float u_spin;
uniform float u_time;
uniform vec3 u_color;
varying vec3 vNormal;
varying vec3 vViewPosition;
void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);
  float alpha = pow(1.0 - abs(dot(normal, viewDir)), 2.0);
  float pulse = 0.5 + 0.5 * sin(u_time * 4.0 * max(u_spin, 0.05));
  gl_FragColor = vec4(u_color * (0.7 + 0.3 * pulse), alpha * 0.28 * u_spin);
}
`;

function createFallbackBackgroundTexture(): THREE.DataTexture {
  const pixels = new Uint8Array([
    8, 10, 20, 255, 18, 22, 38, 255,
    12, 14, 28, 255, 24, 28, 48, 255,
  ]);
  const texture = new THREE.DataTexture(pixels, 2, 2, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

export default function BlackHoleRig({
  radius,
  spin,
  accretion,
  mass: _mass,
  onSelect,
  interactive,
  lensTexture,
}: BlackHoleRigProps): React.ReactElement {
  const [qualityTier, setQualityTier] = useState<QualityTier>('high');
  const frameProbeRef = useRef<number[]>([]);
  const lowStreakRef = useRef(0);
  const highStreakRef = useRef(0);
  const fallbackBgRef = useRef<THREE.DataTexture | null>(null);
  const { size, scene } = useThree();

  if (!fallbackBgRef.current) {
    fallbackBgRef.current = createFallbackBackgroundTexture();
  }

  const rimColor = useMemo(() => new THREE.Color(1.0, 0.45, 0.08), []);
  const ergoColor = useMemo(() => new THREE.Color(0.15, 0.35, 0.95), []);

  const bgTexture = useMemo(() => {
    if (lensTexture) return lensTexture;
    if (scene.background instanceof THREE.Texture) return scene.background;
    return fallbackBgRef.current!;
  }, [lensTexture, scene.background]);

  // All uniforms (u_time, u_spin, u_accretion, u_bg_texture, u_resolution) are
  // patched directly in useFrame, so these materials are created ONCE and never
  // recreated when spin/accretion props change. The previous pattern of putting
  // [spin, accretion] in useMemo deps caused a new THREE.ShaderMaterial to be
  // allocated on every inspector slider drag, abandoning the old one in VRAM
  // without calling .dispose().
  const horizonMatHigh = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          u_time: { value: 0 },
          u_spin: { value: spin },
          u_accretion: { value: accretion },
          u_rimColor: { value: rimColor },
        },
        vertexShader: horizonVertex,
        fragmentShader: horizonFragmentHigh,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const horizonMatLow = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          u_spin: { value: spin },
          u_rimColor: { value: rimColor },
        },
        vertexShader: horizonVertex,
        fragmentShader: horizonFragmentLow,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const diskMatHigh = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          u_time: { value: 0 },
          u_spin: { value: spin },
          u_accretion: { value: accretion },
          u_bg_texture: { value: bgTexture },
          u_resolution: { value: new THREE.Vector2(size.width, size.height) },
          u_inner: { value: 0.2 },
        },
        vertexShader: diskVertex,
        fragmentShader: diskFragmentHigh,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const makeParallaxMat = (parallax: number, layer: number) =>
    new THREE.ShaderMaterial({
      uniforms: {
        u_time: { value: 0 },
        u_spin: { value: spin },
        u_accretion: { value: accretion },
        u_parallax: { value: parallax },
        u_layer: { value: layer },
        u_inner: { value: 0.2 },
      },
      vertexShader: diskVertex,
      fragmentShader: parallaxDiskFragment,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: layer === 1 ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const diskMatLowBack = useMemo(() => makeParallaxMat(0.02, 0), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const diskMatLowMid = useMemo(() => makeParallaxMat(0.045, 1), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const diskMatLowFront = useMemo(() => makeParallaxMat(0.07, 2), []);

  const ergoMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          u_spin: { value: spin },
          u_time: { value: 0 },
          u_color: { value: ergoColor },
        },
        vertexShader: ergosphereVertex,
        fragmentShader: ergosphereFragment,
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const horizonGeo = useMemo(() => new THREE.SphereGeometry(1, 24, 24), []);
  const diskGeo = useMemo(() => {
    const geo = new THREE.RingGeometry(0.35, 1.0, 64, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);
  const diskPlaneGeo = useMemo(() => {
    const geo = new THREE.PlaneGeometry(2, 2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    return geo;
  }, []);
  const ergoGeo = useMemo(() => new THREE.SphereGeometry(1.12, 16, 16), []);

  const lowDiskMats = [diskMatLowBack, diskMatLowMid, diskMatLowFront];
  const allMaterials = useMemo(
    () => [horizonMatHigh, horizonMatLow, diskMatHigh, ergoMat, ...lowDiskMats],
    [horizonMatHigh, horizonMatLow, diskMatHigh, ergoMat, diskMatLowBack, diskMatLowMid, diskMatLowFront]
  );

  useEffect(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isMobile = MOBILE_UA_REGEX.test(ua);
    const memory =
      typeof navigator !== 'undefined'
        ? (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
        : 8;
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8;
    setQualityTier(isMobile && (memory <= 4 || cores <= 4) ? 'low' : 'high');
  }, []);

  useEffect(() => {
    return () => {
      horizonGeo.dispose();
      diskGeo.dispose();
      diskPlaneGeo.dispose();
      ergoGeo.dispose();
      allMaterials.forEach((m) => m.dispose());
      fallbackBgRef.current?.dispose();
    };
  }, [horizonGeo, diskGeo, diskPlaneGeo, ergoGeo, allMaterials]);

  const rootGroupRef = useRef<THREE.Group>(null);
  const diskGroupRef = useRef<THREE.Group>(null);
  const horizonMeshRef = useRef<THREE.Mesh>(null);
  const ergoMeshRef = useRef<THREE.Mesh>(null);
  const diskHighRef = useRef<THREE.Mesh>(null);
  const diskLowRefs = [useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null), useRef<THREE.Mesh>(null)];

  // Register this rig with the lens capture registry so the FBO render can
  // hide it directly without traversing the full scene graph.
  useEffect(() => {
    const obj = rootGroupRef.current;
    if (!obj) return;
    registerBlackHoleVisual(obj, true);
    return () => registerBlackHoleVisual(obj, false);
  }, []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    let nextTier = qualityTier;

    // Brightness tracks the disk's radiative efficiency, which rises from 5.7%
    // at zero spin to ~32% at the Thorne limit as the ISCO moves inwards. A
    // spun-up hole is genuinely brighter for the same accretion rate.
    const luminous = Math.min(1, accretion * (diskEfficiency(spin) / diskEfficiency(0)));
    // Inner disk edge = ISCO, anchored so a static hole is unchanged (0.20).
    const innerFraction = Math.max(0.03, 0.20 * (iscoRadiusRg(spin, true) / 6));

    horizonMatHigh.uniforms.u_time.value = t;
    horizonMatHigh.uniforms.u_spin.value = spin;
    horizonMatHigh.uniforms.u_accretion.value = luminous;
    horizonMatLow.uniforms.u_spin.value = spin;

    diskMatHigh.uniforms.u_time.value = t;
    diskMatHigh.uniforms.u_spin.value = spin;
    diskMatHigh.uniforms.u_accretion.value = luminous;
    diskMatHigh.uniforms.u_inner.value = innerFraction;
    diskMatHigh.uniforms.u_bg_texture.value = bgTexture;
    diskMatHigh.uniforms.u_resolution.value.set(size.width, size.height);

    lowDiskMats.forEach((m) => {
      m.uniforms.u_time.value = t;
      m.uniforms.u_spin.value = spin;
      m.uniforms.u_accretion.value = luminous;
      m.uniforms.u_inner.value = innerFraction;
    });

    ergoMat.uniforms.u_time.value = t;
    ergoMat.uniforms.u_spin.value = spin;

    if (diskGroupRef.current) {
      diskGroupRef.current.rotation.x = 0;
      diskGroupRef.current.rotation.z = 0;
      // Orbital angular frequency at the ISCO, Omega = 1/(r^1.5 + a) in
      // geometrised units, normalised to the Schwarzschild case (r = 6 r_g).
      // A near-extremal hole's inner disk therefore whirls ~13x faster than a
      // static one's, instead of the previous linear 0.15 + 0.85a fudge.
      const isco = iscoRadiusRg(spin, true);
      const omegaRel = Math.pow(6, 1.5) / (Math.pow(isco, 1.5) + spin);
      diskGroupRef.current.rotation.y += delta * 0.15 * Math.min(omegaRel, 20);
    }

    if (qualityTier === 'high' && frameProbeRef.current.length < 60) {
      frameProbeRef.current.push(delta);
      if (frameProbeRef.current.length === 60) {
        const avg = frameProbeRef.current.reduce((s, d) => s + d, 0) / 60;
        if (1 / Math.max(avg, 1e-4) < 55) nextTier = 'low';
      }
    } else if (qualityTier === 'high') {
      const fps = 1 / Math.max(delta, 1e-4);
      if (fps < 52) lowStreakRef.current += 1;
      else lowStreakRef.current = 0;
      if (lowStreakRef.current > 45) nextTier = 'low';
    } else {
      const fps = 1 / Math.max(delta, 1e-4);
      if (fps > 58) highStreakRef.current += 1;
      else highStreakRef.current = 0;
      if (highStreakRef.current > 90) nextTier = 'high';
    }

    if (nextTier !== qualityTier) setQualityTier(nextTier);
  });

  const tier = qualityTier;
  const horizonScale = radius * 0.55;

  /**
   * Spin drives real geometry, not just shader mood.
   *
   * `radius` is the drawn Kerr outer horizon r+ = r_g(1 + sqrt(1 - a*^2)).
   * Expressing everything else as a multiple of r_g keeps the whole rig
   * self-consistent as spin changes:
   *
   *  - The accretion disk's inner edge is the ISCO, which runs from 6 r_g at
   *    zero spin down to 1 r_g at extremal prograde spin. A rapidly spinning
   *    hole therefore has a disk that reaches much further in relative to its
   *    horizon, which is the visually striking part of Kerr geometry.
   *  - The ergosphere is oblate: it touches the horizon at the poles and
   *    reaches R_s = 2 r_g at the equator. It was previously a fixed 1.12x
   *    sphere, which is the wrong shape at every spin.
   */
  const rgPerHorizon = 1 / (1 + Math.sqrt(Math.max(0, 1 - spin * spin)));
  const iscoRg = iscoRadiusRg(spin, true);

  // The disk's outer extent is held constant in gravitational radii, so it does
  // not appear to shrink merely because the horizon does. The 2 * rgPerHorizon
  // factor is exactly 1 at zero spin, so a static hole renders identically to
  // before this change.
  const diskScale = radius * 2.8 * (2 * rgPerHorizon);

  // Inner edge of the disk, as a fraction of the quad. Anchored so a static
  // hole keeps its existing 0.20 hole and scaled by the ISCO's real motion:
  // 6 r_g when static, 1.24 r_g at the Thorne limit, so a rapidly spinning
  // hole's disk reaches almost to the horizon.
  const diskInnerFraction = Math.max(0.03, 0.20 * (iscoRg / 6));

  // Equatorial static limit is always R_s = 2 r_g; the poles sit on the
  // horizon. Expressed as a multiple of the drawn horizon radius.
  const ergoEquatorial = 2 * rgPerHorizon;
  const ergoPolar = 1.0;
  const showErgo = spin > 0.08;

  return (
    <group
      ref={rootGroupRef}
      userData={{ isBlackHole: true }}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (interactive) onSelect();
      }}
    >
      <mesh ref={horizonMeshRef} geometry={horizonGeo} scale={horizonScale} renderOrder={2} material={tier === 'high' ? horizonMatHigh : horizonMatLow} />

      {showErgo && tier === 'high' && (
        // Non-uniform scale: the ergosphere bulges at the equator (XZ) and
        // meets the horizon at the poles (Y).
        <mesh
          ref={ergoMeshRef}
          geometry={ergoGeo}
          scale={[horizonScale * ergoEquatorial, horizonScale * ergoPolar, horizonScale * ergoEquatorial]}
          renderOrder={1}
          material={ergoMat}
        />
      )}

      <group ref={diskGroupRef} scale={diskScale} renderOrder={3}>
        {tier === 'high' ? (
          <mesh ref={diskHighRef} geometry={diskGeo} material={diskMatHigh} />
        ) : (
          diskLowRefs.map((ref, i) => (
            <mesh
              key={i}
              ref={ref}
              geometry={diskPlaneGeo}
              material={lowDiskMats[i]}
              position={[0, (i - 1) * 0.008, 0]}
              scale={1 + i * 0.03}
            />
          ))
        )}
      </group>
    </group>
  );
}
