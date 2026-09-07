/**
 * Primaries → derived properties.
 *
 * Every body in the simulation is defined by a small set of *primary* degrees of
 * freedom the user may edit (mass, composition, spin, rotation, overrides).
 * Everything else — radius, density, surface gravity, escape velocity,
 * luminosity, effective temperature, horizon geometry — is *derived* here and is
 * read-only in the UI. Centralising it means a body can never end up in a state
 * where its displayed numbers disagree with its physics.
 *
 * All masses are in M⊕, all radii in km, all temperatures in K.
 */

import type { BodyType, CelestialBody } from '../types';
import {
  BODY_CONFIGS,
  EVOLUTION_THRESHOLDS,
  GIANT_TYPES,
  TERRESTRIAL_TYPES,
} from '../constants';
import {
  M_SUN_IN_EARTH,
  R_EARTH_KM,
  R_JUPITER_KM,
  R_SUN_KM,
  T_SUN_EFF_K,
  bulkDensityGcm3,
  effectiveTemperatureK,
  escapeVelocityKms,
  luminositySolarFromMass,
  luminositySolarFromRadiusTemp,
  massToSolar,
  radiusKmFromDensity,
  stellarRadiusSolarFromMass,
  surfaceGravitySi,
  visualRadiusFromKm,
} from './units';
import { kerrOuterHorizonKm } from './relativity';

// ---------------------------------------------------------------------------
// Terrestrial interiors
// ---------------------------------------------------------------------------

/** Zero-pressure densities of the three end-member components, g/cm³. */
export const DENSITY_IRON = 7.8;
export const DENSITY_SILICATE = 3.3;
export const DENSITY_WATER = 1.0;

/**
 * Uncompressed bulk density of an iron/silicate/water mixture.
 * Volumes add, so 1/ρ = Σ fᵢ/ρᵢ for mass fractions fᵢ.
 */
export const mixtureDensity = (fIron: number, fSil: number, fWater: number): number => {
  const sum = fIron + fSil + fWater;
  const s = sum > 1e-9 ? sum : 1;
  const inv =
    fIron / s / DENSITY_IRON + fSil / s / DENSITY_SILICATE + fWater / s / DENSITY_WATER;
  return 1 / Math.max(inv, 1e-6);
};

/**
 * Self-compression correction, f(M) = exp(−b·M^q).
 *
 * A zero-pressure mixture would give R ∝ M^⅓, but real rocky bodies compress
 * under their own weight: Earth's uncompressed density is ~4.06 g/cm³ against a
 * measured 5.51. The two constants are fixed by requiring
 *   (a) f(1 M⊕) = 6371/7055 for an Earth-like 32.5% iron mixture, and
 *   (b) R(10 M⊕)/R(1 M⊕) = 10^0.27, i.e. the super-Earth mass-radius slope of
 *       Zeng, Sasselov & Jacobsen (2016) over the decade they fit.
 * f → 1 as M → 0, so small bodies are correctly left uncompressed.
 *
 * Validation against bodies not used in the calibration: Mars 3270 km (actual
 * 3390, −3.5%), the Moon 1686 km (actual 1737, −2.9%). The residuals are the
 * price of a composition-only model that ignores each body's real core-mantle
 * structure, and are well inside the scatter of the observed population.
 */
const compressionFactor = (massEarth: number): number => {
  if (!(massEarth > 0)) return 1;
  return Math.exp(-0.101918 * Math.pow(massEarth, 0.3856));
};

/** Radius (km) of a terrestrial body from mass and composition. */
export const terrestrialRadiusKm = (
  massEarth: number,
  fIron: number,
  fSil: number,
  fWater: number,
): number => {
  const rho = mixtureDensity(fIron, fSil, fWater);
  const uncompressed = radiusKmFromDensity(Math.max(massEarth, 1e-14), rho);
  return uncompressed * compressionFactor(massEarth);
};

// ---------------------------------------------------------------------------
// Giant planets
// ---------------------------------------------------------------------------

/**
 * Mass-radius anchors for cold, mature giants, in (M⊕, R⊕). Interpolated
 * log-log. Uranus/Neptune, Saturn and Jupiter sit on real measured values; the
 * relation flattens near 1 R♃ and then contracts, which is the observed
 * behaviour once electron degeneracy starts to dominate above ~0.5 M♃.
 *
 * Irradiated hot Jupiters inflate well above this (up to ~1.8 R♃); that is an
 * age- and insolation-dependent effect not modelled here.
 */
const GIANT_ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [2.0, 1.25],
  [10, 3.0],
  [14.54, 3.98],   // Uranus
  [17.15, 3.86],   // Neptune
  [50, 6.5],
  [95.16, 9.14],   // Saturn
  [317.8, 10.97],  // Jupiter
  [1000, 11.2],
  [4132, 10.5],    // 13 M♃, the deuterium-burning limit
];

export const giantRadiusKm = (massEarth: number): number => {
  const m = Math.max(massEarth, 1e-6);
  const a = GIANT_ANCHORS;
  if (m <= a[0][0]) return a[0][1] * R_EARTH_KM * Math.cbrt(m / a[0][0]);
  if (m >= a[a.length - 1][0]) return a[a.length - 1][1] * R_EARTH_KM;
  for (let i = 1; i < a.length; i++) {
    if (m <= a[i][0]) {
      const [m0, r0] = a[i - 1];
      const [m1, r1] = a[i];
      const t = (Math.log(m) - Math.log(m0)) / (Math.log(m1) - Math.log(m0));
      return Math.exp(Math.log(r0) + t * (Math.log(r1) - Math.log(r0))) * R_EARTH_KM;
    }
  }
  return a[a.length - 1][1] * R_EARTH_KM;
};

// ---------------------------------------------------------------------------
// Stars and substellar objects
// ---------------------------------------------------------------------------

export const mainSequenceRadiusKm = (massEarth: number): number =>
  stellarRadiusSolarFromMass(massEarth) * R_SUN_KM;

/**
 * Red giant radius. An evolved star inflates by one to three orders of
 * magnitude; `luminosityClass` (0 = giant, 1 = supergiant) selects where in the
 * observed 30–500 R☉ range it lands, with a weak mass dependence.
 */
export const redGiantRadiusKm = (massEarth: number, luminosityClass = 0): number => {
  const lc = Math.max(0, Math.min(1, luminosityClass));
  const base = 30 + lc * 470;
  return base * Math.pow(Math.max(massToSolar(massEarth), 0.1), 0.4) * R_SUN_KM;
};

/**
 * Brown dwarf radius. Between the deuterium-burning limit and the hydrogen
 * burning limit, Coulomb pressure and electron degeneracy very nearly cancel,
 * so radius is almost independent of mass at ~0.85–1.0 R♃ across the whole
 * range (Burrows et al. 2001). Modelled as a shallow decline.
 */
export const brownDwarfRadiusKm = (massEarth: number): number => {
  const mJup = massEarth / 317.83;
  const rJup = 1.0 - 0.13 * Math.min(1, Math.max(0, (mJup - 13) / 62));
  return rJup * R_JUPITER_KM;
};

/**
 * White dwarf radius from the Nauenberg (1972) analytic fit to the fully
 * degenerate mass-radius relation:
 *   R = 0.0126 R☉ (μₑ/2)^(−5/3) (M/M☉)^(−⅓) √(1 − (M/M_Ch)^(4/3))
 * with μₑ = 2 (carbon/oxygen) and M_Ch = 1.44 M☉.
 *
 * Note the *inverse* mass dependence: more massive white dwarfs are smaller,
 * and the radius goes to zero at the Chandrasekhar limit. Sirius B (1.02 M☉)
 * comes out at 5290 km against a measured 5850.
 */
export const whiteDwarfRadiusKm = (massEarth: number): number => {
  const m = Math.max(massToSolar(massEarth), 0.01);
  const ratio = Math.min(0.999, m / 1.44);
  const shrink = Math.sqrt(Math.max(1e-6, 1 - Math.pow(ratio, 4 / 3)));
  return 0.0126 * Math.pow(m, -1 / 3) * shrink * R_SUN_KM;
};

/**
 * Neutron star radius. An empirical fit to the current multimessenger + NICER
 * constraint of 12 ± 1 km, anchored at 12.4 km for the canonical 1.4 M☉ star
 * and declining weakly with mass as stiff-EoS models predict.
 *
 * The pre-2.0 engine had this *increasing* with mass, which is backwards for a
 * degeneracy-supported object.
 */
export const neutronStarRadiusKm = (massEarth: number): number => {
  const m = massToSolar(massEarth);
  return Math.max(9.5, Math.min(14, 12.4 - 1.4 * (m - 1.4)));
};

/** Kerr event horizon; reduces to the Schwarzschild radius at zero spin. */
export const blackHoleRadiusKm = (massEarth: number, spin = 0): number =>
  kerrOuterHorizonKm(massEarth, spin);

// ---------------------------------------------------------------------------
// Radius dispatcher
// ---------------------------------------------------------------------------

export const radiusKmForType = (
  type: BodyType,
  massEarth: number,
  props?: CelestialBody['properties'],
): number => {
  const p = props ?? {};
  if (TERRESTRIAL_TYPES.includes(type)) {
    return terrestrialRadiusKm(
      massEarth,
      p.compositionIron ?? 0.3,
      p.compositionSilicates ?? 0.6,
      p.compositionWater ?? 0.1,
    );
  }
  if (GIANT_TYPES.includes(type)) return giantRadiusKm(massEarth);
  switch (type) {
    case 'Star': return mainSequenceRadiusKm(massEarth);
    case 'Red Giant': return redGiantRadiusKm(massEarth, p.luminosityClass ?? 0);
    case 'Brown Dwarf': return brownDwarfRadiusKm(massEarth);
    case 'White Dwarf': return whiteDwarfRadiusKm(massEarth);
    case 'Neutron Star':
    case 'Pulsar': return neutronStarRadiusKm(massEarth);
    case 'Black Hole': return blackHoleRadiusKm(massEarth, p.spinParameter ?? 0);
    default: return terrestrialRadiusKm(massEarth, 0.3, 0.6, 0.1);
  }
};

// ---------------------------------------------------------------------------
// Photospheric temperature
// ---------------------------------------------------------------------------

/**
 * Default effective temperature for self-luminous bodies, in K. Stars follow
 * Stefan-Boltzmann from their own mass-luminosity and mass-radius relations;
 * the remnants use representative observed values, since their temperature is
 * set by cooling age rather than by mass.
 */
export const defaultEffectiveTemperatureK = (
  type: BodyType,
  massEarth: number,
  radiusKm: number,
): number => {
  switch (type) {
    case 'Star': {
      const L = luminositySolarFromMass(massEarth);
      return Math.max(2000, Math.min(60000, effectiveTemperatureK(L, radiusKm / R_SUN_KM)));
    }
    case 'Red Giant':
      return 3500;             // typical M-type giant photosphere
    case 'Brown Dwarf':
      return 1300;             // mid L/T dwarf
    case 'White Dwarf':
      return 10000;            // representative of the observed cooling sequence
    case 'Neutron Star':
    case 'Pulsar':
      return 6e5;              // young NS surface
    case 'Black Hole':
      return 0;                // no photosphere; the disk carries the light
    default:
      return 288;              // overwritten by the equilibrium-temperature pass
  }
};

/** Luminosity in L☉ for any body that emits its own light. */
export const derivedLuminositySolar = (
  type: BodyType,
  massEarth: number,
  radiusKm: number,
  temperatureK: number,
): number => {
  if (type === 'Star') return luminositySolarFromMass(massEarth);
  if (type === 'Black Hole') return 0;
  if (
    type === 'Red Giant' ||
    type === 'Brown Dwarf' ||
    type === 'White Dwarf' ||
    type === 'Neutron Star' ||
    type === 'Pulsar'
  ) {
    return luminositySolarFromRadiusTemp(radiusKm, temperatureK);
  }
  return 0;
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * Return the type a body must have given its mass, preserving the user's chosen
 * type whenever it remains physically admissible.
 *
 * Compact objects follow a one-way collapse ladder (a white dwarf pushed past
 * Chandrasekhar becomes a neutron star; a neutron star past the TOV limit
 * becomes a black hole; a black hole never uncollapses). Everything else is
 * validated against its own declared mass range in `BODY_CONFIGS`, so the
 * classification table has exactly one definition.
 */
export const classifyBody = (type: BodyType, massEarth: number): BodyType => {
  const m = Number.isFinite(massEarth) ? massEarth : 0;

  // One-way collapse ladder for degenerate remnants.
  if (type === 'Black Hole') return 'Black Hole';
  if (type === 'Neutron Star' || type === 'Pulsar') {
    return m > EVOLUTION_THRESHOLDS.TOV ? 'Black Hole' : type;
  }
  if (type === 'White Dwarf') {
    if (m > EVOLUTION_THRESHOLDS.TOV) return 'Black Hole';
    return m > EVOLUTION_THRESHOLDS.CHANDRASEKHAR ? 'Neutron Star' : 'White Dwarf';
  }

  // Non-degenerate bodies keep their type while it stays within range.
  const cfg = BODY_CONFIGS[type];
  if (cfg && m >= cfg.massRange[0] && m <= cfg.massRange[1]) return type;

  return classifyByMass(m);
};

/** Best-fit type for a mass with no prior type to preserve. */
export const classifyByMass = (massEarth: number): BodyType => {
  const m = massEarth;
  if (m >= EVOLUTION_THRESHOLDS.HYDROGEN_BURNING) return 'Star';
  if (m >= EVOLUTION_THRESHOLDS.DEUTERIUM_BURNING) return 'Brown Dwarf';
  if (m >= 50) return 'Gas Giant';
  if (m >= 5) return 'Ice Giant';
  if (m >= 0.02) return 'Planet';
  if (m >= 1e-4) return 'Dwarf';
  if (m >= 1e-9) return 'Asteroid';
  return 'Comet';
};

// ---------------------------------------------------------------------------
// Whole-body derivation
// ---------------------------------------------------------------------------

export interface DerivedBodyState {
  radiusKm: number;
  radius: number;              // visual, L*
  bulkDensity: number;         // g/cm³
  surfaceGravity: number;      // m/s²
  escapeVelocity: number;      // km/s
  luminositySolar: number;     // L☉
  temperature: number;         // K (photospheric; 0 for non-luminous)
}

/**
 * Compute every derived quantity for a body from its primaries. Pure — returns
 * a value rather than mutating, so it can be used by tests, the store and the
 * preset loader alike.
 *
 * `manualRadius` lets a user pin a radius directly; density is then solved from
 * mass and radius instead of the other way round.
 */
export const deriveBodyState = (
  type: BodyType,
  massEarth: number,
  props?: CelestialBody['properties'],
): DerivedBodyState => {
  const p = props ?? {};
  const mass = Number.isFinite(massEarth) && massEarth > 0 ? massEarth : 1e-9;

  const radiusKm =
    p.manualRadius && Number.isFinite(p.manualRadiusKm as number) && (p.manualRadiusKm as number) > 0
      ? (p.manualRadiusKm as number)
      : radiusKmForType(type, mass, p);

  const temperature = defaultEffectiveTemperatureK(type, mass, radiusKm);

  return {
    radiusKm,
    radius: visualRadiusFromKm(type, radiusKm),
    bulkDensity: bulkDensityGcm3(mass, radiusKm),
    surfaceGravity: surfaceGravitySi(mass, radiusKm),
    escapeVelocity: escapeVelocityKms(mass, radiusKm),
    luminositySolar: derivedLuminositySolar(type, mass, radiusKm, temperature),
    temperature,
  };
};

/**
 * Apply `deriveBodyState` to a live body in place, reclassifying it first if its
 * mass has moved outside what its type allows. Returns the type it ended up
 * with so callers can raise an evolution event.
 *
 * Photospheric temperature is only written for self-luminous bodies; everything
 * else is left to the equilibrium-temperature pass, and a user override is
 * always respected.
 */
export const applyDerivedState = (body: CelestialBody): BodyType => {
  const nextType = classifyBody(body.type, body.mass);
  body.type = nextType;

  const d = deriveBodyState(nextType, body.mass, body.properties);
  body.radiusKm = d.radiusKm;
  body.radius = d.radius;

  if (d.temperature > 0 && !body.properties?.userTempOverride) {
    body.temperature = d.temperature;
  }

  body.properties = {
    ...(body.properties ?? {}),
    bulkDensity: d.bulkDensity,
    surfaceGravity: d.surfaceGravity,
    escapeVelocity: d.escapeVelocity,
    luminositySolarDerived: d.luminositySolar,
  };

  return nextType;
};

/** Effective temperature of the Sun, for tests and UI reference. */
export const SUN_T_EFF = T_SUN_EFF_K;
/** One solar mass in simulation units, re-exported for convenience. */
export const SOLAR_MASS = M_SUN_IN_EARTH;
