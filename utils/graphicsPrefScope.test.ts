import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from './store';
import { DISPLAY_PREFS_STORAGE_KEY, resetDisplayPrefsMemoryForTests } from './displayPrefs';
import type { WorldData } from '../types';

/**
 * The graphics mode is a property of the DEVICE, not of a saved universe, so it
 * must behave exactly like `uiMode`: global, persisted once, and untouched by
 * loading a world. It is absent from `WorldData.settings` and from `loadWorld`'s
 * `set({...})` on purpose — that omission is the entire mechanism, and it is
 * easy to undo by accident when someone adds the next per-world toggle.
 */
const emptyWorld = (id: string): WorldData => ({
  id,
  version: 2,
  bodies: [],
  settings: {
    speed: 3,
    showGrid: false,
    showDust: false,
    showHabitable: true,
    showStability: true,
    showOrbitPaths: false,
  },
});

// The test env is `node`, so there is no DOM storage. Same in-memory stub the
// display-prefs and onboarding suites use.
const values = new Map<string, string>();

describe('graphics mode is global, not per-world', () => {
  beforeEach(() => {
    values.clear();
    resetDisplayPrefsMemoryForTests();
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

  it('survives loading a world that carries its own display settings', () => {
    useStore.getState().setGraphicsMode('performance');
    expect(useStore.getState().graphicsMode).toBe('performance');

    useStore.getState().loadWorld(emptyWorld('w1'));

    expect(useStore.getState().graphicsMode).toBe('performance');
    // The world's own settings did land, so the load genuinely happened.
    expect(useStore.getState().showGrid).toBe(false);
    expect(useStore.getState().speed).toBe(3);
  });

  it('survives switching between worlds', () => {
    useStore.getState().setGraphicsMode('quality');
    useStore.getState().loadWorld(emptyWorld('w1'));
    useStore.getState().loadWorld(emptyWorld('w2'));
    expect(useStore.getState().graphicsMode).toBe('quality');
  });

  it('is not written into a world blob', () => {
    useStore.getState().setGraphicsMode('performance');
    const world = emptyWorld('w1');
    expect(world.settings).not.toHaveProperty('graphicsMode');
  });

  it('persists to the global preference record rather than to world storage', () => {
    useStore.getState().setGraphicsMode('performance');
    const stored = JSON.parse(localStorage.getItem(DISPLAY_PREFS_STORAGE_KEY)!);
    expect(stored.graphicsMode).toBe('performance');
  });

  it('survives resetSessionUiState, which runs when leaving a world', () => {
    useStore.getState().setGraphicsMode('performance');
    useStore.getState().resetSessionUiState();
    expect(useStore.getState().graphicsMode).toBe('performance');
  });

  it('keeps the auto verdict out of persistent storage', () => {
    // A measurement, not a preference: it must not be restored from a previous
    // session on different hardware or a different scene.
    useStore.getState().setGraphicsMode('auto');
    useStore.getState().setAutoRenderProfile('performance');
    const stored = JSON.parse(localStorage.getItem(DISPLAY_PREFS_STORAGE_KEY)!);
    expect(stored).not.toHaveProperty('autoRenderProfile');
  });
});
