import type { CelestialBody } from '../types';
import { G_AETHER, kmToDist } from './units';
import { CONTACT_FRACTION } from './collisionOutcome';

/** Accuracy in years, independent of presentation and collision policy. */
export function scientificStepLimit(bodies: readonly CelestialBody[]): number {
  let limit = bodies.some(b => b.properties?.physicalCollisions) ? 1 / 1024 : Infinity;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.parentId && b.orbit && b.orbit.a > 0) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const p = bodies[j];
      if (p.parentId && p.orbit && p.orbit.a > 0) continue;
      const x = b.position.x - p.position.x, y = b.position.y - p.position.y, z = b.position.z - p.position.z;
      const vx = b.velocity.x - p.velocity.x, vy = b.velocity.y - p.velocity.y, vz = b.velocity.z - p.velocity.z;
      const r = Math.hypot(x, y, z), mu = G_AETHER * (b.mass + p.mass);
      if (!(mu > 0) || !Number.isFinite(mu) || !Number.isFinite(r)) continue;
      const contact = b.properties?.physicalCollisions || p.properties?.physicalCollisions
        ? kmToDist(b.radiusKm + p.radiusKm) : CONTACT_FRACTION * (b.radius + p.radius);
      // Once inside contact the collision scan owns the outcome. The softening
      // floor avoids a zero timescale at coincident point masses.
      const distance = Math.max(r, contact, 1e-4);
      const speed = Math.hypot(vx, vy, vz);
      // At least 64 samples per encounter timescale, also for unbound pairs.
      limit = Math.min(limit, Math.sqrt(distance ** 3 / mu) / 64);
      if (speed > 0) limit = Math.min(limit, distance / speed / 64);
      if (!(r > 0)) continue;
      const energy = speed * speed / 2 - mu / r;
      if (energy >= 0) continue;
      const a = -mu / (2 * energy);
      const h2 = (y * vz - z * vy) ** 2 + (z * vx - x * vz) ** 2 + (x * vy - y * vx) ** 2;
      const e = Math.sqrt(Math.max(0, 1 - h2 / (mu * a)));
      const peri = Math.max(a * (1 - e), contact, 1e-4);
      const pericentreTime = 2 * Math.PI * Math.sqrt(peri ** 3 / (mu * (1 + e)));
      if (Number.isFinite(pericentreTime) && pericentreTime > 0) limit = Math.min(limit, pericentreTime / 256);
    }
  }
  return Math.max(2 ** -40, 2 ** Math.floor(Math.log2(limit)));
}

type AccuracyState = { limit: number; steps: number };
let states = new WeakMap<readonly CelestialBody[], AccuracyState>();
export const invalidateScientificSteps = () => { states = new WeakMap(); };
/** Shared by pacing and integration: no repeated pair scans per render frame. */
export function currentScientificStepLimit(bodies: readonly CelestialBody[]): number {
  let state = states.get(bodies);
  if (!state) {
    state = { limit: scientificStepLimit(bodies), steps: 0 };
    states.set(bodies, state);
  }
  return state.limit;
}
/** Recheck only at step boundaries; retain the strictest limit until an edit.
 * Eight steps cover at most 1/8 of an encounter timescale. This leaves a wide
 * margin while avoiding a second pair scan on every force evaluation.
 */
export function advanceScientificStepPolicy(bodies: readonly CelestialBody[]): void {
  currentScientificStepLimit(bodies);
  const state = states.get(bodies)!;
  if (++state.steps >= 8) {
    state.limit = Math.min(state.limit, scientificStepLimit(bodies));
    state.steps = 0;
  }
}
/** Reserve a 30 fps budget at the maximum 4x slider value. */
export function scientificPacingScale(bodies: readonly CelestialBody[], maxSteps: number): number {
  return Math.min(1, currentScientificStepLimit(bodies) * maxSteps * 30 * 0.8 / 0.16);
}
