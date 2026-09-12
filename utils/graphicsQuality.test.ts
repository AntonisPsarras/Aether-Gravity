import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAPHICS_MODE,
  GRAPHICS_MODES,
  isGraphicsMode,
  resolveRenderProfile,
  type GraphicsMode,
  type RenderProfile,
} from './graphicsQuality';
import { environmentQualityForDevice, physicsBudgetForTier, profileForTier, renderTierFor } from '../components/CanvasSetup';
import { physicsStepPolicy } from './physicsSoA';
import { simElapsedForFrame, simYearsPerRealSecond } from './simRate';
import type { DeviceTier } from './deviceCapabilities';

describe('graphics mode', () => {
  it('recognises exactly the three modes', () => {
    expect(GRAPHICS_MODES.every(isGraphicsMode)).toBe(true);
    for (const bad of ['ultra', '', null, undefined, 1, {}]) {
      expect(isGraphicsMode(bad)).toBe(false);
    }
  });

  it('defaults to auto', () => {
    expect(DEFAULT_GRAPHICS_MODE).toBe('auto');
  });

  it('honours an explicit choice regardless of what was measured', () => {
    for (const measured of ['quality', 'performance'] as RenderProfile[]) {
      expect(resolveRenderProfile('quality', measured)).toBe('quality');
      expect(resolveRenderProfile('performance', measured)).toBe('performance');
    }
  });

  it('follows the measurement only in auto', () => {
    expect(resolveRenderProfile('auto', 'quality')).toBe('quality');
    expect(resolveRenderProfile('auto', 'performance')).toBe('performance');
  });

  it('maps profiles and tiers back and forth consistently', () => {
    expect(renderTierFor('quality')).toBe('high');
    expect(renderTierFor('performance')).toBe('low');
    expect(profileForTier('high')).toBe('quality');
    expect(profileForTier('low')).toBe('performance');
  });
});

/**
 * Constraint: a graphics preference must never change the simulation. The
 * integrator's timestep is keyed on the hardware `DeviceTier`, which no
 * graphics mode is allowed to influence, so two users watching the same scene
 * on the same hardware see the same physics whichever picture they chose.
 */
describe('graphics mode does not reach the physics', () => {
  const tiers: DeviceTier[] = ['low', 'high'];

  it('keeps the step policy a pure function of the hardware tier', () => {
    for (const tier of tiers) {
      const policy = physicsStepPolicy(tier);
      expect(policy).toBe(physicsStepPolicy(tier));
    }
    expect(physicsStepPolicy('high').fixedDt).toBe(1 / 1024);
    expect(physicsStepPolicy('low').fixedDt).toBe(1 / 512);
    expect(physicsStepPolicy('high').maxCatchupSteps).toBe(8);
    expect(physicsStepPolicy('low').maxCatchupSteps).toBe(6);
  });

  it('advances the same simulated time in every graphics mode', () => {
    for (const tier of tiers) {
      const baseline = simElapsedForFrame(1 / 60, 1, 'advanced', [], tier);
      const rate = simYearsPerRealSecond(1, 'advanced', [], tier);
      for (const mode of GRAPHICS_MODES) {
        // The profile a mode resolves to changes the picture only; it is never
        // an argument to any pacing function. Resolving it here documents that
        // the value exists and is deliberately unused below.
        const profile = resolveRenderProfile(mode as GraphicsMode, 'performance');
        expect(profile === 'quality' || profile === 'performance').toBe(true);
        expect(simElapsedForFrame(1 / 60, 1, 'advanced', [], tier)).toBe(baseline);
        expect(simYearsPerRealSecond(1, 'advanced', [], tier)).toBe(rate);
      }
    }
  });

  it('keeps the fragment budget on the hardware tier, not the render profile', () => {
    // Debris fragments are BODIES: changing how many a collision makes would
    // change the simulation, so this budget must not be reachable from the
    // render profile's quality table.
    expect(physicsBudgetForTier('high').maxFragmentsPerImpact).toBe(6);
    expect(physicsBudgetForTier('low').maxFragmentsPerImpact).toBe(3);
    for (const profile of ['quality', 'performance'] as RenderProfile[]) {
      expect(environmentQualityForDevice(profile)).not.toHaveProperty('maxFragmentsPerImpact');
    }
  });
});

/**
 * Performance may cost less. It may not look like a different scene.
 */
describe('render profiles differ in cost, not in features', () => {
  const quality = environmentQualityForDevice('quality');
  const performance = environmentQualityForDevice('performance');

  it('never snaps the grid line levels', () => {
    // One level takes the `floor(lod + 0.5)` branch in the grid fragment
    // shader, which tiles the curvature surface into blocks of two densities.
    // That was the reported mobile bug; neither profile may select it.
    expect(quality.gridLineLevels).toBe(2);
    expect(performance.gridLineLevels).toBe(2);
  });

  it('keeps every optional visual feature enabled on both profiles', () => {
    for (const q of [quality, performance]) {
      expect(q.jetEnabled).toBe(true);
      expect(q.gridMaxAnchors).toBe(3);
    }
  });

  it('does not dim or tint one profile relative to the other', () => {
    // Brightness knobs cost nothing, so a difference is a pure look change.
    expect(performance.effectIntensity).toBe(quality.effectIntensity);
    expect(performance.gasOpacity).toBe(quality.gasOpacity);
    expect(performance.reflectionIntensity).toBe(quality.reflectionIntensity);
  });

  it('leaves the quality bloom scale unset so it matches the desktop path', () => {
    expect(quality.bloomResolutionScale).toBeUndefined();
    expect(performance.bloomResolutionScale).toBe(0.5);
  });

  it('is genuinely cheaper on the knobs that cost fill rate and vertices', () => {
    expect(performance.gridRings).toBeLessThan(quality.gridRings);
    expect(performance.gridSpokes).toBeLessThan(quality.gridSpokes);
    expect(performance.dustCount).toBeLessThan(quality.dustCount);
    expect(performance.reflectionResolution).toBeLessThan(quality.reflectionResolution);
    expect(performance.blackHoleDiskSteps).toBeLessThan(quality.blackHoleDiskSteps);
    expect(performance.orbitSegments).toBeLessThan(quality.orbitSegments);
  });

  it('resolves every body in full on quality', () => {
    // A zero pixel-radius threshold means no body is ever demoted by distance.
    expect(quality.detailedBodyPixelRadius).toBe(0);
    expect(performance.detailedBodyPixelRadius).toBeGreaterThan(0);
  });
});
