/**
 * Per-body uniforms for every surface that follows the spacetime grid.
 *
 * The grid shader (components/SpaceCanvas.tsx) and the habitable-zone disc
 * (components/HabitableZoneVisual.tsx) both fill their arrays through this one
 * function, so the disc can never detach from the surface it lies on.
 *
 * Two rules live here:
 *  - Wells are centred on each body's DRAWN position (`bodyRenderPosition`), so
 *    a moon's dip sits under the moon mesh, not under its unexaggerated physics
 *    position inside the parent's sphere.
 *  - Peak depth and core radius are computed once per body on the CPU from the
 *    active mode's `WellParams`; the shaders only evaluate the 1/r profile.
 */
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { bodyRenderPosition } from './renderPosition';
import { bodyVisualRadius, wellParamsFor, type UiMode } from './displayMode';
import { wellCoreRadius, wellPeakDepth } from './curvatureDisplay';

/** Uniform array length in both shaders. */
export const GRID_MAX_BODIES = 50;

export interface GridWellUniforms {
  positions: Float32Array;
  masses: Float32Array;
  peaks: Float32Array;
  cores: Float32Array;
}

export const createGridWellUniforms = (): GridWellUniforms => ({
  positions: new Float32Array(GRID_MAX_BODIES * 3),
  masses: new Float32Array(GRID_MAX_BODIES),
  peaks: new Float32Array(GRID_MAX_BODIES),
  cores: new Float32Array(GRID_MAX_BODIES),
});

/** Module scratch — the per-frame path allocates nothing. */
const _byId = new Map<string, CelestialBody>();
const _pos = new THREE.Vector3();

/** Fills `out` for up to `GRID_MAX_BODIES` bodies and returns the count. */
export const fillGridWellUniforms = (
  out: GridWellUniforms,
  bodies: readonly CelestialBody[],
  floatingOffset: THREE.Vector3,
  mode: UiMode,
): number => {
  _byId.clear();
  for (const b of bodies) _byId.set(b.id, b);
  const p = wellParamsFor(mode);
  const count = Math.min(GRID_MAX_BODIES, bodies.length);
  for (let i = 0; i < count; i++) {
    const b = bodies[i];
    const parent = b.parentId ? _byId.get(b.parentId) : undefined;
    bodyRenderPosition(_pos, b, parent, floatingOffset, mode);
    out.positions[i * 3] = _pos.x;
    out.positions[i * 3 + 1] = _pos.y;
    out.positions[i * 3 + 2] = _pos.z;
    out.masses[i] = b.mass;
    out.peaks[i] = wellPeakDepth(b.mass, p.amplitude, p.exponent, p.maxDepth);
    out.cores[i] = wellCoreRadius(bodyVisualRadius(b, mode), p.coreFactor, p.coreFloor);
  }
  _byId.clear();
  return count;
};
