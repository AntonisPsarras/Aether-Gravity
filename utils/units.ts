/**
 * Aether Units — the canonical unit system for the simulation.
 *
 * The simulation integrates in a single, self-consistent unit triple. Every
 * other constant in the codebase is *derived* from it rather than tuned:
 *
 *   Mass    M* = 1 M⊕            = 5.9722 × 10²⁴ kg
 *   Length  L* = 0.025 AU        = 3.7399 × 10⁹ m
 *   Time    T* = 1 Julian year   = 3.15576 × 10⁷ s
 *
 * from which G* ≈ 7.588 and c* ≈ 2.53 × 10⁶ L*·T*⁻¹ follow exactly. Because G is
 * derived rather than invented, Kepler's third law holds numerically: a body on
 * a circular orbit at r = 40 L* (1 AU) around a 332 946 M* star has
 * v = √(G*M/r) = 251.3 L*·T*⁻¹ and a period of exactly 1.000 T* = 1 year.
 *
 * The length unit is unchanged from the previous "game units" (1/40 AU), so
 * scene scale, camera limits and every hand-tuned visual constant survive.
 *
 * ── Physical vs. visual radius ──────────────────────────────────────────────
 * Bodies are *rendered* far larger than life (Earth's true radius is 0.0017 L*,
 * but it is drawn at 2.5 L*), otherwise nothing would be visible at orbital
 * scale. To keep that exaggeration out of the physics:
 *
 *   body.radiusKm  — the physical truth. Feeds density, gravity, escape
 *                    velocity, Roche, Schwarzschild/ISCO, Stefan-Boltzmann, ESI.
 *   body.radius    — VISUAL ONLY, in L*, produced by `visualRadiusFromKm`.
 *                    Used for rendering, picking and collision detection.
 *
 * Never feed `body.radius` into a physical formula.
 */

import type { BodyType } from '../types';

// ---------------------------------------------------------------------------
// SI / astronomical reference values
// ---------------------------------------------------------------------------

/** Newtonian gravitational constant (CODATA 2018), m³·kg⁻¹·s⁻². */
export const G_SI = 6.67430e-11;
/** Stefan-Boltzmann constant, W·m⁻²·K⁻⁴. */
export const STEFAN_BOLTZMANN = 5.670374419e-8;
/** Speed of light in vacuum, km/s (exact by definition). */
export const C_KM_S = 299792.458;

export const M_EARTH_KG = 5.9722e24;
export const R_EARTH_KM = 6371.0;                 // volumetric mean radius
/** IAU 2015 nominal solar mass parameter / G. */
export const M_SUN_KG = 1.98847e30;
export const R_SUN_KM = 695700;                   // IAU 2015 nominal
export const L_SUN_W = 3.828e26;                  // IAU 2015 nominal
export const T_SUN_EFF_K = 5772;
export const M_JUPITER_KG = 1.89813e27;
export const R_JUPITER_KM = 69911;                // equatorial, 1 bar
export const AU_KM = 1.495978707e8;               // exact by definition
export const JULIAN_YEAR_S = 3.15576e7;           // exact by definition

export const M_SUN_IN_EARTH = M_SUN_KG / M_EARTH_KG;       // ≈ 332 946
export const M_JUPITER_IN_EARTH = M_JUPITER_KG / M_EARTH_KG; // ≈ 317.83
export const R_SUN_IN_EARTH = R_SUN_KM / R_EARTH_KM;       // ≈ 109.2
export const R_JUPITER_IN_EARTH = R_JUPITER_KM / R_EARTH_KM; // ≈ 10.97

// ---------------------------------------------------------------------------
// Aether unit definitions
// ---------------------------------------------------------------------------

/** 1 length unit expressed in AU. Unchanged from the legacy scene scale. */
export const GAME_DIST_TO_AU = 1 / 40;
export const LENGTH_UNIT_KM = AU_KM * GAME_DIST_TO_AU;   // 3.7399 × 10⁶ km
export const LENGTH_UNIT_M = LENGTH_UNIT_KM * 1000;
export const MASS_UNIT_KG = M_EARTH_KG;
export const TIME_UNIT_S = JULIAN_YEAR_S;

/**
 * Gravitational constant in Aether units, G* = G·M*·T*² / L*³ ≈ 7.5883.
 * Derived, never tuned — this is what makes displayed SI values truthful.
 */
export const G_AETHER =
  (G_SI * MASS_UNIT_KG * TIME_UNIT_S * TIME_UNIT_S) /
  (LENGTH_UNIT_M * LENGTH_UNIT_M * LENGTH_UNIT_M);

/** Speed of light in Aether units, ≈ 2.5298 × 10⁶ L*·T*⁻¹. */
export const C_AETHER = (C_KM_S * TIME_UNIT_S) / LENGTH_UNIT_KM;

/** 1 L*·T*⁻¹ expressed in km/s (≈ 0.1185). */
export const VELOCITY_UNIT_KM_S = LENGTH_UNIT_KM / TIME_UNIT_S;

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

export const massToEarth = (m: number) => m;                        // mass unit IS M⊕
export const massToJupiter = (m: number) => m / M_JUPITER_IN_EARTH;
export const massToSolar = (m: number) => m / M_SUN_IN_EARTH;
export const massToKg = (m: number) => m * M_EARTH_KG;
export const solarMassToUnits = (mSun: number) => mSun * M_SUN_IN_EARTH;
export const jupiterMassToUnits = (mJup: number) => mJup * M_JUPITER_IN_EARTH;

export const distToAU = (d: number) => d * GAME_DIST_TO_AU;
export const distToKm = (d: number) => d * LENGTH_UNIT_KM;
export const auToDist = (au: number) => au / GAME_DIST_TO_AU;
export const kmToDist = (km: number) => km / LENGTH_UNIT_KM;

export const radiusKmToEarth = (km: number) => km / R_EARTH_KM;
export const radiusKmToSolar = (km: number) => km / R_SUN_KM;
export const radiusKmToJupiter = (km: number) => km / R_JUPITER_KM;

export const velocityToKmS = (v: number) => v * VELOCITY_UNIT_KM_S;
export const kmSToVelocity = (kms: number) => kms / VELOCITY_UNIT_KM_S;

// ---------------------------------------------------------------------------
// Visual radius mapping (rendering only — never feed back into physics)
// ---------------------------------------------------------------------------

/** Earth draws at 2.5 L*, the anchor inherited from the legacy scale. */
const EARTH_VISUAL_RADIUS = 2.5;

/**
 * Compression exponent for solid bodies: drawn radius ∝ (true radius)^0.5.
 *
 * A purely linear map cannot work. Stars must be drawn small enough to fit
 * inside their innermost orbit (the Sun at 12 L* against Mercury's 15.5), which
 * forces stars to be ~23× more compressed than planets — and that in turn would
 * draw Jupiter at 27 L*, more than twice the size of the Sun it orbits. Square
 * roots restore the ordering: Earth 2.5, Neptune 4.9, Jupiter 8.3, Sun 12.
 *
 * The cost is that relative sizes between solid bodies are compressed too
 * (Jupiter reads as 3.3× Earth rather than 11×). That is the same class of
 * deliberate concession as the star compression, and the Inspector always
 * reports the true radius in km.
 */
const SOLID_RADIUS_EXPONENT = 0.5;

/** A 1 R☉ star draws at 12 L* — stars are compressed ~23× relative to planets. */
const STAR_VISUAL_AT_ONE_SOLAR_RADIUS = 12;

/** A 12 km neutron star draws at 0.18 L* (further magnified by the renderer). */
const NEUTRON_VISUAL_AT_12KM = 0.18;

/**
 * Drawn radius in L* from a body's true radius in km.
 *
 * Three regimes, each calibrated to reproduce the pre-existing visual scale so
 * that adopting real units does not move anything on screen:
 *  - solid bodies scale linearly,
 *  - stars scale linearly against R☉ but ~23× more compressed,
 *  - black holes scale logarithmically (a stellar-mass horizon is ~30 km, a
 *    supermassive one ~10⁷ km; no linear map can show both).
 */
export const visualRadiusFromKm = (type: BodyType, radiusKm: number): number => {
  const km = Number.isFinite(radiusKm) && radiusKm > 0 ? radiusKm : 1;
  switch (type) {
    case 'Star':
    case 'Red Giant':
    case 'Brown Dwarf':
      return clampRange((km / R_SUN_KM) * STAR_VISUAL_AT_ONE_SOLAR_RADIUS, 1.0, 180);
    case 'Neutron Star':
    case 'Pulsar':
      return clampRange((km / 12) * NEUTRON_VISUAL_AT_12KM, 0.1, 0.5);
    case 'Black Hole':
      // 2.0 + 1.6·ln(r/3 km): ~5.7 for a 10 M☉ horizon, ~26 for Sgr A*.
      return clampRange(2.0 + 1.6 * Math.log(Math.max(km, 3) / 3), 1.5, 80);
    default:
      return clampRange(
        EARTH_VISUAL_RADIUS * Math.pow(km / R_EARTH_KM, SOLID_RADIUS_EXPONENT),
        0.05,
        60,
      );
  }
};

const clampRange = (v: number, lo: number, hi: number) =>
  !Number.isFinite(v) ? lo : Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------------
// Derived physical quantities (all inputs in real units)
// ---------------------------------------------------------------------------

/** Bulk density (g/cm³) from mass (M⊕) and radius (km). */
export const bulkDensityGcm3 = (massEarth: number, radiusKm: number): number => {
  const rM = radiusKm * 1000;
  if (!(rM > 0) || !Number.isFinite(massEarth)) return NaN;
  const volumeM3 = (4 / 3) * Math.PI * rM * rM * rM;
  return (massToKg(massEarth) / volumeM3) / 1000;   // kg/m³ → g/cm³
};

/** Radius (km) that gives `density` (g/cm³) for `massEarth`. */
export const radiusKmFromDensity = (massEarth: number, densityGcm3: number): number => {
  const rho = Math.max(densityGcm3, 1e-6) * 1000;   // → kg/m³
  const volumeM3 = massToKg(massEarth) / rho;
  return Math.cbrt((3 * volumeM3) / (4 * Math.PI)) / 1000;
};

/** Surface gravity (m/s²) from mass (M⊕) and radius (km). */
export const surfaceGravitySi = (massEarth: number, radiusKm: number): number => {
  const rM = radiusKm * 1000;
  if (!(rM > 0) || !Number.isFinite(massEarth)) return NaN;
  return (G_SI * massToKg(massEarth)) / (rM * rM);
};

/** Escape velocity (km/s) from mass (M⊕) and radius (km). */
export const escapeVelocityKms = (massEarth: number, radiusKm: number): number => {
  const rM = radiusKm * 1000;
  if (!(rM > 0) || !Number.isFinite(massEarth)) return NaN;
  return Math.sqrt((2 * G_SI * massToKg(massEarth)) / rM) / 1000;
};

/**
 * Main-sequence mass-luminosity relation, L/L☉ from mass in M⊕.
 *
 * The standard four-segment empirical broken power law (see e.g. Duric,
 * *Advanced Astrophysics*, 2004, §1.8). Segments are continuous to within a few
 * percent at each break:
 *   L = 0.23 M^2.3   (M < 0.43 M☉)
 *   L = M^4          (0.43 – 2 M☉)
 *   L = 1.4 M^3.5    (2 – 55 M☉)
 *   L = 32000 M      (M > 55 M☉)
 *
 * Sanity: Proxima Centauri (0.122 M☉) → 0.0018 L☉ against a measured 0.0017.
 */
export const luminositySolarFromMass = (massEarth: number): number => {
  const m = massToSolar(massEarth);
  if (!(m > 0)) return 0;
  if (m < 0.43) return 0.23 * Math.pow(m, 2.3);
  if (m < 2) return Math.pow(m, 4);
  if (m < 55) return 1.4 * Math.pow(m, 3.5);
  return 32000 * m;
};

/**
 * Main-sequence mass-radius relation, R/R☉ from mass in M⊕.
 * R ∝ M^0.8 below 1 M☉ and R ∝ M^0.57 above — the standard ZAMS fits.
 */
export const stellarRadiusSolarFromMass = (massEarth: number): number => {
  const m = massToSolar(massEarth);
  if (!(m > 0)) return 0.1;
  return m < 1 ? Math.pow(m, 0.8) : Math.pow(m, 0.57);
};

/**
 * Effective temperature (K) from luminosity and radius, by inverting the
 * Stefan-Boltzmann law L = 4πR²σT⁴ in solar-relative form.
 */
export const effectiveTemperatureK = (lumSolar: number, radiusSolar: number): number => {
  if (!(lumSolar > 0) || !(radiusSolar > 0)) return 0;
  return T_SUN_EFF_K * Math.pow(lumSolar / (radiusSolar * radiusSolar), 0.25);
};

/** Luminosity (L☉) from radius (km) and effective temperature (K). */
export const luminositySolarFromRadiusTemp = (radiusKm: number, tEffK: number): number => {
  const r = radiusKm / R_SUN_KM;
  const t = tEffK / T_SUN_EFF_K;
  if (!(r > 0) || !(t > 0)) return 0;
  return r * r * t * t * t * t;
};

/**
 * Equilibrium temperature of Earth at 1 AU under 1 L☉ with zero albedo,
 * T = (L☉ / (16πσ·d²))^¼ ≈ 278.3 K. Derived, not hardcoded.
 */
export const T_EARTH_EQ_K = Math.pow(
  L_SUN_W / (16 * Math.PI * STEFAN_BOLTZMANN * Math.pow(AU_KM * 1000, 2)),
  0.25,
);

/**
 * Greenhouse warming factor from a 0-1 atmospheric density parameter.
 *
 * An empirical fit, not a derivation: the only two well-characterised anchors
 * available are Earth (T_eq 254 K → T_surf 288 K, factor 1.13, thin atmosphere
 * ≈ 0.3) and Venus (232 K → 737 K, factor 3.18, thick atmosphere ≈ 1.0).
 * exp(1.157·x^1.87) passes through both and stays bounded, so a user cranking
 * the slider gets Venus rather than a runaway.
 */
export const greenhouseFactor = (atmosphereDensity: number): number => {
  const x = Math.max(0, Math.min(1, atmosphereDensity));
  return Math.exp(1.157 * Math.pow(x, 1.87));
};

/**
 * Equilibrium (and, with an atmosphere, surface) temperature of a body.
 *
 * T_eq = T⊕ · L^¼ · (1−α)^¼ / √d_AU, which is the Stefan-Boltzmann balance
 * L(1−α)/(16πσd²) written relative to Earth.
 */
export const equilibriumTemperatureK = (
  starMassEarth: number,
  distanceUnits: number,
  albedo = 0.3,
  greenhouseDensity = 0,
): number => {
  const distAU = Math.max(1e-4, distToAU(distanceUnits));
  const L = luminositySolarFromMass(starMassEarth);
  return equilibriumTemperatureFromLuminosity(L, distAU, albedo, greenhouseDensity);
};

/** As above, but taking luminosity (L☉) and distance (AU) directly. */
export const equilibriumTemperatureFromLuminosity = (
  lumSolar: number,
  distAU: number,
  albedo = 0.3,
  greenhouseDensity = 0,
): number => {
  if (!(lumSolar > 0) || !(distAU > 0)) return 2.7;   // CMB floor
  const teq =
    (T_EARTH_EQ_K * Math.pow(lumSolar, 0.25) * Math.pow(Math.max(0, 1 - albedo), 0.25)) /
    Math.sqrt(distAU);
  return teq * greenhouseFactor(greenhouseDensity);
};

/**
 * Bond albedo from composition fractions. Anchored on Solar System values:
 * iron/basaltic surfaces ≈ 0.10, silicate rock ≈ 0.20, ice/water ≈ 0.55.
 */
export const albedoFromComposition = (fIron: number, fSil: number, fWater: number): number => {
  const sum = Math.max(0.001, fIron + fSil + fWater);
  return (0.10 * fIron + 0.20 * fSil + 0.55 * fWater) / sum;
};

/**
 * Orbital period in years for a circular/elliptical orbit of semi-major axis
 * `a` (L*) around total mass `mTotal` (M⊕). P = 2π√(a³/G*M).
 */
export const orbitalPeriodYears = (aUnits: number, mTotalEarth: number): number => {
  if (!(aUnits > 0) || !(mTotalEarth > 0)) return Infinity;
  return 2 * Math.PI * Math.sqrt((aUnits * aUnits * aUnits) / (G_AETHER * mTotalEarth));
};

/** Circular orbital speed (L*·T*⁻¹) at radius r around mass m. */
export const circularOrbitalSpeed = (rUnits: number, mEarth: number): number =>
  rUnits > 0 && mEarth > 0 ? Math.sqrt((G_AETHER * mEarth) / rUnits) : 0;

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export const fmtMass = (m: number): string => {
  if (!Number.isFinite(m)) return '— M⊕';
  const mSun = massToSolar(m);
  if (mSun >= 0.02) return `${mSun.toFixed(2)} M☉`;
  const mJup = massToJupiter(m);
  if (mJup >= 0.1) return `${mJup.toFixed(2)} M♃`;
  if (m >= 1) return `${m.toFixed(2)} M⊕`;
  if (m >= 0.001) return `${m.toFixed(3)} M⊕`;
  return `${(m * 1000).toFixed(2)} mM⊕`;
};

export const fmtRadiusKm = (km: number): string => {
  if (!Number.isFinite(km)) return '— km';
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M km`;
  if (km >= 1e4) return `${(km / 1e3).toFixed(0)}k km`;
  if (km >= 1e3) return `${(km / 1e3).toFixed(1)}k km`;
  return `${km.toFixed(km < 100 ? 1 : 0)} km`;
};

/** Radius in the most legible reference unit for its size. */
export const fmtRadiusRelative = (km: number): string => {
  if (!Number.isFinite(km)) return '—';
  if (km >= 0.2 * R_SUN_KM) return `${radiusKmToSolar(km).toFixed(2)} R☉`;
  if (km >= 0.3 * R_JUPITER_KM) return `${radiusKmToJupiter(km).toFixed(2)} R♃`;
  return `${radiusKmToEarth(km).toFixed(2)} R⊕`;
};

export const fmtTemp = (k: number): string => {
  if (!Number.isFinite(k)) return '— K';
  if (k >= 10000) return `${(k / 1000).toFixed(1)}k K`;
  return `${Math.round(k)} K`;
};

export const fmtGravity = (gMs2: number): string =>
  Number.isFinite(gMs2) ? `${gMs2.toFixed(2)} m/s²` : '— m/s²';

export const fmtEscVel = (vKms: number): string =>
  Number.isFinite(vKms) ? `${vKms.toFixed(2)} km/s` : '— km/s';

export const fmtDensity = (gPerCm3: number): string =>
  Number.isFinite(gPerCm3) ? `${gPerCm3.toFixed(2)} g/cm³` : '— g/cm³';

export const fmtDistance = (dUnits: number): string => {
  if (!Number.isFinite(dUnits)) return '—';
  const au = distToAU(dUnits);
  if (au >= 0.01) return `${au.toFixed(2)} AU`;
  const km = distToKm(dUnits);
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)}M km`;
  return `${(km / 1e3).toFixed(0)}k km`;
};

export const fmtLuminositySolar = (L: number): string => {
  if (!Number.isFinite(L)) return '— L☉';
  if (L >= 0.01) return `${L.toFixed(2)} L☉`;
  if (L >= 1e-5) return `${(L * 1000).toFixed(2)} mL☉`;
  return `${L.toExponential(1)} L☉`;
};

/** Luminosity of a star given its mass in simulation units. */
export const fmtLuminosity = (massEarth: number): string =>
  fmtLuminositySolar(luminositySolarFromMass(massEarth));

export const fmtPeriod = (years: number): string => {
  if (!Number.isFinite(years) || years <= 0) return '—';
  if (years >= 1) return `${years.toFixed(2)} yr`;
  const days = years * 365.25;
  if (days >= 1) return `${days.toFixed(1)} d`;
  return `${(days * 24).toFixed(1)} h`;
};
