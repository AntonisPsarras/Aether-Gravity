import { describe, it, expect } from 'vitest';
import {
  BEGINNER_BODY_TYPES,
  beginnerVisualScale,
  isBeginnerBodyType,
  isUiMode,
  visualScaleFor,
} from './displayMode';
import { BODY_CONFIGS } from '../constants';
import type { BodyType } from '../types';

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

describe('isUiMode', () => {
  it('accepts only the two modes', () => {
    expect(isUiMode('beginner')).toBe(true);
    expect(isUiMode('advanced')).toBe(true);
    expect(isUiMode('expert')).toBe(false);
    expect(isUiMode(undefined)).toBe(false);
    expect(isUiMode(null)).toBe(false);
  });
});
