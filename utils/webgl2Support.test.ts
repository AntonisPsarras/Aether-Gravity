import { afterEach, describe, expect, it, vi } from 'vitest';
import { isWebGL2Available } from './webgl2Support';

describe('isWebGL2Available', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when document is missing', () => {
    vi.stubGlobal('document', undefined);
    expect(isWebGL2Available()).toBe(false);
  });

  it('returns true when canvas.getContext("webgl2") yields a context', () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: (type: string) => (type === 'webgl2' ? {} : null),
      }),
    });
    expect(isWebGL2Available()).toBe(true);
  });

  it('returns false when getContext("webgl2") is null', () => {
    vi.stubGlobal('document', {
      createElement: () => ({
        getContext: () => null,
      }),
    });
    expect(isWebGL2Available()).toBe(false);
  });

  it('returns false when probing throws', () => {
    vi.stubGlobal('document', {
      createElement: () => {
        throw new Error('canvas unavailable');
      },
    });
    expect(isWebGL2Available()).toBe(false);
  });
});
