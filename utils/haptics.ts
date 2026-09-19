/**
 * Haptic feedback.
 *
 * Inside the Android app this goes through @capacitor/haptics, which uses the
 * system haptic effects (crisp clicks rather than a motor buzz) and whose
 * plugin manifest brings the VIBRATE permission — without it the WebView's
 * `navigator.vibrate` is silently a no-op. In a browser the plugin's web
 * implementation falls back to `navigator.vibrate`, so it is only called on
 * touch devices; desktops have nothing to vibrate.
 *
 * Every call is fire-and-forget. Feedback is optional and must never throw
 * into UI code (OEM builds and permissions policies can reject it).
 */
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { TimeState } from './timeState';

export type HapticWeight = 'light' | 'medium' | 'heavy';

const IMPACT_STYLE: Record<HapticWeight, ImpactStyle> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

/** Gap between the two pulses that mark reversing time. */
const DOUBLE_PULSE_MS = 90;

const canVibrate = (): boolean => {
  if (Capacitor.isNativePlatform()) return true;
  return typeof navigator !== 'undefined' && 'vibrate' in navigator && navigator.maxTouchPoints > 0;
};

export const fireOptionalHaptic = (call: () => Promise<void>): void => {
  if (!canVibrate()) return;
  try {
    call().catch(() => { console.warn('Aether: native-haptic-failed'); });
  } catch {
    console.warn('Aether: native-haptic-failed');
  }
};

export function hapticImpact(weight: HapticWeight): void {
  fireOptionalHaptic(() => Haptics.impact({ style: IMPACT_STYLE[weight] }));
}

/**
 * Detent ticks while dragging a control. The native selection API only ticks
 * between a start and an end, so bracket the drag with these.
 */
export function hapticSelectionStart(): void {
  fireOptionalHaptic(() => Haptics.selectionStart());
}

export function hapticSelectionTick(): void {
  fireOptionalHaptic(() => Haptics.selectionChanged());
}

export function hapticSelectionEnd(): void {
  fireOptionalHaptic(() => Haptics.selectionEnd());
}

/**
 * One distinct pattern per clock state, so the change can be felt without
 * looking: reversing is a double heavy pulse, stopping a single heavy one,
 * landing on normal pace a medium click, slow/fast a light click.
 */
export function hapticTimeState(state: TimeState): void {
  switch (state) {
    case 'reverse':
      hapticImpact('heavy');
      window.setTimeout(() => hapticImpact('heavy'), DOUBLE_PULSE_MS);
      break;
    case 'stopped':
      hapticImpact('heavy');
      break;
    case 'normal':
      hapticImpact('medium');
      break;
    default:
      hapticImpact('light');
  }
}
