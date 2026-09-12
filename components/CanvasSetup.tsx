import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom, Vignette, Noise } from '@react-three/postprocessing';
import * as THREE from 'three';
import { getE2EConfig } from '../utils/e2eConfig';
import {
  classifyDeviceCapabilities,
  combineDeviceTiers,
  type DeviceTier,
} from '../utils/deviceCapabilities';
import { AutoGraphicsController } from '../utils/autoGraphics';
import type { RenderProfile } from '../utils/graphicsQuality';

/**
 * Render profiles.
 *
 * Profiles change *cost*, never *look*. `performance` renders at lower
 * resolution, density and sampling; `quality` renders the full desktop budget.
 * Every visual FEATURE is present in both — no effect is switched off, no
 * shader branch is removed — so the only difference a user can point at is
 * sharpness. Exposure, bloom threshold/intensity and grid brightness are
 * identical, so the scene reads the same on a phone as on desktop.
 *
 * The one legitimate exception is *distance* LOD (`detailedBodyPixelRadius`):
 * a body smaller than that many pixels drops to the cheap shader path. That is
 * a function of apparent size, not of the device, so it never removes detail
 * the viewer could actually resolve.
 */
export type { DeviceTier } from '../utils/deviceCapabilities';
export type { RenderProfile } from '../utils/graphicsQuality';

/**
 * Bridges the hardware guess into a starting profile. This is a SEED, never a
 * ceiling — see `AutoGraphicsController`.
 */
export const profileForTier = (tier: DeviceTier): RenderProfile =>
  tier === 'low' ? 'performance' : 'quality';

/**
 * The legacy `DeviceTier` axis, derived from the profile, for the many render
 * call sites still written in terms of it.
 */
export const renderTierFor = (profile: RenderProfile): DeviceTier =>
  profile === 'quality' ? 'high' : 'low';

/** Rendering-only budgets. TODO: profile fill rate on older GPUs before further tuning. */
export function environmentQualityForDevice(profile: RenderProfile) {
  const low = profile === 'performance';
  return {
    gasBackgroundLayers: low ? 2 : 4,
    gasLocalLayers: low ? 1 : 2,
    gasEmitterCap: 2,
    gasOctaves: low ? 3 : 5,
    /** Same fragment count either way — a difference here would be pure look. */
    gasOpacity: 0.12,
    reflectionResolution: low ? 32 : 64,
    /**
     * How brightly the environment radiance lights bodies. Same on both: this
     * is a lighting level, not a cost — the resolution above is the cost knob.
     */
    reflectionIntensity: 0.18,
    radiationEmitterCap: low ? 4 : 8,
    radiationSegments: low ? 12 : 24,
    radiationDetail: low ? 0 : 1,
    radiationAnimationRate: 1,
    dustCount: low ? 525 : 1500,
    dustSize: low ? 3.4 : 3,
    dustOpacityGain: low ? 1.3 : 1,
    dustMotion: low ? 0.5 : 1,
    orbitSegments: low ? 64 : 128,
    orbitRefreshHz: low ? 2 : 5,
    blackHoleCaptureResolution: low ? 128 : 256,
    blackHoleCaptureInterval: low ? 6 : 3,
    /**
     * Bloom working resolution, read by `AdaptivePostFX`. `undefined` on
     * quality deliberately: the desktop path never passed the prop, so leaving
     * it unset keeps the library default and guarantees Quality is byte-identical
     * to what desktop renders today rather than merely close to it.
     */
    bloomResolutionScale: low ? 0.5 : undefined,
    /**
     * Distance LOD only — a body projecting smaller than this many pixels takes
     * the cheap shader path. `quality` resolves every body in full.
     */
    detailedBodyPixelRadius: low ? 90 : 0,
    /**
     * Raymarch steps for the black-hole accretion disk. The disk stays
     * raymarched on BOTH profiles (billboard stand-ins were a look change);
     * this step count is the fill-rate knob instead, and it is the first thing
     * to cut if `performance` misses 60fps on black-hole scenes.
     */
    blackHoleDiskSteps: low ? 24 : 48,

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
    debrisParticles: low ? 24 : 64,
    /**
     * Relativistic jet cones on black-hole accretion. Two extra draw calls.
     * On in both profiles: removing them was a look change, and two draw calls
     * are not where a phone's frame budget goes.
     */
    jetEnabled: true,
    /** Supernova / accretion shell tessellation. 512 vs 2048 triangles. */
    compactShellSegments: low ? 20 : 32,
    /**
     * Global multiplier on effect brightness. 1 on both profiles: it existed
     * only to compensate for the weaker low-tier bloom, and `performance` now
     * runs the same bloom response at half resolution. A brightness difference
     * is a look change with no cost attached.
     */
    effectIntensity: 1,

    // --- Spacetime grid lattice (utils/gridLattice.ts) ---
    //
    // Vertex work is vertices × bodies. With every disc in use: ~159.7 k
    // vertices on quality, ~70.2 k on performance. The performance budget was
    // raised from 104/118 rings/spokes because `applyLatticeLod` widens every
    // well it cannot resolve by `LOD_CELLS_PER_CORE × cell size` — so a coarse
    // lattice does not merely look blocky, it renders funnels that are
    // measurably too wide and too shallow. At 104/118 a Solar System's Saturn
    // fell through unresolved and was drawn 24% too wide. 118 spokes also made
    // cells strongly anisotropic (~2.1 L* of arc against a ~1 L* radial step at
    // r = 40), which feeds anisotropic `fwidth` straight into the line-LOD term.
    //
    // Cheapen here: fewer rings/spokes widen every unresolved well's LOD core,
    // and fewer anchors leave distant secondary wells softer. Do NOT cheapen by
    // dropping to one line level — see `gridLineLevels` below.
    /**
     * Primary-lattice rings out to 4000 L*. 200×200 on performance is the
     * smallest budget at which the lattice still resolves every well a Solar
     * System scene contains — i.e. the cheapest lattice that changes line
     * DENSITY without changing the SHAPE of any funnel. It costs 70.2 k
     * vertices against quality's 159.7 k.
     */
    gridRings: low ? 200 : 270,
    /** Primary-lattice rings of the coarsening tail out to 2×10⁷ L*. */
    gridTailRings: low ? 22 : 30,
    gridSpokes: low ? 200 : 320,
    gridDiscRings: low ? 96 : 150,
    gridDiscSpokes: low ? 132 : 210,
    /**
     * Primary plus secondary (disc) lattices. Three on both profiles: dropping
     * to two left the second-strongest well unresolved, and `applyLatticeLod`
     * then widened it into a visibly wrong, shallow funnel.
     */
    gridMaxAnchors: 3,
    /**
     * Grid-line levels cross-faded per pixel. ALWAYS 2.
     *
     * One level takes the `floor(lod + 0.5)` branch in the grid fragment shader,
     * which SNAPS line spacing rather than cross-fading it: any per-quad jitter
     * in `lod` jumps the spacing by 4x, tiling the surface into blocks of two
     * different densities that flicker as the camera moves. That was the
     * reported "buggy curvature graph" on mobile. Two levels cost ~10 extra ALU
     * ops per grid fragment — far too little to buy back a broken surface.
     */
    gridLineLevels: 2,
  };
}
export type EnvironmentQuality = ReturnType<typeof environmentQualityForDevice>;

/**
 * Budgets that change the SIMULATION, not the picture.
 *
 * Deliberately separate from `environmentQualityForDevice` and keyed on the
 * hardware `DeviceTier`, never on the user's graphics mode. Debris bodies cost
 * O(N²) force evaluations and compete for the hard 50-body cap the gravity
 * grid's fixed-size uniform arrays impose, so a weak CPU must be allowed fewer
 * of them — but picking "Performance" for a smoother picture must never change
 * what the physics actually does, or two users watching the same collision
 * would see different outcomes.
 */
export function physicsBudgetForTier(tier: DeviceTier) {
  return {
    /** Debris BODIES (not particles) a single destructive impact may create. */
    maxFragmentsPerImpact: tier === 'low' ? 3 : 6,
  };
}

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

/**
 * Refines the pre-canvas hardware tier with real WebGL limits, and — only in
 * Auto — drives the live render profile from sustained frame timing.
 *
 * The two outputs are deliberately separate callbacks. `onHardwareTier` is a
 * statement about the DEVICE and is the only one allowed to reach the physics
 * timestep; `onProfileChange` is a statement about the PICTURE. Merging them
 * (as the single `onTierChange` used to) meant a frame-rate dip silently
 * changed the integrator's step size mid-session.
 */
export function DeviceCapabilityProbe({
  initialTier,
  onHardwareTier,
  onProfileChange,
}: {
  initialTier: DeviceTier;
  onHardwareTier: (tier: DeviceTier) => void;
  /** Omitted outside Auto, which disables frame-time observation entirely. */
  onProfileChange?: (profile: RenderProfile) => void;
}): null {
  const gl = useThree((s) => s.gl);
  const auto = useRef(new AutoGraphicsController(profileForTier(initialTier)));

  useEffect(() => {
    const ctx = gl.getContext();
    const strings = readRendererStrings(gl);
    const refined = combineDeviceTiers(initialTier, classifyDeviceCapabilities({
      ...strings,
      webgl2: typeof WebGL2RenderingContext !== 'undefined' && ctx instanceof WebGL2RenderingContext,
      maxTextureSize: gl.capabilities.maxTextureSize,
      maxRenderbufferSize: Number(ctx.getParameter(ctx.MAX_RENDERBUFFER_SIZE)),
    }));
    // The refined tier only SEEDS the controller. It is not a ceiling: a phone
    // that sustains 60fps must be able to reach `quality` regardless of what
    // `navigator.deviceMemory` claimed.
    auto.current = new AutoGraphicsController(profileForTier(refined));
    onHardwareTier(refined);
  }, [gl, initialTier, onHardwareTier]);

  useFrame((_, delta) => {
    if (!onProfileChange || document.hidden) return;
    const changed = auto.current.observe(delta);
    if (changed) onProfileChange(changed);
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
 * Tone-mapping exposure. Identical on every tier and input mode.
 *
 * This used to lift touch (1.14) and `low` (1.68) devices on the assumption
 * that their bloom was weaker — but those paths actually ran a *stronger*,
 * lower-threshold bloom than desktop. Stacked with the grid boost below, that
 * blew phones out to a white haze toward the horizon. Kept as a function so
 * callers (SpaceCanvas, MenuSpaceBackground) have one place to ask.
 */
export function exposureForTier(_profile?: RenderProfile): number {
  return 1.0;
}

/**
 * Spacetime-grid line color/alpha multiplier. 1 whenever bloom is running —
 * bloom is identical on every tier, so the grid is too. Only the no-post-FX
 * fallback (GPU effects disabled after a context loss) needs a lift, because
 * bloom is then genuinely absent.
 */
export function gridVisualBoostForDevice(postFxEnabled: boolean): number {
  return postFxEnabled ? 1.0 : 2.35;
}

/** Shared bloom response. Changing these changes every device together. */
const BLOOM_THRESHOLD = 0.5;
const BLOOM_INTENSITY = 1.2;

/**
 * Post-processing. Both profiles get the same bloom RESPONSE (threshold,
 * intensity, full mip chain), the same grain and the same vignette, so the
 * scene reads identically; only the bloom's working resolution differs. All
 * effects merge into a single EffectPass, so grain and vignette are a few ALU
 * ops per pixel rather than extra passes.
 *
 *  - `quality`     — full-resolution bloom + grain + vignette (the desktop path).
 *  - `performance` — half-resolution bloom + grain + vignette.
 *
 * The old third branch rendered quarter-resolution bloom with `levels={3}` and
 * dropped the grain entirely. Truncating the mip chain visibly cuts the glow
 * falloff short, which is a look change rather than a cost one, so it is gone.
 * `resolutionScale` is the knob to step down if `performance` misses 60fps —
 * `levels` is not.
 */
export function AdaptivePostFX({ profile }: { profile: RenderProfile }): React.ReactElement | null {
  const { bloomResolutionScale } = environmentQualityForDevice(profile);

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom
        luminanceThreshold={BLOOM_THRESHOLD}
        mipmapBlur
        intensity={BLOOM_INTENSITY}
        resolutionScale={bloomResolutionScale}
      />
      <Noise opacity={0.03} />
      <Vignette darkness={0.3} />
    </EffectComposer>
  );
}
