import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';

import './Planet/PlanetShaders';
import { PlanetSurfaceMaterial } from './Planet/PlanetShaders';
import { TEXTURE_IDS } from '../constants';
import {
  AdaptivePostFX,
  DeviceCapabilityProbe,
  detectIsTouch,
  exposureForTier,
  RendererConfig,
  type DeviceTier,
  useDeviceTier,
} from './CanvasSetup';
import { EnvironmentProvider, useEnvironment, useReducedMotion } from './Environment/EnvironmentContext';
import { GasClouds } from './Environment/GasClouds';
import { getE2EConfig } from '../utils/e2eConfig';

export type MenuBackgroundMode = 'landing' | 'creator';

type MenuSpaceBackgroundProps = {
  mode?: MenuBackgroundMode;
  presetId?: string | null;
};

type Theme = {
  accent: string;
  secondary: string;
  planetA: string;
  planetB: string;
  star: string;
  temperature: number;
};

const THEMES: Record<string, Theme> = {
  'solar-system': { accent: '#f9d423', secondary: '#77b8ff', planetA: '#24516f', planetB: '#162d4a', star: '#ffd27b', temperature: 5772 },
  'trappist-1': { accent: '#ff765d', secondary: '#c86cff', planetA: '#6d312d', planetB: '#241525', star: '#ff633f', temperature: 2566 },
  'alpha-centauri': { accent: '#ffe3a3', secondary: '#86b8ff', planetA: '#88744f', planetB: '#26374a', star: '#fff2c7', temperature: 5790 },
  procedural: { accent: '#92d7ff', secondary: '#b777ff', planetA: '#274c49', planetB: '#181f3f', star: '#a9d7ff', temperature: 8200 },
};

const qualityForMenu = (tier: DeviceTier, isTouch: boolean) => ({
  // TODO: profile menu-specific fill rate on older GPUs before introducing a
  // third quality tier. This hook deliberately builds on the shared detector.
  stars: tier === 'low' ? 850 : isTouch ? 1800 : 3200,
  dust: tier === 'low' ? 70 : isTouch ? 140 : 260,
  planetSegments: tier === 'low' ? 30 : 56,
  atmosphereSegments: tier === 'low' ? 24 : 44,
  orbitalAccents: tier === 'high',
  pointerDepth: tier === 'low' ? 0.12 : isTouch ? 0.2 : 0.48,
});

type PlanetSurfaceMat = THREE.ShaderMaterial & {
  uColor1: THREE.Color;
  uColor2: THREE.Color;
  uType: number;
  uTectonics: number;
  uAtmosphere: number;
  uWaterLevel: number;
  uMethane: number;
  uCloudDepth: number;
  uTemperature: number;
  uRadius: number;
  uOblateness: number;
  uMass: number;
  uState: number;
  uEmissiveStrength: number;
  uNorthPole: THREE.Vector3;
  uTime: number;
};

const StellarBeacon: React.FC<{ theme: Theme; reducedMotion: boolean; lowQuality: boolean }> = ({ theme, reducedMotion, lowQuality }) => {
  const starRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  useFrame(({ clock }, delta) => {
    if (!reducedMotion && starRef.current) starRef.current.rotation.y += delta * 0.055;
    if (haloRef.current) {
      const pulse = reducedMotion ? 1 : 1 + Math.sin(clock.elapsedTime * 0.8) * 0.035;
      haloRef.current.scale.setScalar(pulse);
    }
  });

  return (
    <group position={[-12.5, 4.5, -15]}>
      <pointLight color={theme.star} intensity={lowQuality ? 2.4 : 4.2} distance={95} decay={2} />
      <mesh ref={haloRef}>
        <sphereGeometry args={[4.1, lowQuality ? 20 : 32, lowQuality ? 20 : 32]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={0.055} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.BackSide} />
      </mesh>
      <mesh ref={starRef}>
        <sphereGeometry args={[2.45, lowQuality ? 24 : 40, lowQuality ? 24 : 40]} />
        <starSurfaceMaterial
          uColor={new THREE.Color(theme.star)}
          uSpeed={0.52}
          uTemperature={theme.temperature}
          uMetallicity={0.25}
          uConvection={5}
          uPulsation={0.13}
          uLuminosityClass={0}
          uFlareActivity={0.28}
          uMagnetic={0.16}
          uOblateness={0}
        />
      </mesh>
    </group>
  );
};

const HeroPlanet: React.FC<{ theme: Theme; tier: DeviceTier; reducedMotion: boolean; mode: MenuBackgroundMode }> = ({ theme, tier, reducedMotion, mode }) => {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<PlanetSurfaceMat>(null);
  const environment = useEnvironment();
  const { size } = useThree();
  const quality = qualityForMenu(tier, detectIsTouch());
  const radius = size.width < 700 ? 2.25 : 3.2;
  const atmosphereRadius = radius * 1.19;
  const northPole = useMemo(() => new THREE.Vector3(0.18, 0.98, 0.08).normalize(), []);

  const surface = useMemo(() => {
    const material = new PlanetSurfaceMaterial().clone() as PlanetSurfaceMat;
    material.uColor1.set(theme.planetA);
    material.uColor2.set(theme.planetB);
    material.uType = TEXTURE_IDS.rock;
    material.uTectonics = 0.68;
    material.uAtmosphere = 0.72;
    material.uWaterLevel = 0.42;
    material.uMethane = 0;
    material.uCloudDepth = 0.36;
    material.uTemperature = 286;
    material.uRadius = radius;
    material.uOblateness = 0.018;
    material.uMass = 95;
    material.uState = 1;
    material.uEmissiveStrength = 0.16;
    material.uNorthPole.copy(northPole);
    return material;
  }, [northPole, radius, theme]);

  useEffect(() => {
    surface.uniforms.uEnvironment.value = environment.texture;
    surface.uniforms.uEnvironmentIntensity.value = environment.quality.reflectionIntensity * 1.5;
  }, [environment, surface]);
  useEffect(() => () => surface.dispose(), [surface]);

  useFrame(({ clock }, delta) => {
    if (!groupRef.current) return;
    if (!reducedMotion) groupRef.current.rotation.y += delta * 0.075;
    if (matRef.current) matRef.current.uTime = clock.elapsedTime;
  });

  const mobile = size.width < 700;
  const position: [number, number, number] = mobile
    ? [3.6, mode === 'creator' ? 3.5 : 1.7, -3.2]
    : [6.2, mode === 'creator' ? 0.4 : -0.55, -0.8];

  return (
    <group ref={groupRef} position={position} rotation={[0.08, -0.45, -0.18]}>
      <mesh material={surface} ref={() => { matRef.current = surface; }}>
        <sphereGeometry args={[radius, quality.planetSegments, quality.planetSegments]} />
      </mesh>
      <mesh renderOrder={2}>
        <sphereGeometry args={[atmosphereRadius, quality.atmosphereSegments, quality.atmosphereSegments]} />
        <planetAtmosphereMaterial
          transparent
          side={THREE.BackSide}
          depthWrite={false}
          uColor={new THREE.Color(theme.secondary)}
          uBoundingRadius={atmosphereRadius}
          uPlanetRadius={radius}
          uDensity={0.68}
          uHaze={0.32}
          uScaleHeight={5.5}
          uOblateness={0.018}
        />
      </mesh>
      {quality.orbitalAccents && (
        <mesh rotation={[Math.PI / 2.35, 0.15, 0]}>
          <torusGeometry args={[radius * 1.8, 0.012, 5, 180]} />
          <meshBasicMaterial color={theme.accent} transparent opacity={0.19} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
};

const OrbitalMoon: React.FC<{ theme: Theme; reducedMotion: boolean; tier: DeviceTier }> = ({ theme, reducedMotion, tier }) => {
  const ref = useRef<THREE.Mesh>(null);
  const angle = useRef(0.65);
  useFrame((_, delta) => {
    if (!ref.current) return;
    if (!reducedMotion) angle.current += delta * 0.11;
    ref.current.position.set(6.2 + Math.cos(angle.current) * 5.3, -0.4 + Math.sin(angle.current * 0.8) * 1.15, -0.8 + Math.sin(angle.current) * 4.1);
    if (!reducedMotion) ref.current.rotation.y += delta * 0.18;
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.48, tier === 'low' ? 14 : 24, tier === 'low' ? 14 : 24]} />
      <meshStandardMaterial color={theme.secondary} roughness={0.88} emissive={theme.secondary} emissiveIntensity={0.035} />
    </mesh>
  );
};

const CosmicDust: React.FC<{ count: number; color: string; reducedMotion: boolean }> = ({ count, color, reducedMotion }) => {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const angle = i * 2.399963;
      const radius = 4 + ((i * 37) % 100) * 0.17;
      data[i * 3] = Math.cos(angle) * radius + 2;
      data[i * 3 + 1] = Math.sin(angle * 0.71) * 6;
      data[i * 3 + 2] = -4 - ((i * 19) % 18);
    }
    return data;
  }, [count]);
  useFrame((_, delta) => {
    if (!reducedMotion && ref.current) ref.current.rotation.z += delta * 0.003;
  });
  return (
    <points ref={ref} raycast={() => {}}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color={color} size={0.032} transparent opacity={0.58} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
};

const MenuScene: React.FC<MenuSpaceBackgroundProps & { tier: DeviceTier; gpuEffectsOk: boolean; onContextLost: () => void; onContextRestored: () => void }> = ({ mode = 'landing', presetId, tier, gpuEffectsOk, onContextLost, onContextRestored }) => {
  const reducedMotion = useReducedMotion();
  const isTouch = detectIsTouch();
  const quality = qualityForMenu(tier, isTouch);
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
      <RendererConfig exposure={exposureForTier(tier, isTouch) * (mode === 'creator' ? 0.94 : 1.02)} managePixelRatio={false} onContextLost={onContextLost} onContextRestored={onContextRestored} />
      <color attach="background" args={['#050810']} />
      <fog attach="fog" args={['#070a12', 28, 105]} />
      <ambientLight intensity={0.12} color={theme.secondary} />
      <directionalLight position={[7, 10, 5]} intensity={0.48} color={theme.secondary} />
      <Stars radius={125} depth={72} count={quality.stars} factor={tier === 'low' ? 2.5 : 3.5} saturation={0.3} fade speed={reducedMotion ? 0 : 0.25} />
      <GasClouds menu />
      <group ref={rigRef}>
        <StellarBeacon theme={theme} reducedMotion={reducedMotion} lowQuality={tier === 'low'} />
        <HeroPlanet theme={theme} tier={tier} reducedMotion={reducedMotion} mode={mode} />
        <OrbitalMoon theme={theme} reducedMotion={reducedMotion} tier={tier} />
        <CosmicDust count={quality.dust} color={theme.secondary} reducedMotion={reducedMotion} />
      </group>
      {gpuEffectsOk && <AdaptivePostFX tier={tier} isTouch={isTouch} />}
    </>
  );
};

const MenuSpaceBackground: React.FC<MenuSpaceBackgroundProps> = ({ mode = 'landing', presetId = null }) => {
  const detectedTier = useDeviceTier();
  const e2eConfig = getE2EConfig();
  const [adaptiveTier, setAdaptiveTier] = useState<DeviceTier>(detectedTier);
  const [gpuEffectsOk, setGpuEffectsOk] = useState(true);
  const deviceTier: DeviceTier = gpuEffectsOk ? adaptiveTier : 'low';
  const handleDetectedTier = useCallback((tier: DeviceTier) => {
    if (!e2eConfig.tier) setAdaptiveTier(tier);
  }, [e2eConfig.tier]);
  const theme = THEMES[presetId ?? 'procedural'] ?? THEMES.procedural;

  return (
    <div className="menu-space-background fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden data-gpu-effects={gpuEffectsOk ? 'on' : 'fallback'}>
      <div className="menu-space-fallback" style={{ '--menu-accent': theme.accent, '--menu-secondary': theme.secondary } as React.CSSProperties} />
      {gpuEffectsOk && (
        <Canvas
          className="!absolute inset-0"
          camera={{ position: [0, 1, 13], fov: 47, near: 0.1, far: 220 }}
          dpr={deviceTier === 'low' ? 1 : [1, 1.5]}
          gl={{ antialias: deviceTier !== 'low', alpha: true, powerPreference: 'high-performance' }}
          onCreated={({ gl }) => {
            // Run before Three's own target listeners. Unmounting synchronously
            // prevents a lost context from being rendered for one more frame.
            gl.domElement.addEventListener('webglcontextlost', (event) => {
              event.preventDefault();
              flushSync(() => setGpuEffectsOk(false));
            }, { capture: true, once: true });
          }}
        >
          <EnvironmentProvider tier={deviceTier} isTouch={detectIsTouch()}>
            {!e2eConfig.tier && <DeviceCapabilityProbe initialTier={detectedTier} onTierChange={handleDetectedTier} />}
            <MenuScene
              mode={mode}
              presetId={presetId}
              tier={deviceTier}
              gpuEffectsOk
              onContextLost={() => setGpuEffectsOk(false)}
              onContextRestored={() => setGpuEffectsOk(true)}
            />
          </EnvironmentProvider>
        </Canvas>
      )}
      <div className="menu-space-grade" />
      <div className="menu-space-glow" style={{ '--menu-accent': theme.accent, '--menu-secondary': theme.secondary } as React.CSSProperties} />
    </div>
  );
};

export default MenuSpaceBackground;
