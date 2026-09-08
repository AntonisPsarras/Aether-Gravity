import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../utils/store';
import { useReducedMotion } from './useReducedMotion';

/** Shortest gap between two flashes of the same field. */
const MIN_FLASH_INTERVAL_MS = 600;
const FLASH_DURATION_MS = 440;

/**
 * Briefly highlight a derived readout when the value it is computed from
 * changes, so an edit to a primary visibly propagates.
 *
 * The simulation ticks at 60 Hz and replaces every body object each frame, so a
 * naive implementation strobes permanently. Four guards prevent that:
 *
 *  1. The caller passes the **formatted** string, not the raw number — the
 *     rounding in `utils/units.ts` absorbs integrator jitter.
 *  2. Only fields explicitly marked `flash` in `utils/inspectorSections.ts`
 *     opt in, and only ones derived from primaries rather than from live
 *     position or velocity.
 *  3. A minimum re-flash interval.
 *  4. Suppressed entirely while a control is being dragged; the flash then
 *     fires once when the value settles.
 */
export function useValueFlash(formatted: string, enabled = true): boolean {
  const reducedMotion = useReducedMotion();
  const isInteracting = useStore((s) => s.isInteractingWithUI);
  const [flashing, setFlashing] = useState(false);

  const previous = useRef(formatted);
  const lastFlashAt = useRef(0);
  const active = enabled && !reducedMotion;

  useEffect(() => {
    if (!active) {
      previous.current = formatted;
      return;
    }
    if (formatted === previous.current) return;
    previous.current = formatted;

    // Mid-drag the value changes continuously; wait for the release.
    if (isInteracting) return;

    const now = Date.now();
    if (now - lastFlashAt.current < MIN_FLASH_INTERVAL_MS) return;
    lastFlashAt.current = now;

    setFlashing(true);
    const timer = setTimeout(() => setFlashing(false), FLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [formatted, active, isInteracting]);

  return flashing;
}
