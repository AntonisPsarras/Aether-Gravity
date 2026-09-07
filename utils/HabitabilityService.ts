/**
 * Habitable zone boundaries after Kopparapu et al. (2013), ApJ 765, 131,
 * using the corrected Table 3 coefficients from the erratum (2013, ApJ 770, 82).
 *
 * The effective stellar flux at each boundary is a quartic in the star's
 * effective temperature relative to the Sun:
 *
 *   S_eff = S_eff☉ + a·T* + b·T*² + c·T*³ + d·T*⁴,   T* = T_eff − 5780 K
 *
 * and the boundary distance follows from the inverse-square law,
 * d = √(L/L☉ / S_eff) in AU.
 *
 * Four boundaries are provided, giving a conservative and an optimistic zone:
 *   conservative  moist greenhouse  →  maximum greenhouse   (0.99–1.69 AU for the Sun)
 *   optimistic    recent Venus      →  early Mars           (0.75–1.77 AU for the Sun)
 *
 * The polynomial fit is only valid for 2600 K ≤ T_eff ≤ 7200 K, so the
 * temperature is clamped to that range before evaluation.
 */

import { CelestialBody } from '../types';
import { auToDist, distToAU } from './units';
import { bodyLuminositySolar } from './physicsUtils';

interface Coefficients {
    S_effSun: number;
    a: number;
    b: number;
    c: number;
    d: number;
}

/** Optimistic inner edge: Venus had liquid water until ~1 Gyr ago. */
const RECENT_VENUS: Coefficients = {
    S_effSun: 1.7763, a: 1.4335e-4, b: 3.3954e-9, c: -7.6364e-12, d: -1.1950e-15,
};

/** Conservative inner edge: water is lost to photolysis and hydrogen escape. */
const MOIST_GREENHOUSE: Coefficients = {
    S_effSun: 1.0146, a: 8.1884e-5, b: 1.9394e-9, c: -4.3618e-12, d: -6.8260e-16,
};

/** Conservative outer edge: maximum CO₂ greenhouse before condensation wins. */
const MAXIMUM_GREENHOUSE: Coefficients = {
    S_effSun: 0.3507, a: 5.9578e-5, b: 1.6707e-9, c: -3.0058e-12, d: -5.1925e-16,
};

/** Optimistic outer edge: Mars appears to have had surface water ~3.8 Gyr ago. */
const EARLY_MARS: Coefficients = {
    S_effSun: 0.3207, a: 5.4471e-5, b: 1.5275e-9, c: -2.1709e-12, d: -3.8282e-16,
};

/** Validity range of the Kopparapu polynomial fit. */
const T_MIN = 2600;
const T_MAX = 7200;

const calculateSeff = (tEff: number, coeffs: Coefficients): number => {
    const clamped = Math.max(T_MIN, Math.min(T_MAX, tEff));
    const t = clamped - 5780;
    const t2 = t * t;
    return (
        coeffs.S_effSun +
        coeffs.a * t +
        coeffs.b * t2 +
        coeffs.c * t2 * t +
        coeffs.d * t2 * t2
    );
};

export interface HabitableZoneAU {
    /** Optimistic inner edge (recent Venus), AU. */
    optimisticInner: number;
    /** Conservative inner edge (moist greenhouse), AU. */
    inner: number;
    /** Conservative outer edge (maximum greenhouse), AU. */
    outer: number;
    /** Optimistic outer edge (early Mars), AU. */
    optimisticOuter: number;
}

/**
 * Habitable zone boundaries in AU for a star of the given luminosity (L☉) and
 * effective temperature (K).
 */
export const calculateHabitableZone = (
    luminositySolar: number,
    temperatureK: number,
): HabitableZoneAU => {
    const L = Math.max(0, luminositySolar);
    const d = (coeffs: Coefficients) => {
        const seff = calculateSeff(temperatureK, coeffs);
        return seff > 0 ? Math.sqrt(L / seff) : 0;
    };
    return {
        optimisticInner: d(RECENT_VENUS),
        inner: d(MOIST_GREENHOUSE),
        outer: d(MAXIMUM_GREENHOUSE),
        optimisticOuter: d(EARLY_MARS),
    };
};

/** Habitable zone of a body, using its real luminosity rather than a mass proxy. */
export const habitableZoneForStar = (star: CelestialBody): HabitableZoneAU =>
    calculateHabitableZone(bodyLuminositySolar(star), star.temperature);

export const checkHabitability = (planet: CelestialBody, star: CelestialBody): boolean => {
    if (!star || !planet) return false;
    const hz = habitableZoneForStar(star);
    const distAU = distToAU(planet.position.distanceTo(star.position));
    return distAU >= hz.inner && distAU <= hz.outer;
};

/** As `checkHabitability`, but against the optimistic (Venus-Mars) boundaries. */
export const checkOptimisticHabitability = (planet: CelestialBody, star: CelestialBody): boolean => {
    if (!star || !planet) return false;
    const hz = habitableZoneForStar(star);
    const distAU = distToAU(planet.position.distanceTo(star.position));
    return distAU >= hz.optimisticInner && distAU <= hz.optimisticOuter;
};

/** Habitable zone radii converted to simulation length units for rendering. */
export const getHabitableZoneInGameUnits = (star: CelestialBody) => {
    const hz = habitableZoneForStar(star);
    return {
        optimisticInner: auToDist(hz.optimisticInner),
        inner: auToDist(hz.inner),
        outer: auToDist(hz.outer),
        optimisticOuter: auToDist(hz.optimisticOuter),
    };
};
