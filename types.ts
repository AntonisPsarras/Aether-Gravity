import * as THREE from 'three';
import * as React from 'react';
import { ThreeElements as R3FThreeElements } from '@react-three/fiber';

declare global {
  namespace JSX {
    interface IntrinsicElements extends R3FThreeElements {
      // Custom elements with permissive props for uniforms
      gravityGridMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      starSurfaceMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      planetSurfaceMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      planetAtmosphereMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      shockwaveMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      supernovaMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      neutronStarMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      pulsarJetMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      relativisticDiskMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      kerrEventHorizonMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      ergosphereMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      selectionHaloMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      planetTerrainMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      gPGPUBodyMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      habitableZoneMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends R3FThreeElements {
      gravityGridMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      starSurfaceMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      planetSurfaceMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      planetAtmosphereMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      shockwaveMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      supernovaMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      neutronStarMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      pulsarJetMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      relativisticDiskMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      kerrEventHorizonMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      ergosphereMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      selectionHaloMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      planetTerrainMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      gPGPUBodyMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
      habitableZoneMaterial: R3FThreeElements['shaderMaterial'] & { [key: string]: any };
    }
  }
}

export type BodyType = 'Star' | 'Planet' | 'Black Hole' | 'Dwarf' | 'Neutron Star' | 'Red Giant' | 'Ice Giant';

export interface CelestialBody {
  id: string;
  type: BodyType;
  mass: number;
  radius: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: string;
  texture: string;
  trailColor: string;
  temperature: number;
  habitability: 'HABITABLE' | 'FROZEN' | 'BURNING' | 'TOXIC' | 'STELLAR' | 'SINGULARITY' | 'STERILIZED' | 'N/A';
  population: number;
  name: string;
  properties?: {
    // Composition (Terrestrial) - Sums to 1.0
    compositionIron?: number;
    compositionSilicates?: number;
    compositionWater?: number;

    // Derived Geophysics
    bulkDensity?: number;      // g/cm^3
    surfaceGravity?: number;   // m/s^2
    escapeVelocity?: number;   // km/s

    // Atmosphere
    scaleHeight?: number;      // 0-1 relative scale
    haze?: number;             // 0-1 Mie scattering amount

    // Star Properties
    metallicity?: number;      // Stars: 0-1
    oblateness?: number;       // Stars: 0-1
    convectionScale?: number;  // Stars: 1-10

    // Giant Properties
    massLoss?: number;         // Giants: 0-1
    pulsationSpeed?: number;   // Giants: Hz
    luminosityClass?: number;  // Giants: 0 (Giant) - 1 (Supergiant)

    // Planet Surface
    tectonics?: number;        // Planets: 0-1
    atmosphere?: number;       // Planets: 0-1 (Density)
    waterLevel?: number;       // Planets: 0-1

    // Ice Giant
    methane?: number;          // Ice: 0-1
    cloudDepth?: number;       // Ice: 0-1
    axialTilt?: number;        // Ice: 0-180 deg

    // Dwarf
    flareActivity?: number;    // Dwarfs: 0-1
    magneticIndex?: number;    // Dwarfs: 0-1
    degeneracy?: number;       // White Dwarfs: 0-1

    // Black Hole (Kerr Metric)
    spinParameter?: number;    // 0-1 (Dimensionless spin a*)
    accretionRate?: number;    // 0-1 (Mass flow rate)

    // Dynamics
    rotationPeriod?: number;   // Hours (arbitrary game units)
    isTidallyLocked?: boolean;
  };
}

export interface WaveEvent {
  id: number;
  position: THREE.Vector3;
  startTime: number;
  amplitude: number;
  frequency: number;
  decay: number;
}

export interface PhysicsEvent {
  type: 'collision' | 'fragmentation' | 'supernova' | 'evolution' | 'tde' | 'gravitational_wave';
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  mass?: number;
  kineticEnergy?: number;
  count?: number;
  energy?: number;
  radius?: number;
  bodyType?: BodyType;
  strain?: number;
  frequency?: number;
  density?: number;
  turbulence?: number;
}

export interface CelestialBodyData {
  id: string;
  type: BodyType;
  mass: number;
  radius: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  color: string;
  texture: string;
  trailColor: string;
  temperature: number;
  habitability: CelestialBody['habitability'];
  population: number;
  name: string;
  properties?: CelestialBody['properties'];
}

export interface FolderMeta {
  id: string;
  name: string;
  createdAt: number;
}

export interface WorldMeta {
  id: string;
  name: string;
  createdAt: number;
  lastOpenedAt: number;
  folderId?: string;
}

export interface WorldData {
  id: string;
  version: number;
  bodies: CelestialBodyData[];
  settings: {
    speed: number;
    showGrid: boolean;
    showDust: boolean;
    showHabitable: boolean;
    showStability: boolean;
  };
}