import { describe, expect, it, beforeEach } from 'vitest';
import { consumeBackPress, registerBackHandler, resetBackHandlers } from './backNavigation';

describe('backNavigation', () => {
  beforeEach(() => {
    resetBackHandlers();
  });

  it('returns false when no handlers are registered', () => {
    expect(consumeBackPress()).toBe(false);
  });

  it('runs the most recently registered handler first', () => {
    const order: string[] = [];
    registerBackHandler(() => {
      order.push('outer');
      return false;
    });
    registerBackHandler(() => {
      order.push('inner');
      return true;
    });

    expect(consumeBackPress()).toBe(true);
    expect(order).toEqual(['inner']);
  });

  it('falls through to earlier handlers when inner handler returns false', () => {
    registerBackHandler(() => true);
    registerBackHandler(() => false);

    expect(consumeBackPress()).toBe(true);
  });

  it('unregisters handlers on cleanup', () => {
    const unregister = registerBackHandler(() => true);
    unregister();
    expect(consumeBackPress()).toBe(false);
  });
});
