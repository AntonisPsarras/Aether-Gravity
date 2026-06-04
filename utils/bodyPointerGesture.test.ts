import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreeEvent } from '@react-three/fiber';
import {
  BODY_DRAG_THRESHOLD_PX,
  BODY_LONG_PRESS_MS,
  cancelAllBodyPointerGestures,
  createBodyGestureController,
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
