import type { MutableRefObject } from 'react';
import type { CelestialBody } from '../types';
import { sanitizeCelestialBody, sanitizeProperties } from './physicsBounds';
import { resetVerletCache } from './physicsSoA';

let bodiesRef: MutableRefObject<CelestialBody[]> | null = null;
const EMPTY: readonly CelestialBody[] = [];
export const registerPhysicsBodiesRef = (ref: MutableRefObject<CelestialBody[]>) => { bodiesRef = ref; };
export const unregisterPhysicsBodiesRef = (ref: MutableRefObject<CelestialBody[]>) => {
  if (bodiesRef === ref) bodiesRef = null;
};
/** An empty registered world is authoritative too. */
export const getPhysicsBodiesSnapshot = (fallback: readonly CelestialBody[] = EMPTY): readonly CelestialBody[] =>
  bodiesRef ? bodiesRef.current : fallback;

export const clonePhysicsBody = (b: CelestialBody): CelestialBody => ({
  ...b, position: b.position.clone(), velocity: b.velocity.clone(),
  properties: b.properties ? { ...b.properties } : undefined,
  orbit: b.orbit ? { ...b.orbit } : undefined,
});
export const patchPhysicsBody = (id: string, updates: Partial<CelestialBody>) => {
  const list = bodiesRef?.current;
  const index = list?.findIndex(b => b.id === id) ?? -1;
  if (!list || index < 0) return;
  const prev = list[index];
  const next = sanitizeCelestialBody({
    ...prev, ...updates,
    properties: updates.properties ? sanitizeProperties({ ...prev.properties, ...updates.properties }) : prev.properties,
  });
  const changedForce = next.mass !== prev.mass || next.radiusKm !== prev.radiusKm ||
    !next.position.equals(prev.position) || next.parentId !== prev.parentId || next.orbit !== prev.orbit ||
    next.properties?.physicalCollisions !== prev.properties?.physicalCollisions;
  Object.assign(prev, next);
  if (changedForce || updates.velocity) resetVerletCache();
};
export const replacePhysicsBodies = (bodies: readonly CelestialBody[]) => {
  resetVerletCache();
  if (bodiesRef) {
    const previous = new Map(bodiesRef.current.map(b => [b.id, b]));
    bodiesRef.current = bodies.map(b => {
      const next = sanitizeCelestialBody(clonePhysicsBody(b));
      const live = previous.get(b.id);
      return live ? Object.assign(live, next) : next;
    });
  }
};
export const appendPhysicsBody = (body: CelestialBody, fallback: readonly CelestialBody[] = EMPTY): CelestialBody[] => {
  const next = [...getPhysicsBodiesSnapshot(fallback), sanitizeCelestialBody(clonePhysicsBody(body))];
  resetVerletCache();
  if (bodiesRef) bodiesRef.current = next;
  return next;
};
