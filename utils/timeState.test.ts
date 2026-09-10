import { describe, expect, it } from 'vitest';
import { PHYSICS_LIMITS } from './physicsBounds';
import {
  formatSpeedReadout,
  snapSpeed,
  speedDetentIndex,
  timeStateFor,
} from './timeState';

describe('timeStateFor', () => {
  it('treats pause as stopped regardless of the slider', () => {
    for (const speed of [-2, 0, 0.5, 1, 4]) expect(timeStateFor(speed, true)).toBe('stopped');
  });

  it('classifies each band of the slider', () => {
    expect(timeStateFor(-2, false)).toBe('reverse');
    expect(timeStateFor(-0.1, false)).toBe('reverse');
    expect(timeStateFor(0, false)).toBe('stopped');
    expect(timeStateFor(0.04, false)).toBe('stopped');
    expect(timeStateFor(0.1, false)).toBe('slow');
    expect(timeStateFor(0.9, false)).toBe('slow');
    expect(timeStateFor(1, false)).toBe('normal');
    expect(timeStateFor(1.1, false)).toBe('fast');
    expect(timeStateFor(4, false)).toBe('fast');
  });

  it('never throws on a corrupt speed', () => {
    expect(timeStateFor(Number.NaN, false)).toBe('stopped');
  });
});

describe('snapSpeed', () => {
  it('sticks to 0x and 1x within the detent radius', () => {
    expect(snapSpeed(0.1)).toBe(0);
    expect(snapSpeed(-0.1)).toBe(0);
    expect(snapSpeed(0.9)).toBe(1);
    expect(snapSpeed(1.1)).toBe(1);
  });

  it('leaves values outside the detents on the 0.1 grid', () => {
    expect(snapSpeed(0.5)).toBe(0.5);
    expect(snapSpeed(-1.3)).toBe(-1.3);
    expect(snapSpeed(2.4000000001)).toBe(2.4);
  });

  it('respects the store clamp', () => {
    expect(snapSpeed(99)).toBe(PHYSICS_LIMITS.SPEED_MAX);
    expect(snapSpeed(-99)).toBe(PHYSICS_LIMITS.SPEED_MIN);
  });
});

describe('speedDetentIndex', () => {
  it('changes exactly at integer crossings', () => {
    expect(speedDetentIndex(1.9)).toBe(1);
    expect(speedDetentIndex(2)).toBe(2);
    expect(speedDetentIndex(-0.1)).toBe(-1);
    expect(speedDetentIndex(0)).toBe(0);
  });
});

describe('formatSpeedReadout', () => {
  it('signs reverse playback and names the stop', () => {
    expect(formatSpeedReadout(-1.5, 'reverse')).toBe('−1.5x');
    expect(formatSpeedReadout(0, 'stopped')).toBe('STOP');
    expect(formatSpeedReadout(2, 'fast')).toBe('2.0x');
  });
});
