import type { CelestialBody } from '../types';
import { G_AETHER } from './units';

/** Quantized, mode-independent accuracy limit; re-evaluated after user edits. */
export function scientificStepLimit(bodies: readonly CelestialBody[]): number {
  if (!bodies.some(b => b.properties?.physicalCollisions)) return Infinity;
  let limit = 1 / 1024;
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    if (b.parentId && b.orbit) continue;
    for (let j = i + 1; j < bodies.length; j++) {
      const p = bodies[j];
      if (p.parentId && p.orbit) continue;
      const x = b.position.x - p.position.x, y = b.position.y - p.position.y, z = b.position.z - p.position.z;
      const vx = b.velocity.x - p.velocity.x, vy = b.velocity.y - p.velocity.y, vz = b.velocity.z - p.velocity.z;
      const r = Math.hypot(x, y, z), mu = G_AETHER * (b.mass + p.mass);
      if (!(r > 0 && mu > 0)) continue;
      const energy = (vx * vx + vy * vy + vz * vz) / 2 - mu / r;
      if (energy >= 0) continue;
      const a = -mu / (2 * energy);
      const h2 = (y * vz - z * vy) ** 2 + (z * vx - x * vz) ** 2 + (x * vy - y * vx) ** 2;
      const e = Math.sqrt(Math.max(0, 1 - h2 / (mu * a)));
      const pericentreTime = 2 * Math.PI * Math.sqrt(a ** 3 / mu) * (1 - e) ** 1.5 / Math.sqrt(1 + e);
      if (Number.isFinite(pericentreTime) && pericentreTime > 0) limit = Math.min(limit, pericentreTime / 256);
    }
  }
  return Math.max(2 ** -40, 2 ** Math.floor(Math.log2(limit)));
}

/** Reserve a 30 fps budget at the maximum 4x slider value. */
export function scientificPacingScale(bodies: readonly CelestialBody[], maxSteps: number): number {
  const dt = scientificStepLimit(bodies);
  return Math.min(1, dt * maxSteps * 30 * 0.8 / 0.16);
}
