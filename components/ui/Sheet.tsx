import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SHEET_DETENTS, type SheetDetent } from '../../utils/store';
import { useReducedMotion } from '../hooks/useReducedMotion';

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

/** Resolved pixel height of a detent for a given viewport height. */
function detentHeight(detent: SheetDetent, vh: number): number {
  const proportional = DETENT_FRACTION[detent] * vh;
  return detent === 'peek' ? Math.min(proportional, PEEK_MAX_PX) : proportional;
}

/** Fling speed above which the drag direction, not the position, picks the detent. */
const FLING_PX_PER_MS = 0.5;

/**
 * The same quantity the CSS detents are written against.
 *
 * `--sheet-peek/half/full` are `dvh` — the *dynamic* viewport, which shrinks
 * while Android's system bars are showing. `window.innerHeight` is the *large*
 * viewport and does not, so the drag math and the CSS resting heights computed
 * different pixel values for the same detent and releasing a drag made the
 * sheet jump. `visualViewport.height` is the closest JS equivalent to `dvh`.
 */
function viewportHeight(): number {
  if (typeof window === 'undefined') return 800;
  return window.visualViewport?.height ?? window.innerHeight;
}

/** Detent whose height is closest to `height` pixels. */
function nearestDetent(height: number, vh: number): SheetDetent {
  let best: SheetDetent = 'peek';
  let bestDelta = Infinity;
  for (const d of SHEET_DETENTS) {
    const delta = Math.abs(detentHeight(d, vh) - height);
    if (delta < bestDelta) { bestDelta = delta; best = d; }
  }
  return best;
}

/** One step toward the top / bottom of the detent ladder. */
function stepDetent(from: SheetDetent, direction: 1 | -1): SheetDetent {
  const i = SHEET_DETENTS.indexOf(from);
  const next = Math.max(0, Math.min(SHEET_DETENTS.length - 1, i + direction));
  return SHEET_DETENTS[next];
}

export interface BottomSheetHandleProps {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

/**
 * Drag behaviour for a multi-detent bottom sheet.
 *
 * Returns props to spread on the grab handle plus the live height to apply to
 * the sheet. The sheet element itself stays owned by the caller so it can keep
 * its existing anchor classes — `index.css` styles the inspector's sliders
 * through the `.inspector-panel-anchor` ancestor selector, and losing that
 * class would silently drop the star-temperature gradient and the 44px mobile
 * track height.
 *
 * Deliberately does *not* set `isInteractingWithUI`: that flag disables
 * OrbitControls with a 1500 ms safety timer, so flagging a sheet flick would
 * leave the camera dead for over a second afterwards. The sheet already
 * swallows the pointer by sitting above the canvas.
 */
export function useBottomSheet({
  detent, onDetentChange, onDismiss, enabled,
}: {
  detent: SheetDetent;
  onDetentChange: (d: SheetDetent) => void;
  onDismiss: () => void;
  /** False on tablet/desktop, where there are no detents. */
  enabled: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  // `vh` is captured once per drag rather than re-read on every move. Each of
  // the three call sites used to sample it independently, so a viewport change
  // mid-drag silently moved the target geometry — and `visualViewport.height`
  // also shrinks when the software keyboard opens over an inspector field.
  const drag = useRef({ active: false, startY: 0, startHeight: 0, lastY: 0, lastT: 0, velocity: 0, vh: 0 });

  // A detent change from elsewhere (the back handler, say) must cancel a drag.
  useEffect(() => { if (!enabled) setDragHeight(null); }, [enabled]);

  // A viewport change mid-drag is rare; abandoning is more predictable than
  // trying to re-map an in-flight drag onto new geometry.
  useEffect(() => {
    const vv = typeof window === 'undefined' ? null : window.visualViewport;
    if (!vv) return;
    const abort = () => {
      if (!drag.current.active) return;
      drag.current.active = false;
      setDragHeight(null);
    };
    vv.addEventListener('resize', abort);
    return () => vv.removeEventListener('resize', abort);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, select, textarea, [data-no-drag]')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const vh = viewportHeight();
    drag.current = {
      active: true,
      startY: e.clientY,
      startHeight: detentHeight(detent, vh),
      lastY: e.clientY,
      lastT: performance.now(),
      velocity: 0,
      vh,
    };
    setDragHeight(drag.current.startHeight);
  }, [enabled, detent]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const now = performance.now();
    const dt = now - drag.current.lastT;
    if (dt > 0) drag.current.velocity = (e.clientY - drag.current.lastY) / dt;
    drag.current.lastY = e.clientY;
    drag.current.lastT = now;

    const vh = drag.current.vh;
    // Dragging down shrinks the sheet. A little rubber-band above `full`.
    const raw = drag.current.startHeight - (e.clientY - drag.current.startY);
    const max = detentHeight('full', vh);
    setDragHeight(raw > max ? max + (raw - max) * 0.25 : Math.max(0, raw));
  }, []);

  const finish = useCallback((e: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const height = dragHeight ?? drag.current.startHeight;
    const vh = drag.current.vh;
    setDragHeight(null);

    // Dragged well below the smallest detent: dismiss.
    if (height < detentHeight('peek', vh) * 0.6) {
      onDismiss();
      return;
    }

    // A deliberate fling moves one detent in the direction of travel. Under
    // reduced motion, fall back to nearest-detent so the result is
    // deterministic rather than gesture-speed dependent.
    const v = drag.current.velocity;
    if (!reducedMotion && Math.abs(v) > FLING_PX_PER_MS) {
      onDetentChange(stepDetent(detent, v > 0 ? -1 : 1));
      return;
    }
    onDetentChange(nearestDetent(height, vh));
  }, [dragHeight, detent, onDetentChange, onDismiss, reducedMotion]);

  const handleProps: BottomSheetHandleProps = {
    onPointerDown,
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: finish,
  };

  return {
    handleProps,
    dragging: dragHeight !== null,
    /** Inline height for the sheet; null while the CSS detent height applies. */
    heightPx: dragHeight,
  };
}
