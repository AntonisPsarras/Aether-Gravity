import { createContext, useContext } from 'react';
import type { CelestialBody } from '../../types';

type Props = NonNullable<CelestialBody['properties']>;

/**
 * Everything a section needs from the panel, passed by context so sections do
 * not prop-drill a dozen callbacks.
 *
 * `lockFields` / `unlockFields` are the edit-lock protocol: while a control is
 * being dragged, the named fields are protected from the physics→store sync so
 * the value cannot be overwritten mid-edit. Every editable control must call
 * them from `onEditStart` / `onEditEnd`.
 */
export interface InspectorCtx {
  body: CelestialBody;
  parent: CelestialBody | null;
  props: Props;
  updateBody: (id: string, updates: Partial<CelestialBody>) => void;
  setProp: <K extends keyof Props>(key: K, value: Props[K]) => void;
  lockFields: (fields: readonly string[]) => void;
  unlockFields: (fields: readonly string[]) => void;
  /** Convenience wrappers around the `['properties']` lock set. */
  propEditStart: () => void;
  propEditEnd: () => void;
  /**
   * Whether a field id from `utils/inspectorSections.ts` should be rendered in
   * the active presentation mode. Sections own their JSX, so the `audience`
   * metadata can only take effect if each advanced control asks this first.
   * Display-only: a hidden field's value is untouched and returns on switch.
   */
  showField: (fieldId: string) => boolean;
}

/** Field groups protected while the matching control is being edited. */
export const LOCK_SETS = {
  physical: ['mass', 'radius', 'properties', 'composition'],
  props: ['properties'],
  composition: ['composition', 'radius', 'properties'],
  temperature: ['temperature', 'color', 'properties'],
  orbit: ['position', 'velocity'],
} as const;

const Ctx = createContext<InspectorCtx | null>(null);
export const InspectorProvider = Ctx.Provider;

export function useInspectorCtx(): InspectorCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('Inspector sections must render inside an InspectorProvider');
  return ctx;
}
