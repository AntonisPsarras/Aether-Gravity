import React, { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

import {
  AdaptivePostFX,
  DeviceCapabilityProbe,
  exposureForTier,
  profileForTier,
  RendererConfig,
  type DeviceTier,
  useDeviceTier,
} from './CanvasSetup';
import { resolveRenderProfile, type RenderProfile } from '../utils/graphicsQuality';
import { useStore } from '../utils/store';
import { EnvironmentProvider, useReducedMotion } from './Environment/EnvironmentContext';
import { GasClouds } from './Environment/GasClouds';
import { MenuBlackHole, type MenuBlackHoleTheme } from './MenuBlackHole';
import { getE2EConfig } from '../utils/e2eConfig';

type MenuBackgroundMode = 'landing' | 'creator';

type MenuSpaceBackgroundProps = {
  mode?: MenuBackgroundMode;
  presetId?: string | null;
};

type Theme = {
  accent: string;
  secondary: string;
  disk: MenuBlackHoleTheme;
};

// Each creator preset re-colours the black hole's disk and grid, so choosing an
// origin still changes the scene behind the composer.
const THEMES: Record<string, Theme> = {
  'solar-system': { accent: '#f9d423', secondary: '#77b8ff', disk: { diskTemperature: 7000, diskTint: '#ff8a3d', tintMix: 0.45, gridFar: '#3d5bd6' } },
  'trappist-1': { accent: '#ff765d', secondary: '#c86cff', disk: { diskTemperature: 5200, diskTint: '#ff3d6e', tintMix: 0.55, gridFar: '#7a3fd1' } },
  // The Play Store feature graphic: white-hot core, ember rim, violet bands.
  procedural: { accent: '#92d7ff', secondary: '#b777ff', disk: { diskTemperature: 8000, diskTint: '#9a5cff', tintMix: 0.85, gridFar: '#4b3fc4' } },
};

const qualityForMenu = (profile: RenderProfile) => ({
  stars: profile === 'quality' ? 3200 : 1200,
  /**
   * Up to four full-screen fbm gas layers — the largest fill-rate cost after
   * the black hole, and so the first thing to reach for if Quality drops frames
   * on a phone. It follows the PROFILE rather than touch now: gating it on
   * `!isTouch` meant the nebula could never appear on mobile, however capable
   * the device, which is exactly the desktop/mobile disparity being fixed.
   */
  gas: profile === 'quality',
  pointerDepth: profile === 'quality' ? 0.48 : 0.2,
});

const MenuScene: React.FC<MenuSpaceBackgroundProps & { profile: RenderProfile; gpuEffectsOk: boolean; onContextLost: () => void; onContextRestored: () => void }> = ({ mode = 'landing', presetId, profile, gpuEffectsOk, onContextLost, onContextRestored }) => {
  const reducedMotion = useReducedMotion();
  const quality = qualityForMenu(profile);
  const theme = THEMES[presetId ?? 'procedural'] ?? THEMES.procedural;
  const rigRef = useRef<THREE.Group>(null);
  const pointer = useRef(new THREE.Vector2());
  const scroll = useRef(0);

  useEffect(() => {
    if (reducedMotion) return;
    const move = (event: PointerEvent) => pointer.current.set((event.clientX / window.innerWidth - 0.5) * 2, (event.clientY / window.innerHeight - 0.5) * 2);
    const scrollSurface = document.querySelector<HTMLElement>('.main-menu-scroll');
    const updateScroll = () => { scroll.current = Math.min(1, (scrollSurface?.scrollTop ?? 0) / Math.max(window.innerHeight, 1)); };
    window.addEventListener('pointermove', move, { passive: true });
    scrollSurface?.addEventListener('scroll', updateScroll, { passive: true });
    return () => { window.removeEventListener('pointermove', move); scrollSurface?.removeEventListener('scroll', updateScroll); };
  }, [reducedMotion]);

  useFrame(({ clock }, delta) => {
    if (!rigRef.current || reducedMotion) return;
    const alpha = 1 - Math.exp(-delta * 2.8);
    const targetX = pointer.current.x * quality.pointerDepth;
    const targetY = -pointer.current.y * quality.pointerDepth - scroll.current * 0.8 + Math.sin(clock.elapsedTime * 0.12) * 0.08;
    rigRef.current.position.x = THREE.MathUtils.lerp(rigRef.current.position.x, targetX, alpha);
    rigRef.current.position.y = THREE.MathUtils.lerp(rigRef.current.position.y, targetY, alpha);
    rigRef.current.rotation.y = THREE.MathUtils.lerp(rigRef.current.rotation.y, pointer.current.x * 0.025, alpha);
  });

  return (
    <>
      <RendererConfig exposure={exposureForTier(profile)} managePixelRatio={false} onContextLost={onContextLost} onContextRestored={onContextRestored} />
      <color attach="background" args={['#04060c']} />
      <Stars radius={125} depth={72} count={quality.stars} factor={profile === 'quality' ? 3.5 : 2.5} saturation={0.3} fade speed={reducedMotion ? 0 : 0.25} />
      {quality.gas && <GasClouds menu />}
      <group ref={rigRef}>
        <MenuBlackHole theme={theme.disk} profile={profile} reducedMotion={reducedMotion} mode={mode} />
      </group>
      {gpuEffectsOk && <AdaptivePostFX profile={profile} />}
    </>
  );
};

const MenuSpaceBackground: React.FC<MenuSpaceBackgroundProps> = ({ mode = 'landing', presetId = null }) => {
  const detectedTier = useDeviceTier();
  const e2eConfig = getE2EConfig();
  const storedGraphicsMode = useStore((s) => s.graphicsMode);
  const graphicsMode = e2eConfig.graphics ?? storedGraphicsMode;
  const [hardwareTier, setHardwareTier] = useState<DeviceTier>(detectedTier);
  const [gpuEffectsOk, setGpuEffectsOk] = useState(true);
  /**
   * The menu honours the same preference as the simulation, but never runs the
   * live frame-time controller: the menu is transient, and a profile pop while
   * someone reads the title screen is pure noise. In Auto it simply uses the
   * hardware seed.
   */
  const profile: RenderProfile = !gpuEffectsOk
    ? 'performance'
    : e2eConfig.tier
      ? profileForTier(e2eConfig.tier)
      : resolveRenderProfile(graphicsMode, profileForTier(hardwareTier));
  const handleHardwareTier = useCallback((tier: DeviceTier) => {
    if (!e2eConfig.tier) setHardwareTier(tier);
  }, [e2eConfig.tier]);
  const theme = THEMES[presetId ?? 'procedural'] ?? THEMES.procedural;
  const themeVars = { '--menu-accent': theme.accent, '--menu-secondary': theme.secondary } as React.CSSProperties;

  return (
    <div className="menu-space-background fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden data-gpu-effects={gpuEffectsOk ? 'on' : 'fallback'}>
      <div className="menu-space-fallback" style={themeVars} />
      {gpuEffectsOk && (
        <Canvas
          className="!absolute inset-0"
          camera={{ position: [0, 1, 13], fov: 47, near: 0.1, far: 220 }}
          key={profile}
          dpr={profile === 'quality' ? [1, 1.5] : 1}
          gl={{ antialias: profile === 'quality', alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            // Run before Three's own target listeners. Unmounting synchronously
            // prevents a lost context from being rendered for one more frame.
            gl.domElement.addEventListener('webglcontextlost', (event) => {
              event.preventDefault();
              flushSync(() => setGpuEffectsOk(false));
            }, { capture: true, once: true });
          }}
        >
          <EnvironmentProvider profile={profile}>
            {!e2eConfig.tier && <DeviceCapabilityProbe initialTier={detectedTier} onHardwareTier={handleHardwareTier} />}
            <MenuScene
              mode={mode}
              presetId={presetId}
              profile={profile}
              gpuEffectsOk
              onContextLost={() => setGpuEffectsOk(false)}
              onContextRestored={() => setGpuEffectsOk(true)}
            />
          </EnvironmentProvider>
        </Canvas>
      )}
      <div className="menu-space-grade" />
      <div className="menu-space-glow" style={themeVars} />
    </div>
  );
};

export default MenuSpaceBackground;
