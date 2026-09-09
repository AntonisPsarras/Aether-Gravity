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
 * Memory: all hot-loop data lives in reusable `Float64Array`s indexed by
 * body order so we touch zero allocations per step. Previous accelerations
 * are carried across calls in a module-scope buffer keyed by body id, so
 * adds/removes/reorders survive correctly without re-priming.
 */

import { CelestialBody } from '../types';
import { G_CONSTANT } from '../constants';
import { clampBodiesInPlace } from './physicsBounds';
import { pairSofteningSq } from './physicsUtils';
import { isSatellite } from './moonSystem';
import type { DeviceTier } from './deviceCapabilities';
import { scientificStepLimit } from './scientificStep';

/**
 * Bodies the integrator owns. Satellites on Kepler rails are excluded: they are
 * placed analytically by `moonSystem.propagateSatellites`, exert no force, and
 * must not be moved by Verlet or their position would be written twice.
 */
const isValid = (b: CelestialBody | null | undefined): b is CelestialBody =>
  b != null &&
  b.position != null &&
  b.velocity != null &&
  typeof b.mass === 'number' && isFinite(b.mass) &&
  typeof b.radius === 'number' && isFinite(b.radius) &&
  // radiusKm feeds pairSofteningSq below. That function is defensive on its own
  // (a bad radiusKm there degrades to the softening floor rather than NaN); this
  // check is the secondary net, and is deliberately the weaker of the two because
  // failing it removes the body from gravity entirely.
  typeof b.radiusKm === 'number' && isFinite(b.radiusKm) &&
  !isSatellite(b);

// Reusable typed buffers (resized on demand, never shrunk).
let bufCapacity = 0;
let accelCurr: Float64Array = new Float64Array(0);
let accelNext: Float64Array = new Float64Array(0);

// Persistent per-body acceleration state across frames, keyed by id.
// Stores the LAST computed acceleration so that on the next step we
// already have a(t) without recomputing.
const accelById: Map<string, [number, number, number]> = new Map();

const ensureCapacity = (n: number) => {
  const need = n * 3;
  if (need > bufCapacity) {
    bufCapacity = need;
    accelCurr = new Float64Array(need);
    accelNext = new Float64Array(need);
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
const storeAccel = (bodies: CelestialBody[], src: Float64Array) => {
  // Structural changes call resetVerletCache, so pruning does not belong in
  // the steady-state tick (where building a Set used to allocate).
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
const computeAccelerationsInArray = (bodies: CelestialBody[], out: Float64Array): void => {
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
      const distSq = dx * dx + dy * dy + dz * dz + pairSofteningSq(bi, bj);
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

/**
 * Physics tick, in simulation years — 1/1024 yr ≈ 8.5 hours.
 *
 * Chosen from the shortest orbit the N-body loop has to resolve: Mercury's
 * 0.241 yr period gets ~247 steps, which keeps velocity-Verlet's per-orbit
 * energy error (∝ (dt/P)²) below 10⁻⁴. Moons, whose periods are far shorter,
 * are propagated analytically instead of through this loop precisely so that
 * dt does not have to shrink further (see `utils/moonSystem.ts`).
 *
 * This does NOT change per-frame cost: the number of steps drained per frame is
 * capped by MAX_CATCHUP_STEPS either way, and it does not set the playback rate
 * either — `utils/simRate.ts` owns the real-seconds→sim-years mapping and is
 * deliberately calibrated to stay under this cap across the whole speed slider.
 */
export const FIXED_DT = 1 / 1024;
/**
 * Steps drained per frame. This is the per-frame O(N²) budget, so it must not
 * be raised to buy playback speed — that is `simRate.ts`'s job.
 *
 * It exists to absorb a stalled tab or a slow frame. Before the pacing layer,
 * normal 60 fps playback hit this cap every single frame and the residual was
 * discarded below, which silently flattened the whole upper half of the speed
 * slider into one rate.
 */
export const MAX_CATCHUP_STEPS = 8;
export const LOW_TIER_FIXED_DT = 1 / 512;
export const LOW_TIER_MAX_CATCHUP_STEPS = 6;

const HIGH_STEP_POLICY = Object.freeze({ fixedDt: FIXED_DT, maxCatchupSteps: MAX_CATCHUP_STEPS });
const LOW_STEP_POLICY = Object.freeze({ fixedDt: LOW_TIER_FIXED_DT, maxCatchupSteps: LOW_TIER_MAX_CATCHUP_STEPS });
export const physicsStepPolicy = (tier: DeviceTier): Readonly<{ fixedDt: number; maxCatchupSteps: number }> =>
  tier === 'low' ? LOW_STEP_POLICY : HIGH_STEP_POLICY;

// Mutable fractional scalars kept in typed storage. Updating a captured JS
// number can allocate boxed HeapNumbers in V8's optimized code.
const clockState = new Float64Array(2);
const ACCUMULATOR_INDEX = 0;
const SIM_TIME_INDEX = 1;

/**
 * Total simulated time in years. Kepler-propagated satellites need an absolute
 * clock (their mean anomaly is defined against an epoch), and it is what the UI
 * shows as elapsed simulation time.
 */
export const getSimTime = (): number => clockState[SIM_TIME_INDEX];
export const setSimTime = (t: number): void => { clockState[SIM_TIME_INDEX] = isFinite(t) ? t : 0; };

/**
 * Run zero or more verlet steps to consume `elapsed` simulated time.
 * `stepCallback` is invoked after each step so collision/evolution checks
 * can run at sub-frame resolution.
 */
export const runFixedSteps = (
  bodiesRef: { current: CelestialBody[] },
  elapsed: number,
  stepCallback?: (bodies: CelestialBody[], dt: number) => CelestialBody[],
  tier: DeviceTier = 'high',
): number => {
  if (!isFinite(elapsed) || elapsed === 0 || !bodiesRef.current) {
    return 0;
  }
  const basePolicy = physicsStepPolicy(tier);
  const policy = { ...basePolicy, fixedDt: Math.min(basePolicy.fixedDt, scientificStepLimit(bodiesRef.current)) };
  // Velocity-Verlet is time-symmetric, so running it with a negative dt
  // integrates backwards. The pre-2.0 loop returned early on elapsed <= 0, so
  // the reverse half of the speed slider silently did nothing.
  const reverse = elapsed < 0;
  const dt = reverse ? -policy.fixedDt : policy.fixedDt;
  clockState[ACCUMULATOR_INDEX] += Math.min(Math.abs(elapsed), 0.2); // hard cap to avoid death spiral
  let steps = 0;
  let bodies = bodiesRef.current;
  while (clockState[ACCUMULATOR_INDEX] >= policy.fixedDt && steps < policy.maxCatchupSteps) {
    bodies = verletStepInPlace(bodies, dt);
    clockState[SIM_TIME_INDEX] += dt;
    clampBodiesInPlace(bodies);
    if (stepCallback) {
      // `dt` is signed, so a collision scan can sweep the step it just integrated
      // and reverse playback keeps working.
      const countBefore = bodies.length;
      bodies = stepCallback(bodies, dt);
      // A merge or a fragmentation changes the body set. `primeCurrentAccel`
      // would otherwise return anyKnown=true from the *surviving* bodies' cache
      // entries and skip the full force pass, leaving a new fragment with
      // a(t) = 0 and a merge survivor with the acceleration it had at its
      // pre-merge position and mass.
      if (bodies.length !== countBefore) resetVerletCache();
    }
    clampBodiesInPlace(bodies);
    clockState[ACCUMULATOR_INDEX] -= policy.fixedDt;
    steps++;
  }
  // If we hit the catchup cap, drop residual time to avoid lag accumulation.
  if (steps >= policy.maxCatchupSteps) clockState[ACCUMULATOR_INDEX] = 0;
  bodiesRef.current = bodies;
  return steps;
};

export const resetAccumulator = () => {
  clockState[ACCUMULATOR_INDEX] = 0;
  clockState[SIM_TIME_INDEX] = 0;
};
