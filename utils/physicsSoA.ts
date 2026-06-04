/**
 * Structure-of-Arrays N-body integrator using **Velocity-Verlet**.
 *
 * Velocity-Verlet is symplectic (long-term energy bounded), second-order
 * accurate, and costs ONE force evaluation per step when previous
 * accelerations are cached. That's the same cost as the previous
 * semi-implicit Euler in `physicsUtils.calculateGravityInPlace` but with
 * markedly better orbit-shape preservation, which is critical for the
 * scientific accuracy goals of the engine.
 *
 *   Loop step:
 *     x(t+dt)  = x(t) + v(t)·dt + ½·a(t)·dt²
 *     a(t+dt)  = ∑ G·m_j·(x_j - x_i) / |r|³   (one O(N²) pass)
 *     v(t+dt)  = v(t) + ½·(a(t) + a(t+dt))·dt
 *
 * Memory: all hot-loop data lives in reusable `Float32Array`s indexed by
 * body order so we touch zero allocations per step. Previous accelerations
 * are carried across calls in a module-scope buffer keyed by body id, so
 * adds/removes/reorders survive correctly without re-priming.
 */

import { CelestialBody } from '../types';
import { G_CONSTANT } from '../constants';
import { clampBodiesInPlace } from './physicsBounds';

const isValid = (b: CelestialBody | null | undefined): b is CelestialBody =>
  b != null &&
  b.position != null &&
  b.velocity != null &&
  typeof b.mass === 'number' && isFinite(b.mass) &&
  typeof b.radius === 'number' && isFinite(b.radius);

// Reusable typed buffers (resized on demand, never shrunk).
let bufCapacity = 0;
let accelCurr: Float32Array = new Float32Array(0);
let accelNext: Float32Array = new Float32Array(0);

// Persistent per-body acceleration state across frames, keyed by id.
// Stores the LAST computed acceleration so that on the next step we
// already have a(t) without recomputing.
const accelById: Map<string, [number, number, number]> = new Map();

const ensureCapacity = (n: number) => {
  const need = n * 3;
  if (need > bufCapacity) {
    bufCapacity = need;
    accelCurr = new Float32Array(need);
    accelNext = new Float32Array(need);
  } else {
    accelCurr.fill(0, 0, need);
    accelNext.fill(0, 0, need);
  }
};

/** Seed `accelCurr` from the persistent per-id store, defaulting to 0. */
const primeCurrentAccel = (bodies: CelestialBody[]): boolean => {
  let anyKnown = false;
  for (let i = 0; i < bodies.length; i++) {
    const cached = accelById.get(bodies[i].id);
    const base = i * 3;
    if (cached) {
      accelCurr[base]     = cached[0];
      accelCurr[base + 1] = cached[1];
      accelCurr[base + 2] = cached[2];
      anyKnown = true;
    } else {
      accelCurr[base] = 0;
      accelCurr[base + 1] = 0;
      accelCurr[base + 2] = 0;
    }
  }
  return anyKnown;
};

/** Write computed accelerations back to the persistent store. */
const storeAccel = (bodies: CelestialBody[], src: Float32Array) => {
  // Prune ids no longer present (cheap O(N))
  if (accelById.size > bodies.length * 2) {
    const live = new Set(bodies.map(b => b.id));
    for (const key of accelById.keys()) {
      if (!live.has(key)) accelById.delete(key);
    }
  }
  for (let i = 0; i < bodies.length; i++) {
    const b = i * 3;
    let triple = accelById.get(bodies[i].id);
    if (!triple) {
      triple = [0, 0, 0];
      accelById.set(bodies[i].id, triple);
    }
    triple[0] = src[b];
    triple[1] = src[b + 1];
    triple[2] = src[b + 2];
  }
};

/**
 * Drop-in replacement for `calculateGravityInPlace` using Velocity-Verlet.
 * Mutates body positions/velocities. Returns the filtered valid list so
 * callers can use the same call pattern as before.
 */
/** Pairwise accelerations over the live array — skips invalid bodies without allocating. */
const computeAccelerationsInArray = (bodies: CelestialBody[], out: Float32Array): void => {
  const n = bodies.length;
  out.fill(0, 0, n * 3);

  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    if (!isValid(bi)) continue;
    const xi = bi.position.x, yi = bi.position.y, zi = bi.position.z;
    const mi = bi.mass;
    const bi3 = i * 3;

    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      if (!isValid(bj)) continue;
      const dx = bj.position.x - xi;
      const dy = bj.position.y - yi;
      const dz = bj.position.z - zi;
      const distSq = dx * dx + dy * dy + dz * dz + 0.1;
      const invDist = 1 / Math.sqrt(distSq);
      const invR3 = invDist / distSq;
      const f = G_CONSTANT * invR3;
      const ax = dx * f;
      const ay = dy * f;
      const az = dz * f;
      const mj = bj.mass;
      out[bi3]     += ax * mj;
      out[bi3 + 1] += ay * mj;
      out[bi3 + 2] += az * mj;
      const bj3 = j * 3;
      out[bj3]     -= ax * mi;
      out[bj3 + 1] -= ay * mi;
      out[bj3 + 2] -= az * mi;
    }
  }
};

export const verletStepInPlace = (bodies: CelestialBody[], dt: number): CelestialBody[] => {
  if (!bodies || bodies.length === 0) return [];
  if (!isFinite(dt) || dt === 0) return bodies;

  const n = bodies.length;
  let validCount = 0;
  for (let i = 0; i < n; i++) {
    if (isValid(bodies[i])) validCount++;
  }
  if (validCount === 0) return bodies;

  ensureCapacity(n);

  const hadCache = primeCurrentAccel(bodies);
  if (!hadCache) {
    computeAccelerationsInArray(bodies, accelCurr);
  }

  const halfDtSq = 0.5 * dt * dt;

  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (!isValid(b)) continue;
    const a3 = i * 3;
    b.position.x += b.velocity.x * dt + accelCurr[a3]     * halfDtSq;
    b.position.y += b.velocity.y * dt + accelCurr[a3 + 1] * halfDtSq;
    b.position.z += b.velocity.z * dt + accelCurr[a3 + 2] * halfDtSq;
  }

  computeAccelerationsInArray(bodies, accelNext);

  const halfDt = 0.5 * dt;
  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    if (!isValid(b)) continue;
    const a3 = i * 3;
    b.velocity.x += (accelCurr[a3]     + accelNext[a3])     * halfDt;
    b.velocity.y += (accelCurr[a3 + 1] + accelNext[a3 + 1]) * halfDt;
    b.velocity.z += (accelCurr[a3 + 2] + accelNext[a3 + 2]) * halfDt;
  }

  storeAccel(bodies, accelNext);

  return bodies;
};

/** Reset persistent acceleration cache (call on world load / generate). */
export const resetVerletCache = () => {
  accelById.clear();
};

// ---- Fixed-timestep accumulator ----
//
// Decouples physics determinism from render frame rate. Caller feeds the
// frame delta (already scaled by user speed); we drain the accumulator
// in FIXED_DT chunks. The accumulator is module-scope so React renders
// don't reset it.

export const FIXED_DT = 1 / 240;             // 4.17 ms per physics tick
export const MAX_CATCHUP_STEPS = 8;          // cap when tab unfocused / slow frame
let accumulator = 0;

/**
 * Run zero or more verlet steps to consume `elapsed` simulated time.
 * `stepCallback` is invoked after each step so collision/evolution checks
 * can run at sub-frame resolution.
 */
export const runFixedSteps = (
  bodiesRef: { current: CelestialBody[] },
  elapsed: number,
  stepCallback?: (bodies: CelestialBody[]) => CelestialBody[]
): { steps: number; bodies: CelestialBody[] } => {
  if (!isFinite(elapsed) || elapsed <= 0 || !bodiesRef.current) {
    return { steps: 0, bodies: bodiesRef.current || [] };
  }
  accumulator += Math.min(elapsed, 0.2); // hard cap to avoid death spiral
  let steps = 0;
  let bodies = bodiesRef.current;
  while (accumulator >= FIXED_DT && steps < MAX_CATCHUP_STEPS) {
    bodies = verletStepInPlace(bodies, FIXED_DT);
    clampBodiesInPlace(bodies);
    if (stepCallback) bodies = stepCallback(bodies);
    clampBodiesInPlace(bodies);
    accumulator -= FIXED_DT;
    steps++;
  }
  // If we hit the catchup cap, drop residual time to avoid lag accumulation.
  if (steps >= MAX_CATCHUP_STEPS) accumulator = 0;
  bodiesRef.current = bodies;
  return { steps, bodies };
};

export const resetAccumulator = () => {
  accumulator = 0;
};
