/** Returns true when the back press was handled (do not exit the app). */
export type BackHandler = () => boolean;

const stack: BackHandler[] = [];

/** Register a handler; last registered is consulted first. Returns an unregister fn. */
export function registerBackHandler(handler: BackHandler): () => void {
  stack.push(handler);
  return () => {
    const index = stack.lastIndexOf(handler);
    if (index >= 0) stack.splice(index, 1);
  };
}

/** Run handlers from innermost (most recently registered) to outermost. */
export function consumeBackPress(): boolean {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i]()) return true;
  }
  return false;
}

/** Clear all handlers — used in tests or hard resets. */
export function resetBackHandlers(): void {
  stack.length = 0;
}
