import type { MutableRefObject } from 'react';
import type { CelestialBody } from '../types';
import { sanitizeCelestialBody } from './physicsBounds';
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
