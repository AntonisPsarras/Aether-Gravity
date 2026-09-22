import * as THREE from 'three';
import { ThreeElements as R3FThreeElements } from '@react-three/fiber';

declare global {
  namespace JSX {
    interface IntrinsicElements extends R3FThreeElements {
      // Custom elements with permissive props for uniforms
      gravityGridMaterial: any;
      starSurfaceMaterial: any;
      planetSurfaceMaterial: any;
      planetAtmosphereMaterial: any;
      planetCloudMaterial: any;
      planetRingMaterial: any;
      shockwaveMaterial: any;
      supernovaMaterial: any;
      debrisMaterial: any;
      neutronStarMaterial: any;
      relativisticDiskMaterial: any;
      kerrEventHorizonMaterial: any;
      ergosphereMaterial: any;
      selectionHaloMaterial: any;
      planetTerrainMaterial: any;
      habitableZoneMaterial: any;
    }
  }
}

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends R3FThreeElements {
      gravityGridMaterial: any;
      starSurfaceMaterial: any;
      planetSurfaceMaterial: any;
      planetAtmosphereMaterial: any;
      planetCloudMaterial: any;
      planetRingMaterial: any;
      shockwaveMaterial: any;
      supernovaMaterial: any;
      debrisMaterial: any;
      neutronStarMaterial: any;
      relativisticDiskMaterial: any;
      kerrEventHorizonMaterial: any;
      ergosphereMaterial: any;
      selectionHaloMaterial: any;
      planetTerrainMaterial: any;
      habitableZoneMaterial: any;
    }
  }
}

export type BodyType =
  | 'Star'
  | 'Planet'
  | 'Black Hole'
  | 'Dwarf'
  | 'Neutron Star'
  | 'Red Giant'
  | 'Ice Giant'
  | 'Gas Giant'
  | 'Moon'
  | 'White Dwarf'
  | 'Brown Dwarf'
  | 'Pulsar'
  | 'Asteroid'
  | 'Comet';

/**
 * Keplerian orbital elements, used for bodies propagated analytically about a
 * parent (moons) and as the persisted form of the Inspector's Orbit tab.
 * Angles in radians; `a` in simulation length units; `epoch` in sim years.
 */
export interface OrbitalElements {
  a: number;      // semi-major axis (L*)
  e: number;      // eccentricity
  i: number;      // inclination (rad)
  lan: number;    // longitude of ascending node, Ω (rad)
  argp: number;   // argument of periapsis, ω (rad)
  m0: number;     // mean anomaly at epoch (rad)
  epoch: number;  // sim time at which m0 applies (years)
}

export interface CelestialBody {
  id: string;
  type: BodyType;
  /** Mass in Earth masses (the simulation's mass unit). */
  mass: number;
  /**
   * VISUAL radius in simulation length units. Used for rendering, picking and
   * collision detection only — see `utils/units.ts`. Never use it in a physical
   * formula; use `radiusKm` instead.
   */
  radius: number;
  /** True physical radius in kilometres. The source of truth for all physics. */
  radiusKm: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: string;
  texture: string;
  trailColor: string;
  temperature: number;
  habitability: 'HABITABLE' | 'FROZEN' | 'BURNING' | 'TOXIC' | 'STELLAR' | 'SINGULARITY' | 'STERILIZED' | 'N/A';
  population: number;
  name: string;
  /**
   * Explicit hierarchy. When set, this body is propagated analytically on
   * `orbit` about its parent instead of participating in the N-body sum
   * (see `utils/moonSystem.ts`). Cleared when the body is promoted to a
   * free body.
   */
  parentId?: string;
  /** Persisted Keplerian elements relative to `parentId`. */
  orbit?: OrbitalElements;
  properties?: {
    /** Optional scientific preset provenance; absent in legacy sandbox worlds. */
    presetId?: string;
    scienceNote?: string;
    epochJD?: number;
    referencePlane?: string;
    physicalCollisions?: boolean;
    /** Multiplicative display compression, independent of physical radius. */
    renderRadiusScale?: number;
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
    luminositySolar?: number;  // Stars: derived L/L☉

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
    spinParameter?: number;    // 0-0.998 (Dimensionless spin a*; Thorne limit)
    accretionRate?: number;    // 0-1 (Mass flow rate)

    // Ring system (rendering only; rings carry negligible mass and are not
    // integrated by the N-body solver).
    /** 0-1 optical depth of the ring plane. 0 (or absent) means no rings. */
    ringOpacity?: number;
    /** Inner ring edge, in body radii. Physically sits near the Roche limit. */
    ringInnerRadius?: number;
    /** Outer ring edge, in body radii. Always greater than the inner edge. */
    ringOuterRadius?: number;

    // Dynamics
    /** Unresolved intrinsic angular momentum, M* L*²/year. Accounting only;
     * not a rigid-body orientation solver or the rendered rotation period. */
    angularMomentumX?: number;
    angularMomentumY?: number;
    angularMomentumZ?: number;
    rotationPeriod?: number;   // Hours
    obliquity?: number;        // Axial tilt of the spin axis, degrees 0-180
    isTidallyLocked?: boolean;

    // Compact remnants
    /** Pulsar spin period in seconds (distinct from `rotationPeriod` hours). */
    pulsarPeriodS?: number;
    /** Surface magnetic field, 10¹² gauss. Drives magnetic-dipole spin-down. */
    magneticFieldTG?: number;

    // Comet
    /** 0-1 volatile fraction; scales coma brightness and tail length. */
    volatileFraction?: number;

    // Derived read-outs (recomputed, never user-authored)
    luminositySolarDerived?: number;

    // Display / Engine overrides
    userTempOverride?: boolean; // Skip Stefan-Boltzmann auto-update for this body
    manualRadius?: boolean;     // User set radius directly; don't auto-derive from composition
    manualRadiusKm?: number;    // The pinned physical radius, km (only when manualRadius)
    /** Bond albedo override; falls back to composition-derived when absent. */
    albedo?: number;
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
  /**
   * Which physical pathway a contact resolved through. Set on contact events so
   * the VFX layer can pick an effect without re-deriving the physics.
   * See `utils/collisionOutcome.ts`.
   */
  outcome?: 'merge' | 'shatter' | 'accrete' | 'collapse';
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  mass?: number;
  kineticEnergy?: number;
  /** Angular momentum carried by unresolved ejecta/radiation, M* L*²/year. */
  angularMomentum?: THREE.Vector3;
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
  /** Optional so that v1 saves (which predate the physical/visual split) parse. */
  radiusKm?: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  color: string;
  texture: string;
  trailColor: string;
  temperature: number;
  habitability: CelestialBody['habitability'];
  population: number;
  name: string;
  parentId?: string;
  orbit?: OrbitalElements;
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
  /** Optional origin template. Absent for procedural and legacy worlds. */
  presetId?: string;
}

export interface WorldData {
  id: string;
  version: number;
  bodies: CelestialBodyData[];
  settings: {
    simTime?: number;
    speed: number;
    showGrid: boolean;
    showDust: boolean;
    showHabitable: boolean;
    showStability: boolean;
    /** Optional: worlds saved before the settings sheet existed omit it. */
    showOrbitPaths?: boolean;
  };
}
