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
import { getOnboardingProgress } from './onboarding';

export const DISPLAY_PREFS_STORAGE_KEY = 'aether:prefs:v1';

export interface DisplayPrefs {
  version: 1;
  uiMode: UiMode;
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

const defaultPrefs = (): DisplayPrefs => ({ version: 1, uiMode: seedMode() });

let memoryPrefs: DisplayPrefs | null = null;

export function parseDisplayPrefs(raw: unknown): DisplayPrefs | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<DisplayPrefs>;
  if (!isUiMode(value.uiMode)) return null;
  return { version: 1, uiMode: value.uiMode };
}

export function getDisplayPrefs(): DisplayPrefs {
  if (memoryPrefs) return { ...memoryPrefs };
  try {
    if (typeof localStorage !== 'undefined') {
      const parsed = parseDisplayPrefs(JSON.parse(localStorage.getItem(DISPLAY_PREFS_STORAGE_KEY) || 'null'));
      if (parsed) {
        memoryPrefs = parsed;
        return { ...memoryPrefs };
      }
    }
  } catch {
    // Unreadable storage falls through to the seeded default.
  }
  memoryPrefs = defaultPrefs();
  return { ...memoryPrefs };
}

export function saveDisplayPrefs(prefs: DisplayPrefs): DisplayPrefs {
  memoryPrefs = parseDisplayPrefs(prefs) ?? defaultPrefs();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DISPLAY_PREFS_STORAGE_KEY, JSON.stringify(memoryPrefs));
    }
  } catch {
    // Keep the session-level memory fallback when persistent storage is unavailable.
  }
  return { ...memoryPrefs };
}

export const getUiMode = (): UiMode => getDisplayPrefs().uiMode;

export const saveUiMode = (uiMode: UiMode): DisplayPrefs =>
  saveDisplayPrefs({ version: 1, uiMode });

export function resetDisplayPrefsMemoryForTests(): void {
  memoryPrefs = null;
}
