import { describe, it, expect } from 'vitest';
import {
  dampScalar, dampFactor, lambdaForDuration, framingDistanceFor,
  arrivalEpsilonSq, FLY_TO_LAMBDA, FOLLOW_LAMBDA,
} from './cameraFly';

describe('dampScalar', () => {
  it('is frame-rate independent', () => {
    // The whole point of the exponential form: simulating one second at 60 fps
    // and at 120 fps must land in the same place. The old fixed-alpha lerp
    // converged twice as fast on a 120 Hz display.
    const run = (steps: number) => {
      let v = 0;
      for (let i = 0; i < steps; i++) v = dampScalar(v, 100, FLY_TO_LAMBDA, 1 / steps);
      return v;
    };
    expect(Math.abs(run(60) - run(120))).toBeLessThan(1e-6);
    expect(Math.abs(run(60) - run(240))).toBeLessThan(1e-6);
  });

  it('converges monotonically toward the target', () => {
    let v = 0;
    let last = -1;
    for (let i = 0; i < 200; i++) {
      v = dampScalar(v, 10, FLY_TO_LAMBDA, 1 / 60);
      expect(v).toBeGreaterThan(last);
      expect(v).toBeLessThanOrEqual(10);
      last = v;
    }
    expect(v).toBeCloseTo(10, 5);
  });

  it('approaches from above as well as below', () => {
    const v = dampScalar(100, 0, FLY_TO_LAMBDA, 1 / 60);
    expect(v).toBeLessThan(100);
    expect(v).toBeGreaterThan(0);
  });

  it('is a no-op for a non-positive or non-finite dt', () => {
    // r3f can hand back a zero delta on the first frame after a tab regains focus.
    expect(dampScalar(5, 100, FLY_TO_LAMBDA, 0)).toBe(5);
    expect(dampScalar(5, 100, FLY_TO_LAMBDA, -1)).toBe(5);
    expect(dampScalar(5, 100, FLY_TO_LAMBDA, NaN)).toBe(5);
  });
});

describe('dampFactor', () => {
  it('stays inside [0, 1)', () => {
    for (const dt of [1 / 240, 1 / 60, 1 / 30, 1]) {
      const k = dampFactor(FLY_TO_LAMBDA, dt);
      expect(k).toBeGreaterThan(0);
      expect(k).toBeLessThan(1);
    }
  });

  it('agrees with dampScalar', () => {
    const k = dampFactor(FLY_TO_LAMBDA, 1 / 60);
    expect(0 + (100 - 0) * k).toBeCloseTo(dampScalar(0, 100, FLY_TO_LAMBDA, 1 / 60), 9);
  });

  it('is zero for a non-positive dt', () => {
    expect(dampFactor(FLY_TO_LAMBDA, 0)).toBe(0);
  });
});

describe('lambdaForDuration', () => {
  it('closes 99% of the gap in the requested time', () => {
    for (const seconds of [0.2, 0.6, 1.5]) {
      const lambda = lambdaForDuration(seconds);
      const remaining = dampScalar(1, 0, lambda, seconds);
      expect(remaining).toBeCloseTo(0.01, 6);
    }
  });

  it('gives the fly-to a roughly 600 ms feel', () => {
    expect(dampScalar(1, 0, FLY_TO_LAMBDA, 0.6)).toBeCloseTo(0.01, 6);
    expect(FOLLOW_LAMBDA).toBeGreaterThan(FLY_TO_LAMBDA);
  });
});

describe('framingDistanceFor', () => {
  it('matches the framing the camera snap has always used', () => {
    // Regression pin: changing this silently re-frames every recenter and
    // every preset load.
    for (const r of [0, 1, 4.375, 10, 500]) {
      expect(framingDistanceFor(r)).toBe(Math.max(140, r * 32));
    }
  });

  it('never frames closer than the 140-unit floor', () => {
    expect(framingDistanceFor(0)).toBe(140);
    expect(framingDistanceFor(0.01)).toBe(140);
  });
});

describe('arrivalEpsilonSq', () => {
  it('scales with the framing distance but keeps a floor', () => {
    expect(arrivalEpsilonSq(140)).toBeGreaterThan(0);
    expect(arrivalEpsilonSq(10000)).toBeGreaterThan(arrivalEpsilonSq(140));
    expect(arrivalEpsilonSq(0)).toBeCloseTo(0.05 * 0.05, 12);
  });
});
