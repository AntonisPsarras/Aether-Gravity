/** Scientific starting conditions with explicit epochs, frames and assumptions.
 * Runtime is offline. Source URLs are attached to each system; Horizons fixtures
 * can be regenerated with scripts/fetch-satellite-elements.ps1.
 * Positions use real distances; only drawn radii and moon displays are enlarged.
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
import solarElements from './solarSatelliteElements.json';
import { meanAnomalyFromTrueAnomaly } from '../utils/keplerOrbit';
import { G_AETHER, distToAU, equilibriumTemperatureFromLuminosity } from '../utils/units';

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
  /** Mean anomaly at the system's reference epoch, degrees. */
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
  /** Relative to the centre of mass of these already-placed free bodies. */
  barycentreOf?: string[];
  orbit?: RealOrbitSpec;
  /**
   * Propagate analytically on Kepler rails rather than through the N-body sum.
   * Used for satellites, whose periods are far shorter than the physics
   * timestep can resolve. See utils/moonSystem.ts.
   */
  onRails?: boolean;
  /**
   * Mean sidereal period, days (rails satellites). Sets the semi-major axis by
   * Kepler's third law so the unperturbed rails keep the real mean motion; an
   * osculating snapshot's own period can be off by ~1% (the Moon's is 27.016 d
   * against 27.3217 d, because the Sun perturbs it). Orientation and J2000
   * phase still come from the Horizons snapshot.
   */
  siderealPeriodDays?: number;
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
  epochJD?: number;
  referencePlane?: string;
  sources?: string[];
  notes?: string;
  bodies: RealBodySpec[];
}

// ---------------------------------------------------------------------------
// The Solar System
// ---------------------------------------------------------------------------

const SOLAR_SYSTEM: RealSystem = {
  id: 'solar-system',
  epochJD: 2451545,
  referencePlane: 'J2000 mean ecliptic',
  sources: [
    'https://ssd.jpl.nasa.gov/planets/approx_pos.html',
    'https://ssd.jpl.nasa.gov/horizons/',
    'https://ssd.jpl.nasa.gov/planets/phys_par.html',
    'https://ssd.jpl.nasa.gov/sats/phys_par/',
  ],
  notes: 'Planet elements are JPL approximate mean elements. Earth follows the Earth–Moon barycentre and Pluto the Pluto–Charon barycentre, because moons on analytic rails exert no force. Moon orientations and J2000 phases are geometric Horizons snapshots, with semi-major axes set from the mean sidereal periods so the unperturbed rails keep the real mean motion. Masses and radii follow the JPL SSD physical-parameter tables. Moon gravity and precession are omitted. Surfaces and enlarged moon displays are illustrative.',
  name: 'The Solar System',
  subtitle: 'Sun · 8 planets · Pluto · 11 major moons',
  description:
    'Our system at J2000: measured masses and radii, approximate planetary ' +
    'orbits and analytical moons. Physical distances with enlarged body displays.',
  source: 'NASA/JPL physical parameters, approximate planetary elements and Horizons J2000 satellite snapshots',
  bodies: [
    {
      name: 'Sun', type: 'Star', mass: M_SUN_IN_EARTH, radiusKm: R_SUN_KM,
      color: '#fff4ea', texture: 'plasma', temperatureK: 5772,
      rotationHours: 609.12,
      properties: { luminositySolar: 1, metallicity: 0.5, convectionScale: 5, oblateness: 0.0 },
    },

    // --- Terrestrial planets -------------------------------------------------
    {
      name: 'Mercury', type: 'Planet', mass: 0.055274, radiusKm: 2439.4,
      color: '#8c8079', texture: 'rock', temperatureK: 440,
      rotationHours: 1407.6, obliquityDeg: 0.034,
      // JPL Table 1: ω = ϖ − Ω = 77.45779628 − 48.33076593, M = L − ϖ.
      orbit: { aAU: 0.38709927, e: 0.20563593, iDeg: 7.00497902, lanDeg: 48.33076593, argpDeg: 29.12703035, mDeg: 174.79252722 },
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
      // JPL Table 1 "EM Bary": the Earth–Moon barycentre, since the Moon exerts no force here.
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
      orbit: { aAU: 9.53667594, e: 0.05386179, iDeg: 2.48599187, lanDeg: 113.66242448, argpDeg: 338.93645383, mDeg: 317.35536592 },
      // The main rings: inner edge of the C ring at 1.24 R_S, outer edge of the
      // A ring at 2.27 R_S, both comfortably inside Saturn's 2.7 R_S Roche
      // limit for loose ice. Optically thick in the B ring.
      properties: {
        atmosphere: 1.0, cloudDepth: 0.7, oblateness: 0.098,
        ringOpacity: 0.85, ringInnerRadius: 74658 / 58232, ringOuterRadius: 136775 / 58232,
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
      // JPL SSD: 13 024.6 × 10¹⁸ kg.
      name: 'Pluto', type: 'Dwarf', mass: 0.0021809, radiusKm: 1188.3,
      color: '#c8b7a6', texture: 'ice', temperatureK: 44,
      rotationHours: -153.29, obliquityDeg: 122.53,
      // JPL approximate elements of the Pluto–Charon barycentre (Charon exerts no force here).
      orbit: { aAU: 39.48211675, e: 0.24882730, iDeg: 17.14001206, lanDeg: 110.30393684, argpDeg: 113.76497945, mDeg: 14.86012204 },
      properties: { compositionIron: 0.1, compositionSilicates: 0.4, compositionWater: 0.5, atmosphere: 0.01 },
    },

    // --- Satellites (Kepler rails) -------------------------------------------
    // Masses are JPL SSD mass parameters over GM⊕ = 398 600.4418 km³/s²; radii
    // are JPL SSD mean radii; periods are mean sidereal periods.
    {
      name: 'Moon', type: 'Moon', mass: 0.0123000371, radiusKm: 1737.4,
      color: '#b8b2a8', texture: 'rock', temperatureK: 250,
      parent: 'Earth', onRails: true, siderealPeriodDays: 27.321661,
      orbit: { aKm: 384399, e: 0.0549, iDeg: 5.145, lanDeg: 125.08, argpDeg: 318.15, mDeg: 135.27 },
      properties: { compositionIron: 0.08, compositionSilicates: 0.92, compositionWater: 0, isTidallyLocked: true },
    },
    {
      name: 'Io', type: 'Moon', mass: 0.0149521, radiusKm: 1821.49,
      color: '#e8d44d', texture: 'lava', temperatureK: 110,
      parent: 'Jupiter', onRails: true, siderealPeriodDays: 1.769138,
      orbit: { aKm: 421800, e: 0.0041, iDeg: 0.036, lanDeg: 43.977, argpDeg: 84.129, mDeg: 342.021 },
      properties: { compositionIron: 0.2, compositionSilicates: 0.8, compositionWater: 0, tectonics: 1.0, isTidallyLocked: true },
    },
    {
      name: 'Europa', type: 'Moon', mass: 0.0080349, radiusKm: 1560.8,
      color: '#d9c9a8', texture: 'ice', temperatureK: 102,
      parent: 'Jupiter', onRails: true, siderealPeriodDays: 3.551181,
      orbit: { aKm: 671100, e: 0.0094, iDeg: 0.466, lanDeg: 219.106, argpDeg: 88.970, mDeg: 171.016 },
      properties: { compositionIron: 0.15, compositionSilicates: 0.75, compositionWater: 0.10, waterLevel: 1.0, isTidallyLocked: true },
    },
    {
      name: 'Ganymede', type: 'Moon', mass: 0.0248064, radiusKm: 2631.2,
      color: '#9d9186', texture: 'ice', temperatureK: 110,
      parent: 'Jupiter', onRails: true, siderealPeriodDays: 7.154553,
      orbit: { aKm: 1070400, e: 0.0013, iDeg: 0.177, lanDeg: 63.552, argpDeg: 192.417, mDeg: 317.540 },
      properties: { compositionIron: 0.1, compositionSilicates: 0.55, compositionWater: 0.35, isTidallyLocked: true },
    },
    {
      name: 'Callisto', type: 'Moon', mass: 0.0180112, radiusKm: 2410.3,
      color: '#6b5f57', texture: 'rock', temperatureK: 134,
      parent: 'Jupiter', onRails: true, siderealPeriodDays: 16.689018,
      orbit: { aKm: 1882700, e: 0.0074, iDeg: 0.192, lanDeg: 298.848, argpDeg: 52.643, mDeg: 181.408 },
      properties: { compositionIron: 0.05, compositionSilicates: 0.55, compositionWater: 0.40, isTidallyLocked: true },
    },
    {
      name: 'Titan', type: 'Moon', mass: 0.0225242, radiusKm: 2574.76,
      color: '#d9a441', texture: 'gas', temperatureK: 94,
      parent: 'Saturn', onRails: true, siderealPeriodDays: 15.945421,
      orbit: { aKm: 1221900, e: 0.0288, iDeg: 0.312, lanDeg: 28.060, argpDeg: 180.532, mDeg: 163.310 },
      properties: { compositionIron: 0.1, compositionSilicates: 0.5, compositionWater: 0.4, atmosphere: 0.6, haze: 1.0, scaleHeight: 0.4, isTidallyLocked: true },
    },
    {
      name: 'Enceladus', type: 'Moon', mass: 1.8089e-5, radiusKm: 252.1,
      color: '#f2f7f7', texture: 'ice', temperatureK: 75,
      parent: 'Saturn', onRails: true, siderealPeriodDays: 1.370218,
      orbit: { aKm: 238040, e: 0.0047, iDeg: 0.009, lanDeg: 342.507, argpDeg: 119.5, mDeg: 57.0 },
      properties: { compositionIron: 0.05, compositionSilicates: 0.35, compositionWater: 0.60, isTidallyLocked: true },
    },
    {
      name: 'Titania', type: 'Moon', mass: 5.6924e-4, radiusKm: 788.9,
      color: '#a89a90', texture: 'ice', temperatureK: 70,
      parent: 'Uranus', onRails: true, siderealPeriodDays: 8.706234,
      orbit: { aKm: 435910, e: 0.0011, iDeg: 0.079, lanDeg: 99.771, argpDeg: 284.400, mDeg: 24.614 },
      properties: { compositionIron: 0.05, compositionSilicates: 0.5, compositionWater: 0.45, isTidallyLocked: true },
    },
    {
      name: 'Triton', type: 'Moon', mass: 0.0035838, radiusKm: 1352.6,
      color: '#c4bcae', texture: 'ice', temperatureK: 38,
      parent: 'Neptune', onRails: true, siderealPeriodDays: 5.876854,
      // Retrograde: inclination above 90 degrees. Triton is a captured
      // Kuiper belt object, which is why it orbits backwards.
      orbit: { aKm: 354759, e: 0.000016, iDeg: 156.885, lanDeg: 172.431, argpDeg: 344.046, mDeg: 264.775 },
      properties: { compositionIron: 0.1, compositionSilicates: 0.55, compositionWater: 0.35, atmosphere: 0.01, isTidallyLocked: true },
    },
    {
      name: 'Charon', type: 'Moon', mass: 2.6618e-4, radiusKm: 606.0,
      color: '#9a9086', texture: 'ice', temperatureK: 53,
      parent: 'Pluto', onRails: true, siderealPeriodDays: 6.387230,
      orbit: { aKm: 19591, e: 0.0002, iDeg: 0.08, lanDeg: 223.046, argpDeg: 146.106, mDeg: 0.0 },
      properties: { compositionIron: 0.05, compositionSilicates: 0.5, compositionWater: 0.45, isTidallyLocked: true },
    },
    {
      name: 'Phobos', type: 'Moon', mass: 1.7780e-9, radiusKm: 11.08,
      color: '#7a6a5d', texture: 'rock', temperatureK: 233,
      parent: 'Mars', onRails: true, siderealPeriodDays: 0.318910,
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
  epochJD: 2457257.93115525,
  referencePlane: 'Coplanar Jacobi solution, rotated face-on for viewing',
  sources: ['https://arxiv.org/abs/2010.01074', 'https://arxiv.org/abs/2409.11620'],
  notes: 'Agol 2021 Table 2 posterior central parameters in Jacobi coordinates at BJD TDB 2457257.93115525; not a posterior sample or precision transit forecast. The 2024 timing update is cited for limitations, not mixed into these elements. Coplanarity and synchronous spins are model assumptions. Exoplanet surfaces, albedos and compositions are illustrative; atmospheres and habitability are unknown.',
  name: 'TRAPPIST-1',
  subtitle: 'Ultracool dwarf · 7 terrestrial planets',
  description:
    'Seven Earth-sized worlds around a 0.09 solar-mass star, three of them in ' +
    'the habitable zone. The whole system would fit inside Mercury’s orbit.',
  source: 'Agol et al. (2021), PSJ 2, 1, Table 2 Jacobi parameters; Agol et al. (2024) timing limitations',
  bodies: [
    {
      name: 'TRAPPIST-1', type: 'Star', mass: 0.0898 * M_SUN_IN_EARTH, radiusKm: 0.1192 * R_SUN_KM,
      color: '#ff7043', texture: 'plasma', temperatureK: 2566,
      rotationHours: 3.3 * 24,
      properties: { luminositySolar: 0.000553, metallicity: 0.6, convectionScale: 8, flareActivity: 0.7 },
    },
    trappistPlanet('b', 1.116),
    trappistPlanet('c', 1.097),
    trappistPlanet('d', 0.788),
    trappistPlanet('e', 0.920),
    trappistPlanet('f', 1.045),
    trappistPlanet('g', 1.129),
    trappistPlanet('h', 0.755),
  ],
};

/** Coplanar Jacobi initial conditions from Agol 2021 Table 2. */
function trappistPlanet(
  letter: string,
  radiusEarth: number,
): RealBodySpec {
  // Agol 2021 Table 2: mass at 0.09 solar masses, P(days), t0(BJD-2450000), e cos w, e sin w.
  const solution: Record<string, number[]> = {
    b: [1.3771, 1.510826, 7257.55044, -0.00215, 0.00217],
    c: [1.3105, 2.421937, 7258.58728, 0.00055, 0.00001],
    d: [0.3885, 4.049219, 7257.06768, -0.00496, 0.00267],
    e: [0.6932, 6.101013, 7257.82771, 0.00433, -0.00461],
    f: [1.0411, 9.207540, 7257.07426, -0.00840, -0.00051],
    g: [1.3238, 12.352446, 7257.71462, 0.00380, 0.00128],
    h: [0.3261, 18.772866, 7249.60676, -0.00365, -0.00002],
  };
  const [mass09, period, transit, ecosw, esinw] = solution[letter];
  const mass = mass09 * 0.0898 / 0.09;
  const e = Math.hypot(ecosw, esinw);
  const omega = Math.atan2(esinw, ecosw);
  const mean = meanAnomalyFromTrueAnomaly(Math.PI / 2 - omega, e)
    + 2 * Math.PI * (7257.93115525 - transit) / period;
  const inner = Object.keys(solution).filter(l => l < letter);
  const enclosedMass = 0.0898 * M_SUN_IN_EARTH + inner.reduce((sum, l) => sum + solution[l][0] * 0.0898 / 0.09, 0);
  const aAU = distToAU(Math.cbrt(G_AETHER * (enclosedMass + mass) * (period / 365.25 / (2 * Math.PI)) ** 2));
  return {
    name: `TRAPPIST-1${letter}`,
    type: 'Planet',
    mass,
    radiusKm: radiusEarth * 6371,
    color: ['#b37d65', '#aa9681', '#80786f', '#9c8b7a', '#a99888', '#b8aca2', '#c1b8ae']['bcdefgh'.indexOf(letter)],
    texture: 'rock',
    temperatureK: 0,   // resolved by the equilibrium-temperature pass
    rotationHours: period * 24,
    barycentreOf: ['TRAPPIST-1', ...inner.map(l => `TRAPPIST-1${l}`)],
    orbit: { aAU, e, iDeg: 0, lanDeg: 0, argpDeg: omega * 180 / Math.PI, mDeg: mean * 180 / Math.PI },
    properties: {
      compositionIron: 0.25,
      compositionSilicates: 0.75,
      compositionWater: 0,
      atmosphere: 0,
      albedo: 0.3,
      isTidallyLocked: true,
    },
  };
}

export const REAL_SYSTEMS: RealSystem[] = [SOLAR_SYSTEM, TRAPPIST_1];

// Horizons already expresses each satellite in the common ecliptic frame;
// using these snapshots avoids treating a planet-equatorial inclination as
// ecliptic. Only rails satellites take them. A planet whose moons are on rails
// must follow its system barycentre (JPL's EM Bary for Earth, the Pluto-system
// barycentre for Pluto), because those moons exert no force here: the body's
// own osculating elements would freeze the moon-induced wobble into a wrong
// orbit — Earth's would give a 365.50-day year.
for (const spec of SOLAR_SYSTEM.bodies) {
  if (!spec.onRails) continue;
  const elements = solarElements[spec.name as keyof typeof solarElements];
  if (!elements) continue;
  spec.orbit = { aAU: elements.aAU, e: elements.e, iDeg: elements.iDeg, lanDeg: elements.lanDeg, argpDeg: elements.argpDeg, mDeg: elements.mDeg };
  // Tidally locked: spin with the mean orbit.
  spec.rotationHours = (spec.siderealPeriodDays ?? elements.periodDays) * 24;
}

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
        presetId: system.id,
        epochJD: system.epochJD,
        referencePlane: system.referencePlane,
        scienceNote: system.notes,
        physicalCollisions: true,
        renderRadiusScale: system.id === 'trappist-1'
          ? (spec.type === 'Star' ? 0.08 : 0.01) : 1,
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
    const centre = new THREE.Vector3();
    const centreVelocity = new THREE.Vector3();
    let centralMass = parent.mass;
    if (spec.barycentreOf) {
      centralMass = 0;
      for (const name of spec.barycentreOf) {
        const member = byName.get(name);
        if (!member) throw new Error(`Unknown barycentre member ${name}`);
        centralMass += member.mass;
        centre.addScaledVector(member.position, member.mass);
        centreVelocity.addScaledVector(member.velocity, member.mass);
      }
      centre.divideScalar(centralMass);
      centreVelocity.divideScalar(centralMass);
    } else {
      centre.copy(parent.position);
      centreVelocity.copy(parent.velocity);
    }

    // Rails moons: Kepler III from the mean sidereal period, so the unperturbed
    // rails keep the real mean motion (see RealBodySpec.siderealPeriodDays).
    const periodYears = spec.onRails && spec.siderealPeriodDays ? spec.siderealPeriodDays / 365.25 : 0;
    const a = periodYears > 0
      ? Math.cbrt(gravitationalParameter(parent.mass, body.mass) * (periodYears / (2 * Math.PI)) ** 2)
      : spec.orbit.aAU !== undefined ? auToDist(spec.orbit.aAU) : kmToDist(spec.orbit.aKm!);
    const elements = elementsFromDegrees(
      a, spec.orbit.e, spec.orbit.iDeg, spec.orbit.lanDeg, spec.orbit.argpDeg, spec.orbit.mDeg,
    );

    if (spec.onRails) {
      // Satellites keep their elements and are placed each frame by moonSystem.
      body.parentId = parent.id;
      body.orbit = elements;
      continue;
    }

    propagateOrbit(elements, gravitationalParameter(centralMass, body.mass), 0, _pos, _vel);
    body.position.copy(centre).add(_pos);
    body.velocity.copy(centreVelocity).add(_vel);
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
  for (const body of bodies) {
    if (body.temperature > 0 || body.type === 'Star') continue;
    const flux = bodies.filter(b => b.type === 'Star').reduce((sum, star) => sum
      + (star.properties?.luminositySolar ?? 0) / distToAU(body.position.distanceTo(star.position)) ** 2, 0);
    body.temperature = equilibriumTemperatureFromLuminosity(flux, 1, body.properties?.albedo ?? 0.3, 0);
  }
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
    // Analytical satellites exert no force, so the conserved frame is that of
    // the integrated bodies. Their positions must still receive the same shift.
    if (b.parentId) continue;
    totalMass += b.mass;
    com.addScaledVector(b.position, b.mass);
    mom.addScaledVector(b.velocity, b.mass);
  }
  if (!(totalMass > 0)) return;
  com.divideScalar(totalMass);
  mom.divideScalar(totalMass);
  for (const b of bodies) {
    b.position.sub(com);
    b.velocity.sub(mom);
  }
};
