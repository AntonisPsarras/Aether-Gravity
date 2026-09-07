import { describe, it, expect } from 'vitest';
import {
  brownDwarfRadiusKm,
  classifyBody,
  classifyByMass,
  deriveBodyState,
  giantRadiusKm,
  mainSequenceRadiusKm,
  mixtureDensity,
  neutronStarRadiusKm,
  terrestrialRadiusKm,
  whiteDwarfRadiusKm,
} from './bodyDerivation';
import {
  M_JUPITER_IN_EARTH,
  M_SUN_IN_EARTH,
  R_EARTH_KM,
  R_JUPITER_KM,
  R_SUN_KM,
  bulkDensityGcm3,
  escapeVelocityKms,
  luminositySolarFromMass,
  surfaceGravitySi,
} from './units';
import { EVOLUTION_THRESHOLDS } from '../constants';

const SOLAR = M_SUN_IN_EARTH;
/** Assert `actual` is within `pct` percent of `expected`. */
const within = (actual: number, expected: number, pct: number) => {
  expect(Math.abs(actual - expected) / Math.abs(expected)).toBeLessThan(pct / 100);
};

describe('terrestrial mass-radius relation', () => {
  it('reproduces Earth: 1 M_earth, 32.5% iron -> 6371 km, 5.51 g/cm3, 9.8 m/s2, 11.19 km/s', () => {
    const r = terrestrialRadiusKm(1, 0.325, 0.675, 0);
    within(r, R_EARTH_KM, 1);
    within(bulkDensityGcm3(1, r), 5.51, 2);
    within(surfaceGravitySi(1, r), 9.80, 2);
    within(escapeVelocityKms(1, r), 11.19, 2);
  });

  it('reproduces Mars (0.107 M_earth, 24% iron) within 5%', () => {
    within(terrestrialRadiusKm(0.107, 0.24, 0.76, 0), 3390, 5);
  });

  it('reproduces the Moon (0.0123 M_earth, 8% iron) within 4%', () => {
    within(terrestrialRadiusKm(0.0123, 0.08, 0.92, 0), 1737, 4);
  });

  it('reproduces Ceres (1.57e-4 M_earth, ice-rich) within 20%', () => {
    within(terrestrialRadiusKm(1.57e-4, 0.0, 0.45, 0.55), 470, 20);
  });

  it('compresses super-Earths: R ~ M^0.27, not M^(1/3)', () => {
    const r1 = terrestrialRadiusKm(1, 0.325, 0.675, 0);
    const r10 = terrestrialRadiusKm(10, 0.325, 0.675, 0);
    const slope = Math.log(r10 / r1) / Math.log(10);
    expect(slope).toBeCloseTo(0.27, 2);
    // A 10 M_earth rocky world is denser than Earth, never less dense.
    expect(bulkDensityGcm3(10, r10)).toBeGreaterThan(5.51);
  });

  it('leaves very small bodies uncompressed (R ~ M^(1/3))', () => {
    const a = terrestrialRadiusKm(1e-6, 0.3, 0.7, 0);
    const b = terrestrialRadiusKm(8e-6, 0.3, 0.7, 0);
    expect(Math.log(b / a) / Math.log(8)).toBeCloseTo(1 / 3, 2);
  });

  it('makes water-rich bodies less dense than iron-rich ones', () => {
    expect(mixtureDensity(1, 0, 0)).toBeCloseTo(7.8, 6);
    expect(mixtureDensity(0, 0, 1)).toBeCloseTo(1.0, 6);
    expect(mixtureDensity(0, 1, 0)).toBeCloseTo(3.3, 6);
    expect(mixtureDensity(0.5, 0.5, 0)).toBeGreaterThan(mixtureDensity(0, 0.5, 0.5));
  });
});

describe('giant planet mass-radius relation', () => {
  it('reproduces Jupiter (317.8 M_earth -> 69911 km) within 2%', () => {
    within(giantRadiusKm(317.8), R_JUPITER_KM, 2);
  });

  it('reproduces Saturn (95.16 M_earth -> 58232 km) within 3%', () => {
    within(giantRadiusKm(95.16), 58232, 3);
  });

  it('reproduces Neptune and Uranus within 5%', () => {
    within(giantRadiusKm(17.15), 24622, 5);
    within(giantRadiusKm(14.54), 25362, 5);
  });

  it('flattens near 1 Jupiter radius instead of growing without bound', () => {
    const rJup = giantRadiusKm(317.8);
    const r10Jup = giantRadiusKm(10 * M_JUPITER_IN_EARTH);
    expect(r10Jup / rJup).toBeLessThan(1.15);
    expect(r10Jup / rJup).toBeGreaterThan(0.85);
  });
});

describe('stellar mass-radius-luminosity relations', () => {
  it('reproduces the Sun: 1 R_sun, 1 L_sun, 5772 K', () => {
    within(mainSequenceRadiusKm(SOLAR), R_SUN_KM, 1);
    within(luminositySolarFromMass(SOLAR), 1.0, 1);
    const d = deriveBodyState('Star', SOLAR);
    within(d.temperature, 5772, 3);
    within(d.luminositySolar, 1.0, 1);
  });

  it('reproduces Proxima Centauri luminosity (0.122 M_sun -> ~0.0017 L_sun)', () => {
    within(luminositySolarFromMass(0.122 * SOLAR), 0.0017, 20);
  });

  it('makes massive stars hotter and more luminous', () => {
    const sun = deriveBodyState('Star', SOLAR);
    const big = deriveBodyState('Star', 10 * SOLAR);
    const small = deriveBodyState('Star', 0.2 * SOLAR);
    expect(big.temperature).toBeGreaterThan(sun.temperature);
    expect(sun.temperature).toBeGreaterThan(small.temperature);
    expect(big.luminositySolar).toBeGreaterThan(1000);
    expect(small.luminositySolar).toBeLessThan(0.02);
  });
});

describe('degenerate remnants', () => {
  it('white dwarf radius DECREASES with mass (electron degeneracy)', () => {
    const light = whiteDwarfRadiusKm(0.4 * SOLAR);
    const heavy = whiteDwarfRadiusKm(1.2 * SOLAR);
    expect(heavy).toBeLessThan(light);
  });

  it('reproduces Sirius B (1.02 M_sun) within 15% of 5850 km', () => {
    within(whiteDwarfRadiusKm(1.02 * SOLAR), 5850, 15);
  });

  it('collapses the white dwarf radius towards the Chandrasekhar limit', () => {
    expect(whiteDwarfRadiusKm(1.43 * SOLAR)).toBeLessThan(whiteDwarfRadiusKm(1.2 * SOLAR));
  });

  it('neutron star radius DECREASES with mass and stays near 12 km', () => {
    const r14 = neutronStarRadiusKm(1.4 * SOLAR);
    const r20 = neutronStarRadiusKm(2.0 * SOLAR);
    within(r14, 12.4, 2);
    expect(r20).toBeLessThan(r14);
    expect(r20).toBeGreaterThan(10);
  });

  it('gives neutron stars nuclear density (~4e14 g/cm3)', () => {
    const rho = bulkDensityGcm3(1.4 * SOLAR, neutronStarRadiusKm(1.4 * SOLAR));
    expect(rho).toBeGreaterThan(1e14);
    expect(rho).toBeLessThan(1e15);
  });

  it('keeps brown dwarf radius near 1 Jupiter radius across its whole range', () => {
    for (const mJup of [13, 30, 50, 75]) {
      const r = brownDwarfRadiusKm(mJup * M_JUPITER_IN_EARTH);
      expect(r / R_JUPITER_KM).toBeGreaterThan(0.8);
      expect(r / R_JUPITER_KM).toBeLessThanOrEqual(1.0);
    }
  });
});

describe('black hole geometry via derivation', () => {
  it('gives a 10 M_sun hole a ~29.5 km horizon, scaling linearly with mass', () => {
    const d10 = deriveBodyState('Black Hole', 10 * SOLAR);
    const d20 = deriveBodyState('Black Hole', 20 * SOLAR);
    within(d10.radiusKm, 29.53, 1);
    within(d20.radiusKm / d10.radiusKm, 2.0, 0.1);
  });

  it('shrinks the horizon when the hole spins', () => {
    const still = deriveBodyState('Black Hole', 10 * SOLAR, { spinParameter: 0 });
    const spun = deriveBodyState('Black Hole', 10 * SOLAR, { spinParameter: 0.9 });
    expect(spun.radiusKm).toBeLessThan(still.radiusKm);
  });
});

describe('classification', () => {
  it('preserves a valid type', () => {
    expect(classifyBody('Planet', 1)).toBe('Planet');
    expect(classifyBody('Star', SOLAR)).toBe('Star');
    expect(classifyBody('Gas Giant', 317.8)).toBe('Gas Giant');
  });

  it('promotes a planet past the deuterium and hydrogen burning limits', () => {
    expect(classifyBody('Planet', EVOLUTION_THRESHOLDS.DEUTERIUM_BURNING * 1.1)).toBe('Brown Dwarf');
    expect(classifyBody('Planet', EVOLUTION_THRESHOLDS.HYDROGEN_BURNING * 1.1)).toBe('Star');
  });

  it('collapses a white dwarf past Chandrasekhar into a neutron star', () => {
    expect(classifyBody('White Dwarf', 1.2 * SOLAR)).toBe('White Dwarf');
    expect(classifyBody('White Dwarf', 1.5 * SOLAR)).toBe('Neutron Star');
  });

  it('collapses a neutron star past the TOV limit into a black hole', () => {
    expect(classifyBody('Neutron Star', 2.0 * SOLAR)).toBe('Neutron Star');
    expect(classifyBody('Neutron Star', 2.3 * SOLAR)).toBe('Black Hole');
    expect(classifyBody('Pulsar', 2.3 * SOLAR)).toBe('Black Hole');
  });

  it('never lets a black hole uncollapse', () => {
    expect(classifyBody('Black Hole', 1)).toBe('Black Hole');
  });

  it('makes a physically inconsistent body impossible: a neutron star cannot be Earth-density', () => {
    // Whatever mass the user dials in, the radius is derived from the neutron
    // star equation of state, so the density is always nuclear.
    for (const mSun of [1.1, 1.4, 2.0]) {
      const d = deriveBodyState('Neutron Star', mSun * SOLAR);
      expect(d.bulkDensity).toBeGreaterThan(1e13);
    }
  });

  it('assigns sensible types by mass alone', () => {
    expect(classifyByMass(1e-10)).toBe('Comet');
    expect(classifyByMass(1e-6)).toBe('Asteroid');
    expect(classifyByMass(2e-3)).toBe('Dwarf');
    expect(classifyByMass(1)).toBe('Planet');
    expect(classifyByMass(17)).toBe('Ice Giant');
    expect(classifyByMass(317.8)).toBe('Gas Giant');
    expect(classifyByMass(SOLAR)).toBe('Star');
  });
});

describe('derived state consistency', () => {
  it('keeps density, gravity and escape velocity mutually consistent', () => {
    const d = deriveBodyState('Planet', 3, {
      compositionIron: 0.3, compositionSilicates: 0.6, compositionWater: 0.1,
    });
    within(bulkDensityGcm3(3, d.radiusKm), d.bulkDensity, 0.001);
    within(surfaceGravitySi(3, d.radiusKm), d.surfaceGravity, 0.001);
    within(escapeVelocityKms(3, d.radiusKm), d.escapeVelocity, 0.001);
  });

  it('honours a pinned manual radius', () => {
    const d = deriveBodyState('Planet', 1, { manualRadius: true, manualRadiusKm: 10000 });
    expect(d.radiusKm).toBe(10000);
    within(d.bulkDensity, bulkDensityGcm3(1, 10000), 0.001);
  });

  it('produces finite values for every creatable type', () => {
    const types = [
      'Asteroid', 'Comet', 'Moon', 'Dwarf', 'Planet', 'Ice Giant', 'Gas Giant',
      'Brown Dwarf', 'Star', 'Red Giant', 'White Dwarf', 'Neutron Star', 'Pulsar',
      'Black Hole',
    ] as const;
    for (const t of types) {
      const mass = Math.max(1e-9, (BODY_MASS_MID as Record<string, number>)[t] ?? 1);
      const d = deriveBodyState(t, mass);
      expect(Number.isFinite(d.radiusKm), `${t} radiusKm`).toBe(true);
      expect(d.radiusKm, `${t} radiusKm`).toBeGreaterThan(0);
      expect(Number.isFinite(d.radius), `${t} visual radius`).toBe(true);
      expect(d.radius, `${t} visual radius`).toBeGreaterThan(0);
      expect(Number.isFinite(d.bulkDensity), `${t} density`).toBe(true);
      expect(Number.isFinite(d.surfaceGravity), `${t} gravity`).toBe(true);
      expect(Number.isFinite(d.escapeVelocity), `${t} escape velocity`).toBe(true);
      expect(Number.isFinite(d.luminositySolar), `${t} luminosity`).toBe(true);
    }
  });
});

const BODY_MASS_MID: Record<string, number> = {
  'Asteroid': 1e-5,
  'Comet': 1e-11,
  'Moon': 0.0123,
  'Dwarf': 2e-3,
  'Planet': 1,
  'Ice Giant': 17,
  'Gas Giant': 317.8,
  'Brown Dwarf': 30 * M_JUPITER_IN_EARTH,
  'Star': M_SUN_IN_EARTH,
  'Red Giant': M_SUN_IN_EARTH,
  'White Dwarf': 0.6 * M_SUN_IN_EARTH,
  'Neutron Star': 1.4 * M_SUN_IN_EARTH,
  'Pulsar': 1.4 * M_SUN_IN_EARTH,
  'Black Hole': 10 * M_SUN_IN_EARTH,
};
