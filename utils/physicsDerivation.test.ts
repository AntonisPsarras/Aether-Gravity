import { describe, it, expect } from 'vitest';
import {
  surfaceGravitySiFromGame,
  escapeVelocityKmsFromGame,
  equilibriumTemperatureK,
  STAR_REFERENCE_MASS_GAME,
} from './units';
import {
  calculatePlanetaryPhysics,
  deriveStarProperties,
} from './physicsUtils';

describe('SI calibration from game units', () => {
  it('Earth analog (mass 10, radius 2.5) yields ~9.8 m/s² and ~11.2 km/s', () => {
    const g = surfaceGravitySiFromGame(10, 2.5);
    const vEsc = escapeVelocityKmsFromGame(10, 2.5);
    expect(g).toBeGreaterThan(8.5);
    expect(g).toBeLessThan(11);
    expect(vEsc).toBeGreaterThan(10);
    expect(vEsc).toBeLessThan(13);
  });

  it('composition-derived planet has finite SI surface properties', () => {
    const p = calculatePlanetaryPhysics(10, 0.3, 0.6, 0.1);
    expect(p.radius).toBeGreaterThan(0.1);
    expect(p.surfaceGravity).toBeGreaterThan(0);
    expect(p.escapeVelocity).toBeGreaterThan(0);
    expect(p.bulkDensity).toBeGreaterThan(1);
    expect(p.bulkDensity).toBeLessThan(12);
  });

  it('solar-mass star has main-sequence temperature in a plausible range', () => {
    const star = deriveStarProperties(STAR_REFERENCE_MASS_GAME);
    expect(star.temperature).toBeGreaterThan(5000);
    expect(star.temperature).toBeLessThan(7000);
    expect(star.radius).toBeGreaterThan(8);
  });

  it('equilibrium temperature drops with orbital distance', () => {
    const tNear = equilibriumTemperatureK(STAR_REFERENCE_MASS_GAME, 40, 0.3, 0);
    const tFar = equilibriumTemperatureK(STAR_REFERENCE_MASS_GAME, 120, 0.3, 0);
    expect(tFar).toBeLessThan(tNear);
  });
});
