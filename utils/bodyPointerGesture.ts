import { useCallback, useEffect, useRef } from 'react';
import type { ThreeEvent } from '@react-three/fiber';

/** Screen-space movement above this cancels body tap / long-press (camera drag). */
export const BODY_DRAG_THRESHOLD_PX = 10;

/**
 * Hold duration that opens the properties inspector.
 *
 * Deliberately below Android's `ViewConfiguration.getLongPressTimeout()` (500ms):
 * at 500 we raced the WebView's own text-selection / callout hold, which emits a
 * `pointercancel` that silently killed the gesture. Resolving first is the second
 * line of defence behind the `-webkit-touch-callout` / `contextmenu` suppression
 * on the canvas (index.css + SpaceCanvas's sim-canvas wrapper).
 */
export const BODY_LONG_PRESS_MS = 400;

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
  /**
   * Which finger owns this gesture. Without it a second `pointerdown` (a pinch)
   * re-armed the timer at the new finger's coordinates and either finger's
   * `pointerup` closed the gesture — so pinch-zooming over a planet opened it.
   */
  pointerId: number | null;
  /** From the `pointerdown`; drives the touch-vs-mouse out/leave policy below. */
  pointerType: string;
  /**
   * Running *maximum* distance from the press origin, not the instantaneous
   * displacement. A finger that swings 40px out and returns to within the slop
   * by release is a camera rotate, not a tap, and an endpoint-only check scored
   * it as a tap.
   */
  maxMovePx: number;
  /** True once `onLongPressStart` ran, so `onPressEnd` fires exactly once. */
  pressStarted: boolean;
};

const cancelRegistry = new Set<() => void>();

/**
 * Controllers with a press in flight. A Set rather than a counter so a double
 * `resetGesture` (every exit path funnels through it) cannot underflow.
 */
const activeGestures = new Set<object>();

let justReleased = false;

/** Cancels every in-flight body tap / long-press (e.g. canvas pointer-missed). */
export function cancelAllBodyPointerGestures(): void {
  cancelRegistry.forEach((cancel) => cancel());
}

/** True while a finger is down on a body hitbox. */
export function hasActiveBodyPointerGesture(): boolean {
  return activeGestures.size > 0;
}

/**
 * True for the remainder of the task in which a body gesture was released.
 *
 * R3F dispatches `onPointerMissed` in the same task as the DOM `pointerup`, so
 * a release that drifted off a moving body used to land on the canvas handler,
 * which cleared the selection and closed the inspector the press had just
 * opened. A microtask window is enough to cover that dispatch without leaving a
 * flag set long enough to swallow a genuine tap-on-empty-space.
 */
export function wasBodyGestureJustReleased(): boolean {
  return justReleased;
}

function markJustReleased(): void {
  justReleased = true;
  queueMicrotask(() => {
    justReleased = false;
  });
}

function createInitialGestureState(): GestureState {
  return {
    startX: 0,
    startY: 0,
    active: false,
    longPressFired: false,
    timerId: null,
    pointerId: null,
    pointerType: '',
    maxMovePx: 0,
    pressStarted: false,
  };
}

/** Touch and pen pointers are implicitly captured; mouse pointers are not. */
function isImplicitlyCaptured(pointerType: string): boolean {
  return pointerType === 'touch' || pointerType === 'pen';
}

type BodyGestureControllerOptions = {
  getBodyId: () => string;
  getCreationMode: () => boolean;
  onGesture: (bodyId: string, kind: BodyGestureKind) => void;
  /** Fired when a press begins — the hook uses it to attach window listeners. */
  onGestureStart?: () => void;
  /** Fired when an active press terminates, by any path. Detaches them again. */
  onGestureEnd?: () => void;
  /** Fired at the instant `longPress` dispatches (OrbitControls interlock). */
  onLongPressStart?: () => void;
  /** Balances `onLongPressStart` exactly once, on every exit path. */
  onPressEnd?: () => void;
};

/** Pure gesture controller — shared by the hook and unit tests. */
export function createBodyGestureController({
  getBodyId,
  getCreationMode,
  onGesture,
  onGestureStart,
  onGestureEnd,
  onLongPressStart,
  onPressEnd,
}: BodyGestureControllerOptions) {
  const state: GestureState = createInitialGestureState();
  /** Identity token for the module-level active set. */
  const token = {};

  const clearLongPressTimer = () => {
    if (state.timerId != null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
  };

  const resetGesture = () => {
    clearLongPressTimer();
    const wasActive = state.active;
    const hadPressStarted = state.pressStarted;

    activeGestures.delete(token);
    state.startX = 0;
    state.startY = 0;
    state.active = false;
    state.longPressFired = false;
    state.pointerId = null;
    state.pointerType = '';
    state.maxMovePx = 0;
    state.pressStarted = false;

    if (hadPressStarted) onPressEnd?.();
    if (wasActive) onGestureEnd?.();
  };

  /** True when this event belongs to the finger that owns the active gesture. */
  const owns = (pointerId: number): boolean =>
    state.active && state.pointerId === pointerId;

  const begin = (
    pointerId: number,
    x: number,
    y: number,
    pointerType: string,
    isPrimary: boolean,
  ) => {
    if (getCreationMode()) return;

    // A second finger, or a non-primary pointer, means a pinch / dolly-pan is
    // starting. Kill the in-flight press rather than ignoring the new pointer.
    if (!isPrimary || (state.active && state.pointerId !== pointerId)) {
      resetGesture();
      return;
    }

    resetGesture();

    state.active = true;
    state.startX = x;
    state.startY = y;
    state.pointerId = pointerId;
    state.pointerType = pointerType;
    state.maxMovePx = 0;
    state.longPressFired = false;
    activeGestures.add(token);

    state.timerId = setTimeout(() => {
      state.timerId = null;
      if (!state.active || getCreationMode()) return;
      state.longPressFired = true;
      state.pressStarted = true;
      onLongPressStart?.();
      onGesture(getBodyId(), 'longPress');
    }, BODY_LONG_PRESS_MS);

    onGestureStart?.();
  };

  const move = (pointerId: number, x: number, y: number) => {
    if (!owns(pointerId)) return;
    const travelled = Math.hypot(x - state.startX, y - state.startY);
    if (travelled > state.maxMovePx) state.maxMovePx = travelled;
    // Past the slop this is a camera drag. Drop the pending long press now
    // instead of letting it fire mid-rotation; the press stays active so the
    // release still counts as "owned by a body" for the pointer-missed guard.
    if (state.maxMovePx > BODY_DRAG_THRESHOLD_PX) clearLongPressTimer();
  };

  const end = (pointerId: number, x: number, y: number) => {
    if (getCreationMode()) {
      resetGesture();
      return;
    }
    if (!owns(pointerId)) return;

    clearLongPressTimer();

    const travelled = Math.hypot(x - state.startX, y - state.startY);
    const maxMove = Math.max(state.maxMovePx, travelled);
    const wasLongPress = state.longPressFired;
    resetGesture();
    markJustReleased();

    if (wasLongPress) return;
    if (maxMove > BODY_DRAG_THRESHOLD_PX) return;
    onGesture(getBodyId(), 'tap');
  };

  const cancel = (pointerId?: number) => {
    if (pointerId != null && state.active && state.pointerId !== pointerId) return;
    resetGesture();
  };

  // ── ThreeEvent adapters ───────────────────────────────────────────────────
  // `?? 0` keeps synthetic test events (which carry no pointerId) on a single
  // consistent id; `!== false` treats an absent `isPrimary` as primary.
  const idOf = (e: ThreeEvent<PointerEvent>) => (e as { pointerId?: number }).pointerId ?? 0;
  const typeOf = (e: ThreeEvent<PointerEvent>) => (e as { pointerType?: string }).pointerType ?? '';

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (getCreationMode()) return;
    begin(idOf(e), e.clientX, e.clientY, typeOf(e), (e as { isPrimary?: boolean }).isPrimary !== false);
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    move(idOf(e), e.clientX, e.clientY);
  };

  const onPointerUp = (e: ThreeEvent<PointerEvent>) => {
    if (getCreationMode()) {
      e.stopPropagation();
      resetGesture();
      return;
    }
    if (!owns(idOf(e))) {
      // Not our finger, or nothing in flight — do not swallow the event.
      if (!state.active) resetGesture();
      return;
    }
    e.stopPropagation();
    end(idOf(e), e.clientX, e.clientY);
  };

  /**
   * Out / leave policy.
   *
   * For touch and pen this is ignored outright. Bodies orbit every physics
   * frame, so a hitbox slides out from under a perfectly stationary finger and
   * R3F emits `pointerout` — which used to cancel the hold. (The old
   * `e.buttons === 0` guard did not save it: on touch `buttons` is 1 while
   * down.) That was the dominant "long press does nothing" case on small or
   * fast-moving bodies. For implicitly-captured pointers the authoritative
   * cancels are the window-level movement slop and `pointercancel`.
   *
   * Mouse pointers keep the old behaviour: leaving the mesh with a button held
   * really is the user dragging away.
   */
  const onPointerOutOrLeave = (e: ThreeEvent<PointerEvent>) => {
    if (!state.active) return;
    const pointerType = state.pointerType || typeOf(e);
    if (isImplicitlyCaptured(pointerType)) return;
    if (e.buttons === 0) return;
    e.stopPropagation();
    resetGesture();
  };

  const onPointerCancel = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    // A cancel arriving after the long press already dispatched cannot retract
    // it — `resetGesture` just tears down, it never un-fires `onGesture`.
    cancel(idOf(e));
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerOut: onPointerOutOrLeave,
    onPointerLeave: onPointerOutOrLeave,
    onPointerCancel,
    resetGesture,
    // Raw primitives for the window-level listeners in `useBodyPointerGesture`.
    handleMove: move,
    handleEnd: end,
    handleCancel: cancel,
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
    state.maxMovePx = 0;
  };

  const onPointerDown = (e: DomPointerLike) => {
    resetGesture();
    state.active = true;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.maxMovePx = 0;
    state.timerId = setTimeout(() => {
      state.timerId = null;
      if (!state.active) return;
      state.longPressFired = true;
      onGesture(getBodyId(), 'longPress');
    }, BODY_LONG_PRESS_MS);
  };

  /** Lets a hold that turns into a list scroll drop its pending long press. */
  const onPointerMove = (e: DomPointerLike) => {
    if (!state.active) return;
    const travelled = Math.hypot(e.clientX - state.startX, e.clientY - state.startY);
    if (travelled > state.maxMovePx) state.maxMovePx = travelled;
    if (state.maxMovePx > BODY_DRAG_THRESHOLD_PX) clearLongPressTimer();
  };

  const onPointerUp = (e: DomPointerLike) => {
    if (!state.active) {
      resetGesture();
      return;
    }
    clearLongPressTimer();
    const travelled = Math.hypot(e.clientX - state.startX, e.clientY - state.startY);
    const maxMove = Math.max(state.maxMovePx, travelled);
    const wasLongPress = state.longPressFired;
    resetGesture();

    if (wasLongPress) return;
    if (maxMove > BODY_DRAG_THRESHOLD_PX) return;
    onGesture(getBodyId(), 'tap');
  };

  return { onPointerDown, onPointerMove, onPointerUp, resetGesture };
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
    onPointerMove: controller.onPointerMove,
    onPointerUp: controller.onPointerUp,
    onPointerCancel: reset,
  };
}

export type BodyPressLifecycle = {
  onLongPressStart?: () => void;
  onPressEnd?: () => void;
};

/**
 * Ref-backed pointer gesture hook for celestial body hitboxes.
 *
 * The mesh handlers alone are not enough. R3F only delivers `onPointerMove` and
 * `onPointerUp` to a mesh while the ray still intersects it, which is exactly
 * backwards for a gesture whose job is to notice the finger *leaving* — and it
 * meant a release that drifted off a moving body was lost to `onPointerMissed`.
 * So the press also listens on `window` for the duration, and the mesh handlers
 * stay as a redundant (idempotent, pointer-id guarded) path.
 *
 * Pointer capture on `gl.domElement` would not help: capture redirects raw DOM
 * events, but R3F's mesh handlers are raycast-driven, so it would not restore
 * mesh delivery.
 */
export function useBodyPointerGesture(
  bodyId: string,
  creationMode: boolean,
  onGesture: (bodyId: string, kind: BodyGestureKind) => void,
  lifecycle?: BodyPressLifecycle,
): BodyPointerGestureHandlers {
  const onGestureRef = useRef(onGesture);
  onGestureRef.current = onGesture;

  const bodyIdRef = useRef(bodyId);
  bodyIdRef.current = bodyId;

  const creationModeRef = useRef(creationMode);
  creationModeRef.current = creationMode;

  const lifecycleRef = useRef(lifecycle);
  lifecycleRef.current = lifecycle;

  const detachRef = useRef<(() => void) | null>(null);

  const controllerRef = useRef<ReturnType<typeof createBodyGestureController> | null>(null);
  if (!controllerRef.current) {
    const attach = () => {
      if (typeof window === 'undefined') return;
      detachRef.current?.();

      const onMove = (e: PointerEvent) =>
        controllerRef.current?.handleMove(e.pointerId, e.clientX, e.clientY);
      const onUp = (e: PointerEvent) =>
        controllerRef.current?.handleEnd(e.pointerId, e.clientX, e.clientY);
      const onCancel = (e: PointerEvent) => controllerRef.current?.handleCancel(e.pointerId);
      const onLost = () => controllerRef.current?.handleCancel();

      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerup', onUp, { passive: true });
      window.addEventListener('pointercancel', onCancel, { passive: true });
      window.addEventListener('blur', onLost);
      document.addEventListener('visibilitychange', onLost);

      detachRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        window.removeEventListener('blur', onLost);
        document.removeEventListener('visibilitychange', onLost);
        detachRef.current = null;
      };
    };

    controllerRef.current = createBodyGestureController({
      getBodyId: () => bodyIdRef.current,
      getCreationMode: () => creationModeRef.current,
      onGesture: (id, kind) => onGestureRef.current(id, kind),
      onGestureStart: attach,
      onGestureEnd: () => detachRef.current?.(),
      onLongPressStart: () => lifecycleRef.current?.onLongPressStart?.(),
      onPressEnd: () => lifecycleRef.current?.onPressEnd?.(),
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
      detachRef.current?.();
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
