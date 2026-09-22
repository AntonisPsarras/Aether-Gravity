import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { relativityChunk } from './shaders/relativityChunk';
import type { RenderProfile } from '../utils/graphicsQuality';

/**
 * Main-menu black hole, modelled on the Play Store feature graphic: a lensed,
 * banded accretion disk over a spacetime-grid funnel with a glittering dust halo.
 *
 * The hole itself is an impostor — one camera-facing quad whose fragment shader
 * bends a ray per pixel around a Schwarzschild hole — so its cost is bounded by
 * its screen area and a per-tier step count, with no render targets, textures,
 * lights or scene captures. The grid funnel and the dust are real geometry
 * placed in the same disk frame, so parallax keeps them locked to the disk.
 *
 * All shader lengths below are in Schwarzschild radii (rs = 1).
 */

export type MenuBlackHoleTheme = {
  /** Display temperature at the hottest part of the disk, kelvin. */
  diskTemperature: number;
  /** Colour of the interleaved disk bands (the feature graphic's violet layers). */
  diskTint: string;
  /** How strongly those tint bands show, 0..1. */
  tintMix: number;
  /** Colour of the grid far from the well; the throat is always cyan. */
  gridFar: string;
};

type Mode = 'landing' | 'creator';

const DISK_INNER = 3; // ISCO of a non-spinning hole: 6 r_g = 3 rs
const DISK_OUTER = 12;
// Straight rays that never come within this distance cannot reach the disk.
const LENS_RADIUS = DISK_OUTER * 1.02;
// The impostor only covers where anything can appear: the disk's width, the
// lensed arch above the shadow and the near rim below it. A square quad would
// march about twice as many empty pixels.
const LENS_X = DISK_OUTER * 1.04;
const LENS_Y_MIN = -5.5;
const LENS_Y_MAX = 8.5;
/** Layout reference: `s` in layoutFor is the world size of this many rs. */
const LAYOUT_SPAN = 29;
const INCLINATION = 0.3; // rad above the disk plane — enough for the far side to arch over the shadow
const ROLL = -0.14; // rad of cinematic tilt
const ORBIT_SPEED = 1.8; // Keplerian: Ω = ORBIT_SPEED · r^-1.5 rad/s
// Start the clock already sheared so the disk opens on swept streaks, not blobs.
const PRE_SHEAR_SECONDS = 30;
const GRID_EXTENT = 44;
const GRID_EXTRA_TILT = 0.2; // the grid is viewed a little more face-on than the disk, as in the feature graphic

/**
 * Per-profile budgets. Steps, noise and crossing counts are compile-time
 * defines, so each profile compiles a branch-free shader rather than paying for
 * disabled features.
 *
 * `performance` is modelled on what capable phones already ran (32 steps, one
 * noise octave), not on the old weak-device branch (18 steps, no noise). That
 * branch flattened the photon ring enough to read as a different image rather
 * than a cheaper one.
 */
export function menuBlackHoleQuality(profile: RenderProfile) {
  if (profile === 'performance') {
    return { steps: 32, stepScale: 0.26, noiseOctaves: 1, maxHits: 2, ringWidth: 0.16, gridSegments: 72, dust: 1400 };
  }
  return { steps: 44, stepScale: 0.2, noiseOctaves: 2, maxHits: 2, ringWidth: 0.13, gridSegments: 96, dust: 2400 };
}
type Quality = ReturnType<typeof menuBlackHoleQuality>;

const quadVertex = /* glsl */ `
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const lensFragment = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uCamDist;
uniform float uTempPeak;
uniform vec3 uTint;
uniform float uTintMix;
uniform float uIntensity;
varying vec2 vLocal;

${relativityChunk}

const float R_IN = ${DISK_INNER.toFixed(1)};
const float R_OUT = ${DISK_OUTER.toFixed(1)};
const float R_LENS = ${LENS_RADIUS.toFixed(2)};
const float INCL = ${INCLINATION.toFixed(3)};
const float SPEED = ${ORBIT_SPEED.toFixed(2)};

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/** Emission (rgb, premultiplied by coverage) and coverage of the disk at a crossing. */
vec4 shadeDisk(vec3 hit, vec3 rayDir, float rr) {
  // Shakura-Sunyaev profile, T^4 ~ r^-3 (1 - sqrt(r_in / r)), held at its peak
  // inside r = 49/36 r_in so the inner edge reads hot instead of dark. The 0.8
  // exponent (vs the physical 0.25) is a display remap that spreads the
  // gradient from a white core through yellow and orange to an ember-red rim.
  float x = max(rr / R_IN, 1.3611);
  float prof = pow(x, -3.0) * (1.0 - inversesqrt(x));
  float tNorm = pow(clamp(prof / 0.0566510, 1e-6, 1.0), 0.8);

  // Keplerian shear: sample the pattern in a frame that has rotated by Ω(r)·t.
  float ang = -uTime * SPEED * pow(rr, -1.5);
  float cs = cos(ang), sn = sin(ang);
  vec2 q = vec2(cs * hit.x - sn * hit.z, sn * hit.x + cs * hit.z);
  float streak = 1.0;
#if NOISE_OCT > 0
  float n = vnoise(q * 1.5);
#if NOISE_OCT > 1
  n = n * 0.6 + vnoise(q * 3.7 + 7.3) * 0.4;
#endif
  streak = 0.6 + 0.7 * n;
#endif
  float bands = (0.8 + 0.2 * sin(rr * 3.1 + streak * 0.8)) * (0.93 + 0.07 * sin(rr * 11.0));

  // Doppler beaming and gravitational redshift. Prograde orbit direction in the
  // disk plane; beta = sqrt(r_g / r) with r_g = 0.5 rs.
  vec3 orbit = normalize(vec3(-hit.z, 0.0, hit.x));
  float cosPhi = dot(orbit, -rayDir);
  float beta = min(sqrt(0.5 / rr), 0.7);
  float gamma = inversesqrt(1.0 - beta * beta);
  float g = sqrt(max(1.0 - 1.0 / rr, 0.02)) / (gamma * (1.0 - beta * cosPhi));

  vec3 col = blackbodyNormalized(uTempPeak * tNorm * g);
  // A few broad bands in the cooler half pick up the theme tint, and the
  // palette is pushed past blackbody saturation toward the feature graphic's
  // coloured bands; bloom and ACES would otherwise wash it all to white.
  float tintBand = smoothstep(0.4, 1.0, sin(rr * 1.35 + 0.4) * 0.5 + 0.5) * smoothstep(0.95, 0.3, tNorm);
  col = mix(col, uTint, tintBand * 0.8 * uTintMix);
  col = max(mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.45), 0.0);

  float edge = smoothstep(R_IN, R_IN * 1.15, rr) * (1.0 - smoothstep(R_OUT * 0.62, R_OUT, rr));
  float lum = (0.1 + 1.05 * tNorm * sqrt(tNorm)) * bands * streak * clamp(g * g * g, 0.15, 2.6) * edge * uIntensity;
  float cover = clamp(edge * (0.55 + 0.35 * tNorm) * bands, 0.0, 0.9);
  return vec4(col * lum * cover, cover);
}

void main() {
  vec2 uv = vLocal;

  // Virtual camera on the quad's axis, INCL above the disk plane (XZ).
  float si = sin(INCL), ci = cos(INCL);
  vec3 camPos = vec3(0.0, si, ci) * uCamDist;
  vec3 target = vec3(uv.x, 0.0, 0.0) + vec3(0.0, ci, -si) * uv.y;
  vec3 dir = normalize(target - camPos);

  // Jump straight to the lensing sphere; rays that miss it see nothing here.
  float b = dot(camPos, dir);
  float disc = b * b - (dot(camPos, camPos) - R_LENS * R_LENS);
  if (disc <= 0.0) discard;
  vec3 pos = camPos + dir * (-b - sqrt(disc));
  vec3 vel = dir;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);

  vec3 col = vec3(0.0);
  float trans = 1.0;
  float minR = 1e3;
  int hits = 0;
  bool captured = false;

  for (int i = 0; i < STEPS; i++) {
    float r2 = dot(pos, pos);
    float r = sqrt(r2);
    // Adaptive step: long strides far out, short ones near the photon sphere.
    float dt = STEP_K * r * clamp(r * 0.3, 0.5, 1.0);
    vec3 prev = pos;
    // Photon geodesic in Schwarzschild, in the standard Newtonian-form
    // approximation a = -1.5 h^2 r / |r|^5 (rs = 1).
    vel += (-1.5 * h2 / (r2 * r2 * r)) * pos * dt;
    pos += vel * dt;

    // Closest approach along the whole segment, not just at the sample points:
    // sampling only the endpoints quantises the photon ring into moire rings.
    vec3 seg = pos - prev;
    float ts = clamp(-dot(prev, seg) / max(dot(seg, seg), 1e-6), 0.0, 1.0);
    minR = min(minR, length(prev + seg * ts));
    float rn = length(pos);

    if (prev.y * pos.y < 0.0 && hits < MAX_HITS) {
      vec3 hit = mix(prev, pos, prev.y / (prev.y - pos.y));
      float rr = length(hit.xz);
      if (rr > R_IN && rr < R_OUT) {
        vec4 d = shadeDisk(hit, normalize(vel), rr);
        // Higher-order images are demagnified and dimmer than the direct one.
        col += trans * d.rgb * (hits == 0 ? 1.0 : 0.55);
        trans *= 1.0 - d.a;
      }
      hits++;
    }
    if (rn < 1.0) { captured = true; break; }
    if (rn > R_LENS && dot(pos, vel) > 0.0) break;
    if (trans < 0.02) break;
  }

  float alpha = captured ? 1.0 : 1.0 - trans;
  if (!captured) {
    // Photon ring: escaping rays that skimmed the photon sphere (1.5 rs).
    float ringD = (minR - 1.5) / RING_W;
    float ring = exp(-ringD * ringD);
    vec3 ringCol = mix(blackbodyNormalized(uTempPeak), vec3(1.0, 0.92, 0.82), 0.5);
    col += trans * ringCol * ring * 0.9 * uIntensity;
  }
  if (alpha < 0.002 && dot(col, col) < 1e-6) discard;
  // Premultiplied output: the shadow (alpha 1, black) hides what is behind it;
  // glow added without alpha is additive.
  gl_FragColor = vec4(col, alpha);
}
`;

const funnelVertex = /* glsl */ `
varying vec2 vGrid;
varying float vWell;
varying float vRadius;
const float EXTENT = ${GRID_EXTENT.toFixed(1)};
void main() {
  // Concentrate vertices near the throat (identity at the rim), and draw grid
  // lines in the remapped plane so cells stay square in world space.
  float rq = length(position.xz) / EXTENT;
  vec2 q = position.xz * (0.35 + 0.65 * rq);
  float r = length(q);
  float well = inversesqrt(r * r / 10.0 + 1.0);
  vec3 p = vec3(q.x, -0.8 - 10.0 * well, q.y);
  vGrid = q;
  vWell = well;
  vRadius = r;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const funnelFragment = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColorNear;
uniform vec3 uColorFar;
varying vec2 vGrid;
varying float vWell;
varying float vRadius;
const float EXTENT = ${GRID_EXTENT.toFixed(1)};
void main() {
  vec2 g = vGrid / 2.2;
  vec2 w = fwidth(g);
  vec2 l = abs(fract(g - 0.5) - 0.5) / max(w, vec2(1e-4));
  float line = 1.0 - min(min(l.x, l.y), 1.0);
  // Where cells shrink below a couple of pixels the lines alias; fade them out.
  float moire = 1.0 - smoothstep(0.3, 0.7, max(w.x, w.y));
  float fade = 1.0 - smoothstep(EXTENT * 0.3, EXTENT * 0.95, vRadius);
  float pulse = 0.82 + 0.18 * sin(vRadius * 0.55 - uTime * 1.1);
  vec3 col = mix(uColorFar, uColorNear, smoothstep(0.15, 0.8, vWell));
  float a = line * moire * fade * pulse * uOpacity * (0.45 + vWell * 1.1);
  gl_FragColor = vec4(col, a);
}
`;

const dustVertex = /* glsl */ `
attribute vec4 aOrbit; // radius, phase, height, seed
uniform float uTime;
uniform float uPointScale;
varying float vTwinkle;
varying float vHeat;
const float SPEED = ${ORBIT_SPEED.toFixed(2)};
void main() {
  float r = aOrbit.x;
  float ang = aOrbit.y + uTime * SPEED * pow(r, -1.5);
  vec4 mv = modelViewMatrix * vec4(cos(ang) * r, aOrbit.z, sin(ang) * r, 1.0);
  gl_Position = projectionMatrix * mv;
  float s = aOrbit.w;
  vTwinkle = 0.55 + 0.45 * sin(uTime * (0.6 + s * 2.4) + s * 61.0);
  vHeat = 1.0 - smoothstep(12.0, 30.0, r);
  gl_PointSize = clamp((0.45 + fract(s * 13.7)) * uPointScale / -mv.z, 1.0, 6.0);
}
`;

const dustFragment = /* glsl */ `
uniform float uOpacity;
varying float vTwinkle;
varying float vHeat;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d) * vTwinkle * uOpacity;
  if (a < 0.01) discard;
  vec3 col = mix(vec3(0.62, 0.76, 1.0), vec3(1.0, 0.8, 0.5), vHeat);
  gl_FragColor = vec4(col, a);
}
`;

/** Deterministic dust layout, so the halo is identical on every launch. */
function buildDustGeometry(count: number): THREE.BufferGeometry {
  let seed = 0x2f6b3a1d;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const orbit = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    const halo = rand() < 0.18;
    const r = halo ? DISK_OUTER * (1.1 + 2.2 * rand()) : DISK_OUTER * (0.9 + 1.3 * Math.pow(rand(), 1.7));
    const gauss = rand() + rand() + rand() - 1.5;
    orbit[i * 4] = r;
    orbit[i * 4 + 1] = rand() * Math.PI * 2;
    orbit[i * 4 + 2] = gauss * (halo ? 0.18 * r : 0.035 * r + 0.15);
    orbit[i * 4 + 3] = rand();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aOrbit', new THREE.BufferAttribute(orbit, 4));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), DISK_OUTER * 3.6);
  return geometry;
}

function createLensMaterial(quality: Quality): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    defines: {
      STEPS: quality.steps,
      STEP_K: quality.stepScale.toFixed(3),
      NOISE_OCT: quality.noiseOctaves,
      MAX_HITS: quality.maxHits,
      RING_W: quality.ringWidth.toFixed(3),
    },
    uniforms: {
      uTime: { value: 0 },
      uCamDist: { value: 50 },
      uTempPeak: { value: 9000 },
      uTint: { value: new THREE.Color() },
      uTintMix: { value: 0.5 },
      uIntensity: { value: 1 },
    },
    vertexShader: quadVertex,
    fragmentShader: lensFragment,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    depthTest: false,
  });
}

/** Where the hole sits for a given viewport (world units at z = 0) and menu mode. */
function layoutFor(vw: number, vh: number, mode: Mode) {
  if (vw / vh < 0.85) {
    // Portrait phone: top fifth of the screen, above the bottom-aligned hero
    // copy, with the disk overflowing both edges.
    const s = Math.min(vw * 1.28, vh * 0.62);
    return mode === 'creator' ? { x: vw * 0.08, y: vh * 0.36, s: s * 0.7 } : { x: vw * 0.05, y: vh * 0.31, s };
  }
  const s = Math.min(vh * 1.05, vw * 0.55);
  return mode === 'creator' ? { x: vw * 0.32, y: vh * 0.14, s: s * 0.72 } : { x: vw * 0.28, y: vh * 0.02, s };
}

const UP = new THREE.Vector3(0, 1, 0);
// Disk-frame basis of the virtual camera: right, up, towards-camera.
const DISK_BASIS_T = new THREE.Matrix4()
  .makeBasis(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, Math.cos(INCLINATION), -Math.sin(INCLINATION)),
    new THREE.Vector3(0, Math.sin(INCLINATION), Math.cos(INCLINATION)),
  )
  .transpose();

export const MenuBlackHole: React.FC<{
  theme: MenuBlackHoleTheme;
  profile: RenderProfile;
  reducedMotion: boolean;
  mode: Mode;
}> = ({ theme, profile, reducedMotion, mode }) => {
  const quality = useMemo(() => menuBlackHoleQuality(profile), [profile]);
  const anchorRef = useRef<THREE.Group>(null);
  const quadRef = useRef<THREE.Mesh>(null);
  const frameRef = useRef<THREE.Group>(null);
  const dustRef = useRef<THREE.Points>(null);
  const time = useRef(PRE_SHEAR_SECONDS);
  const layout = useRef({ x: 0, y: 0, s: 1, intensity: 1, ready: false });

  const lensMaterial = useMemo(() => createLensMaterial(quality), [quality]);
  const quadGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(LENS_X * 2, LENS_Y_MAX - LENS_Y_MIN);
    geometry.translate(0, (LENS_Y_MAX + LENS_Y_MIN) / 2, 0);
    return geometry;
  }, []);
  const funnelGeometry = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(GRID_EXTENT * 2, GRID_EXTENT * 2, quality.gridSegments, quality.gridSegments);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }, [quality.gridSegments]);
  const funnelMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0.3 },
      uColorNear: { value: new THREE.Color('#5fe3ff') },
      uColorFar: { value: new THREE.Color(theme.gridFar) },
    },
    vertexShader: funnelVertex,
    fragmentShader: funnelFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  const dustGeometry = useMemo(() => buildDustGeometry(quality.dust), [quality.dust]);
  const dustMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPointScale: { value: 40 }, uOpacity: { value: 0.85 } },
    vertexShader: dustVertex,
    fragmentShader: dustFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), []);

  useEffect(() => () => lensMaterial.dispose(), [lensMaterial]);
  useEffect(() => () => funnelGeometry.dispose(), [funnelGeometry]);
  useEffect(() => () => dustGeometry.dispose(), [dustGeometry]);
  useEffect(() => () => {
    quadGeometry.dispose();
    funnelMaterial.dispose();
    dustMaterial.dispose();
  }, [quadGeometry, funnelMaterial, dustMaterial]);

  // Theme targets. Uniforms ease toward these so choosing a preset in the
  // creator re-colours the disk smoothly instead of popping.
  const targetTint = useMemo(() => new THREE.Color(theme.diskTint), [theme.diskTint]);
  const targetGridFar = useMemo(() => new THREE.Color(theme.gridFar), [theme.gridFar]);
  const scratch = useMemo(() => ({
    p: new THREE.Vector3(),
    w: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    r2: new THREE.Vector3(),
    u2: new THREE.Vector3(),
    view: new THREE.Matrix4(),
    frame: new THREE.Matrix4(),
    q: new THREE.Quaternion(),
    parentQ: new THREE.Quaternion(),
  }), []);

  useFrame((state, delta) => {
    const anchor = anchorRef.current;
    const quad = quadRef.current;
    const frame = frameRef.current;
    const dust = dustRef.current;
    if (!anchor || !quad || !frame || !dust) return;
    const dt = Math.min(delta, 0.05);
    if (!reducedMotion) time.current += dt;

    // Layout: ease between landing/creator placements and follow resizes.
    const L = layout.current;
    const target = layoutFor(state.viewport.width, state.viewport.height, mode);
    const ease = L.ready ? 1 - Math.exp(-dt * 2.4) : 1;
    L.x += (target.x - L.x) * ease;
    L.y += (target.y - L.y) * ease;
    L.s += (target.s - L.s) * ease;
    L.intensity += ((mode === 'creator' ? 0.72 : 1) - L.intensity) * ease;
    L.ready = true;
    anchor.position.set(L.x, L.y, 0);
    // One world scale for everything: world units per rs.
    const unit = L.s / LAYOUT_SPAN;
    quad.scale.setScalar(unit);
    frame.scale.setScalar(unit);
    dust.scale.setScalar(unit);

    // Orientation: billboard the quad toward the camera, then derive the disk
    // frame from the impostor's virtual camera so geometry lines up with it.
    const { p, w, right, up, r2, u2, view, q, parentQ } = scratch;
    anchor.updateWorldMatrix(true, false);
    p.setFromMatrixPosition(anchor.matrixWorld);
    w.subVectors(state.camera.position, p);
    const distance = w.length();
    w.divideScalar(distance);
    right.crossVectors(UP, w).normalize();
    up.crossVectors(w, right);
    const cr = Math.cos(ROLL);
    const sr = Math.sin(ROLL);
    r2.copy(right).multiplyScalar(cr).addScaledVector(up, sr);
    u2.copy(up).multiplyScalar(cr).addScaledVector(right, -sr);
    view.makeBasis(r2, u2, w);
    if (anchor.parent) anchor.parent.getWorldQuaternion(parentQ).invert();
    else parentQ.identity();
    q.setFromRotationMatrix(view);
    quad.quaternion.copy(parentQ).multiply(q);
    scratch.frame.multiplyMatrices(view, DISK_BASIS_T);
    q.setFromRotationMatrix(scratch.frame);
    frame.quaternion.copy(parentQ).multiply(q);
    // The dust shares the disk frame but draws after the impostor (additive
    // sparkles over the disk), so it is a sibling mirroring the transform.
    dust.quaternion.copy(frame.quaternion);

    const themeEase = 1 - Math.exp(-dt * 3);
    const lens = lensMaterial.uniforms;
    lens.uTime.value = time.current;
    lens.uCamDist.value = distance / unit;
    lens.uIntensity.value = L.intensity;
    lens.uTint.value.lerp(targetTint, themeEase);
    lens.uTintMix.value += (theme.tintMix - lens.uTintMix.value) * themeEase;
    lens.uTempPeak.value += (theme.diskTemperature - lens.uTempPeak.value) * themeEase;

    funnelMaterial.uniforms.uTime.value = time.current;
    funnelMaterial.uniforms.uOpacity.value = 0.3 * L.intensity;
    funnelMaterial.uniforms.uColorFar.value.lerp(targetGridFar, themeEase);

    const camera = state.camera as THREE.PerspectiveCamera;
    dustMaterial.uniforms.uTime.value = time.current;
    // World-space point size → pixels at unit view depth.
    dustMaterial.uniforms.uPointScale.value =
      (0.018 * state.size.height * state.gl.getPixelRatio() * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov ?? 47) / 2);
    dustMaterial.uniforms.uOpacity.value = 0.85 * L.intensity;
  });

  return (
    <group ref={anchorRef}>
      <group ref={frameRef}>
        <mesh geometry={funnelGeometry} material={funnelMaterial} rotation={[GRID_EXTRA_TILT, 0, 0]} renderOrder={1} raycast={() => {}} frustumCulled={false} />
      </group>
      <mesh ref={quadRef} geometry={quadGeometry} material={lensMaterial} renderOrder={2} raycast={() => {}} frustumCulled={false} />
      <points ref={dustRef} geometry={dustGeometry} material={dustMaterial} renderOrder={3} raycast={() => {}} frustumCulled={false} />
    </group>
  );
};

export default MenuBlackHole;
