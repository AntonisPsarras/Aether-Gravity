import { CelestialBody } from '../types';

// Kopparapu et al. (2013) Coefficients
// Coefficients for effective flux calculation
interface Coefficients {
    S_effSun: number;
    a: number;
    b: number;
    c: number;
    d: number;
}

// Inner Edge: Runaway Greenhouse
const INNER_COEFFS: Coefficients = {
    S_effSun: 1.107,
    a: 1.332e-4,
    b: 1.58e-8,
    c: -8.308e-12,
    d: -1.931e-15
};

// Outer Edge: Maximum Greenhouse
const OUTER_COEFFS: Coefficients = {
    S_effSun: 0.356,
    a: 6.171e-5,
    b: 1.698e-9,
    c: -3.198e-12,
    d: -5.575e-16
};

/**
 * Calculates the Effective Stellar Flux (Seff) limit for a given boundary.
 * Formula: Seff = SeffSun + aT* + bT*^2 + cT*^3 + dT*^4
 * where T* = Teff - 5780
 */
const calculateSeff = (tEff: number, coeffs: Coefficients): number => {
    const tStar = tEff - 5780;
    return coeffs.S_effSun +
        coeffs.a * tStar +
        coeffs.b * Math.pow(tStar, 2) +
        coeffs.c * Math.pow(tStar, 3) +
        coeffs.d * Math.pow(tStar, 4);
};

/**
 * Calculates the Habitable Zone boundaries in Astronomical Units (AU).
 * Formula: d = sqrt(L/Seff)
 * Returns { inner: number, outer: number } in AU.
 */
export const calculateHabitableZone = (luminosity: number, temperature: number) => {
    const seffInner = calculateSeff(temperature, INNER_COEFFS);
    const seffOuter = calculateSeff(temperature, OUTER_COEFFS);

    const innerAU = Math.sqrt(luminosity / seffInner);
    const outerAU = Math.sqrt(luminosity / seffOuter);

    return { inner: innerAU, outer: outerAU };
};

/**
 * Converting Game Units to AU and checking habitability.
 * We assume 1 AU approx 40 game units based on existing logic (SpaceCanvas.tsx line 500).
 */
const GAME_UNITS_PER_AU = 40.0;

export const checkHabitability = (planet: CelestialBody, star: CelestialBody): boolean => {
    if (!star || !planet) return false;

    // Approximate Luminosity if not present (Solar Units)
    // L ~ M^3 for main sequence
    const luminosity = Math.pow(star.mass / 1000.0, 3.0);

    const borders = calculateHabitableZone(luminosity, star.temperature);

    const dist = planet.position.distanceTo(star.position);
    const distAU = dist / GAME_UNITS_PER_AU;

    if (distAU >= borders.inner && distAU <= borders.outer) {
        return true;
    }

    return false;
};

export const getHabitableZoneInGameUnits = (star: CelestialBody) => {
    const luminosity = Math.pow(star.mass / 1000.0, 3.0);
    const borders = calculateHabitableZone(luminosity, star.temperature);
    return {
        inner: borders.inner * GAME_UNITS_PER_AU,
        outer: borders.outer * GAME_UNITS_PER_AU
    };
};
