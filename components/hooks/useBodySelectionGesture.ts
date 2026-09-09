import { useCallback } from 'react';
import { useStore } from '../../utils/store';
import type { BodyGestureKind } from '../../utils/bodyPointerGesture';
import { detectIsTouch } from '../CanvasSetup';

/**
 * Short haptic tick confirming a long press landed.
 *
 * Web Vibration API — no new dependency, present in Android WebView, silently
 * absent on iOS and desktop. It lives here rather than in the gesture
 * controller so that module stays side-effect-free (and node-testable), and so
 * the outliner rows get the same confirmation for free.
 */
function pulseLongPress(): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  if (!detectIsTouch()) return;
  try {
    navigator.vibrate(12);
  } catch {
    // Blocked by a permissions policy or an OEM build — feedback is optional.
  }
}

/**
 * Maps a tap / long-press on a body to selection and inspector state.
 *
 * Tap selects (and closes an inspector that is showing something else);
 * long-press selects and opens the inspector. This mapping is shared by the
 * 3D canvas and the outliner list so the two can never drift apart — they were
 * previously two byte-identical copies.
 *
 * Camera motion is deliberately *not* triggered here: `<CameraFlyTo>` watches
 * `selectedId`, so every route into a selection — canvas, outliner, or a future
 * one — gets the same easing for free.
 */
export function useBodySelectionGesture(): (id: string, kind: BodyGestureKind) => void {
  const selectBody = useStore((s) => s.selectBody);
  const openInspector = useStore((s) => s.openInspector);
  const closeInspector = useStore((s) => s.closeInspector);

  return useCallback((id: string, kind: BodyGestureKind) => {
    if (kind === 'longPress') {
      pulseLongPress();
      selectBody(id);
      openInspector(id);
      return;
    }
    selectBody(id);
    const { inspectorBodyId } = useStore.getState();
    if (inspectorBodyId && inspectorBodyId !== id) {
      closeInspector();
    }
  }, [selectBody, openInspector, closeInspector]);
}
