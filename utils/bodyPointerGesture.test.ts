import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreeEvent } from '@react-three/fiber';
import {
  BODY_DRAG_THRESHOLD_PX,
  BODY_LONG_PRESS_MS,
  cancelAllBodyPointerGestures,
  createBodyGestureController,
  createDomTapLongPress,
  type BodyGestureKind,
} from './bodyPointerGesture';

function makePointerEvent(
  type: 'down' | 'up' | 'out' | 'leave' | 'cancel',
  clientX: number,
  clientY: number,
  buttons = 0,
): ThreeEvent<PointerEvent> {
  return {
    clientX,
    clientY,
    buttons,
    stopPropagation: vi.fn(),
  } as unknown as ThreeEvent<PointerEvent>;
}

describe('createBodyGestureController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cancelAllBodyPointerGestures();
    vi.useRealTimers();
  });

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
});
