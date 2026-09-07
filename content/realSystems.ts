/**
 * Accurately parameterised real planetary systems.
 *
 * Every number here is a published measurement, not a tuned game value. Bodies
 * carry their real mass, real radius and real osculating orbital elements, and
 * because the engine now runs in real units (M⊕ / 0.025 AU / year with G
 * derived from SI) the resulting orbits reproduce the real periods without any
 * correction factor — `realSystems.test.ts` asserts exactly that.
 *
 * Sources
 * -------
 * Solar System : NASA/JPL planetary fact sheets (masses, radii, rotation) and
 *                the JPL "Approximate Positions of the Major Planets" Keplerian
 *                element set for 1800-2050 AD (Standish), referred to the mean
 *                ecliptic and equinox of J2000.
 *                https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *                Satellite elements: JPL Solar System Dynamics planetary
 *                satellite mean elements.
 *                https://ssd.jpl.nasa.gov/sats/elem/
 * TRAPPIST-1   : Agol et al. (2021), PSJ 2, 1 — the dynamical (transit-timing)
 *                solution, cross-checked against the NASA Exoplanet Archive
 *                default parameter set.
 * Alpha Cen    : Kervella et al. (2017) for the masses and the visual binary
 *                orbit; Anglada-Escudé et al. (2016) for Proxima b.
 *
 * The JPL element set is published as longitude of perihelion ϖ and mean
 * longitude L; the argument of periapsis and mean anomaly stored below are
 * ω = ϖ − Ω and M = L − ϖ.
 */

import type { BodyType, CelestialBody } from '../types';
import * as THREE from 'three';
import {
  M_SUN_IN_EARTH,
  R_SUN_KM,
  auToDist,
  kmToDist,
} from '../utils/units';
import { elementsFromDegrees, gravitationalParameter, propagateOrbit } from '../utils/keplerOrbit';
import { deriveBodyState } from '../utils/bodyDerivation';

export interface RealOrbitSpec {
  /** Semi-major axis, in AU (planets) or km (satellites). Give exactly one. */
  aAU?: number;
  aKm?: number;
  e: number;
  /** Inclination to the system reference plane, degrees. */
  iDeg: number;
  /** Longitude of ascending node Ω, degrees. */
  lanDeg: number;
  /** Argument of periapsis ω, degrees. */
  argpDeg: number;
  /** Mean anomaly at epoch J2000, degrees. */
  mDeg: number;
}

export interface RealBodySpec {
  name: string;
  type: BodyType;
  /** Mass in Earth masses. */
  mass: number;
  /** True equatorial or volumetric mean radius, km. */
  radiusKm: number;
  color: string;
  texture: string;
  /** Name of the body this one orbits. Absent = system primary. */
  parent?: string;
  orbit?: RealOrbitSpec;
  /**
   * Propagate analytically on Kepler rails rather than through the N-body sum.
   * Used for satellites, whose periods are far shorter than the physics
   * timestep can resolve. See utils/moonSystem.ts.
   */
  onRails?: boolean;
  /** Measured mean surface or effective temperature, K. */
  temperatureK?: number;
  /** Sidereal rotation period, hours. Negative means retrograde. */
  rotationHours?: number;
  /** Axial tilt, degrees. */
  obliquityDeg?: number;
  properties?: CelestialBody['properties'];
}

export interface RealSystem {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  source: string;
  bodies: RealBodySpec[];
}

// ---------------------------------------------------------------------------
// The Solar System
// ---------------------------------------------------------------------------

const SOLAR_SYSTEM: RealSystem = {
  id: 'solar-system',
  name: 'The Solar System',
  subtitle: 'Sun · 8 planets · Pluto · 11 major moons',
  description:
    'Our own system at full precision: JPL masses, radii and J2000 orbital ' +
    'elements. Every orbital period is reproduced from the physics, not scripted.',
  source: 'NASA/JPL planetary fact sheets + approximate positions of the major planets (J2000)',
  bodies: [
    {
      name: 'Sun', type: 'Star', mass: M_SUN_IN_EARTH, radiusKm: R_SUN_KM,
      color: '#fff4ea', texture: 'plasma', temperatureK: 5772,
      rotationHours: 609.12,
      properties: { metallicity: 0.5, convectionScale: 5, oblateness: 0.0 },
    },

    // --- Terrestrial planets -------------------------------------------------
    {
      name: 'Mercury', type: 'Planet', mass: 0.055274, radiusKm: 2439.7,
      color: '#8c8079', texture: 'rock', temperatureK: 440,
      rotationHours: 1407.6, obliquityDeg: 0.034,
      orbit: { aAU: 0.38709927, e: 0.20563593, iDeg: 7.00497902, lanDeg: 48.33076593, argpDeg: 29.12470300, mDeg: 174.79252722 },
      properties: { compositionIron: 0.70, compositionSilicates: 0.30, compositionWater: 0, atmosphere: 0, tectonics: 0.05 },
    },
    {
      name: 'Venus', type: 'Planet', mass: 0.815, radiusKm: 6051.8,
      color: '#e6c98a', texture: 'rock', temperatureK: 737,
      rotationHours: -5832.5, obliquityDeg: 177.36,
      orbit: { aAU: 0.72333566, e: 0.00677672, iDeg: 3.39467605, lanDeg: 76.67984255, argpDeg: 54.92262463, mDeg: 50.37663232 },
      properties: { compositionIron: 0.31, compositionSilicates: 0.69, compositionWater: 0, atmosphere: 1.0, haze: 0.9, scaleHeight: 0.25, albedo: 0.77 },
    },
    {
      name: 'Earth', type: 'Planet', mass: 1.0, radiusKm: 6371.0,
      color: '#4d7ea8', texture: 'rock', temperatureK: 288,
      rotationHours: 23.9345, obliquityDeg: 23.44,
      orbit: { aAU: 1.00000261, e: 0.01671123, iDeg: 0.00001531, lanDeg: 0.0, argpDeg: 102.93768193, mDeg: 357.52688967 },
      properties: { compositionIron: 0.325, compositionSilicates: 0.675, compositionWater: 0.0, atmosphere: 0.30, waterLevel: 0.71, tectonics: 0.8, scaleHeight: 0.14, haze: 0.1, albedo: 0.306 },
    },
    {
      name: 'Mars', type: 'Planet', mass: 0.10745, radiusKm: 3389.5,
      color: '#c1440e', texture: 'rock', temperatureK: 210,
      rotationHours: 24.6229, obliquityDeg: 25.19,
      orbit: { aAU: 1.52371034, e: 0.09339410, iDeg: 1.84969142, lanDeg: 49.55953891, argpDeg: 286.49678100, mDeg: 19.39019754 },
      properties: { compositionIron: 0.24, compositionSilicates: 0.76, compositionWater: 0, atmosphere: 0.02, tectonics: 0.1, albedo: 0.25 },
    },

    // --- Giants --------------------------------------------------------------
    {
      name: 'Jupiter', type: 'Gas Giant', mass: 317.83, radiusKm: 69911,
      color: '#c9a06a', texture: 'gas', temperatureK: 165,
      rotationHours: 9.9250, obliquityDeg: 3.13,
      orbit: { aAU: 5.20288700, e: 0.04838624, iDeg: 1.30439695, lanDeg: 100.47390909, argpDeg: 274.25457074, mDeg: 19.66796068 },
      // Jupiter's ring is a tenuous dust halo from Adrastea/Amalthea/Thebe,
      // 1.4-3.1 R_J and optically thin to the point of invisibility from Earth.
      properties: {
        atmosphere: 1.0, cloudDepth: 0.8, oblateness: 0.065,
        ringOpacity: 0.05, ringInnerRadius: 1.4, ringOuterRadius: 3.1,
      },
    },
    {
      name: 'Saturn', type: 'Gas Giant', mass: 95.16, radiusKm: 58232,
      color: '#e3d1a0', texture: 'gas', temperatureK: 134,
      rotationHours: 10.656, obliquityDeg: 26.73,
      orbit: { aAU: 9.53667594, e: 0.05386179, iDeg: 2.48599187, lanDeg: 113.66242448, argpDeg: 338.93645383, mDeg: 317.35553592 },
      // The main rings: inner edge of the C ring at 1.24 R_S, outer edge of the
      // A ring at 2.27 R_S, both comfortably inside Saturn's 2.7 R_S Roche
      // limit for loose ice. Optically thick in the B ring.
      properties: {
        atmosphere: 1.0, cloudDepth: 0.7, oblateness: 0.098,
        ringOpacity: 0.85, ringInnerRadius: 1.24, ringOuterRadius: 2.27,
      },
    },
    {
      name: 'Uranus', type: 'Ice Giant', mass: 14.536, radiusKm: 25362,
      color: '#a7d8de', texture: 'ice', temperatureK: 76,
      rotationHours: -17.24, obliquityDeg: 97.77,
      orbit: { aAU: 19.18916464, e: 0.04725744, iDeg: 0.77263783, lanDeg: 74.01692503, argpDeg: 96.93735127, mDeg: 142.28382821 },
      // Thirteen narrow, dark rings between 1.6 and 2.0 R_U (the epsilon ring
      // at 2.006). Nearly edge-on from the Sun given the 97.8 deg obliquity.
      properties: {
        methane: 0.85, cloudDepth: 0.5, atmosphere: 0.9, oblateness: 0.023,
        ringOpacity: 0.18, ringInnerRadius: 1.60, ringOuterRadius: 2.01,
      },
    },
    {
      name: 'Neptune', type: 'Ice Giant', mass: 17.147, radiusKm: 24622,
      color: '#3f6fd1', texture: 'ice', temperatureK: 72,
      rotationHours: 16.11, obliquityDeg: 28.32,
      orbit: { aAU: 30.06992276, e: 0.00859048, iDeg: 1.77004347, lanDeg: 131.78422574, argpDeg: 273.18053653, mDeg: 259.91520804 },
      // Five faint rings, the Adams ring at 2.54 R_N carrying the arcs.
      properties: {
        methane: 0.9, cloudDepth: 0.6, atmosphere: 0.9, oblateness: 0.017,
        ringOpacity: 0.10, ringInnerRadius: 1.69, ringOuterRadius: 2.54,
      },
    },
    {
      name: 'Pluto', type: 'Dwarf', mass: 0.002188, radiusKm: 1188.3,
      color: '#c8b7a6', texture: 'ice', temperatureK: 44,
      rotationHours: -153.29, obliquityDeg: 122.53,
      orbit: { aAU: 39.48211675, e: 0.24882730, iDeg: 17.14001206, lanDeg: 110.30393684, argpDeg: 113.76497945, mDeg: 14.86012204 },
      properties: { compositionIron: 0.1, compositionSilicates: 0.4, compositionWater: 0.5, atmosphere: 0.01 },
    },

    // --- Satellites (Kepler rails) -------------------------------------------
    {
      name: 'Moon', type: 'Moon', mass: 0.0123000371, radiusKm: 1737.4,
      color: '#b8b2a8', texture: 'rock', temperatureK: 250,
      parent: 'Earth', onRails: true,
      orbit: { aKm: 384399, e: 0.0549, iDeg: 5.145, lanDeg: 125.08, argpDeg: 318.15, mDeg: 135.27 },
      properties: { compositionIron: 0.08, compositionSilicates: 0.92, compositionWater: 0, isTidallyLocked: true },
    },
    {
      name: 'Io', type: 'Moon', mass: 0.0149568, radiusKm: 1821.6,
      color: '#e8d44d', texture: 'lava', temperatureK: 110,
      parent: 'Jupiter', onRails: true,
      orbit: { aKm: 421800, e: 0.0041, iDeg: 0.036, lanDeg: 43.977, argpDeg: 84.129, mDeg: 342.021 },
      properties: { compositionIron: 0.2, compositionSilicates: 0.8, compositionWater: 0, tectonics: 1.0, isTidallyLocked: true },
    },
    {
      name: 'Europa', type: 'Moon', mass: 0.0080374, radiusKm: 1560.8,
      color: '#d9c9a8', texture: 'ice', temperatureK: 102,
      parent: 'Jupiter', onRails: true,
      orbit: { aKm: 671100, e: 0.0094, iDeg: 0.466, lanDeg: 219.106, argpDeg: 88.970, mDeg: 171.016 },
      properties: { compositionIron: 0.15, compositionSilicates: 0.75, compositionWater: 0.10, waterLevel: 1.0, isTidallyLocked: true },
    },
    {
      name: 'Ganymede', type: 'Moon', mass: 0.0248138, radiusKm: 2634.1,
      color: '#9d9186', texture: 'ice', temperatureK: 110,
      parent: 'Jupiter', onRails: true,
      orbit: { aKm: 1070400, e: 0.0013, iDeg: 0.177, lanDeg: 63.552, argpDeg: 192.417, mDeg: 317.540 },
      properties: { compositionIron: 0.1, compositionSilicates: 0.55, compositionWater: 0.35, isTidallyLocked: true },
    },
    {
      name: 'Callisto', type: 'Moon', mass: 0.0180152, radiusKm: 2410.3,
      color: '#6b5f57', texture: 'rock', temperatureK: 134,
      parent: 'Jupiter', onRails: true,
      orbit: { aKm: 1882700, e: 0.0074, iDeg: 0.192, lanDeg: 298.848, argpDeg: 52.643, mDeg: 181.408 },
      properties: { compositionIron: 0.05, compositionSilicates: 0.55, compositionWater: 0.40, isTidallyLocked: true },
    },
    {
      name: 'Titan', type: 'Moon', mass: 0.0225238, radiusKm: 2574.7,
      color: '#d9a441', texture: 'gas', temperatureK: 94,
      parent: 'Saturn', onRails: true,
      orbit: { aKm: 1221900, e: 0.0288, iDeg: 0.312, lanDeg: 28.060, argpDeg: 180.532, mDeg: 163.310 },
      properties: { compositionIron: 0.1, compositionSilicates: 0.5, compositionWater: 0.4, atmosphere: 0.6, haze: 1.0, scaleHeight: 0.4, isTidallyLocked: true },
    },
    {
      name: 'Enceladus', type: 'Moon', mass: 1.8016e-5, radiusKm: 252.1,
      color: '#f2f7f7', texture: 'ice', temperatureK: 75,
      parent: 'Saturn', onRails: true,
      orbit: { aKm: 238040, e: 0.0047, iDeg: 0.009, lanDeg: 342.507, argpDeg: 119.5, mDeg: 57.0 },
      properties: { compositionIron: 0.05, compositionSilicates: 0.35, compositionWater: 0.60, isTidallyLocked: true },
    },
    {
      name: 'Titania', type: 'Moon', mass: 5.6931e-4, radiusKm: 788.4,
      color: '#a89a90', texture: 'ice', temperatureK: 70,
      parent: 'Uranus', onRails: true,
      orbit: { aKm: 435910, e: 0.0011, iDeg: 0.079, lanDeg: 99.771, argpDeg: 284.400, mDeg: 24.614 },
      properties: { compositionIron: 0.05, compositionSilicates: 0.5, compositionWater: 0.45, isTidallyLocked: true },
    },
    {
      name: 'Triton', type: 'Moon', mass: 0.00358139, radiusKm: 1353.4,
      color: '#c4bcae', texture: 'ice', temperatureK: 38,
      parent: 'Neptune', onRails: true,
      // Retrograde: inclination above 90 degrees. Triton is a captured
      // Kuiper belt object, which is why it orbits backwards.
      orbit: { aKm: 354759, e: 0.000016, iDeg: 156.885, lanDeg: 172.431, argpDeg: 344.046, mDeg: 264.775 },
      properties: { compositionIron: 0.1, compositionSilicates: 0.55, compositionWater: 0.35, atmosphere: 0.01, isTidallyLocked: true },
    },
    {
      name: 'Charon', type: 'Moon', mass: 2.6555e-4, radiusKm: 606.0,
      color: '#9a9086', texture: 'ice', temperatureK: 53,
      parent: 'Pluto', onRails: true,
      orbit: { aKm: 19591, e: 0.0002, iDeg: 0.08, lanDeg: 223.046, argpDeg: 146.106, mDeg: 0.0 },
      properties: { compositionIron: 0.05, compositionSilicates: 0.5, compositionWater: 0.45, isTidallyLocked: true },
    },
    {
      name: 'Phobos', type: 'Moon', mass: 1.7854e-9, radiusKm: 11.267,
      color: '#7a6a5d', texture: 'rock', temperatureK: 233,
      parent: 'Mars', onRails: true,
      orbit: { aKm: 9376, e: 0.0151, iDeg: 1.093, lanDeg: 164.931, argpDeg: 150.247, mDeg: 92.474 },
      properties: { compositionIron: 0.1, compositionSilicates: 0.9, compositionWater: 0, isTidallyLocked: true },
    },
  ],
};

// ---------------------------------------------------------------------------
// TRAPPIST-1
// ---------------------------------------------------------------------------

const TRAPPIST_1: RealSystem = {
  id: 'trappist-1',
  name: 'TRAPPIST-1',
  subtitle: 'Ultracool dwarf · 7 terrestrial planets',
  description:
    'Seven Earth-sized worlds around a 0.09 solar-mass star, three of them in ' +
    'the habitable zone. The whole system would fit inside Mercury’s orbit.',
  source: 'Agol et al. (2021), PSJ 2, 1; NASA Exoplanet Archive default parameters',
  bodies: [
    {
      name: 'TRAPPIST-1', type: 'Star', mass: 0.0898 * M_SUN_IN_EARTH, radiusKm: 0.1192 * R_SUN_KM,
      color: '#ff7043', texture: 'plasma', temperatureK: 2566,
      rotationHours: 3.3 * 24,
      properties: { metallicity: 0.6, convectionScale: 8, flareActivity: 0.7 },
    },
    trappistPlanet('b', 1.374, 1.116, 0.01154, 0.00622, 89.728),
    trappistPlanet('c', 1.308, 1.097, 0.01580, 0.00654, 89.778),
    trappistPlanet('d', 0.388, 0.788, 0.02227, 0.00837, 89.896),
    trappistPlanet('e', 0.692, 0.920, 0.02925, 0.00510, 89.793),
    trappistPlanet('f', 1.039, 1.045, 0.03849, 0.01007, 89.740),
    trappistPlanet('g', 1.321, 1.129, 0.04683, 0.00208, 89.742),
    trappistPlanet('h', 0.326, 0.755, 0.06189, 0.00567, 89.805),
  ],
};

/**
 * TRAPPIST-1 planets are nearly coplanar and nearly circular. Orbital
 * inclinations are given relative to the sky plane in the literature (~89.7°,
 * i.e. edge-on to us); relative to the system's own plane they are < 0.3°, so
 * the system is laid out flat with a small spread and phased by the observed
 * resonant chain.
 */
function trappistPlanet(
  letter: string,
  mass: number,
  radiusEarth: number,
  aAU: number,
  e: number,
  _iSkyDeg: number,
): RealBodySpec {
  const phases: Record<string, number> = {
    b: 0, c: 137, d: 41, e: 233, f: 316, g: 92, h: 189,
  };
  const isTemperate = ['e', 'f', 'g'].includes(letter);
  return {
    name: `TRAPPIST-1${letter}`,
    type: 'Planet',
    mass,
    radiusKm: radiusEarth * 6371,
    color: isTemperate ? '#5b8fb9' : '#a1685a',
    texture: 'rock',
    temperatureK: 0,   // resolved by the equilibrium-temperature pass
    rotationHours: 24,
    orbit: { aAU, e, iDeg: (phases[letter] % 3) * 0.1, lanDeg: 0, argpDeg: 0, mDeg: phases[letter] },
    properties: {
      compositionIron: 0.25,
      compositionSilicates: 0.55,
      compositionWater: 0.20,
      atmosphere: isTemperate ? 0.3 : 0.05,
      isTidallyLocked: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Alpha Centauri
// ---------------------------------------------------------------------------

const ALPHA_CENTAURI: RealSystem = {
  id: 'alpha-centauri',
  name: 'Alpha Centauri',
  subtitle: 'The nearest system · a real binary',
  description:
    'A G2 and a K1 star on a wide, strongly eccentric 80-year orbit, closing ' +
    'from 35.6 AU to 11.2 AU and back. Proxima and its planet orbit far outside.',
  source: 'Kervella et al. (2017) A&A 598, L7 (masses, visual orbit); Anglada-Escudé et al. (2016) for Proxima b',
  bodies: [
    {
      name: 'Alpha Centauri A', type: 'Star', mass: 1.0788 * M_SUN_IN_EARTH, radiusKm: 1.2234 * R_SUN_KM,
      color: '#fff6e8', texture: 'plasma', temperatureK: 5790,
      properties: { metallicity: 0.7, convectionScale: 5 },
    },
    {
      name: 'Alpha Centauri B', type: 'Star', mass: 0.9092 * M_SUN_IN_EARTH, radiusKm: 0.8632 * R_SUN_KM,
      color: '#ffd9a0', texture: 'plasma', temperatureK: 5260,
      parent: 'Alpha Centauri A',
      orbit: { aAU: 23.52, e: 0.5179, iDeg: 79.32, lanDeg: 204.85, argpDeg: 231.65, mDeg: 0 },
      properties: { metallicity: 0.7, convectionScale: 6 },
    },
    {
      name: 'Proxima Centauri', type: 'Star', mass: 0.1221 * M_SUN_IN_EARTH, radiusKm: 0.1542 * R_SUN_KM,
      color: '#ff5722', texture: 'plasma', temperatureK: 3042,
      parent: 'Alpha Centauri A',
      // Proxima's true separation is ~8700 AU with a ~550 000 year period;
      // that is unusable in an interactive scene, so it is placed on a
      // representative wide orbit and flagged in the description.
      orbit: { aAU: 430, e: 0.5, iDeg: 107.6, lanDeg: 126, argpDeg: 72, mDeg: 210 },
      properties: { metallicity: 0.3, convectionScale: 9, flareActivity: 0.9 },
    },
    {
      name: 'Proxima b', type: 'Planet', mass: 1.07, radiusKm: 1.03 * 6371,
      color: '#7a8b99', texture: 'rock', temperatureK: 0,
      parent: 'Proxima Centauri', onRails: true,
      orbit: { aAU: 0.04856, e: 0.02, iDeg: 0, lanDeg: 0, argpDeg: 0, mDeg: 0 },
      properties: {
        compositionIron: 0.3, compositionSilicates: 0.6, compositionWater: 0.1,
        atmosphere: 0.3, isTidallyLocked: true,
      },
    },
  ],
};

export const REAL_SYSTEMS: RealSystem[] = [SOLAR_SYSTEM, TRAPPIST_1, ALPHA_CENTAURI];

export const getRealSystem = (id: string): RealSystem | undefined =>
  REAL_SYSTEMS.find((s) => s.id === id);

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

const _pos = new THREE.Vector3();
const _vel = new THREE.Vector3();

/**
 * Turn a system specification into live bodies.
 *
 * Free bodies get state vectors integrated from their elements about their
 * primary; satellites keep their elements and are propagated analytically.
 * Finally the whole system is shifted into its barycentric frame so it does not
 * drift across the scene.
 */
export const buildRealSystem = (system: RealSystem): CelestialBody[] => {
  const byName = new Map<string, CelestialBody>();
  const bodies: CelestialBody[] = [];

  for (const spec of system.bodies) {
    const derived = deriveBodyState(spec.type, spec.mass, spec.properties);
    const body: CelestialBody = {
      id: `${system.id}-${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      type: spec.type,
      mass: spec.mass,
      // Real radii are measurements, so they override the mass-radius relation.
      radiusKm: spec.radiusKm,
      radius: derived.radius,
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      color: spec.color,
      texture: spec.texture,
      trailColor: spec.color,
      temperature: spec.temperatureK ?? 0,
      habitability: 'N/A',
      population: 0,
      name: spec.name,
      properties: {
        ...spec.properties,
        manualRadius: true,
        manualRadiusKm: spec.radiusKm,
        rotationPeriod: spec.rotationHours !== undefined ? Math.abs(spec.rotationHours) : 24,
        obliquity: spec.obliquityDeg ?? 0,
        userTempOverride: spec.temperatureK !== undefined && spec.temperatureK > 0,
      },
    };
    // Recompute density/gravity/escape velocity against the real radius.
    const withRealRadius = deriveBodyState(spec.type, spec.mass, body.properties);
    body.radius = withRealRadius.radius;
    body.properties = {
      ...body.properties,
      bulkDensity: withRealRadius.bulkDensity,
      surfaceGravity: withRealRadius.surfaceGravity,
      escapeVelocity: withRealRadius.escapeVelocity,
      luminositySolarDerived: withRealRadius.luminositySolar,
    };

    byName.set(spec.name, body);
    bodies.push(body);
  }

  const primary = byName.get(system.bodies[0].name)!;

  // Place bodies parent-first so a satellite's parent already has a position.
  for (const spec of system.bodies) {
    if (!spec.orbit) continue;
    const body = byName.get(spec.name)!;
    const parent = spec.parent ? byName.get(spec.parent) : primary;
    if (!parent) continue;

    const a = spec.orbit.aAU !== undefined ? auToDist(spec.orbit.aAU) : kmToDist(spec.orbit.aKm!);
    const elements = elementsFromDegrees(
      a, spec.orbit.e, spec.orbit.iDeg, spec.orbit.lanDeg, spec.orbit.argpDeg, spec.orbit.mDeg,
    );

    if (spec.onRails) {
      // Satellites keep their elements and are placed each frame by moonSystem.
      body.parentId = parent.id;
      body.orbit = elements;
      continue;
    }

    propagateOrbit(elements, gravitationalParameter(parent.mass, body.mass), 0, _pos, _vel);
    body.position.copy(parent.position).add(_pos);
    body.velocity.copy(parent.velocity).add(_vel);
  }

  // Second pass so satellites of satellites (and of bodies placed above) start
  // at the right absolute position rather than at the origin.
  for (const spec of system.bodies) {
    if (!spec.onRails || !spec.orbit) continue;
    const body = byName.get(spec.name)!;
    const parent = spec.parent ? byName.get(spec.parent) : primary;
    if (!parent || !body.orbit) continue;
    propagateOrbit(body.orbit, gravitationalParameter(parent.mass, body.mass), 0, _pos, _vel);
    body.position.copy(parent.position).add(_pos);
    body.velocity.copy(parent.velocity).add(_vel);
  }

  shiftToBarycentre(bodies);
  return bodies;
};

/**
 * Move into the centre-of-mass frame. Published elements are given relative to
 * the primary, so without this the whole system slowly translates off-screen as
 * the primary recoils from its planets.
 */
const shiftToBarycentre = (bodies: CelestialBody[]): void => {
  let totalMass = 0;
  const com = new THREE.Vector3();
  const mom = new THREE.Vector3();
  for (const b of bodies) {
    totalMass += b.mass;
    com.addScaledVector(b.position, b.mass);
    mom.addScaledVector(b.velocity, b.mass);
  }
  if (!(totalMass > 0)) return;
  com.divideScalar(totalMass);
  mom.divideScalar(totalMass);
  for (const b of bodies) {
    // Satellites are positioned relative to their parent every frame, so only
    // free bodies need the shift; correcting both would double-count it.
    if (b.parentId) continue;
    b.position.sub(com);
    b.velocity.sub(mom);
  }
};
