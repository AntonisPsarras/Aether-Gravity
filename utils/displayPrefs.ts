/**
 * Global, cross-world user preferences.
 *
 * The per-world settings blob (`WorldSettings` in types.ts) is deliberately not
 * the home for this: Beginner/Advanced is a property of the *person*, not of a
 * saved universe, and it must survive returning to the menu and opening a
 * different world.
 *
 * Storage mirrors `utils/onboarding.ts` exactly — same defensive shape, same
 * module-level memory fallback so private browsing, quota policies and corrupt
 * JSON degrade to a working session rather than a blank screen.
 */
import { isUiMode, type UiMode } from './displayMode';
import { DEFAULT_GRAPHICS_MODE, isGraphicsMode, type GraphicsMode } from './graphicsQuality';
import { getOnboardingProgress } from './onboarding';
import { readStorageJson, reportStorageIssue, writeStorageJsonVerified } from './browserStorage';

export const DISPLAY_PREFS_STORAGE_KEY = 'aether:prefs:v1';

export interface DisplayPrefs {
  version: 1;
  uiMode: UiMode;
  /**
   * Quality / Performance / Auto. Global rather than per-world for the same
   * reason as `uiMode`: it describes the *device* the person is holding, not
   * anything about a saved universe, so `store.loadWorld` must never reset it.
   */
  graphicsMode: GraphicsMode;
}

/**
 * Seed for a user with no stored preference. Someone who has already finished
 * the tutorial knows the app, so demoting them to a reduced UI would be a
 * regression; a genuine first-timer gets the gentler view. Read once, then the
 * preference is independent of onboarding forever.
 */
const seedMode = (): UiMode => {
  try {
    return getOnboardingProgress().tutorialSeen ? 'advanced' : 'beginner';
  } catch {
    return 'beginner';
  }
};

const defaultPrefs = (): DisplayPrefs => ({
  version: 1,
  uiMode: seedMode(),
  graphicsMode: DEFAULT_GRAPHICS_MODE,
});

let memoryPrefs: DisplayPrefs | null = null;

/**
 * `uiMode` is still required — a blob without it is not ours and is rejected.
 * `graphicsMode` is *default-filled* instead, because every blob written before
 * the setting existed lacks it; rejecting those would silently demote every
 * existing user back to the seeded Beginner/Advanced default.
 */
export function parseDisplayPrefs(raw: unknown): DisplayPrefs | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<DisplayPrefs>;
  if (!isUiMode(value.uiMode)) return null;
  return {
    version: 1,
    uiMode: value.uiMode,
    graphicsMode: isGraphicsMode(value.graphicsMode) ? value.graphicsMode : DEFAULT_GRAPHICS_MODE,
  };
}

export function getDisplayPrefs(): DisplayPrefs {
  if (memoryPrefs) return { ...memoryPrefs };
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = readStorageJson(DISPLAY_PREFS_STORAGE_KEY);
      const parsed = parseDisplayPrefs(stored);
      if (parsed) {
        memoryPrefs = parsed;
        return { ...memoryPrefs };
      }
      if (stored !== null) {
        reportStorageIssue({
          kind: 'corrupt', key: DISPLAY_PREFS_STORAGE_KEY,
          message: 'The saved display preference has an invalid shape.',
        });
      }
    }
  } catch {
    // Unreadable storage falls through to the seeded default.
  }
  memoryPrefs = defaultPrefs();
  return { ...memoryPrefs };
}

function saveDisplayPrefs(prefs: DisplayPrefs): DisplayPrefs {
  memoryPrefs = parseDisplayPrefs(prefs) ?? defaultPrefs();
  try {
    if (typeof localStorage !== 'undefined') {
      writeStorageJsonVerified(DISPLAY_PREFS_STORAGE_KEY, memoryPrefs);
    }
  } catch {
    // Keep the session-level memory fallback when persistent storage is unavailable.
  }
  return { ...memoryPrefs };
}

export const getUiMode = (): UiMode => getDisplayPrefs().uiMode;

/** Merges, never replaces: writing one preference must not drop the others. */
export const saveUiMode = (uiMode: UiMode): DisplayPrefs =>
  saveDisplayPrefs({ ...getDisplayPrefs(), uiMode });

export const getGraphicsMode = (): GraphicsMode => getDisplayPrefs().graphicsMode;

export const saveGraphicsMode = (graphicsMode: GraphicsMode): DisplayPrefs =>
  saveDisplayPrefs({ ...getDisplayPrefs(), graphicsMode });

export function resetDisplayPrefsMemoryForTests(): void {
  memoryPrefs = null;
}
