import { useCallback, useEffect, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';

/** Screen-space movement above this cancels body tap / long-press (camera drag). */
export const BODY_DRAG_THRESHOLD_PX = 10;

/** Hold duration that opens the properties inspector. */
export const BODY_LONG_PRESS_MS = 500;

export type BodyGestureKind = 'tap' | 'longPress';

export type BodyPointerGestureHandlers = {
  onPointerDown: (e: ThreeEvent<PointerEvent>) => void;
  onPointerUp: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
  onPointerLeave: (e: ThreeEvent<PointerEvent>) => void;
  onPointerCancel: (e: ThreeEvent<PointerEvent>) => void;
};

type GestureState = {
  startX: number;
  startY: number;
  active: boolean;
  longPressFired: boolean;
  timerId: ReturnType<typeof setTimeout> | null;
};

const cancelRegistry = new Set<() => void>();

/** Cancels every in-flight body tap / long-press (e.g. canvas pointer-missed). */
export function cancelAllBodyPointerGestures(): void {
  cancelRegistry.forEach((cancel) => cancel());
}

function createInitialGestureState(): GestureState {
  return {
    startX: 0,
    startY: 0,
    active: false,
    longPressFired: false,
    timerId: null,
  };
}

type BodyGestureControllerOptions = {
  getBodyId: () => string;
  getCreationMode: () => boolean;
  onGesture: (bodyId: string, kind: BodyGestureKind) => void;
};

/** Pure gesture controller — shared by the hook and unit tests. */
export function createBodyGestureController({
  getBodyId,
  getCreationMode,
  onGesture,
}: BodyGestureControllerOptions) {
  const state: GestureState = createInitialGestureState();

  const clearLongPressTimer = () => {
    if (state.timerId != null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
  };

  const resetGesture = () => {
    clearLongPressTimer();
    state.startX = 0;
    state.startY = 0;
    state.active = false;
    state.longPressFired = false;
  };

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (getCreationMode()) {
      e.stopPropagation();
      return;
    }
    e.stopPropagation();
    resetGesture();

    state.active = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.longPressFired = false;
    state.timerId = setTimeout(() => {
      state.timerId = null;
      if (!state.active || getCreationMode()) return;
      state.longPressFired = true;
      onGesture(getBodyId(), 'longPress');
    }, BODY_LONG_PRESS_MS);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (getCreationMode()) {
      e.stopPropagation();
      resetGesture();
      return;
    }

    if (!state.active) {
      resetGesture();
      return;
    }

    e.stopPropagation();
    clearLongPressTimer();

    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const wasLongPress = state.longPressFired;
    resetGesture();

    if (wasLongPress) return;
    if (Math.hypot(dx, dy) > BODY_DRAG_THRESHOLD_PX) return;
    onGesture(getBodyId(), 'tap');
  };

  const cancelActiveGesture = (e?: ThreeEvent<PointerEvent>) => {
    if (e) e.stopPropagation();
    resetGesture();
  };

  const onPointerOut = (e: ThreeEvent<PointerEvent>) => {
    if (!state.active || e.buttons === 0) return;
    cancelActiveGesture(e);
  };

  const onPointerLeave = (e: ThreeEvent<PointerEvent>) => {
    if (!state.active || e.buttons === 0) return;
    cancelActiveGesture(e);
  };

  const onPointerCancel = (e: ThreeEvent<PointerEvent>) => {
    cancelActiveGesture(e);
  };

  return {
    onPointerDown,
    onPointerUp,
    onPointerOut,
    onPointerLeave,
    onPointerCancel,
    resetGesture,
  };
}

/** Minimal pointer shape the DOM detector needs — a React or native event. */
export type DomPointerLike = { clientX: number; clientY: number };

/**
 * DOM-event variant of the same tap / long-press detector, for list rows.
 *
 * The outliner used to re-implement this against DOM events with different
 * semantics: it measured elapsed time on pointer-**up** instead of firing a
 * timer, so a 600 ms hold that ended outside the row still counted as a long
 * press, and it never joined the cancel registry — meaning a canvas
 * pointer-missed could not cancel an in-flight row press. This shares the
 * thresholds, the timer semantics and the registry with the 3D hitbox path.
 */
export function createDomTapLongPress({
  getBodyId,
  onGesture,
}: {
  getBodyId: () => string;
  onGesture: (bodyId: string, kind: BodyGestureKind) => void;
}) {
  const state: GestureState = createInitialGestureState();

  const clearLongPressTimer = () => {
    if (state.timerId != null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
  };

  const resetGesture = () => {
    clearLongPressTimer();
    state.startX = 0;
    state.startY = 0;
    state.active = false;
    state.longPressFired = false;
  };

  const onPointerDown = (e: DomPointerLike) => {
    resetGesture();
    state.active = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.timerId = setTimeout(() => {
      state.timerId = null;
      if (!state.active) return;
      state.longPressFired = true;
      onGesture(getBodyId(), 'longPress');
    }, BODY_LONG_PRESS_MS);
  };

  const onPointerUp = (e: DomPointerLike) => {
    if (!state.active) {
      resetGesture();
      return;
    }
    clearLongPressTimer();
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const wasLongPress = state.longPressFired;
    resetGesture();

    if (wasLongPress) return;
    if (Math.hypot(dx, dy) > BODY_DRAG_THRESHOLD_PX) return;
    onGesture(getBodyId(), 'tap');
  };

  return { onPointerDown, onPointerUp, resetGesture };
}

/** React binding for `createDomTapLongPress`, wired into the cancel registry. */
export function useDomTapLongPress(
  bodyId: string,
  onGesture: (bodyId: string, kind: BodyGestureKind) => void,
) {
  const bodyIdRef = useRef(bodyId);
  bodyIdRef.current = bodyId;
  const onGestureRef = useRef(onGesture);
  onGestureRef.current = onGesture;

  const controllerRef = useRef<ReturnType<typeof createDomTapLongPress> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createDomTapLongPress({
      getBodyId: () => bodyIdRef.current,
      onGesture: (id, kind) => onGestureRef.current(id, kind),
    });
  }

  const reset = useCallback(() => controllerRef.current?.resetGesture(), []);

  useEffect(() => {
    cancelRegistry.add(reset);
    return () => {
      cancelRegistry.delete(reset);
      reset();
    };
  }, [reset]);

  const controller = controllerRef.current;
  return {
    onPointerDown: controller.onPointerDown,
    onPointerUp: controller.onPointerUp,
    onPointerCancel: reset,
  };
}

/**
 * Ref-backed pointer gesture hook for celestial body hitboxes.
 * Long-press fires from a pointerdown-only timer; all cancel paths clear it.
 */
export function useBodyPointerGesture(
  bodyId: string,
  creationMode: boolean,
  onGesture: (bodyId: string, kind: BodyGestureKind) => void,
): BodyPointerGestureHandlers {
  const onGestureRef = useRef(onGesture);
  onGestureRef.current = onGesture;

  const bodyIdRef = useRef(bodyId);
  bodyIdRef.current = bodyId;

  const creationModeRef = useRef(creationMode);
  creationModeRef.current = creationMode;

  const controllerRef = useRef<ReturnType<typeof createBodyGestureController> | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = createBodyGestureController({
      getBodyId: () => bodyIdRef.current,
      getCreationMode: () => creationModeRef.current,
      onGesture: (id, kind) => onGestureRef.current(id, kind),
    });
  }

  const resetGesture = useCallback(() => {
    controllerRef.current?.resetGesture();
  }, []);

  useEffect(() => {
    cancelRegistry.add(resetGesture);
    return () => {
      cancelRegistry.delete(resetGesture);
      resetGesture();
    };
  }, [resetGesture]);

  useEffect(() => {
    if (creationMode) {
      resetGesture();
    }
  }, [creationMode, resetGesture]);

  const controller = controllerRef.current;
  return {
    onPointerDown: controller.onPointerDown,
    onPointerUp: controller.onPointerUp,
    onPointerOut: controller.onPointerOut,
    onPointerLeave: controller.onPointerLeave,
    onPointerCancel: controller.onPointerCancel,
  };
}
