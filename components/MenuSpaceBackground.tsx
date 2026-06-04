import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { Stars, shaderMaterial } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import './Planet/PlanetShaders';
import { PlanetSurfaceMaterial } from './Planet/PlanetShaders';
import { TEXTURE_IDS } from '../constants';
import { RendererConfig, useDeviceTier } from './CanvasSetup';

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

const NebulaMaterial = shaderMaterial(
  {
    uTime: 0,
    uColorA: new THREE.Color('#1a1035'),
    uColorB: new THREE.Color('#B57335'),
    uColorC: new THREE.Color('#F9D423'),
  },
  /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  /* glsl */ `
    uniform float uTime;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uColorC;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.1;
        a *= 0.5;
      }
      return v;
    }

    void main() {
      vec2 uv = vUv - 0.5;
      float t = uTime * 0.04;
      float n = fbm(uv * 2.5 + vec2(t, t * 0.7));
      float n2 = fbm(uv * 4.0 - vec2(t * 0.5, t));
      float mist = smoothstep(0.15, 0.85, n * 0.65 + n2 * 0.35);
      vec3 col = mix(uColorA, uColorB, mist);
      col = mix(col, uColorC, pow(mist, 2.5) * 0.35);
      float vignette = 1.0 - length(uv) * 1.1;
      float alpha = mist * 0.22 * max(0.0, vignette);
      gl_FragColor = vec4(col, alpha);
    }
  `
);

extend({ NebulaMaterial });

/** Tear down GPU allocations when leaving the main menu for a simulation. */
function MenuGpuCleanup(): null {
  // R3F disposes the scene on unmount; avoid double-dispose of shared materials.
  return null;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

const MenuNebula: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const matRef = useRef<THREE.ShaderMaterial & { uTime: number }>(null);
  useFrame((_, dt) => {
    if (reducedMotion || !matRef.current) return;
    matRef.current.uTime += dt;
  });
  return (
    <>
      <mesh position={[-8, 2, -18]} rotation={[0, 0.3, 0.1]}>
        <planeGeometry args={[55, 40]} />
        <nebulaMaterial ref={matRef} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh position={[10, -4, -22]} rotation={[0, -0.5, -0.15]}>
        <planeGeometry args={[48, 36]} />
        <nebulaMaterial
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uColorB={new THREE.Color('#2d1b4e')}
          uColorC={new THREE.Color('#6b8cff')}
        />
      </mesh>
    </>
  );
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
  const reducedMotion = usePrefersReducedMotion();
  const deviceTier = useDeviceTier();
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
      <MenuGpuCleanup />
      <RendererConfig
        managePixelRatio={false}
        onContextLost={onContextLost}
        onContextRestored={onContextRestored}
      />
      <color attach="background" args={['#080b12']} />
      <ambientLight intensity={0.15} />
      <directionalLight position={[8, 12, 6]} intensity={0.35} color="#a8c4ff" />
      <Stars radius={120} depth={60} count={starCount} factor={3.5} saturation={0.15} fade speed={reducedMotion ? 0 : 0.4} />
      <MenuNebula reducedMotion={reducedMotion} />
      <MenuStar reducedMotion={reducedMotion} />
      <group ref={rigRef}>
        <MenuPlanet reducedMotion={reducedMotion} />
        <MenuMoon reducedMotion={reducedMotion} />
      </group>
      {deviceTier === 'high' && gpuEffectsOk && (
        <EffectComposer multisampling={0}>
          <Bloom luminanceThreshold={0.45} mipmapBlur intensity={0.9} />
          <Vignette eskil={false} offset={0.12} darkness={0.55} />
        </EffectComposer>
      )}
    </>
  );
};

const MenuSpaceBackground: React.FC = () => {
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
      <MenuScene
        gpuEffectsOk={gpuEffectsOk}
        onContextLost={() => setGpuEffectsOk(false)}
        onContextRestored={() => {
          setGpuEffectsOk(true);
          setGlEpoch((n) => n + 1);
        }}
      />
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
