/**
 * Schedules work after two animation frames (post-layout / post-commit).
 * Returns a cancel function that prevents the callback and clears pending rAFs.
 */
export function deferDoubleFrame(callback: () => void): () => void {
  let cancelled = false;
  let outerFrame = 0;
  let innerFrame = 0;

  outerFrame = requestAnimationFrame(() => {
    innerFrame = requestAnimationFrame(() => {
      if (!cancelled) callback();
    });
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(outerFrame);
    cancelAnimationFrame(innerFrame);
  };
}

/**
 * Tracks a single pending rAF; cancel replaces any in-flight frame.
 * Use for retry loops that must not run after unmount.
 */
export function createRafScheduler() {
  let cancelled = false;
  let pendingId = 0;

  const cancel = () => {
    cancelled = true;
    if (pendingId) {
      cancelAnimationFrame(pendingId);
      pendingId = 0;
    }
  };

  const schedule = (fn: () => void) => {
    if (cancelled) return;
    if (pendingId) cancelAnimationFrame(pendingId);
    pendingId = requestAnimationFrame(() => {
      pendingId = 0;
      if (!cancelled) fn();
    });
  };

  return { schedule, cancel, isCancelled: () => cancelled };
}
