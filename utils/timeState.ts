/**
 * What the simulation clock is doing, as the user perceives it.
 *
 * The speed slider is one continuous number (-2x … 4x) but the user cares about
 * five qualitatively different states — running backwards, stopped, slowed,
 * at the normal pace, and fast-forwarded. The control bar colours the slider,
 * labels the readout and fires a distinct haptic per state from this single
 * classification, so the three can never disagree.
 *
 * Pure: no React, no DOM. `timeState.test.ts` guards the boundaries.
 */
import { clampSpeed } from './physicsBounds';

export type TimeState = 'reverse' | 'stopped' | 'slow' | 'normal' | 'fast';

/** |speed| below this is indistinguishable from stopped on screen. */
export const STOPPED_EPSILON = 0.05;
/** Half-width of the band around 1x that still reads as "normal pace". */
export const NORMAL_BAND = 0.05;
/** Half-width of the sticky detents at 0x and 1x on the slider. */
export const SNAP_RADIUS = 0.15;

export const timeStateFor = (speed: number, paused: boolean): TimeState => {
  if (paused || !Number.isFinite(speed) || Math.abs(speed) < STOPPED_EPSILON) return 'stopped';
  if (speed < 0) return 'reverse';
  if (speed < 1 - NORMAL_BAND) return 'slow';
  if (speed <= 1 + NORMAL_BAND) return 'normal';
  return 'fast';
};

/**
 * Sticky detents at 0x (stop) and 1x (normal pace), then the store's clamp.
 * Those are the two positions people aim for and the hardest to hit exactly
 * with a thumb on a 0.1-step slider.
 */
export const snapSpeed = (value: number): number => {
  const v = clampSpeed(value);
  if (Math.abs(v) <= SNAP_RADIUS) return 0;
  if (Math.abs(v - 1) <= SNAP_RADIUS) return 1;
  return Math.round(v * 10) / 10;
};

/**
 * Index of the whole-number band `speed` sits in — changes exactly when the
 * slider crosses an integer multiple. Used for the detent tick while dragging.
 */
export const speedDetentIndex = (speed: number): number => Math.floor(speed + 1e-9);

/** Signed, compact readout: "−1.5x", "STOP", "0.5x", "2.0x". */
export const formatSpeedReadout = (speed: number, state: TimeState): string => {
  if (state === 'stopped') return 'STOP';
  const magnitude = `${Math.abs(speed).toFixed(1)}x`;
  return speed < 0 ? `−${magnitude}` : magnitude;
};

/**
 * Readout for the throttled rate shown next to "resolving close encounter".
 * Unlike formatSpeedReadout, this never collapses to "STOP": it only ever
 * runs while playback is genuinely still advancing (just below the scientific
 * pacing budget), so classifying it through STOPPED_EPSILON — a threshold
 * meant for the user's own speed choice — would mislabel a real, if slow,
 * rate as fully halted. Two decimal places keep a compact but tight system
 * (e.g. TRAPPIST-1, throttled to a few percent even at rest) visibly
 * distinct from zero instead of rounding it away.
 */
export const formatEncounterSpeedReadout = (speed: number): string => {
  if (!Number.isFinite(speed) || speed === 0) return '0.00x';
  const magnitude = `${Math.abs(speed).toFixed(2)}x`;
  return speed < 0 ? `−${magnitude}` : magnitude;
};

export interface TimeStateVisual {
  label: string;
  /** Solid colour for the thumb, readout and pill (CSS colour string). */
  color: string;
}

export const TIME_STATE_VISUALS: Record<TimeState, TimeStateVisual> = {
  reverse: { label: 'Reversing time', color: '#a78bfa' },
  stopped: { label: 'Time stopped', color: '#94a3b8' },
  slow: { label: 'Slow motion', color: '#22d3ee' },
  normal: { label: 'Normal pace', color: '#f9d423' },
  fast: { label: 'Fast forward', color: '#fb923c' },
};
