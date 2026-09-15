import { describe, expect, it } from 'vitest';
import postcss from 'postcss';
import config from '../postcss.config.js';

describe('build input isolation', () => {
  it.each([undefined, 'fixture.css'])('does not parse attacker-supplied previous maps with from=%s', from => {
    const css = 'a{color:red}/*# sourceMappingURL=data:application/json;invalid,x */';
    // The installed vulnerable default attempts to parse the map and throws.
    expect(() => postcss([]).process(css, { from }).sync()).toThrow();
    const result = postcss([]).process(css, { from, map: config.map }).sync();
    expect(result.root?.source?.input.map).toBeUndefined();
    expect(result.root?.first?.type).toBe('rule');
  });
});
