import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DISPLAY_PREFS_STORAGE_KEY,
  getDisplayPrefs,
  getUiMode,
  parseDisplayPrefs,
  resetDisplayPrefsMemoryForTests,
  saveUiMode,
} from './displayPrefs';
import {
  ONBOARDING_STORAGE_KEY,
  markTutorialSeen,
  resetOnboardingMemoryForTests,
} from './onboarding';

// Same in-memory localStorage stub the onboarding suite uses; the test env is
// `node`, so there is no DOM storage to clear.
const values = new Map<string, string>();

beforeEach(() => {
  values.clear();
  resetDisplayPrefsMemoryForTests();
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
});

describe('parseDisplayPrefs', () => {
  it('rejects anything that is not a known mode', () => {
    expect(parseDisplayPrefs(null)).toBeNull();
    expect(parseDisplayPrefs('beginner')).toBeNull();
    expect(parseDisplayPrefs({})).toBeNull();
    expect(parseDisplayPrefs({ uiMode: 'expert' })).toBeNull();
  });

  it('accepts a well-formed record', () => {
    expect(parseDisplayPrefs({ version: 1, uiMode: 'advanced' })).toEqual({ version: 1, uiMode: 'advanced' });
  });
});

describe('first-run seeding', () => {
  it('seeds a brand-new user into Beginner Mode', () => {
    expect(getUiMode()).toBe('beginner');
  });

  it('seeds a user who has already finished the tutorial into Advanced Mode', () => {
    markTutorialSeen();
    resetDisplayPrefsMemoryForTests();
    expect(getUiMode()).toBe('advanced');
  });

  it('does not follow onboarding once an explicit choice has been stored', () => {
    saveUiMode('beginner');
    markTutorialSeen();
    resetDisplayPrefsMemoryForTests();
    expect(getUiMode()).toBe('beginner');
  });
});

describe('persistence', () => {
  it('round-trips a saved mode through localStorage', () => {
    saveUiMode('advanced');
    resetDisplayPrefsMemoryForTests();
    expect(getUiMode()).toBe('advanced');
    expect(JSON.parse(localStorage.getItem(DISPLAY_PREFS_STORAGE_KEY)!)).toEqual({
      version: 1, uiMode: 'advanced',
    });
  });

  it('falls back to the seeded default on corrupt JSON rather than throwing', () => {
    localStorage.setItem(DISPLAY_PREFS_STORAGE_KEY, '{not json');
    expect(() => getDisplayPrefs()).not.toThrow();
    expect(getUiMode()).toBe('beginner');
  });

  it('ignores a corrupt onboarding record when seeding', () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, '{{{');
    expect(() => getUiMode()).not.toThrow();
  });

  it('returns a copy, so callers cannot mutate the cached record', () => {
    saveUiMode('advanced');
    const prefs = getDisplayPrefs();
    prefs.uiMode = 'beginner';
    expect(getUiMode()).toBe('advanced');
  });
});
