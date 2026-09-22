/**
 * General-relativistic geometry for compact objects.
 *
 * Every function here is a pure scalar computation on real constants, with no
 * allocation, so it is safe to call from an inspector edit or a shader-uniform
 * update. Masses are in simulation units (M⊕); lengths are returned in km.
 *
 * The dimensionless spin `aStar = cJ/GM²` runs 0 (Schwarzschild) to 1 (extremal
 * Kerr). Astrophysical accretion caps it near 0.998 — the Thorne limit — because
 * photons captured from the disk carry away angular momentum.
 *
 * References: Bardeen, Press & Teukolsky (1972), ApJ 178, 347 for the ISCO and
 * photon-orbit expressions; Novikov & Thorne (1973) for the disk efficiency.
 */

import { C_KM_S, G_SI, massToKg } from './units';

/**
 * Thorne's equilibrium spin limit for accretion-spun black holes. Enforced on
 * user input by `physicsBounds.sanitizeProperties`, NOT here — the functions in
 * this module are pure geometry and remain valid up to the extremal a* = 1, so
 * they can be checked against the textbook extremal limits.
 */
export const MAX_SPIN_PARAMETER = 0.998;

const C_M_S = C_KM_S * 1000;

const clampSpin = (a: number): number =>
  !Number.isFinite(a) ? 0 : Math.max(0, Math.min(1, a));

/**
 * Gravitational radius r_g = GM/c², in km. Half the Schwarzschild radius, and
 * the natural length unit for every other quantity in this module.
 */
export const gravitationalRadiusKm = (massEarth: number): number => {
  if (!(massEarth > 0)) return 0;
  return (G_SI * massToKg(massEarth)) / (C_M_S * C_M_S) / 1000;
};

/** Schwarzschild radius R_s = 2GM/c², in km. 2.95 km for 1 M☉. */
export const schwarzschildRadiusKm = (massEarth: number): number =>
  2 * gravitationalRadiusKm(massEarth);

/**
 * Kerr outer (event) horizon, r₊ = r_g(1 + √(1 − a*²)).
 * Equals R_s at a* = 0 and shrinks to r_g at extremal spin.
 */
export const kerrOuterHorizonKm = (massEarth: number, aStar: number): number => {
  const a = clampSpin(aStar);
  return gravitationalRadiusKm(massEarth) * (1 + Math.sqrt(1 - a * a));
};

/** Kerr inner (Cauchy) horizon, r₋ = r_g(1 − √(1 − a*²)). */
export const kerrInnerHorizonKm = (massEarth: number, aStar: number): number => {
  const a = clampSpin(aStar);
  return gravitationalRadiusKm(massEarth) * (1 - Math.sqrt(1 - a * a));
};

/**
 * Static limit (outer boundary of the ergosphere) at polar angle θ:
 *   r_E(θ) = r_g(1 + √(1 − a*²cos²θ))
 * It touches the horizon at the poles and bulges to R_s at the equator — the
 * ergosphere is oblate, not the sphere the renderer previously drew.
 */
export const ergosphereRadiusKm = (
  massEarth: number,
  aStar: number,
  thetaRad: number,
): number => {
  const a = clampSpin(aStar);
  const c = Math.cos(thetaRad);
  return gravitationalRadiusKm(massEarth) * (1 + Math.sqrt(Math.max(0, 1 - a * a * c * c)));
};

/**
 * ISCO radius in units of r_g (Bardeen, Press & Teukolsky 1972, eq. 2.21):
 *   Z₁ = 1 + (1−a²)^⅓[(1+a)^⅓ + (1−a)^⅓]
 *   Z₂ = √(3a² + Z₁²)
 *   r  = 3 + Z₂ ∓ √((3−Z₁)(3+Z₁+2Z₂))
 * with the minus sign for prograde orbits.
 *
 * Limits: 6 r_g at a*=0; 1 r_g prograde and 9 r_g retrograde at a*=1.
 */
export const iscoRadiusRg = (aStar: number, prograde = true): number => {
  const a = clampSpin(aStar);
  const oneMinusA2 = 1 - a * a;
  const z1 =
    1 + Math.cbrt(oneMinusA2) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  const disc = Math.sqrt(Math.max(0, (3 - z1) * (3 + z1 + 2 * z2)));
  return 3 + z2 + (prograde ? -disc : disc);
};

/** ISCO radius in km. */
export const iscoRadiusKm = (massEarth: number, aStar: number, prograde = true): number =>
  gravitationalRadiusKm(massEarth) * iscoRadiusRg(aStar, prograde);

/**
 * Equatorial circular photon orbit in units of r_g:
 *   r_ph = 2 r_g{1 + cos[⅔ arccos(∓a*)]}
 * 3 r_g for Schwarzschild; 1 r_g prograde / 4 r_g retrograde at extremal spin.
 */
export const photonSphereRadiusRg = (aStar: number, prograde = true): number => {
  const a = clampSpin(aStar);
  return 2 * (1 + Math.cos((2 / 3) * Math.acos(prograde ? -a : a)));
};

export const photonSphereRadiusKm = (
  massEarth: number,
  aStar: number,
  prograde = true,
): number => gravitationalRadiusKm(massEarth) * photonSphereRadiusRg(aStar, prograde);

/**
 * Specific energy of a circular orbit at radius r (in r_g), Kerr equatorial:
 *   Ẽ = (r² − 2r + a√r) / (r√(r² − 3r + 2a√r))
 */
const specificEnergyAtRg = (rRg: number, aStar: number): number => {
  const a = clampSpin(aStar);
  const r = rRg;
  const sqrtR = Math.sqrt(r);
  const num = r * r - 2 * r + a * sqrtR;
  const den = r * Math.sqrt(Math.max(1e-12, r * r - 3 * r + 2 * a * sqrtR));
  return num / den;
};

/**
 * Radiative efficiency of a thin accretion disk, η = 1 − Ẽ(r_ISCO): the
 * fraction of accreted rest-mass energy radiated away.
 * 5.7% for a Schwarzschild hole, ~32% at the Thorne limit, 42.3% at a* = 1.
 */
export const diskEfficiency = (aStar: number): number => {
  const a = clampSpin(aStar);
  const r = iscoRadiusRg(a, true);
  // The a → 1 limit is 1 − 1/√3; guard the 0/0 form near extremal spin.
  if (r <= 1 + 1e-6) return 1 - 1 / Math.sqrt(3);
  const e = specificEnergyAtRg(r, a);
  return Number.isFinite(e) ? Math.max(0, Math.min(1, 1 - e)) : 1 - 1 / Math.sqrt(3);
};

/**
 * Gravitational redshift factor √(1 − R_s/r) for a static observer at radius r
 * (km) outside a Schwarzschild hole. Returns 0 at or inside the horizon.
 */
export const gravitationalRedshiftFactor = (massEarth: number, rKm: number): number => {
  const rs = schwarzschildRadiusKm(massEarth);
  if (!(rKm > rs)) return 0;
  return Math.sqrt(1 - rs / rKm);
};

/**
 * Peak effective temperature of a Shakura-Sunyaev thin disk, in K.
 *
 * T_max ∝ (η Ṁ c² / (σ r_in²))^¼. Rather than carry an absolute Ṁ we normalise
 * to a fiducial 10 M☉, Schwarzschild, Eddington-rate disk at ~10⁷ K, which is
 * the standard order of magnitude for a stellar-mass X-ray binary, and let mass
 * and spin scale it. This is a scaling law for the renderer's colour, not a
 * radiative-transfer result.
 */
export const diskPeakTemperatureK = (
  massEarth: number,
  aStar: number,
  eddingtonFraction = 1,
): number => {
  const rg = gravitationalRadiusKm(massEarth);
  if (!(rg > 0)) return 0;
  const rIn = rg * iscoRadiusRg(aStar, true);
  const etaRatio = diskEfficiency(aStar) / diskEfficiency(0);
  // Reference: 10 M☉ Schwarzschild hole at the Eddington rate.
  const REF_T = 1.0e7;
  const REF_RG = gravitationalRadiusKm(10 * 332946);
  const REF_RIN = REF_RG * 6;
  const scale =
    (etaRatio * Math.max(1e-4, eddingtonFraction) * (massEarth / (10 * 332946))) /
    Math.pow(rIn / REF_RIN, 2);
  return REF_T * Math.pow(Math.max(1e-8, scale), 0.25);
};
