import { useCallback } from 'react';
import { useStore } from '../../utils/store';
import type { BodyGestureKind } from '../../utils/bodyPointerGesture';
import { detectIsTouch } from '../CanvasSetup';
import { hapticImpact } from '../../utils/haptics';

/**
 * Short haptic tick confirming a long press landed.
 *
 * Goes through utils/haptics (native haptics in the app, Web Vibration in a
 * browser). It lives here rather than in the gesture controller so that module
 * stays side-effect-free (and node-testable), and so the outliner rows get the
 * same confirmation for free.
 */
function pulseLongPress(): void {
  if (!detectIsTouch()) return;
  hapticImpact('light');
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
