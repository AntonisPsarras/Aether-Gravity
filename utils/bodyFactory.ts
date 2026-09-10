/**
 * Construction of user-created sandbox bodies.
 *
 * Shared by the slingshot creator and the moon creator so the two cannot drift
 * apart in defaults (texture mapping, composition, derived radius).
 */
import type * as THREE from 'three';
import type { BodyType, CelestialBody } from '../types';
import { BODY_CONFIGS } from '../constants';
import { sanitizeCelestialBody } from './physicsBounds';
import { reconcileBodyDerivedState } from './physicsUtils';

/**
 * Log-uniform draw within a type's mass range, from a uniform variate `u` in
 * [0, 1). The ranges span many orders of magnitude, so a linear draw would
 * always land near the top. `maxMass` caps the upper end (a moon is capped by
 * its parent); the lower end of the type's range always wins.
 */
export const sampleMassForType = (
  type: BodyType,
  u: number = Math.random(),
  maxMass = Infinity,
): number => {
  const [lo, rangeHi] = (BODY_CONFIGS[type] ?? BODY_CONFIGS.Planet).massRange;
  const hi = Math.max(lo, Math.min(rangeHi, maxMass));
  const t = Math.min(1, Math.max(0, Number.isFinite(u) ? u : 0.5));
  return Math.exp(Math.log(lo) + t * (Math.log(hi) - Math.log(lo)));
};

export interface SandboxBodySpec {
  id: string;
  type: BodyType;
  name: string;
  mass: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

/** A sanitized body of `type` with every derived quantity already reconciled. */
export const createSandboxBody = ({
  id, type, name, mass, position, velocity,
}: SandboxBodySpec): CelestialBody => {
  const config = BODY_CONFIGS[type] ?? BODY_CONFIGS.Planet;
  const body = sanitizeCelestialBody({
    id,
    type,
    position,
    velocity,
    mass,
    // Both radii are derived from mass and type immediately below.
    radius: 1,
    radiusKm: 1,
    color: config.defaultColor,
    temperature: 300,
    habitability: 'N/A',
    population: 0,
    name,
    texture: config.visualType === 'rocky' ? 'rock'
      : config.visualType === 'gaseous' ? 'gas'
      : config.visualType === 'neutron' ? 'neutron' : 'solid',
    trailColor: config.defaultColor,
    properties: {
      rotationPeriod: 24.0,
      isTidallyLocked: false,
      compositionIron: 0.3,
      compositionSilicates: 0.6,
      compositionWater: 0.1,
    },
  });
  reconcileBodyDerivedState(body);
  return body;
};
