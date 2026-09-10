/**
 * The moon creator's in-progress draft.
 *
 * A separate store rather than a slice of `utils/store.ts`: it is read both by
 * the DOM panel and by the R3F preview inside the Canvas, it is meaningless
 * outside Moon mode, and it must never be saved with the world.
 *
 * Only user intent lives here. Limits, clamping and derived read-outs are
 * recomputed from the live physics bodies by `resolveMoonDraft`.
 */
import { create } from 'zustand';
import type { CelestialBody } from '../types';
import { getPhysicsBodiesSnapshot } from './physicsBridge';
import { useStore } from './store';
import { makeMoonTemplate, moonHostStatus, moonMassFor, type MoonDraftInput } from './moonCreation';

interface MoonDraftState extends MoonDraftInput {
  /** Transient explanation, e.g. why a tapped body cannot host a moon. */
  hint: string | null;
  /** True while the ghost-moon handle is being dragged. */
  dragging: boolean;
  /** Start a new session: default size, nothing picked. */
  begin: () => void;
  reset: () => void;
  /**
   * Change parent. Distance, speed and phase return to their defaults; the
   * chosen size is kept and re-clamped to what the new parent can hold.
   */
  setParent: (id: string | null) => void;
  patch: (p: Partial<Pick<MoonDraftInput, 'r' | 'f' | 'phase' | 'tiltDeg' | 'retrograde' | 'mass'>>) => void;
  setHint: (hint: string | null) => void;
  setDragging: (dragging: boolean) => void;
}

const INITIAL: MoonDraftInput & { hint: string | null; dragging: boolean } = {
  parentId: null,
  r: null,
  f: 1,
  phase: null,
  tiltDeg: 0,
  retrograde: false,
  mass: null,
  hint: null,
  dragging: false,
};

export const useMoonDraft = create<MoonDraftState>((set) => ({
  ...INITIAL,
  begin: () => set({ ...INITIAL }),
  reset: () => set({ ...INITIAL }),
  setParent: (parentId) => set({ parentId, r: null, f: 1, phase: null, hint: null }),
  patch: (p) => set(p),
  setHint: (hint) => set({ hint }),
  setDragging: (dragging) => set({ dragging }),
}));

/**
 * The live physics bodies. Store positions only sync on collision/evolution
 * events, so anything that places a moon relative to its parent must read the
 * physics array. Falls back to the store before the canvas has registered.
 */
export const getLiveBodies = (): readonly CelestialBody[] => {
  return getPhysicsBodiesSnapshot(useStore.getState().bodies);
};

/**
 * Try to make `id` the draft's parent. The single path for both the canvas tap
 * and the panel list. An ineligible body is not selected (so the camera does
 * not fly away from the moon in progress); its reason becomes the hint unless
 * `silent`.
 */
export const pickMoonParent = (id: string, { silent = false }: { silent?: boolean } = {}): boolean => {
  const bodies = getLiveBodies();
  const body = bodies.find((b) => b.id === id);
  if (!body) return false;
  const draft = useMoonDraft.getState();
  const status = moonHostStatus(
    body,
    makeMoonTemplate(body, moonMassFor(body, draft.mass)),
    bodies,
    useStore.getState().uiMode,
    draft.retrograde,
  );
  if (!status.ok) {
    if (!silent) draft.setHint(`${body.name}: ${status.reason}`);
    return false;
  }
  if (draft.parentId !== id) draft.setParent(id);
  else draft.setHint(null);
  useStore.getState().selectBody(id);
  return true;
};
