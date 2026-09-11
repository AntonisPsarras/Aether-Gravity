import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import {
  ONBOARDING_STORAGE_KEY,
  enqueueUnseenHelpers,
  getOnboardingProgress,
  helperDefinition,
  helpersForTrigger,
  markHelperSeen,
  markTutorialSeen,
  parseOnboardingProgress,
  resetOnboardingMemoryForTests,
} from './onboarding';
import { subscribeStorageIssues, type StorageIssue } from './browserStorage';

const body = (overrides: Partial<CelestialBody> = {}): CelestialBody => ({
  id: 'body', type: 'Planet', mass: 1, radius: 1, radiusKm: 6371,
  position: new THREE.Vector3(), velocity: new THREE.Vector3(),
  color: '#fff', texture: 'rock', trailColor: '#fff', temperature: 288,
  habitability: 'N/A', population: 0, name: 'Test body', properties: {},
  ...overrides,
});

describe('onboarding progress', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    resetOnboardingMemoryForTests();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'localStorage');
    resetOnboardingMemoryForTests();
  });

  it('sanitizes malformed and unknown persisted values', () => {
    expect(parseOnboardingProgress(null)).toEqual({ version: 1, tutorialSeen: false, seenHelperIds: [] });
    expect(parseOnboardingProgress({
      version: 99,
      tutorialSeen: 'yes',
      seenHelperIds: ['panel:creation', 'panel:creation', 'future:tip', 42],
    })).toEqual({ version: 1, tutorialSeen: false, seenHelperIds: ['panel:creation'] });

    values.set(ONBOARDING_STORAGE_KEY, '{bad json');
    expect(getOnboardingProgress()).toEqual({ version: 1, tutorialSeen: false, seenHelperIds: [] });
  });

  it('persists tutorial and helper acknowledgement without duplicates', () => {
    markTutorialSeen();
    markHelperSeen('panel:inspector');
    markHelperSeen('panel:inspector');

    expect(getOnboardingProgress()).toEqual({
      version: 1,
      tutorialSeen: true,
      seenHelperIds: ['panel:inspector'],
    });
    expect(JSON.parse(values.get(ONBOARDING_STORAGE_KEY)!)).toEqual(getOnboardingProgress());
  });

  it('keeps a session fallback when localStorage rejects writes', () => {
    const issues: StorageIssue[] = [];
    const unsubscribe = subscribeStorageIssues((issue) => issues.push(issue));
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => { throw new DOMException('blocked', 'QuotaExceededError'); },
      },
    });
    markHelperSeen('panel:analysis');
    expect(getOnboardingProgress().seenHelperIds).toEqual(['panel:analysis']);
    expect(issues.some((issue) => issue.kind === 'quota' && issue.key === ONBOARDING_STORAGE_KEY)).toBe(true);
    unsubscribe();
  });
});

describe('helper trigger resolution', () => {
  it('queues panel then body education for an inspected object', () => {
    const star = body({ id: 'sun', type: 'Star', name: 'Sun' });
    expect(helpersForTrigger({ kind: 'inspector-open', body: star })).toEqual([
      { id: 'panel:inspector' },
      { id: 'body:Star', bodyId: 'sun' },
    ]);
  });

  it('deduplicates queued and acknowledged helpers', () => {
    const star = body({ id: 'sun', type: 'Star' });
    const first = enqueueUnseenHelpers([], { kind: 'inspector-open', body: star }, ['panel:inspector']);
    const second = enqueueUnseenHelpers(first, { kind: 'inspector-open', body: star }, ['panel:inspector']);
    expect(second).toEqual([{ id: 'body:Star', bodyId: 'sun' }]);
  });

  it('queues the grid explainer after a new body\'s lesson, only while the grid is visible', () => {
    const planet = body({ id: 'p', type: 'Planet' });
    expect(helpersForTrigger({ kind: 'body-created', body: planet, gridVisible: true })).toEqual([
      { id: 'body:Planet', bodyId: 'p' },
      { id: 'panel:grid' },
    ]);
    expect(helpersForTrigger({ kind: 'body-created', body: planet })).toEqual([
      { id: 'body:Planet', bodyId: 'p' },
    ]);
    expect(helpersForTrigger({ kind: 'grid-visible' })).toEqual([{ id: 'panel:grid' }]);
    expect(enqueueUnseenHelpers([], { kind: 'grid-visible' }, ['panel:grid'])).toEqual([]);
    expect(parseOnboardingProgress({ seenHelperIds: ['panel:grid'] }).seenHelperIds).toEqual(['panel:grid']);
    expect(helperDefinition({ id: 'panel:grid' }, []).content).toContain('potential');
  });

  it('does not claim that a free Moon is already a satellite', () => {
    const moon = body({ id: 'moon', type: 'Moon', name: 'New Moon', mass: 0.01 });
    const definition = helperDefinition({ id: 'body:Moon', bodyId: moon.id }, [moon]);
    expect(definition.content).toContain('Hill sphere');
    expect(definition.detail).toContain('free body');
  });

  it('uses the current black-hole spin in its Kerr explanation', () => {
    const hole = body({
      id: 'hole', type: 'Black Hole', name: 'Kerr Lab', mass: 10 * 332_946,
      properties: { spinParameter: 0.9 },
    });
    const definition = helperDefinition({ id: 'body:Black Hole', bodyId: hole.id }, [hole]);
    expect(definition.content).toContain('dimensionless spin');
    expect(definition.detail).toContain('a* = 0.900');
    expect(definition.detail).toContain('0.998');
    expect(definition.detail).toContain('ISCO');
  });
});
