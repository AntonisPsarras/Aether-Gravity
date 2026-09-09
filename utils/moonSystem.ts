/**
 * Hierarchical satellites ("moons") propagated on Kepler rails.
 *
 * A body with a `parentId` and `orbit` is removed from the N-body sum and
 * instead placed each frame at its parent's live position plus an analytic
 * Kepler offset. This is what makes moons feasible at all:
 *
 *  - Cost is O(1) per moon instead of O(N), so a dozen moons are free. The
 *    Solar System preset runs 10 bodies through the pair loop, not 22.
 *  - Stability no longer depends on the timestep. The Moon's 27-day period
 *    would need a ~50x smaller global dt to integrate directly, which would
 *    slow the entire simulation for every user.
 *  - Displayed elements and periods are exact rather than integrated.
 *
 * What is given up: moons exert no force on anything, and cannot be
 * chaotically ejected. `promoteEscapedMoons` converts a moon back into a full
 * N-body body when that approximation stops holding — its parent is gone, or
 * it has been pushed outside the parent's Hill sphere.
 *
 * ── Render sub-scale ────────────────────────────────────────────────────────
 * Bodies are drawn ~1470x larger than life. At true scale the Moon's orbit
 * (60 Earth radii) would sit 24x *inside* Earth's drawn sphere, and Phobos
 * (2.8 Mars radii) far deeper still. Moon orbits are therefore drawn through
 * `moonOrbitRenderScale`, which maps the true orbit into the same exaggerated
 * frame as the parent's radius, preserving the real orbit-to-parent-radius
 * ratio on screen. Physics, reported elements and reported periods all use the
 * true values; only the drawn separation is scaled.
 */

import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { G_AETHER, kmToDist, visualRadiusFromKm } from './units';
import { visualScaleFor, bodyVisualRadius, type UiMode } from './displayMode';
import {
  elementsFromState,
  gravitationalParameter,
  meanMotion,
  periodFromElements,
  propagateOrbit,
} from './keplerOrbit';

/** Scratch state — module scope so the per-frame path allocates nothing. */
const _relPos = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _elementScratch = {
  h: new THREE.Vector3(),
  e: new THREE.Vector3(),
  n: new THREE.Vector3(),
};

/** True if this body is propagated analytically rather than by the integrator. */
export const isSatellite = (b: CelestialBody): boolean =>
  !!b.parentId && !!b.orbit && b.orbit.a > 0;

/**
 * Ratio by which a satellite's true orbital radius is inflated for rendering,
 * so that its orbit stays outside the parent's exaggerated sphere.
 *
 * It is exactly the parent's own radius exaggeration — drawn radius divided by
 * true radius in the same units — so a moon that really sits at 60 parent
 * radii is drawn at 60 parent radii.
 */
export const moonOrbitRenderScale = (parent: CelestialBody, mode: UiMode = 'advanced', satellite?: CelestialBody): number => {
  if (satellite?.properties?.presetId && satellite.type !== 'Moon') return 1;
  const trueRadiusUnits = kmToDist(parent.radiusKm);
  if (!(trueRadiusUnits > 0)) return 1;
  if (parent.properties?.presetId) return bodyVisualRadius(parent, mode) / trueRadiusUnits;
  const drawn = parent.radius || visualRadiusFromKm(parent.type, parent.radiusKm);
  // Beginner Mode draws the parent larger, so the orbit has to inflate by the
  // same factor or the moon would be swallowed by its parent's sphere. The
  // orbit-to-parent-radius ratio on screen is unchanged either way.
  return (drawn / trueRadiusUnits) * visualScaleFor(mode, parent.type);
};

/**
 * Advance every satellite to simulation time `t`, writing true world positions
 * and velocities. Call once per physics frame, after the N-body step.
 *
 * Parents are resolved through `byId`; a satellite whose parent is missing is
 * left untouched for `promoteEscapedMoons` to deal with.
 */
export const propagateSatellites = (
  bodies: CelestialBody[],
  byId: Map<string, CelestialBody>,
  t: number,
): void => {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!isSatellite(b)) continue;
    const parent = byId.get(b.parentId!);
    if (!parent) continue;

    const mu = gravitationalParameter(parent.mass, b.mass);
    propagateOrbit(b.orbit!, mu, t, _relPos, _relVel);

    b.position.copy(parent.position).add(_relPos);
    b.velocity.copy(parent.velocity).add(_relVel);
  }
};

/**
 * Positions for rendering: the parent's position plus the satellite's offset
 * scaled into the exaggerated visual frame. Writes into `out`.
 */
export const satelliteRenderPosition = (
  satellite: CelestialBody,
  parent: CelestialBody,
  out: THREE.Vector3,
  mode: UiMode = 'advanced',
): THREE.Vector3 => {
  out.subVectors(satellite.position, parent.position);
  out.multiplyScalar(moonOrbitRenderScale(parent, mode, satellite));
  return out.add(parent.position);
};

/** True orbital period of a satellite, in years. */
export const satellitePeriodYears = (
  satellite: CelestialBody,
  parent: CelestialBody,
): number => {
  if (!satellite.orbit) return Infinity;
  return periodFromElements(satellite.orbit.a, gravitationalParameter(parent.mass, satellite.mass));
};

/**
 * Hill radius of `parent` about `grandparent`, in simulation length units.
 * A satellite outside it is not gravitationally bound and must be promoted.
 */
export const hillRadius = (parent: CelestialBody, grandparent: CelestialBody | null): number => {
  if (!grandparent || !(grandparent.mass > 0)) return Infinity;
  const d = parent.position.distanceTo(grandparent.position);
  return d * Math.cbrt(parent.mass / (3 * grandparent.mass));
};

/**
 * Convert a satellite back into a free N-body body, giving it the velocity it
 * actually had on its Kepler orbit so the transition is continuous.
 */
export const promoteToFreeBody = (satellite: CelestialBody): void => {
  satellite.parentId = undefined;
  satellite.orbit = undefined;
};

/**
 * Bind a free body to a parent as a satellite, deriving its elements from the
 * relative state it currently has. Returns false (leaving the body free) if the
 * relative orbit is unbound, in which case rails would be wrong anyway.
 */
export const captureAsSatellite = (
  body: CelestialBody,
  parent: CelestialBody,
  t: number,
): boolean => {
  _relPos.subVectors(body.position, parent.position);
  _relVel.subVectors(body.velocity, parent.velocity);
  const mu = gravitationalParameter(parent.mass, body.mass);
  const elements = elementsFromState(_relPos, _relVel, mu, t, _elementScratch);
  if (!elements) return false;
  body.parentId = parent.id;
  body.orbit = elements;
  return true;
};

/**
 * Release satellites whose parent has vanished or whose orbit has grown beyond
 * the parent's Hill sphere. Returns the ids that were promoted so callers can
 * reset the integrator's acceleration cache for them.
 */
export const promoteEscapedMoons = (
  bodies: CelestialBody[],
  byId: Map<string, CelestialBody>,
  parentMap: Map<string, CelestialBody | null>,
): string[] => {
  let promoted: string[] | null = null;

  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (!b.parentId) continue;
    const parent = byId.get(b.parentId);

    let release = false;
    if (!parent) {
      release = true;                       // parent merged away or was deleted
    } else if (b.orbit) {
      const limit = hillRadius(parent, parentMap.get(parent.id) ?? null);
      // Apoapsis outside the parent's Hill sphere means the pair is no longer
      // gravitationally isolated and the two-body approximation has failed.
      if (b.orbit.a * (1 + b.orbit.e) > limit) release = true;
    }

    if (release) {
      promoteToFreeBody(b);
      (promoted ??= []).push(b.id);
    }
  }

  return promoted ?? EMPTY_IDS;
};

const EMPTY_IDS: string[] = [];

/** Mean motion in radians per year, for UI read-outs. */
export const satelliteMeanMotion = (
  satellite: CelestialBody,
  parent: CelestialBody,
): number =>
  satellite.orbit
    ? meanMotion(satellite.orbit.a, gravitationalParameter(parent.mass, satellite.mass))
    : 0;

/** Gravitational parameter helper re-exported for callers that need it. */
export { gravitationalParameter, G_AETHER };
