import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { FIXED_DT, LOW_TIER_FIXED_DT, physicsStepPolicy, resetVerletCache, verletStepInPlace } from './physicsSoA';
import { auToDist, circularOrbitalSpeed, M_SUN_IN_EARTH } from './units';

const orbitFixture = (): CelestialBody[] => {
  const distance = auToDist(1);
  return [
    { id: 'sun', type: 'Star', name: 'Sun', mass: M_SUN_IN_EARTH, radius: 12, radiusKm: 696340, position: new THREE.Vector3(), velocity: new THREE.Vector3(), color: '#fff', texture: 'solid', trailColor: '#fff', temperature: 5772, habitability: 'STELLAR', population: 0 },
    { id: 'earth', type: 'Planet', name: 'Earth', mass: 1, radius: 2.5, radiusKm: 6371, position: new THREE.Vector3(distance, 0, 0), velocity: new THREE.Vector3(0, 0, circularOrbitalSpeed(distance, M_SUN_IN_EARTH)), color: '#fff', texture: 'rock', trailColor: '#fff', temperature: 288, habitability: 'HABITABLE', population: 1 },
  ];
};

const integrateYears = (dt: number, years: number): CelestialBody[] => {
  const bodies = orbitFixture();
  resetVerletCache();
  for (let t = 0; t < years - dt / 2; t += dt) verletStepInPlace(bodies, dt);
  return bodies;
};

describe('tiered physics step policy', () => {
  it('leaves high-tier precision unchanged', () => {
    expect(physicsStepPolicy('high')).toEqual({ fixedDt: FIXED_DT, maxCatchupSteps: 8 });
  });

  it('halves low-tier force evaluations for the same simulated interval', () => {
    const low = physicsStepPolicy('low');
    expect(low.fixedDt).toBe(LOW_TIER_FIXED_DT);
    expect(low.fixedDt).toBe(FIXED_DT * 2);
    expect(low.maxCatchupSteps).toBe(6);
  });

  it('keeps a ten-year low-tier orbit visually coincident with high tier', () => {
    const high = integrateYears(FIXED_DT, 10);
    const low = integrateYears(LOW_TIER_FIXED_DT, 10);
    const highRelative = high[1].position.clone().sub(high[0].position);
    const lowRelative = low[1].position.clone().sub(low[0].position);
    const projectedOrbitRadiusPx = 360;
    const projectedSeparationPx = lowRelative.distanceTo(highRelative) / auToDist(1) * projectedOrbitRadiusPx;
    expect(projectedSeparationPx).toBeLessThan(1);
    expect(Math.abs(lowRelative.length() - auToDist(1)) / auToDist(1)).toBeLessThan(0.001);
  });

  it('consumes the full 4x playback request at 30 FPS on low tier', () => {
    const low = physicsStepPolicy('low');
    const requestedYears = (1 / 30) * 4 * 0.08;
    expect(requestedYears).toBeLessThanOrEqual(low.fixedDt * low.maxCatchupSteps);
  });
});
