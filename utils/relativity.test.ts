import { describe, it, expect } from 'vitest';
import {
  MAX_SPIN_PARAMETER,
  diskEfficiency,
  ergosphereRadiusKm,
  gravitationalRadiusKm,
  gravitationalRedshiftFactor,
  iscoRadiusRg,
  kerrInnerHorizonKm,
  kerrOuterHorizonKm,
  photonSphereRadiusRg,
  schwarzschildRadiusKm,
} from './relativity';
import { M_SUN_IN_EARTH } from './units';

const SOLAR = M_SUN_IN_EARTH;

describe('Schwarzschild geometry', () => {
  it('gives the textbook 2.95 km horizon for one solar mass', () => {
    expect(schwarzschildRadiusKm(SOLAR)).toBeCloseTo(2.953, 2);
  });

  it('scales linearly with mass, not as the cube root', () => {
    const r1 = schwarzschildRadiusKm(SOLAR);
    const r10 = schwarzschildRadiusKm(10 * SOLAR);
    expect(r10 / r1).toBeCloseTo(10, 6);
  });

  it('gives ~1.27e7 km for Sagittarius A* (4.3e6 M_sun)', () => {
    const rs = schwarzschildRadiusKm(4.3e6 * SOLAR);
    expect(rs).toBeGreaterThan(1.2e7);
    expect(rs).toBeLessThan(1.32e7);
  });

  it('has r_g exactly half of R_s', () => {
    expect(gravitationalRadiusKm(SOLAR) * 2).toBeCloseTo(schwarzschildRadiusKm(SOLAR), 10);
  });

  it('returns 0 for non-positive mass', () => {
    expect(schwarzschildRadiusKm(0)).toBe(0);
    expect(schwarzschildRadiusKm(-1)).toBe(0);
  });
});

describe('Kerr horizons', () => {
  it('reduces to the Schwarzschild radius at zero spin', () => {
    expect(kerrOuterHorizonKm(SOLAR, 0)).toBeCloseTo(schwarzschildRadiusKm(SOLAR), 10);
    expect(kerrInnerHorizonKm(SOLAR, 0)).toBeCloseTo(0, 10);
  });

  it('shrinks the outer horizon towards r_g as spin increases', () => {
    const rg = gravitationalRadiusKm(SOLAR);
    expect(kerrOuterHorizonKm(SOLAR, 0.9)).toBeLessThan(schwarzschildRadiusKm(SOLAR));
    expect(kerrOuterHorizonKm(SOLAR, MAX_SPIN_PARAMETER) / rg).toBeCloseTo(1.0632, 3);
  });

  it('makes the horizons coincide at extremal spin', () => {
    const outer = kerrOuterHorizonKm(SOLAR, 1);
    const inner = kerrInnerHorizonKm(SOLAR, 1);
    expect(outer).toBeCloseTo(inner, 3);
  });

  it('clamps out-of-range spin to the extremal value', () => {
    expect(kerrOuterHorizonKm(SOLAR, 5)).toBeCloseTo(kerrOuterHorizonKm(SOLAR, 1), 10);
    expect(kerrOuterHorizonKm(SOLAR, -3)).toBeCloseTo(kerrOuterHorizonKm(SOLAR, 0), 10);
    expect(kerrOuterHorizonKm(SOLAR, NaN)).toBeCloseTo(kerrOuterHorizonKm(SOLAR, 0), 10);
  });
});

describe('ergosphere', () => {
  it('is oblate: equatorial extent is R_s at any spin, poles touch the horizon', () => {
    const equator = ergosphereRadiusKm(SOLAR, 0.9, Math.PI / 2);
    const pole = ergosphereRadiusKm(SOLAR, 0.9, 0);
    expect(equator).toBeCloseTo(schwarzschildRadiusKm(SOLAR), 8);
    expect(pole).toBeCloseTo(kerrOuterHorizonKm(SOLAR, 0.9), 8);
    expect(equator).toBeGreaterThan(pole);
  });

  it('collapses onto the horizon everywhere at zero spin', () => {
    for (const theta of [0, 0.4, Math.PI / 2]) {
      expect(ergosphereRadiusKm(SOLAR, 0, theta)).toBeCloseTo(
        schwarzschildRadiusKm(SOLAR),
        8,
      );
    }
  });
});

describe('ISCO (Bardeen-Press-Teukolsky)', () => {
  it('is 6 r_g for a non-rotating hole', () => {
    expect(iscoRadiusRg(0, true)).toBeCloseTo(6, 8);
    expect(iscoRadiusRg(0, false)).toBeCloseTo(6, 8);
  });

  it('is 1 r_g prograde and 9 r_g retrograde at extremal spin', () => {
    expect(iscoRadiusRg(1, true)).toBeCloseTo(1, 6);
    expect(iscoRadiusRg(1, false)).toBeCloseTo(9, 6);
  });

  it('decreases monotonically with prograde spin', () => {
    const spins = [0, 0.2, 0.5, 0.8, 0.95, 0.998];
    for (let i = 1; i < spins.length; i++) {
      expect(iscoRadiusRg(spins[i], true)).toBeLessThan(iscoRadiusRg(spins[i - 1], true));
    }
  });

  it('always sits outside the outer horizon', () => {
    for (const a of [0, 0.5, 0.9, 0.998]) {
      const isco = gravitationalRadiusKm(SOLAR) * iscoRadiusRg(a, true);
      expect(isco).toBeGreaterThan(kerrOuterHorizonKm(SOLAR, a));
    }
  });
});

describe('photon sphere', () => {
  it('is 3 r_g for Schwarzschild', () => {
    expect(photonSphereRadiusRg(0, true)).toBeCloseTo(3, 8);
  });

  it('is 1 r_g prograde and 4 r_g retrograde at extremal spin', () => {
    expect(photonSphereRadiusRg(1, true)).toBeCloseTo(1, 6);
    expect(photonSphereRadiusRg(1, false)).toBeCloseTo(4, 6);
  });

  it('lies between the horizon and the ISCO', () => {
    for (const a of [0, 0.5, 0.9]) {
      const ph = photonSphereRadiusRg(a, true);
      expect(ph).toBeGreaterThan(kerrOuterHorizonKm(SOLAR, a) / gravitationalRadiusKm(SOLAR));
      expect(ph).toBeLessThan(iscoRadiusRg(a, true));
    }
  });
});

describe('accretion disk efficiency', () => {
  it('is 5.7% for a Schwarzschild hole (1 - 2*sqrt(2)/3)', () => {
    expect(diskEfficiency(0)).toBeCloseTo(1 - (2 * Math.SQRT2) / 3, 6);
    expect(diskEfficiency(0)).toBeCloseTo(0.0572, 4);
  });

  it('reaches ~32% at the Thorne limit', () => {
    const eta = diskEfficiency(MAX_SPIN_PARAMETER);
    expect(eta).toBeGreaterThan(0.29);
    expect(eta).toBeLessThan(0.35);
  });

  it('never exceeds the extremal 42.3% bound', () => {
    expect(diskEfficiency(1)).toBeCloseTo(1 - 1 / Math.sqrt(3), 6);
    for (const a of [0, 0.3, 0.7, 0.9, 0.998, 1]) {
      expect(diskEfficiency(a)).toBeLessThanOrEqual(1 - 1 / Math.sqrt(3) + 1e-9);
    }
  });

  it('is far more efficient than hydrogen fusion (0.7%)', () => {
    expect(diskEfficiency(0)).toBeGreaterThan(0.007);
  });
});

describe('gravitational redshift', () => {
  it('vanishes at the horizon and tends to 1 far away', () => {
    const rs = schwarzschildRadiusKm(SOLAR);
    expect(gravitationalRedshiftFactor(SOLAR, rs)).toBe(0);
    expect(gravitationalRedshiftFactor(SOLAR, rs * 1e6)).toBeCloseTo(1, 5);
  });

  it('is sqrt(1/2) at twice the Schwarzschild radius', () => {
    const rs = schwarzschildRadiusKm(SOLAR);
    expect(gravitationalRedshiftFactor(SOLAR, 2 * rs)).toBeCloseTo(Math.SQRT1_2, 8);
  });
});
