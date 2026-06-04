export type DeviceTierOverride = 'low' | 'high';

export interface E2EConfig {
  enabled: boolean;
  fixture: string | null;
  tier: DeviceTierOverride | null;
  touch: boolean | null;
  dpr: number | null;
}

const DISABLED: E2EConfig = {
  enabled: false,
  fixture: null,
  tier: null,
  touch: null,
  dpr: null,
};

/** Parse `?e2e=1&fixture=…&tier=low&touch=1&dpr=1` from the current URL. */
export function parseE2ESearchParams(search: string): E2EConfig {
  const params = new URLSearchParams(search);
  if (params.get('e2e') !== '1') return { ...DISABLED };

  const tierRaw = params.get('tier');
  const tier =
    tierRaw === 'low' || tierRaw === 'high' ? tierRaw : null;

  const touchRaw = params.get('touch');
  const touch =
    touchRaw === '1' || touchRaw === 'true'
      ? true
      : touchRaw === '0' || touchRaw === 'false'
        ? false
        : null;

  const dprRaw = params.get('dpr');
  const dprParsed = dprRaw != null ? Number(dprRaw) : NaN;
  const dpr = Number.isFinite(dprParsed) && dprParsed > 0 ? dprParsed : null;

  return {
    enabled: true,
    fixture: params.get('fixture'),
    tier,
    touch,
    dpr,
  };
}

export function getE2EConfig(): E2EConfig {
  if (typeof window === 'undefined') return { ...DISABLED };
  return parseE2ESearchParams(window.location.search);
}

export function isE2EMode(): boolean {
  return getE2EConfig().enabled;
}
