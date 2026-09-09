/**
 * The single definition of "where does this body get drawn".
 *
 * Two rules have to be applied together, and applying only one of them is how a
 * body's mesh ends up somewhere its orbit path, its radiation shell or its
 * shader uniforms do not agree with:
 *
 *  1. Satellites are drawn through their parent's radius exaggeration
 *     (`satelliteRenderPosition`), so a moon's orbit stays outside the parent's
 *     drawn sphere. Free bodies are drawn at their true position.
 *  2. Everything is then shifted by the floating origin (`toRenderSpace`).
 *
 * Every consumer goes through this function so the two can never be combined
 * differently in two places. It writes into the caller's vector and allocates
 * nothing, so it is safe in a per-body, per-frame loop.
 */

import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { satelliteRenderPosition } from './moonSystem';
import { toRenderSpace } from './scratchVectors';
import type { UiMode } from './displayMode';

/** Private scratch — module scope so the hot path allocates nothing. */
const _worldScratch = new THREE.Vector3();

/**
 * `out` = render-space position of `body`.
 *
 * Pass the body's live parent (from the frame's id map) when it has one; a
 * satellite with a resolvable parent is placed in the exaggerated visual frame,
 * anything else at its true world position.
 */
export const bodyRenderPosition = (
  out: THREE.Vector3,
  body: CelestialBody,
  parent: CelestialBody | null | undefined,
  floatingOffset: THREE.Vector3,
  mode: UiMode = 'advanced',
): THREE.Vector3 => {
  if (parent && body.orbit) {
    satelliteRenderPosition(body, parent, _worldScratch, mode);
    return toRenderSpace(out, _worldScratch, floatingOffset);
  }
  return toRenderSpace(out, body.position, floatingOffset);
};
