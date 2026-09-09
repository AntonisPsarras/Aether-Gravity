import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreeEvent } from '@react-three/fiber';
import {
  BODY_DRAG_THRESHOLD_PX,
  BODY_LONG_PRESS_MS,
  cancelAllBodyPointerGestures,
  createBodyGestureController,
  createDomTapLongPress,
  hasActiveBodyPointerGesture,
  wasBodyGestureJustReleased,
  type BodyGestureKind,
} from './bodyPointerGesture';

type PointerExtras = {
  pointerId?: number;
  pointerType?: string;
  isPrimary?: boolean;
};

function makePointerEvent(
  type: 'down' | 'move' | 'up' | 'out' | 'leave' | 'cancel',
  clientX: number,
  clientY: number,
  buttons = 0,
  extras: PointerExtras = {},
): ThreeEvent<PointerEvent> {
  return {
    clientX,
    clientY,
    buttons,
    stopPropagation: vi.fn(),
    ...extras,
  } as unknown as ThreeEvent<PointerEvent>;
}

describe('createBodyGestureController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  // `hasActiveBodyPointerGesture` is module-global, so a test that deliberately
  // leaves a press in flight must not leak it into the next one.
  let created: Array<{ resetGesture: () => void }> = [];

  afterEach(() => {
    cancelAllBodyPointerGestures();
    created.forEach((c) => c.resetGesture());
    created = [];
    vi.useRealTimers();
  });

  const makeController = (lifecycle: {
    onLongPressStart?: () => void;
    onPressEnd?: () => void;
  } = {}) => {
    const gestures: BodyGestureKind[] = [];
    const controller = createBodyGestureController({
      getBodyId: () => 'body-1',
      getCreationMode: () => false,
      onGesture: (_id, kind) => gestures.push(kind),
      ...lifecycle,
    });
    created.push(controller);
    return { controller, gestures };
  };

  it('fires tap on short press within drag threshold', () => {
    const gestures: BodyGestureKind[] = [];
    const controller = createBodyGestureController({
      getBodyId: () => 'body-1',
      getCreationMode: () => false,
      onGesture: (_id, kind) => gestures.push(kind),
    });

    controller.onPointerDown(makePointerEvent('down', 100, 100, 1));
    controller.onPointerUp(makePointerEvent('up', 104, 102));

    expect(gestures).toEqual(['tap']);
  });

  it('aborts tap when drag exceeds threshold', () => {
    const gestures: BodyGestureKind[] = [];
    const controller = createBodyGestureController({
      getBodyId: () => 'body-1',
      getCreationMode: () => false,
      onGesture: (_id, kind) => gestures.push(kind),
    });

    controller.onPointerDown(makePointerEvent('down', 100, 100, 1));
    controller.onPointerUp(
      makePointerEvent('up', 100 + BODY_DRAG_THRESHOLD_PX + 1, 100),
    );

    expect(gestures).toEqual([]);
  });

  it('fires longPress from pointerdown timer only', () => {
    const gestures: BodyGestureKind[] = [];
    const controller = createBodyGestureController({
      getBodyId: () => 'body-1',
      getCreationMode: () => false,
      onGesture: (_id, kind) => gestures.push(kind),
    });

    controller.onPointerDown(makePointerEvent('down', 50, 50, 1));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);

    expect(gestures).toEqual(['longPress']);

    controller.onPointerUp(makePointerEvent('up', 50, 50));
    expect(gestures).toEqual(['longPress']);
  });

  it('cancels long press when pointer leaves while held', () => {
    const gestures: BodyGestureKind[] = [];
    const controller = createBodyGestureController({
      getBodyId: () => 'body-1',
      getCreationMode: () => false,
      onGesture: (_id, kind) => gestures.push(kind),
    });

    controller.onPointerDown(makePointerEvent('down', 10, 10, 1));
    controller.onPointerLeave(makePointerEvent('leave', 40, 40, 1));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);
    controller.onPointerUp(makePointerEvent('up', 40, 40));

    expect(gestures).toEqual([]);
  });

  it('ignores gestures while creation mode is active', () => {
    let creationMode = true;
    const gestures: BodyGestureKind[] = [];
    const controller = createBodyGestureController({
      getBodyId: () => 'body-1',
      getCreationMode: () => creationMode,
      onGesture: (_id, kind) => gestures.push(kind),
    });

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    creationMode = false;
    controller.onPointerUp(makePointerEvent('up', 0, 0));

    expect(gestures).toEqual([]);
  });

  it('resetGesture clears pending long-press timer', () => {
    const gestures: BodyGestureKind[] = [];
    const controller = createBodyGestureController({
      getBodyId: () => 'body-1',
      getCreationMode: () => false,
      onGesture: (_id, kind) => gestures.push(kind),
    });

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    controller.resetGesture();
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);

    expect(gestures).toEqual([]);
  });

  // ── Movement during the hold ───────────────────────────────────────────────
  // The slop used to be checked only at pointerup, so a finger that landed on a
  // body and dragged to rotate the camera still fired longPress at the
  // threshold — opening the inspector mid-rotation.

  it('cancels the pending long press when movement crosses the slop mid-hold', () => {
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    vi.advanceTimersByTime(100);
    controller.onPointerMove(makePointerEvent('move', 0, BODY_DRAG_THRESHOLD_PX + 10, 1));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);
    controller.onPointerUp(makePointerEvent('up', 0, BODY_DRAG_THRESHOLD_PX + 10));

    expect(gestures).toEqual([]);
  });

  it('keeps the long press alive for jitter under the slop', () => {
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    controller.onPointerMove(makePointerEvent('move', 3, 3, 1));
    controller.onPointerMove(makePointerEvent('move', -2, 4, 1));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);

    expect(gestures).toEqual(['longPress']);
  });

  it('suppresses the tap when the pointer strayed and returned', () => {
    // Running maximum, not endpoint delta: a swing out and back is a camera
    // rotate, and an endpoint-only check scored it as a tap.
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    controller.onPointerMove(makePointerEvent('move', 0, 40, 1));
    controller.onPointerMove(makePointerEvent('move', 0, 2, 1));
    controller.onPointerUp(makePointerEvent('up', 0, 2));

    expect(gestures).toEqual([]);
  });

  // ── Pointer identity ───────────────────────────────────────────────────────

  it('cancels the active gesture when a non-primary pointer lands', () => {
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1, { pointerId: 1, isPrimary: true }));
    controller.onPointerDown(makePointerEvent('down', 90, 90, 1, { pointerId: 2, isPrimary: false }));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);

    expect(gestures).toEqual([]);
  });

  it('a second finger cancels an in-flight long press', () => {
    // Pinch-to-zoom starting over a planet used to open its inspector.
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1, { pointerId: 1 }));
    controller.onPointerDown(makePointerEvent('down', 80, 80, 1, { pointerId: 2 }));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);
    controller.onPointerUp(makePointerEvent('up', 80, 80, 0, { pointerId: 2 }));
    controller.onPointerUp(makePointerEvent('up', 0, 0, 0, { pointerId: 1 }));

    expect(gestures).toEqual([]);
  });

  it('ignores a pointerup from a different pointerId', () => {
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1, { pointerId: 1 }));
    controller.onPointerUp(makePointerEvent('up', 1, 1, 0, { pointerId: 2 }));
    expect(gestures).toEqual([]);

    controller.onPointerUp(makePointerEvent('up', 1, 1, 0, { pointerId: 1 }));
    expect(gestures).toEqual(['tap']);
  });

  it('emits a single tap when the mesh and window pointerup both arrive', () => {
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1, { pointerId: 3 }));
    controller.onPointerUp(makePointerEvent('up', 1, 1, 0, { pointerId: 3 }));
    controller.handleEnd(3, 1, 1);

    expect(gestures).toEqual(['tap']);
  });

  // ── Out / leave policy ─────────────────────────────────────────────────────

  it('does not cancel on pointerout for a touch pointer', () => {
    // Bodies orbit every physics frame, so the hitbox slides out from under a
    // perfectly stationary finger. That used to kill the hold.
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 10, 10, 1, { pointerType: 'touch' }));
    controller.onPointerOut(makePointerEvent('out', 12, 12, 1, { pointerType: 'touch' }));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);

    expect(gestures).toEqual(['longPress']);
  });

  it('still cancels on pointerout for a mouse pointer', () => {
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 10, 10, 1, { pointerType: 'mouse' }));
    controller.onPointerOut(makePointerEvent('out', 60, 60, 1, { pointerType: 'mouse' }));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);

    expect(gestures).toEqual([]);
  });

  // ── Cancel semantics ───────────────────────────────────────────────────────

  it('a pointercancel after the long press fired does not retract it', () => {
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);
    controller.onPointerCancel(makePointerEvent('cancel', 0, 0));

    expect(gestures).toEqual(['longPress']);
  });

  it('a pointercancel before the threshold suppresses the long press', () => {
    const { controller, gestures } = makeController();

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    vi.advanceTimersByTime(100);
    controller.onPointerCancel(makePointerEvent('cancel', 0, 0));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);

    expect(gestures).toEqual([]);
  });

  // ── Press lifecycle (OrbitControls interlock) ──────────────────────────────

  it('invokes onLongPressStart exactly once when the long press fires', () => {
    const onLongPressStart = vi.fn();
    const { controller } = makeController({ onLongPressStart });

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS * 3);

    expect(onLongPressStart).toHaveBeenCalledTimes(1);
  });

  it('balances onPressEnd once on pointerup, cancel and reset', () => {
    // A double restore of controls.enabled is exactly what would leave the
    // camera dead, so the counts matter more than the ordering alone.
    for (const finish of ['up', 'cancel', 'reset'] as const) {
      const onLongPressStart = vi.fn();
      const onPressEnd = vi.fn();
      const { controller } = makeController({ onLongPressStart, onPressEnd });

      controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
      vi.advanceTimersByTime(BODY_LONG_PRESS_MS);
      expect(onPressEnd, finish).not.toHaveBeenCalled();

      if (finish === 'up') controller.onPointerUp(makePointerEvent('up', 0, 0));
      if (finish === 'cancel') controller.onPointerCancel(makePointerEvent('cancel', 0, 0));
      if (finish === 'reset') controller.resetGesture();
      controller.resetGesture();

      expect(onPressEnd, finish).toHaveBeenCalledTimes(1);
      expect(onLongPressStart, finish).toHaveBeenCalledTimes(1);
    }
  });

  it('never fires onPressEnd for a press that did not reach the long press', () => {
    const onPressEnd = vi.fn();
    const { controller } = makeController({ onPressEnd });

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    controller.onPointerUp(makePointerEvent('up', 1, 1));

    expect(onPressEnd).not.toHaveBeenCalled();
  });

  // ── Pointer-missed interlock ───────────────────────────────────────────────

  it('hasActiveBodyPointerGesture reflects an in-flight press', () => {
    const { controller } = makeController();

    expect(hasActiveBodyPointerGesture()).toBe(false);
    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    expect(hasActiveBodyPointerGesture()).toBe(true);
    controller.onPointerUp(makePointerEvent('up', 0, 0));
    expect(hasActiveBodyPointerGesture()).toBe(false);
  });

  it('wasBodyGestureJustReleased covers the pointer-missed dispatch task', async () => {
    const { controller } = makeController();

    controller.onPointerDown(makePointerEvent('down', 0, 0, 1));
    controller.onPointerUp(makePointerEvent('up', 0, 0));
    expect(wasBodyGestureJustReleased()).toBe(true);

    await Promise.resolve();
    expect(wasBodyGestureJustReleased()).toBe(false);
  });
});

describe('createDomTapLongPress', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  const run = () => {
    const gestures: BodyGestureKind[] = [];
    const c = createDomTapLongPress({
      getBodyId: () => 'row-1',
      onGesture: (_id, kind) => gestures.push(kind),
    });
    return { c, gestures };
  };

  it('fires a tap for a short, stationary press', () => {
    const { c, gestures } = run();
    c.onPointerDown({ clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(100);
    c.onPointerUp({ clientX: 10, clientY: 10 });
    expect(gestures).toEqual(['tap']);
  });

  it('fires the long press from a timer, not on release', () => {
    // The previous outliner measured elapsed time on pointerup, so a hold that
    // ended elsewhere still counted. The timer fires while the finger is down.
    const { c, gestures } = run();
    c.onPointerDown({ clientX: 10, clientY: 10 });
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);
    expect(gestures).toEqual(['longPress']);
    c.onPointerUp({ clientX: 10, clientY: 10 });
    expect(gestures).toEqual(['longPress']);
  });

  it('does not double-fire at exactly the long-press boundary', () => {
    const { c, gestures } = run();
    c.onPointerDown({ clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);
    c.onPointerUp({ clientX: 0, clientY: 0 });
    expect(gestures).toEqual(['longPress']);
  });

  it('suppresses the tap when the pointer moved past the drag threshold', () => {
    const { c, gestures } = run();
    c.onPointerDown({ clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(50);
    c.onPointerUp({ clientX: BODY_DRAG_THRESHOLD_PX + 5, clientY: 0 });
    expect(gestures).toEqual([]);
  });

  it('still taps for movement inside the threshold', () => {
    const { c, gestures } = run();
    c.onPointerDown({ clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(50);
    c.onPointerUp({ clientX: BODY_DRAG_THRESHOLD_PX - 1, clientY: 0 });
    expect(gestures).toEqual(['tap']);
  });

  it('resetGesture cancels a pending long press', () => {
    const { c, gestures } = run();
    c.onPointerDown({ clientX: 0, clientY: 0 });
    c.resetGesture();
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS * 2);
    c.onPointerUp({ clientX: 0, clientY: 0 });
    expect(gestures).toEqual([]);
  });

  it('ignores a pointerup with no matching pointerdown', () => {
    const { c, gestures } = run();
    c.onPointerUp({ clientX: 0, clientY: 0 });
    expect(gestures).toEqual([]);
  });

  it('cancels the long press when the row is scrolled past the slop', () => {
    const { c, gestures } = run();
    c.onPointerDown({ clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(100);
    c.onPointerMove({ clientX: 0, clientY: BODY_DRAG_THRESHOLD_PX + 6 });
    vi.advanceTimersByTime(BODY_LONG_PRESS_MS);
    c.onPointerUp({ clientX: 0, clientY: BODY_DRAG_THRESHOLD_PX + 6 });
    expect(gestures).toEqual([]);
  });

  it('suppresses the tap when the row press strayed and returned', () => {
    const { c, gestures } = run();
    c.onPointerDown({ clientX: 0, clientY: 0 });
    c.onPointerMove({ clientX: 0, clientY: 40 });
    c.onPointerMove({ clientX: 0, clientY: 1 });
    c.onPointerUp({ clientX: 0, clientY: 1 });
    expect(gestures).toEqual([]);
  });
});
