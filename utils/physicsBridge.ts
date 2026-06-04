import type { MutableRefObject } from 'react';

import { CelestialBody } from '../types';

import { sanitizeCelestialBody, sanitizeProperties } from './physicsBounds';



/** Live physics array — registered by SpaceCanvas so inspector edits apply immediately. */

let bodiesRef: MutableRefObject<CelestialBody[]> | null = null;



export const registerPhysicsBodiesRef = (ref: MutableRefObject<CelestialBody[]>) => {

  bodiesRef = ref;

};



export const unregisterPhysicsBodiesRef = (ref: MutableRefObject<CelestialBody[]>) => {

  if (bodiesRef === ref) bodiesRef = null;

};

/** Read-only access to the live physics array for render-only consumers. */
export const getPhysicsBodiesSnapshot = (): readonly CelestialBody[] =>
  bodiesRef?.current ?? [];



const cloneBody = (b: CelestialBody): CelestialBody => ({

  ...b,

  position: b.position.clone(),

  velocity: b.velocity.clone(),

  properties: b.properties ? { ...b.properties } : b.properties,

});



const mergeAndSanitize = (prev: CelestialBody, updates: Partial<CelestialBody>): CelestialBody =>

  sanitizeCelestialBody({

    ...prev,

    ...updates,

    properties: updates.properties

      ? sanitizeProperties({ ...prev.properties, ...updates.properties })

      : prev.properties,

    position: updates.position ?? prev.position,

    velocity: updates.velocity ?? prev.velocity,

  });



export const patchPhysicsBody = (id: string, updates: Partial<CelestialBody>) => {

  const list = bodiesRef?.current;

  if (!list) return;

  const idx = list.findIndex((b) => b.id === id);

  if (idx === -1) return;

  list[idx] = mergeAndSanitize(list[idx], updates);

};



/** Mirror store bodies into the live physics array after inspector edits. */

export const replacePhysicsBodies = (bodies: CelestialBody[]) => {

  if (!bodiesRef) return;

  bodiesRef.current = bodies.map((b) => sanitizeCelestialBody(cloneBody(b)));

};

/** Append one sanitized body to the live physics array (preserves in-flight positions). */
export const appendPhysicsBody = (body: CelestialBody): CelestialBody[] => {
  const sanitized = sanitizeCelestialBody(cloneBody(body));
  if (!bodiesRef) return [sanitized];
  const next = bodiesRef.current.map(cloneBody);
  next.push(sanitized);
  bodiesRef.current = next;
  return next;
};


