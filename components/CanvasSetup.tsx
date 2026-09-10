import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { getE2EConfig } from '../utils/e2eConfig';
import {
  classifyDeviceCapabilities,
  combineDeviceTiers,
  DeviceTierHysteresis,
  type DeviceTier,
} from '../utils/deviceCapabilities';

/**
 * Device capability tiering.
 *
 * `low`  → outdated / memory-constrained mobile GPUs. Bloom is reduced
 *          and brightness is recovered via tone-mapping exposure instead, so we
 *          retain a small mipmap bloom budget on weak hardware.
 * `high` → desktop *and* capable phones. Gets the bloom-driven look so the
 *          cosmos and gravity grid read identically across devices.
 */
export type { DeviceTier } from '../utils/deviceCapabilities';

/** Rendering-only budgets. TODO: profile fill rate on older GPUs before further tuning. */
export function environmentQualityForDevice(tier: DeviceTier, isTouch = false) {
  const low = tier === 'low';
  return {
    gasBackgroundLayers: low ? 2 : 4,
    gasLocalLayers: low ? 1 : 2,
    gasEmitterCap: 2,
    gasOctaves: low ? 3 : 5,
    gasOpacity: low ? 0.10 : 0.12,
    reflectionResolution: low ? 32 : 64,
    reflectionIntensity: low ? 0.12 : 0.18,
    radiationEmitterCap: low ? 4 : 8,
    radiationSegments: low ? 12 : 24,
    radiationDetail: low ? 0 : 1,
    radiationAnimationRate: 1,
    dustCount: low ? 240 : isTouch ? 525 : 1500,
    dustSize: low ? 3.8 : 3,
    dustOpacityGain: low ? 1.65 : 1,
    dustMotion: low ? 0.5 : 1,
    orbitSegments: low ? 64 : 128,
    orbitRefreshHz: low ? 2 : 5,
    blackHoleCaptureResolution: low ? 128 : 256,
    blackHoleCaptureInterval: low ? 6 : 3,
    bloomResolutionScale: low ? 0.25 : 0.5,
    detailedBodyPixelRadius: low ? 110 : 0,

    // --- Collision / evolution event VFX ---
    //
    // These are TRANSIENT (1.2-5 s) and hard-capped, unlike everything above,
    // so a higher instantaneous budget is acceptable as long as nothing
    // sustains. Worst case on `high` at the concurrency cap: 12 additive quads
    // (24 triangles), 12 shared-geometry point clouds (768 points) and a
    // handful of 2048-triangle supernova shells — a rounding error against the
    // 400×400 gravity grid (320 k triangles) drawn every single frame.
    /** Hard ceiling on live effects; the oldest is evicted past this. */
    maxConcurrentEffects: low ? 4 : 12,
    /** Points in a debris burst. One draw call, geometry shared across effects. */
    debrisParticles: low ? 20 : 64,
    /** Relativistic jet cones on black-hole accretion. Two extra draw calls. */
    jetEnabled: !low,
    /** Supernova / accretion shell tessellation. 512 vs 2048 triangles. */
    compactShellSegments: low ? 16 : 32,
    /** Global multiplier on effect brightness; low tier has reduced bloom. */
    effectIntensity: low ? 0.7 : 1,
    /**
     * Debris BODIES (not particles) a single destructive impact may create.
     * This is a physics budget, not a rendering one: bodies cost O(N²) force
     * evaluations and compete for the hard 50-body cap that the gravity grid's
     * fixed-size uniform arrays impose.
     */
    maxFragmentsPerImpact: low ? 3 : 6,
  };
}
export type EnvironmentQuality = ReturnType<typeof environmentQualityForDevice>;

const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function detectIsTouch(): boolean {
  const e2e = getE2EConfig();
  if (e2e.touch != null) return e2e.touch;
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

export function useDeviceTier(): DeviceTier {
  return useMemo<DeviceTier>(() => {
    const e2e = getE2EConfig();
    if (e2e.tier) return e2e.tier;
    if (typeof navigator === 'undefined') return 'high';
    const isMobile = MOBILE_UA_REGEX.test(navigator.userAgent);
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    return classifyDeviceCapabilities({ memoryGb: memory, logicalCores: cores, isMobile, isTouch: detectIsTouch() });
  }, []);
}

function readRendererStrings(gl: THREE.WebGLRenderer): { renderer?: string; vendor?: string } {
  const ctx = gl.getContext();
  const ext = ctx.getExtension('WEBGL_debug_renderer_info');
  if (!ext) return {};
  return {
    renderer: String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) ?? ''),
    vendor: String(ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) ?? ''),
  };
}

/** Refines the pre-canvas tier with real WebGL limits and sustained frame timing. */
export function DeviceCapabilityProbe({
  initialTier,
  onTierChange,
}: {
  initialTier: DeviceTier;
  onTierChange: (tier: DeviceTier) => void;
}): null {
  const gl = useThree((s) => s.gl);
  const adaptive = useRef(new DeviceTierHysteresis(initialTier));
  const warmupFrames = useRef(0);

  useEffect(() => {
    const ctx = gl.getContext();
    const strings = readRendererStrings(gl);
    const refined = combineDeviceTiers(initialTier, classifyDeviceCapabilities({
      ...strings,
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext,
      maxTextureSize: gl.capabilities.maxTextureSize,
      maxRenderbufferSize: Number(ctx.getParameter(ctx.MAX_RENDERBUFFER_SIZE)),
    }));
    adaptive.current = new DeviceTierHysteresis(refined);
    onTierChange(refined);
  }, [gl, initialTier, onTierChange]);

  useFrame((_, delta) => {
    if (document.hidden || warmupFrames.current++ < 120) return;
    const fps = 1 / Math.max(delta, 1e-4);
    const changed = adaptive.current.observe(fps);
    if (changed) onTierChange(changed);
  });
  return null;
}

/**
 * Enforces a consistent, correct render pipeline on *every* device — desktop,
 * PWA, and Capacitor/WebView wrappers — so the scene is never darker on mobile.
 *
 * Why this exists:
 *  - Color space: some embedded WebViews do not default to sRGB output, which
 *    crushes every colour toward black. We pin `SRGBColorSpace` explicitly.
 *  - Tone mapping: kept identical across devices; exposure is the *only* knob we
 *    vary, and only to compensate for reduced bloom on the `low` tier.
 *  - Pixel ratio: clamped to 2 so 3x/4x phones don't render the emissive grid
 *    lines into sub-pixel oblivion (and don't melt the fill-rate budget).
 */
export function RendererConfig({
  exposure = 1,
  managePixelRatio = true,
  maxPixelRatio = 2,
  onContextLost,
  onContextRestored,
}: {
  exposure?: number;
  /** Clamp `devicePixelRatio` here. Disable when the host `<Canvas dpr>` prop
   *  already owns the pixel ratio (avoids the two fighting on resize). */
  managePixelRatio?: boolean;
  maxPixelRatio?: number;
  onContextLost?: () => void;
  onContextRestored?: () => void;
}): null {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    THREE.ColorManagement.enabled = true;
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.ACESFilmicToneMapping;

    const applyPixelRatio = () => {
      const ratio = Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, maxPixelRatio);
      gl.setPixelRatio(ratio);
    };
    if (managePixelRatio) {
      applyPixelRatio();
      window.addEventListener('resize', applyPixelRatio);
    }

    const canvas = gl.domElement;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      onContextLost?.();
    };
    const handleContextRestored = () => {
      THREE.ColorManagement.enabled = true;
      gl.outputColorSpace = THREE.SRGBColorSpace;
      gl.toneMapping = THREE.ACESFilmicToneMapping;
      gl.toneMappingExposure = exposure;
      if (managePixelRatio) applyPixelRatio();
      onContextRestored?.();
      invalidate();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost, false);
    canvas.addEventListener('webglcontextrestored', handleContextRestored, false);

    return () => {
      if (managePixelRatio) window.removeEventListener('resize', applyPixelRatio);
      canvas.removeEventListener('webglcontextlost', handleContextLost);
      canvas.removeEventListener('webglcontextrestored', handleContextRestored);
    };
  }, [gl, managePixelRatio, maxPixelRatio, onContextLost, onContextRestored, invalidate, exposure]);

  useEffect(() => {
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);

  return null;
}

/**
 * Tone-mapping exposure per tier / input mode.
 * Desktop bloom carries most grid luminance; touch and `low` tiers need extra
 * exposure because bloom is reduced or disabled on mobile GPUs.
 */
export function exposureForTier(tier: DeviceTier, isTouch = false): number {
  if (tier === 'low') return isTouch ? 1.68 : 1.58;
  if (isTouch) return 1.14;
  return 1.0;
}

/** Scales spacetime-grid line color/alpha when bloom is reduced (touch / low tier). */
export function gridVisualBoostForDevice(
  tier: DeviceTier,
  isTouch: boolean,
  postFxEnabled: boolean,
): number {
  if (!postFxEnabled) return 2.35;
  if (tier === 'low') return 2.1;
  if (isTouch) return 1.85;
  return 1.0;
}

/**
 * Adaptive post-processing.
 *
 *  - Desktop (`high`, non-touch): full stack — bloom + film grain + vignette.
 *  - Capable mobile (`high`, touch): a single lightweight mipmap bloom so the
 *    grid/cosmos glow matches desktop without the cost of grain/vignette.
 *  - Weak mobile (`low`): quarter-resolution, three-level bloom plus exposure.
 */
export function AdaptivePostFX({ tier, isTouch }: { tier: DeviceTier; isTouch: boolean }): React.ReactElement | null {
  if (tier === 'low') {
    return (
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom luminanceThreshold={0.28} mipmapBlur intensity={1.35} radius={0.72} resolutionScale={0.25} levels={3} />
      </EffectComposer>
    );
  }

  if (isTouch) {
    return (
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          luminanceThreshold={0.28}
          mipmapBlur
          intensity={1.48}
          radius={0.78}
        />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={0}>
      <Bloom luminanceThreshold={0.5} mipmapBlur intensity={1.2} />
      <Noise opacity={0.03} />
      <Vignette darkness={0.3} />
    </EffectComposer>
  );
}
