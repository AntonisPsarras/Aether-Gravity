import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';

import * as THREE from 'three';
import './Planet/PlanetShaders';
import { PlanetSurfaceMaterial } from './Planet/PlanetShaders';
import { TEXTURE_IDS } from '../constants';
import { RendererConfig, useDeviceTier, detectIsTouch, AdaptivePostFX, exposureForTier } from './CanvasSetup';
import { EnvironmentProvider, useEnvironment, useReducedMotion } from './Environment/EnvironmentContext';
import { GasClouds } from './Environment/GasClouds';

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
  logarithmicDepthBuffer: boolean;
};

const MenuStar: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (reducedMotion || !ref.current) return;
    ref.current.rotation.y += dt * 0.08;
  });
  return (
    <group position={[-14, 4, -12]}>
      <pointLight color="#ffcc66" intensity={2.8} distance={80} decay={2} />
      <mesh ref={ref}>
        <sphereGeometry args={[2.8, 32, 32]} />
        <starSurfaceMaterial
          uColor={new THREE.Color('#fbbf24')}
          uSpeed={0.6}
          uTemperature={5800}
          uMetallicity={0.1}
          uConvection={4}
          uPulsation={0.15}
          uLuminosityClass={0}
          uFlareActivity={0.2}
          uMagnetic={0.1}
          uOblateness={0}
        />
      </mesh>
    </group>
  );
};

const MenuPlanet: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const groupRef = useRef<THREE.Group>(null);
  const matRef = useRef<PlanetSurfaceMat>(null);
  const environment = useEnvironment();
  const northPole = useMemo(() => new THREE.Vector3(0.2, 0.97, 0.1).normalize(), []);

  const surfaceMat = useMemo(() => {
    const mat = new PlanetSurfaceMaterial().clone() as PlanetSurfaceMat;
    mat.uColor1.set('#2d6a4f');
    mat.uColor2.set('#1b4332');
    mat.uType = TEXTURE_IDS.rock;
    mat.uTectonics = 0.35;
    mat.uAtmosphere = 0.55;
    mat.uWaterLevel = 0.52;
    mat.uMethane = 0;
    mat.uCloudDepth = 0.25;
    mat.uTemperature = 288;
    mat.uRadius = 2.2;
    mat.uOblateness = 0.02;
    mat.uMass = 80;
    mat.uState = 1;
    mat.uEmissiveStrength = 0.12;
    mat.uNorthPole.copy(northPole);
    return mat;
  }, [northPole]);

  useEffect(() => {
    surfaceMat.uniforms.uEnvironment.value = environment.texture;
    surfaceMat.uniforms.uEnvironmentIntensity.value = environment.quality.reflectionIntensity;
  }, [surfaceMat, environment]);
  useEffect(() => () => { surfaceMat.dispose(); }, [surfaceMat]);

  useFrame((state, dt) => {
    if (!groupRef.current) return;
    if (!reducedMotion) {
      groupRef.current.rotation.y += dt * 0.12;
    }
    if (matRef.current) matRef.current.uTime = state.clock.elapsedTime;
  });

  const visualRadius = 2.2;
  const atmosRadius = visualRadius * 1.32;

  return (
    <group ref={groupRef} position={[5.5, -0.4, 0]}>
      <mesh material={surfaceMat} ref={(m) => { if (m) matRef.current = surfaceMat; }}>
        <sphereGeometry args={[visualRadius, 56, 56]} />
      </mesh>
      <mesh scale={1.001} renderOrder={1}>
        <sphereGeometry args={[atmosRadius, 40, 40]} />
        <planetAtmosphereMaterial
          transparent
          side={THREE.BackSide}
          depthWrite={false}
          uColor={new THREE.Color(0.45, 0.72, 1.0)}
          uBoundingRadius={atmosRadius}
          uPlanetRadius={visualRadius}
          uDensity={0.55}
          uHaze={0.22}
          uScaleHeight={6}
          uOblateness={0.02}
        />
      </mesh>
    </group>
  );
};

const MenuMoon: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const ref = useRef<THREE.Mesh>(null);
  const orbitAngle = useRef(0.8);
  useFrame((_, dt) => {
    if (!ref.current) return;
    if (!reducedMotion) orbitAngle.current += dt * 0.35;
    const r = 4.2;
    ref.current.position.set(
      5.5 + Math.cos(orbitAngle.current) * r,
      -0.4 + Math.sin(orbitAngle.current * 0.7) * 0.6,
      Math.sin(orbitAngle.current) * r * 0.85
    );
    ref.current.rotation.y += reducedMotion ? 0 : dt * 0.2;
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.45, 24, 24]} />
      <meshStandardMaterial color="#9ca3af" roughness={0.95} metalness={0.05} />
    </mesh>
  );
};

const MenuScene: React.FC<{
  gpuEffectsOk: boolean;
  onContextLost: () => void;
  onContextRestored: () => void;
}> = ({ gpuEffectsOk, onContextLost, onContextRestored }) => {
  const reducedMotion = useReducedMotion();
  const detectedTier = useDeviceTier();
  const deviceTier = gpuEffectsOk ? detectedTier : 'low';
  const rigRef = useRef<THREE.Group>(null);
  const starCount = deviceTier === 'low' ? 1200 : 2800;

  useFrame((state, dt) => {
    if (reducedMotion || !rigRef.current) return;
    const t = state.clock.elapsedTime;
    rigRef.current.rotation.y = Math.sin(t * 0.08) * 0.06;
    rigRef.current.position.y = Math.sin(t * 0.12) * 0.15;
  });

  return (
    <>

      <RendererConfig exposure={exposureForTier(deviceTier, detectIsTouch())}
        managePixelRatio={false}
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
      />
      <color attach="background" args={['#080b12']} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[8, 12, 6]} intensity={0.35} color="#a8c4ff" />
      <Stars radius={120} depth={60} count={starCount} factor={3.5} saturation={0.15} fade speed={reducedMotion ? 0 : 0.4} />
      <GasClouds menu />
      <MenuStar reducedMotion={reducedMotion} />
      <group ref={rigRef}>
        <MenuPlanet reducedMotion={reducedMotion} />
        <MenuMoon reducedMotion={reducedMotion} />
      </group>
      {gpuEffectsOk && <AdaptivePostFX tier={deviceTier} isTouch={detectIsTouch()} />}
    </>
  );
};

const MenuSpaceBackground: React.FC = () => {
  const deviceTier = useDeviceTier();
  const [glEpoch, setGlEpoch] = useState(0);
  const [gpuEffectsOk, setGpuEffectsOk] = useState(true);

  return (
  <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden>
    <Canvas
      key={glEpoch}
      className="!absolute inset-0"
      camera={{ position: [0, 1.2, 11], fov: 48, near: 0.1, far: 200 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
    >
      <EnvironmentProvider tier={gpuEffectsOk ? deviceTier : 'low'} isTouch={detectIsTouch()}>
      <MenuScene
        gpuEffectsOk={gpuEffectsOk}
        onContextLost={() => setGpuEffectsOk(false)}
        onContextRestored={() => {
          setGpuEffectsOk(true);
          setGlEpoch((n) => n + 1);
        }}
      />
      </EnvironmentProvider>
    </Canvas>
    <div
      className="absolute inset-0"
      style={{
        background:
          'radial-gradient(ellipse 85% 70% at 50% 45%, transparent 0%, rgba(16,20,28,0.35) 55%, rgba(16,20,28,0.92) 100%)',
      }}
    />
    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-nova-gold/[0.06] rounded-full blur-[120px]" />
    <div className="absolute bottom-1/3 right-1/5 w-80 h-80 bg-nebula-rust/[0.05] rounded-full blur-[100px]" />
  </div>
  );
};

export default MenuSpaceBackground;
