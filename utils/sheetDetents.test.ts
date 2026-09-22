import { describe, expect, it } from 'vitest';
import {
  DETENT_FRACTION,
  FLING_PX_PER_MS,
  PEEK_MAX_PX,
  detentHeight,
  nearestDetent,
  resolveSheetRelease,
  stepDetent,
} from './sheetDetents';

const PHONE_VH = 844;

describe('detentHeight', () => {
  it('caps peek on a tall phone and uses the fraction on a short one', () => {
    expect(detentHeight('peek', PHONE_VH)).toBe(PEEK_MAX_PX);
    expect(detentHeight('peek', 400)).toBeCloseTo(DETENT_FRACTION.peek * 400);
  });

  it('scales half and full to the viewport', () => {
    expect(detentHeight('half', PHONE_VH)).toBeCloseTo(DETENT_FRACTION.half * PHONE_VH);
    expect(detentHeight('full', PHONE_VH)).toBeCloseTo(DETENT_FRACTION.full * PHONE_VH);
  });
});

describe('nearestDetent', () => {
  it('snaps an 80px travel from half back to half on a phone', () => {
    const half = detentHeight('half', PHONE_VH);
    expect(nearestDetent(half + 80, PHONE_VH)).toBe('half');
    expect(nearestDetent(half - 80, PHONE_VH)).toBe('half');
  });

  it('crosses to full and peek only past the midpoints', () => {
    const half = detentHeight('half', PHONE_VH);
    const full = detentHeight('full', PHONE_VH);
    const peek = detentHeight('peek', PHONE_VH);
    expect(nearestDetent((half + full) / 2 + 1, PHONE_VH)).toBe('full');
    expect(nearestDetent((half + peek) / 2 - 1, PHONE_VH)).toBe('peek');
  });
});

describe('stepDetent', () => {
  it('moves one rung and clamps at the ends', () => {
    expect(stepDetent('half', 1)).toBe('full');
    expect(stepDetent('half', -1)).toBe('peek');
    expect(stepDetent('full', 1)).toBe('full');
    expect(stepDetent('peek', -1)).toBe('peek');
  });
});

describe('resolveSheetRelease', () => {
  const half = detentHeight('half', PHONE_VH);

  it('steps one detent from a fling even when travel is still nearest to half', () => {
    expect(resolveSheetRelease({
      height: half + 80,
      velocity: -(FLING_PX_PER_MS + 0.01),
      from: 'half',
      vh: PHONE_VH,
      reducedMotion: false,
    })).toEqual({ action: 'detent', detent: 'full' });

    expect(resolveSheetRelease({
      height: half - 80,
      velocity: FLING_PX_PER_MS + 0.01,
      from: 'half',
      vh: PHONE_VH,
      reducedMotion: false,
    })).toEqual({ action: 'detent', detent: 'peek' });
  });

  it('falls back to nearest detent under reduced motion or a slow drag', () => {
    expect(resolveSheetRelease({
      height: half + 80,
      velocity: -(FLING_PX_PER_MS + 0.01),
      from: 'half',
      vh: PHONE_VH,
      reducedMotion: true,
    })).toEqual({ action: 'detent', detent: 'half' });

    expect(resolveSheetRelease({
      height: half + 80,
      velocity: -(FLING_PX_PER_MS - 0.01),
      from: 'half',
      vh: PHONE_VH,
      reducedMotion: false,
    })).toEqual({ action: 'detent', detent: 'half' });
  });

  it('dismisses a drag well below peek', () => {
    expect(resolveSheetRelease({
      height: detentHeight('peek', PHONE_VH) * 0.5,
      velocity: 0,
      from: 'peek',
      vh: PHONE_VH,
      reducedMotion: false,
    })).toEqual({ action: 'dismiss' });
  });

  it('uses nearest-detent as a safety net for a large slow travel', () => {
    expect(resolveSheetRelease({
      height: half + 120,
      velocity: 0,
      from: 'half',
      vh: PHONE_VH,
      reducedMotion: false,
    })).toEqual({ action: 'detent', detent: 'full' });

    expect(resolveSheetRelease({
      height: half - 180,
      velocity: 0,
      from: 'half',
      vh: PHONE_VH,
      reducedMotion: false,
    })).toEqual({ action: 'detent', detent: 'peek' });
  });
});
