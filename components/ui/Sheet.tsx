import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type SheetDetent } from '../../utils/store';
import {
  detentHeight,
  resolveSheetRelease,
} from '../../utils/sheetDetents';
import { useReducedMotion } from '../hooks/useReducedMotion';

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
  // `liveHeight` lives on the ref so pointerup can finish with the last move
  // even if React has not committed that state's render yet.
  const drag = useRef({
    active: false,
    startY: 0,
    startHeight: 0,
    lastY: 0,
    lastT: 0,
    velocity: 0,
    vh: 0,
    liveHeight: 0,
  });

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
    const startHeight = detentHeight(detent, vh);
    drag.current = {
      active: true,
      startY: e.clientY,
      startHeight,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      vh,
      liveHeight: startHeight,
    };
    setDragHeight(startHeight);
  }, [enabled, detent]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current.active) return;
    const dt = e.timeStamp - drag.current.lastT;
    if (dt > 0) drag.current.velocity = (e.clientY - drag.current.lastY) / dt;
    drag.current.lastY = e.clientY;
    drag.current.lastT = e.timeStamp;

    const vh = drag.current.vh;
    // Dragging down shrinks the sheet. A little rubber-band above `full`.
    const raw = drag.current.startHeight - (e.clientY - drag.current.startY);
    const max = detentHeight('full', vh);
    const height = raw > max ? max + (raw - max) * 0.25 : Math.max(0, raw);
    drag.current.liveHeight = height;
    setDragHeight(height);
  }, []);

  const finish = useCallback((e: React.PointerEvent) => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const height = drag.current.liveHeight;
    const vh = drag.current.vh;
    const velocity = drag.current.velocity;
    setDragHeight(null);

    const result = resolveSheetRelease({
      height,
      velocity,
      from: detent,
      vh,
      reducedMotion,
    });
    if (result.action === 'dismiss') {
      onDismiss();
      return;
    }
    onDetentChange(result.detent);
  }, [detent, onDetentChange, onDismiss, reducedMotion]);

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
