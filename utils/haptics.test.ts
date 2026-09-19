import { beforeEach, describe, expect, it, vi } from 'vitest';

const { impact } = vi.hoisted(() => ({ impact: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact, selectionStart: vi.fn(), selectionChanged: vi.fn(), selectionEnd: vi.fn() },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
}));

import { fireOptionalHaptic } from './haptics';

describe('optional native haptic diagnostics', () => {
  beforeEach(() => impact.mockReset());

  it('reports a fixed code for an optional native failure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fireOptionalHaptic(() => { throw new Error('sensitive native detail'); });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledWith('Aether: native-haptic-failed');
    warn.mockRestore();
  });

  it('reports the same fixed code for a rejected native promise', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fireOptionalHaptic(() => Promise.reject(new Error('sensitive native detail')));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalledWith('Aether: native-haptic-failed');
    warn.mockRestore();
  });
});
