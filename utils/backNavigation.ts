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

/* ─── Simulation back-stack policy ─────────────────────────────────────────
   The whole in-simulation chain lives in one handler (registered by App.tsx)
   rather than one per panel: this stack is LIFO, so per-panel handlers would
   make the priority order depend on mount order, which is neither stable nor
   obvious once two sheets can be open at once. Keeping the policy here as a
   pure function makes the ordering testable.
────────────────────────────────────────────────────────────────────────────*/

export type SimBackState = {
  storageNotice: boolean;
  confirmOpen: boolean;
  helperOpen: boolean;
  creationMode: boolean;
  /** Phone tiers get sheet detents; wider layouts have none. */
  isPhone: boolean;
  inspectorOpen: boolean;
  /** 'peek' | 'half' | 'full' — only meaningful when isPhone. */
  inspectorDetent: string;
  outlinerOpen: boolean;
  hasSelection: boolean;
};

export type SimBackAction =
  | 'dismissNotice'
  | 'cancelConfirm'
  | 'dismissHelper'
  | 'exitCreationMode'
  | 'collapseInspector'
  | 'closeOutliner'
  | 'closeInspector'
  | 'clearSelection'
  | 'returnToMenu';

const DETENT_ORDER = ['peek', 'half', 'full'];

/** The detent one step down, or null when already at the smallest. */
export function detentBelowName(detent: string): string | null {
  const i = DETENT_ORDER.indexOf(detent);
  return i > 0 ? DETENT_ORDER[i - 1] : null;
}

/**
 * What a back press should do, given the current UI state.
 *
 * Note what is deliberately absent: collapsible inspector sections. Making
 * them back-stack participants would be an unbounded, invisible sink — leaving
 * the inspector could take arbitrarily many presses depending on how many
 * sections happened to be open.
 */
export function resolveSimBackAction(state: SimBackState): SimBackAction {
  if (state.storageNotice) return 'dismissNotice';
  if (state.confirmOpen) return 'cancelConfirm';
  if (state.helperOpen) return 'dismissHelper';
  if (state.creationMode) return 'exitCreationMode';
  if (state.isPhone && state.inspectorOpen && detentBelowName(state.inspectorDetent)) {
    return 'collapseInspector';
  }
  if (state.isPhone && state.outlinerOpen) return 'closeOutliner';
  if (state.inspectorOpen) return 'closeInspector';
  if (state.hasSelection) return 'clearSelection';
  return 'returnToMenu';
}
