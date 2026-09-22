import { SHEET_DETENTS, type SheetDetent } from './store';

/** Fraction of the dynamic viewport each detent occupies. */
export const DETENT_FRACTION: Record<SheetDetent, number> = {
  peek: 0.34,
  half: 0.60,
  full: 0.86,
};

/**
 * `peek` is capped in absolute terms as well as proportionally: its whole job
 * is to show the header and the key-stat strip, and a third of a tall phone is
 * considerably more than that — the surplus reads as a dead grey band. The
 * fraction still governs on short viewports, where 12rem would be too much.
 */
export const PEEK_MAX_PX = 192; // 12rem

/** Fling speed above which the drag direction, not the position, picks the detent. */
export const FLING_PX_PER_MS = 0.5;

/** Resolved pixel height of a detent for a given viewport height. */
export function detentHeight(detent: SheetDetent, vh: number): number {
  const proportional = DETENT_FRACTION[detent] * vh;
  return detent === 'peek' ? Math.min(proportional, PEEK_MAX_PX) : proportional;
}

/** Detent whose height is closest to `height` pixels. */
export function nearestDetent(height: number, vh: number): SheetDetent {
  let best: SheetDetent = 'peek';
  let bestDelta = Infinity;
  for (const d of SHEET_DETENTS) {
    const delta = Math.abs(detentHeight(d, vh) - height);
    if (delta < bestDelta) { bestDelta = delta; best = d; }
  }
  return best;
}

/** One step toward the top / bottom of the detent ladder. */
export function stepDetent(from: SheetDetent, direction: 1 | -1): SheetDetent {
  const i = SHEET_DETENTS.indexOf(from);
  const next = Math.max(0, Math.min(SHEET_DETENTS.length - 1, i + direction));
  return SHEET_DETENTS[next];
}

export type SheetRelease =
  | { action: 'dismiss' }
  | { action: 'detent'; detent: SheetDetent };

/**
 * Decide where a bottom-sheet drag lands.
 *
 * Velocity is expected in px/ms, using the pointer event's own timestamp so a
 * hitching main thread does not under-report a flick.
 */
export function resolveSheetRelease({
  height,
  velocity,
  from,
  vh,
  reducedMotion,
}: {
  height: number;
  velocity: number;
  from: SheetDetent;
  vh: number;
  reducedMotion: boolean;
}): SheetRelease {
  if (height < detentHeight('peek', vh) * 0.6) {
    return { action: 'dismiss' };
  }
  if (!reducedMotion && Math.abs(velocity) > FLING_PX_PER_MS) {
    return { action: 'detent', detent: stepDetent(from, velocity > 0 ? -1 : 1) };
  }
  return { action: 'detent', detent: nearestDetent(height, vh) };
}
