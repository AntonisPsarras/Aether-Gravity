import { describe, expect, it } from 'vitest';
import {
  MAX_HIT_CONE_FRACTION,
  MAX_HIT_GROWTH,
  MIN_HIT_RADIUS_PX,
  clampHitRadiusToCone,
  screenSpaceHitScale,
} from './hitTarget';

describe('screenSpaceHitScale', () => {
  it('never shrinks a body that already clears the target', () => {
    expect(screenSpaceHitScale(MIN_HIT_RADIUS_PX)).toBe(1);
    expect(screenSpaceHitScale(MIN_HIT_RADIUS_PX * 10)).toBe(1);
  });

  it('lifts an undersized body exactly to the target', () => {
    const pixelRadius = MIN_HIT_RADIUS_PX / 2;
    expect(pixelRadius * screenSpaceHitScale(pixelRadius)).toBeCloseTo(MIN_HIT_RADIUS_PX);
  });

  it('saturates at the growth ceiling for a sub-pixel body', () => {
    // Uncapped growth is the real hazard: a distant enough body would get an
    // unboundedly large world-space sphere and swallow the scene.
    expect(screenSpaceHitScale(0.001)).toBe(MAX_HIT_GROWTH);
  });

  it('falls back to the ceiling for a degenerate radius', () => {
    expect(screenSpaceHitScale(0)).toBe(MAX_HIT_GROWTH);
    expect(screenSpaceHitScale(Number.NaN)).toBe(MAX_HIT_GROWTH);
    expect(screenSpaceHitScale(-4)).toBe(MAX_HIT_GROWTH);
  });

  it('honours explicit target and ceiling arguments', () => {
    expect(screenSpaceHitScale(10, 30, 2)).toBe(2);
    expect(screenSpaceHitScale(20, 30, 4)).toBeCloseTo(1.5);
  });
});

describe('clampHitRadiusToCone', () => {
  it('caps the grown radius at the cone fraction of the camera distance', () => {
    const distance = 1000;
    expect(clampHitRadiusToCone(500, distance, 1)).toBe(distance * MAX_HIT_CONE_FRACTION);
  });

  it('leaves a radius already inside the cone alone', () => {
    expect(clampHitRadiusToCone(5, 1000, 1)).toBe(5);
  });

  it('never clamps below the body\'s own authored radius', () => {
    // A body larger than the cone at point-blank range must stay pickable.
    expect(clampHitRadiusToCone(40, 1, 40)).toBe(40);
  });
});
