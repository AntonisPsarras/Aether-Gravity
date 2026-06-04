import React, { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { getE2EConfig } from '../utils/e2eConfig';

/**
 * Device capability tiering.
 *
 * `low`  → outdated / memory-constrained mobile GPUs. Post-processing is dropped
 *          and brightness is recovered via tone-mapping exposure instead, so we
 *          never pay for a full-screen bloom pass on weak hardware.
 * `high` → desktop *and* capable phones. Gets the bloom-driven look so the
 *          cosmos and gravity grid read identically across devices.
 */
export type DeviceTier = 'low' | 'high';

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
    if (!isMobile) return 'high';
    const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const cores = navigator.hardwareConcurrency ?? 8;
    return memory <= 4 || cores <= 4 ? 'low' : 'high';
  }, []);
}

/**
 * Enforces a consistent, correct render pipeline on *every* device — desktop,
 * PWA, and Capacitor/WebView wrappers — so the scene is never darker on mobile.
 *
 * Why this exists:
 *  - Color space: some embedded WebViews do not default to sRGB output, which
 *    crushes every colour toward black. We pin `SRGBColorSpace` explicitly.
 *  - Tone mapping: kept identical across devices; exposure is the *only* knob we
 *    vary, and only to compensate for bloom being disabled on the `low` tier.
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
 *  - Weak mobile (`low`): nothing — brightness is handled by exposure instead.
 */
export function AdaptivePostFX({ tier, isTouch }: { tier: DeviceTier; isTouch: boolean }): React.ReactElement | null {
  if (tier === 'low') return null;

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
