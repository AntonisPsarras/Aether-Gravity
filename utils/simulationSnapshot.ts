import type { CelestialBody } from '../types';
import { clonePhysicsBody, getPhysicsBodiesSnapshot } from './physicsBridge';
import { getSimTime } from './physicsSoA';

export interface SimulationSnapshot {
  bodies: CelestialBody[];
  simTime: number;
}
export const captureSimulationSnapshot = (fallback: readonly CelestialBody[] = []): SimulationSnapshot => ({
  bodies: getPhysicsBodiesSnapshot(fallback).map(clonePhysicsBody),
  simTime: getSimTime(),
});
