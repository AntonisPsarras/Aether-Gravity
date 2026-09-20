import { beforeEach, describe, expect, it, vi } from 'vitest';

const { impact } = vi.hoisted(() => ({ impact: vi.fn() }));
const { reportDiagnostic } = vi.hoisted(() => ({ reportDiagnostic: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact, selectionStart: vi.fn(), selectionChanged: vi.fn(), selectionEnd: vi.fn() },
  ImpactStyle: { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' },
}));
vi.mock('./diagnostics', () => ({ reportDiagnostic }));

import { fireOptionalHaptic } from './haptics';

describe('optional native haptic diagnostics', () => {
  beforeEach(() => {
    impact.mockReset();
    reportDiagnostic.mockReset();
  });

  it('reports a fixed code for an optional native failure', async () => {
    fireOptionalHaptic(() => { throw new Error('sensitive native detail'); });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reportDiagnostic).toHaveBeenCalledWith('native-haptic-failed', expect.any(Error));
    expect(reportDiagnostic.mock.calls[0][1].message).toBe('sensitive native detail');
  });

  it('reports the same fixed code for a rejected native promise', async () => {
    fireOptionalHaptic(() => Promise.reject(new Error('sensitive native detail')));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reportDiagnostic).toHaveBeenCalledWith('native-haptic-failed', expect.any(Error));
    expect(reportDiagnostic.mock.calls[0][1].message).toBe('sensitive native detail');
  });
});
