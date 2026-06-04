import { describe, it, expect } from 'vitest';
import { parseE2ESearchParams } from './e2eConfig';

describe('parseE2ESearchParams', () => {
  it('returns disabled config without e2e flag', () => {
    expect(parseE2ESearchParams('')).toEqual({
      enabled: false,
      fixture: null,
      tier: null,
      touch: null,
      dpr: null,
    });
  });

  it('parses full e2e query string', () => {
    expect(
      parseE2ESearchParams('?e2e=1&fixture=minimal-3body&tier=low&touch=1&dpr=1.5'),
    ).toEqual({
      enabled: true,
      fixture: 'minimal-3body',
      tier: 'low',
      touch: true,
      dpr: 1.5,
    });
  });

  it('ignores invalid tier and dpr values', () => {
    const cfg = parseE2ESearchParams('?e2e=1&fixture=x&tier=ultra&dpr=0');
    expect(cfg.enabled).toBe(true);
    expect(cfg.tier).toBeNull();
    expect(cfg.dpr).toBeNull();
  });
});
