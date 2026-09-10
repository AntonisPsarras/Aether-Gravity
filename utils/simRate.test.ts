import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildRealSystem, getRealSystem } from '../content/realSystems';
import { createSandboxBody } from './bodyFactory';
import { M_SUN_IN_EARTH } from './units';
import { advanceScientificStepPolicy, currentScientificStepLimit, invalidateScientificSteps } from './scientificStep';
import {
  BASE_YEARS_PER_REAL_SECOND,
  BEGINNER_TIME_SCALE,
  MAX_SIM_YEARS_PER_FRAME,
  realSecondsPerEarthYear,
  simElapsedForFrame,
  simYearsPerRealSecond,
} from './simRate';
import { PHYSICS_LIMITS } from './physicsBounds';
import { FIXED_DT, MAX_CATCHUP_STEPS, getSimTime, resetAccumulator, resetVerletCache, runFixedSteps } from './physicsSoA';

const refreshScientificLimit = (bodies: ReturnType<typeof solarEncounter>) => {
  for (let i = 0; i < 8; i++) advanceScientificStepPolicy(bodies);
};

/**
 * A deterministic analogue of the slingshot report: a 5 M☉ hole travels at
 * the creator's maximum launch speed past the Sun/inner planets. Removing the
 * real-system-only flag models generated worlds without random fixture noise.
 */
const solarEncounter = (physicalCollisions: boolean) => {
  const solar = buildRealSystem(getRealSystem('solar-system')!).map((body) => ({
    ...body,
    position: body.position.clone(),
    velocity: body.velocity.clone(),
    properties: physicalCollisions
      ? { ...body.properties }
      : { ...body.properties, physicalCollisions: undefined },
  }));
  const hole = createSandboxBody({
    id: physicalCollisions ? 'real-system-hole' : 'random-system-hole',
    type: 'Black Hole',
    name: 'Slingshot hole',
    mass: 5 * M_SUN_IN_EARTH,
    position: new THREE.Vector3(-500, 0, 1),
    velocity: new THREE.Vector3(2000, 0, 0),
  });
  return [...solar, hole];
};

const slingshotHole = (bodies: ReturnType<typeof solarEncounter>) => bodies.find((body) => body.name === 'Slingshot hole')!;

describe('simYearsPerRealSecond', () => {
  it('runs one Earth year in ~25 s at 1x in Advanced Mode', () => {
    expect(realSecondsPerEarthYear(1, 'advanced')).toBeCloseTo(25, 6);
    expect(simYearsPerRealSecond(1, 'advanced')).toBeCloseTo(BASE_YEARS_PER_REAL_SECOND, 12);
  });

  it('runs Beginner Mode slower than Advanced by exactly BEGINNER_TIME_SCALE', () => {
    const beginner = simYearsPerRealSecond(1, 'beginner');
    const advanced = simYearsPerRealSecond(1, 'advanced');
    expect(beginner / advanced).toBeCloseTo(BEGINNER_TIME_SCALE, 12);
    expect(beginner).toBeLessThan(advanced);
    // ~71 s per Earth year — slow enough to follow an inner orbit by eye.
    expect(realSecondsPerEarthYear(1, 'beginner')).toBeGreaterThan(60);
  });

  it('is linear in speed, so the slider is monotonic across its range', () => {
    for (const mode of ['beginner', 'advanced'] as const) {
      expect(simYearsPerRealSecond(2, mode)).toBeCloseTo(2 * simYearsPerRealSecond(1, mode), 12);
      expect(simYearsPerRealSecond(4, mode)).toBeGreaterThan(simYearsPerRealSecond(3, mode));
      expect(simYearsPerRealSecond(0.5, mode)).toBeLessThan(simYearsPerRealSecond(1, mode));
    }
  });

  it('preserves sign for reverse playback and is zero at rest', () => {
    expect(simYearsPerRealSecond(-2, 'advanced')).toBeLessThan(0);
    expect(simYearsPerRealSecond(-1, 'advanced')).toBeCloseTo(-simYearsPerRealSecond(1, 'advanced'), 12);
    expect(simYearsPerRealSecond(0, 'advanced')).toBe(0);
  });

  it('returns 0 rather than NaN for a non-finite speed', () => {
    expect(simYearsPerRealSecond(NaN, 'advanced')).toBe(0);
    expect(simYearsPerRealSecond(Infinity, 'beginner')).toBe(0);
  });
});

describe('per-frame step budget', () => {
  const FRAME_60 = 1 / 60;

  /**
   * The bug this whole pacing layer exists to fix: if a frame requests more sim
   * time than MAX_CATCHUP_STEPS can drain, runFixedSteps zeroes the accumulator
   * and throws the remainder away, so every speed above that point behaves
   * identically. Guards a future base-rate bump from silently re-saturating.
   */
  it('keeps the full slider range inside the catch-up budget at 60 fps', () => {
    for (const mode of ['beginner', 'advanced'] as const) {
      for (const speed of [PHYSICS_LIMITS.SPEED_MIN, -1, 0.5, 1, 2, 3, PHYSICS_LIMITS.SPEED_MAX]) {
        const requested = Math.abs(simElapsedForFrame(FRAME_60, speed, mode));
        expect(requested).toBeLessThan(MAX_SIM_YEARS_PER_FRAME);
      }
    }
  });

  it('exposes the budget as the product of the physics constants', () => {
    expect(MAX_SIM_YEARS_PER_FRAME).toBeCloseTo(MAX_CATCHUP_STEPS * FIXED_DT, 12);
  });

  it('scales elapsed time linearly with frame delta', () => {
    expect(simElapsedForFrame(2 * FRAME_60, 1, 'advanced'))
      .toBeCloseTo(2 * simElapsedForFrame(FRAME_60, 1, 'advanced'), 12);
  });

  it('relaxes real-system close-encounter pacing after a fast black-hole fly-by', () => {
    invalidateScientificSteps(); resetAccumulator(); resetVerletCache();
    const realSystem = solarEncounter(true);
    const generatedSystem = solarEncounter(false);
    const beforeReal = simYearsPerRealSecond(1, 'advanced', realSystem);
    const beforeGenerated = simYearsPerRealSecond(1, 'advanced', generatedSystem);

    // Closest approach is outside the true Sun+hole contact radius, but well
    // inside the display-radius floor used by generated worlds.
    slingshotHole(realSystem).position.set(0, 0, 1);
    slingshotHole(generatedSystem).position.set(0, 0, 1);
    refreshScientificLimit(realSystem);
    refreshScientificLimit(generatedSystem);
    const strictLimit = currentScientificStepLimit(realSystem);
    const duringReal = simYearsPerRealSecond(1, 'advanced', realSystem);
    const duringGenerated = simYearsPerRealSecond(1, 'advanced', generatedSystem);

    expect(beforeReal).toBeCloseTo(BASE_YEARS_PER_REAL_SECOND, 12);
    expect(beforeGenerated).toBeCloseTo(BASE_YEARS_PER_REAL_SECOND, 12);
    expect(strictLimit).toBeLessThan(FIXED_DT);
    expect(duringReal).toBeLessThan(duringGenerated);
    expect(duringReal).toBeLessThan(beforeReal);
    expect(duringReal).toBeCloseTo(strictLimit * MAX_CATCHUP_STEPS * 30 * 0.8, 12);

    // A strict refreshed limit must still be the one consumed by the
    // integrator, rather than only serving as a presentation/pacing hint.
    const ref = { current: realSystem };
    runFixedSteps(ref, strictLimit * 1.1);
    expect(getSimTime()).toBeCloseTo(strictLimit, 12);

    slingshotHole(realSystem).position.set(500, 0, 1);
    slingshotHole(generatedSystem).position.set(500, 0, 1);
    refreshScientificLimit(realSystem);
    refreshScientificLimit(generatedSystem);
    const afterReal = simYearsPerRealSecond(1, 'advanced', realSystem);
    const afterGenerated = simYearsPerRealSecond(1, 'advanced', generatedSystem);
    expect(afterReal).toBeCloseTo(beforeReal, 12);
    expect(afterGenerated).toBeCloseTo(beforeGenerated, 12);

    // At the maximum slider rate a constrained frame may use most of the
    // available sub-steps, but it must not exceed the active step budget.
    slingshotHole(realSystem).position.set(0, 0, 1);
    refreshScientificLimit(realSystem);
    const requested = Math.abs(simElapsedForFrame(1 / 30, 4, 'advanced', realSystem));
    expect(requested).toBeLessThanOrEqual(currentScientificStepLimit(realSystem) * MAX_CATCHUP_STEPS);
  });
});
