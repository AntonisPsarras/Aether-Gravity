import { describe, it, expect } from 'vitest';
import {
  ADVANCED_DEPTH_AT_1AU_PER_SOLAR_MASS,
  BEGINNER_BODY_TYPES,
  GRID_RENDER_SAFETY_MAX_DEPTH,
  TIDAL_LOG_MAX,
  TIDAL_LOG_MIN,
  WELL_PARAMS_ADVANCED,
  WELL_PARAMS_BEGINNER,
  beginnerVisualScale,
  depthTintFor,
  isBeginnerBodyType,
  wellParamsFor,
  isUiMode,
  tidalTintFor,
  visualScaleFor,
} from './displayMode';
import type { UiMode } from './displayMode';
import { BODY_CONFIGS } from '../constants';
import type { BodyType } from '../types';
import { M_SUN_IN_EARTH, auToDist } from './units';

const ALL_TYPES = Object.keys(BODY_CONFIGS) as BodyType[];

describe('visualScaleFor', () => {
  it('is exactly 1 for every type in Advanced Mode', () => {
    for (const type of ALL_TYPES) {
      expect(visualScaleFor('advanced', type)).toBe(1);
    }
  });

  it('enlarges every type in Beginner Mode', () => {
    for (const type of ALL_TYPES) {
      expect(visualScaleFor('beginner', type)).toBeGreaterThan(1);
    }
  });

  it('boosts solid bodies more than stars, which are already drawn large', () => {
    expect(beginnerVisualScale('Planet')).toBeGreaterThan(beginnerVisualScale('Star'));
    expect(beginnerVisualScale('Asteroid')).toBeGreaterThan(beginnerVisualScale('Red Giant'));
    expect(beginnerVisualScale('Moon')).toBeGreaterThan(beginnerVisualScale('Black Hole'));
  });

  it('keeps every factor within a range that cannot make bodies overlap their orbits', () => {
    for (const type of ALL_TYPES) {
      expect(beginnerVisualScale(type)).toBeLessThanOrEqual(2.5);
    }
  });
});

describe('beginner body-type subset', () => {
  it('offers a strict, non-empty subset of the real body types', () => {
    expect(BEGINNER_BODY_TYPES.length).toBeGreaterThan(0);
    expect(BEGINNER_BODY_TYPES.length).toBeLessThan(ALL_TYPES.length);
    for (const type of BEGINNER_BODY_TYPES) {
      expect(ALL_TYPES).toContain(type);
    }
  });

  it('includes the types a newcomer needs to build a recognisable system', () => {
    for (const type of ['Star', 'Planet', 'Moon'] as BodyType[]) {
      expect(isBeginnerBodyType(type)).toBe(true);
    }
  });

  it('hides the exotic compact objects', () => {
    for (const type of ['Neutron Star', 'Pulsar', 'White Dwarf', 'Brown Dwarf'] as BodyType[]) {
      expect(isBeginnerBodyType(type)).toBe(false);
    }
  });
});

describe('curvature presentation parameters', () => {
  const MODES: UiMode[] = ['beginner', 'advanced'];

  it('draws the true potential in Advanced Mode and exaggerates in Beginner', () => {
    expect(wellParamsFor('advanced')).toBe(WELL_PARAMS_ADVANCED);
    expect(wellParamsFor('beginner')).toBe(WELL_PARAMS_BEGINNER);
    expect(WELL_PARAMS_ADVANCED.model).toBe('potential');
    expect(WELL_PARAMS_BEGINNER.model).toBe('exaggerated');
  });

  it('derives one κ for every mass from the 1 AU depth anchor', () => {
    expect((WELL_PARAMS_ADVANCED.kappa * M_SUN_IN_EARTH) / auToDist(1))
      .toBeCloseTo(ADVANCED_DEPTH_AT_1AU_PER_SOLAR_MASS, 9);
  });

  it('returns well-formed parameters for every mode', () => {
    for (const mode of MODES) {
      const p = wellParamsFor(mode);
      expect(p.coreFactor).toBeGreaterThan(0);
      expect(p.coreFloor).toBeGreaterThanOrEqual(0);
      expect(p.displayKnee).toBeGreaterThan(0);
      expect(p.displayKnee).toBeLessThan(GRID_RENDER_SAFETY_MAX_DEPTH);
    }
    const b = WELL_PARAMS_BEGINNER;
    expect(b.amplitude).toBeGreaterThan(0);
    expect(b.exponent).toBeGreaterThan(0);
    expect(b.exponent).toBeLessThanOrEqual(1);
    expect(b.maxDepth).toBeGreaterThan(b.amplitude);
    expect(b.maxDepth).toBeLessThan(b.displayKnee);
    expect(b.coreFloor).toBeGreaterThan(0);
  });

  it('tints wells more strongly in Beginner Mode', () => {
    expect(depthTintFor('beginner')).toBeGreaterThan(depthTintFor('advanced'));
    expect(depthTintFor('advanced')).toBeGreaterThanOrEqual(0);
  });

  it('weights the curvature (tidal) tint more in Advanced Mode', () => {
    expect(tidalTintFor('advanced')).toBeGreaterThan(tidalTintFor('beginner'));
    expect(tidalTintFor('beginner')).toBeGreaterThan(0);
    expect(TIDAL_LOG_MAX).toBeGreaterThan(TIDAL_LOG_MIN);
  });
});

describe('isUiMode', () => {
  it('accepts only the two modes', () => {
    expect(isUiMode('beginner')).toBe(true);
    expect(isUiMode('advanced')).toBe(true);
    expect(isUiMode('expert')).toBe(false);
    expect(isUiMode(undefined)).toBe(false);
    expect(isUiMode(null)).toBe(false);
  });
});
