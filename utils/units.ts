/**
 * Unit conversion + scientific formatting layer for Aether Gravity.
 *
 * The simulation runs in internally-consistent "game units". This module
 * calibrates those units to SI / astronomical units for display purposes,
 * using anchor points already encoded throughout the codebase:
 *   - Earth analog: mass = 10, radius = 2.5  (from calculateESI refs)
 *   - Sun  analog: mass = 1000               (from analyzePlanet luminosity)
 *   - 1 AU       : dist = 40                 (from analyzePlanet distAU)
 *
 * From those anchors:
 *   1 game-mass  ≈ 0.1  M⊕   (Earth masses)
 *   1 game-rad   ≈ 0.4  R⊕   ≈ 2549 km
 *   1 game-dist  ≈ 0.025 AU  ≈ 3.74 × 10⁶ km
 *
 * These factors are intentionally exported so any future migration to a
 * fully SI-based simulation only needs to flip them to 1.0.
 */

// ---- Calibration constants ----

export const GAME_MASS_TO_EARTH = 0.1;       // game mass × this = M⊕
export const GAME_RADIUS_TO_EARTH = 0.4;     // game radius × this = R⊕
export const GAME_DIST_TO_AU = 1 / 40;       // game dist × this = AU

// Astronomical reference values (SI)
export const M_EARTH_KG = 5.972e24;
export const R_EARTH_KM = 6371;
export const M_SUN_KG = 1.989e30;
export const M_SUN_IN_EARTH = M_SUN_KG / M_EARTH_KG; // ≈ 332946
export const M_JUPITER_IN_EARTH = 317.8;
export const L_SUN_W = 3.828e26;
export const AU_KM = 1.495978707e8;
export const STEFAN_BOLTZMANN = 5.670374419e-8;     // W·m⁻²·K⁻⁴
export const STAR_REFERENCE_MASS_GAME = 1000;       // 1 game star ≈ 1 solar-equivalent inside the sim

// Earth's equilibrium temperature with zero albedo at 1 AU under 1 L☉.
export const T_EARTH_EQ_K = 278.5;

// ---- Conversion helpers ----

export const massGameToEarth = (m: number) => m * GAME_MASS_TO_EARTH;
export const massGameToJupiter = (m: number) => (m * GAME_MASS_TO_EARTH) / M_JUPITER_IN_EARTH;
export const massGameToSolar = (m: number) => (m * GAME_MASS_TO_EARTH) / M_SUN_IN_EARTH;
export const radiusGameToKm = (r: number) => r * GAME_RADIUS_TO_EARTH * R_EARTH_KM;
export const radiusGameToEarth = (r: number) => r * GAME_RADIUS_TO_EARTH;
export const distGameToAU = (d: number) => d * GAME_DIST_TO_AU;
export const distGameToKm = (d: number) => d * GAME_DIST_TO_AU * AU_KM;

/** Newtonian gravitational constant (SI). */
export const G_SI = 6.67430e-11;

/** Surface gravity (m/s²) from calibrated game mass + radius. */
export const surfaceGravitySiFromGame = (massGame: number, radiusGame: number): number => {
  const mKg = massGameToEarth(massGame) * M_EARTH_KG;
  const rM = radiusGameToKm(radiusGame) * 1000;
  if (!isFinite(mKg) || !isFinite(rM) || rM <= 0) return NaN;
  return (G_SI * mKg) / (rM * rM);
};

/** Escape velocity (km/s) from calibrated game mass + radius. */
export const escapeVelocityKmsFromGame = (massGame: number, radiusGame: number): number => {
  const mKg = massGameToEarth(massGame) * M_EARTH_KG;
  const rM = radiusGameToKm(radiusGame) * 1000;
  if (!isFinite(mKg) || !isFinite(rM) || rM <= 0) return NaN;
  return Math.sqrt((2 * G_SI * mKg) / rM) / 1000;
};

/**
 * Stellar luminosity in solar units from game-mass.
 * Uses the broken-powerlaw mass-luminosity relation:
 *   L/L☉ = (M/M☉)^4   for M < 0.43 M☉
 *   L/L☉ = (M/M☉)^3.5 for 0.43 < M < 2 M☉
 *   L/L☉ = 1.4·(M/M☉)^3.5 for M > 2 M☉
 *
 * In game units we anchor M_sun ≡ STAR_REFERENCE_MASS_GAME, so the input
 * is the game mass directly. Output is L / L☉.
 */
export const luminositySolarFromGameMass = (mGame: number): number => {
  const x = mGame / STAR_REFERENCE_MASS_GAME;
  if (x <= 0) return 0;
  if (x < 0.43) return Math.pow(x, 4);
  if (x < 2) return Math.pow(x, 3.5);
  return 1.4 * Math.pow(x, 3.5);
};

/**
 * Stefan-Boltzmann equilibrium temperature for an airless body.
 *   T_eq = T_earth · L_rel^¼ · (1-α)^¼ / sqrt(d_AU)
 * with d_AU and L_rel in solar/AU.
 *
 * @param starMassGame    star mass in game units
 * @param distanceGame    star-planet distance in game units
 * @param albedo          Bond albedo (0..1)
 * @param greenhouseDensity 0..1 atmospheric density; small additive warming
 */
export const equilibriumTemperatureK = (
  starMassGame: number,
  distanceGame: number,
  albedo = 0.3,
  greenhouseDensity = 0
): number => {
  const distAU = Math.max(0.05, distGameToAU(distanceGame));
  const L = luminositySolarFromGameMass(starMassGame);
  if (L <= 0) return 2.7; // CMB floor
  const teq = T_EARTH_EQ_K * Math.pow(L, 0.25) * Math.pow(Math.max(0, 1 - albedo), 0.25) / Math.sqrt(distAU);
  // Simple greenhouse bump: doubles for thick atmospheres, capped to prevent runaway
  const greenhouse = 1 + 0.45 * Math.max(0, Math.min(1, greenhouseDensity));
  return teq * greenhouse;
};

/**
 * Albedo from composition fractions. Water-rich → bright, iron → dark.
 */
export const albedoFromComposition = (fIron: number, fSil: number, fWater: number): number => {
  const sum = Math.max(0.001, fIron + fSil + fWater);
  return (0.10 * fIron + 0.20 * fSil + 0.55 * fWater) / sum;
};

// ---- Formatters (return human-readable strings with units) ----

export const fmtMass = (mGame: number): string => {
  const m = massGameToEarth(mGame);
  if (m >= 1000) {
    const mSun = massGameToSolar(mGame);
    if (mSun >= 0.05) return `${mSun.toFixed(2)} M☉`;
    return `${massGameToJupiter(mGame).toFixed(2)} M♃`;
  }
  if (m >= 1) return `${m.toFixed(2)} M⊕`;
  if (m >= 0.001) return `${m.toFixed(3)} M⊕`;
  return `${(m * 1000).toFixed(2)} mM⊕`;
};

export const fmtRadius = (rGame: number): string => {
  const km = radiusGameToKm(rGame);
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)} M km`;
  if (km >= 1e3) return `${(km / 1e3).toFixed(1)}k km`;
  return `${km.toFixed(0)} km`;
};

export const fmtRadiusEarth = (rGame: number): string => {
  const r = radiusGameToEarth(rGame);
  return `${r.toFixed(2)} R⊕`;
};

export const fmtTemp = (k: number): string => {
  if (!isFinite(k)) return '— K';
  if (k >= 10000) return `${(k / 1000).toFixed(1)}k K`;
  return `${Math.round(k)} K`;
};

export const fmtGravity = (gMs2: number): string =>
  isFinite(gMs2) ? `${gMs2.toFixed(2)} m/s²` : '— m/s²';

export const fmtEscVel = (vKms: number): string =>
  isFinite(vKms) ? `${vKms.toFixed(2)} km/s` : '— km/s';

export const fmtDensity = (gPerCm3: number): string =>
  isFinite(gPerCm3) ? `${gPerCm3.toFixed(2)} g/cm³` : '— g/cm³';

export const fmtDistance = (dGame: number): string => {
  const au = distGameToAU(dGame);
  if (au >= 1) return `${au.toFixed(2)} AU`;
  const km = distGameToKm(dGame);
  if (km >= 1e6) return `${(km / 1e6).toFixed(2)} M km`;
  return `${(km / 1e3).toFixed(0)}k km`;
};

export const fmtLuminosity = (mStarGame: number): string => {
  const L = luminositySolarFromGameMass(mStarGame);
  if (L >= 0.01) return `${L.toFixed(2)} L☉`;
  if (L >= 1e-5) return `${(L * 1000).toFixed(2)} mL☉`;
  return `${L.toExponential(1)} L☉`;
};
