import { describe, expect, it, beforeEach } from 'vitest';
import {
  consumeBackPress, registerBackHandler, resetBackHandlers,
  resolveSimBackAction, detentBelowName,
  type SimBackState, type SimBackAction,
} from './backNavigation';

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

describe('resolveSimBackAction', () => {
  const base: SimBackState = {
    storageNotice: false,
    confirmOpen: false,
    settingsOpen: false,
    helperOpen: false,
    creationMode: false,
    isPhone: false,
    inspectorOpen: false,
    inspectorDetent: 'half',
    outlinerOpen: false,
    hasSelection: false,
  };

  it('falls through to the menu when nothing is open', () => {
    expect(resolveSimBackAction(base)).toBe('returnToMenu');
  });

  it('honours the transient-overlay priority order', () => {
    // Everything open at once: the most transient thing must go first.
    const all: SimBackState = {
      ...base, storageNotice: true, confirmOpen: true, settingsOpen: true, helperOpen: true,
      creationMode: true, isPhone: true, inspectorOpen: true, inspectorDetent: 'full',
      outlinerOpen: true, hasSelection: true,
    };
    expect(resolveSimBackAction(all)).toBe('dismissNotice');
    expect(resolveSimBackAction({ ...all, storageNotice: false })).toBe('cancelConfirm');
    expect(resolveSimBackAction({ ...all, storageNotice: false, confirmOpen: false }))
      .toBe('closeSettings');
    expect(resolveSimBackAction({ ...all, storageNotice: false, confirmOpen: false, settingsOpen: false }))
      .toBe('dismissHelper');
    expect(resolveSimBackAction({
      ...all, storageNotice: false, confirmOpen: false, settingsOpen: false, helperOpen: false,
    })).toBe('exitCreationMode');
  });

  it('dismisses the settings sheet before anything it covers', () => {
    // The sheet sits over the HUD, so it is what a back press is aimed at.
    const open = { ...base, settingsOpen: true, isPhone: true, outlinerOpen: true, hasSelection: true };
    expect(resolveSimBackAction(open)).toBe('closeSettings');
    expect(resolveSimBackAction({ ...open, settingsOpen: false })).toBe('closeOutliner');
  });

  it('steps the phone sheet down one detent at a time before closing it', () => {
    const phone = { ...base, isPhone: true, inspectorOpen: true, hasSelection: true };
    expect(resolveSimBackAction({ ...phone, inspectorDetent: 'full' })).toBe('collapseInspector');
    expect(resolveSimBackAction({ ...phone, inspectorDetent: 'half' })).toBe('collapseInspector');
    // At the smallest detent there is nowhere left to collapse to.
    expect(resolveSimBackAction({ ...phone, inspectorDetent: 'peek' })).toBe('closeInspector');
  });

  it('never collapses detents on tablet or desktop', () => {
    // Those tiers have no sheet, so a back press must dismiss immediately.
    const wide = { ...base, isPhone: false, inspectorOpen: true, inspectorDetent: 'full' };
    expect(resolveSimBackAction(wide)).toBe('closeInspector');
  });

  it('closes the outliner sheet only on phone, and only once the inspector is at peek', () => {
    const phone = { ...base, isPhone: true, outlinerOpen: true };
    expect(resolveSimBackAction(phone)).toBe('closeOutliner');
    expect(resolveSimBackAction({ ...phone, inspectorOpen: true, inspectorDetent: 'half' }))
      .toBe('collapseInspector');
    expect(resolveSimBackAction({ ...phone, inspectorOpen: true, inspectorDetent: 'peek' }))
      .toBe('closeOutliner');
    // Desktop keeps its left rail open; back should not touch it.
    expect(resolveSimBackAction({ ...base, outlinerOpen: true })).toBe('returnToMenu');
  });

  it('clears a bare selection before leaving the simulation', () => {
    expect(resolveSimBackAction({ ...base, hasSelection: true })).toBe('clearSelection');
  });

  it('always terminates: repeated presses reach the menu', () => {
    // Guards against a back-stack sink. Collapsible sections are deliberately
    // not participants for exactly this reason.
    let state: SimBackState = {
      storageNotice: true, confirmOpen: true, settingsOpen: true, helperOpen: true,
      creationMode: true, isPhone: true,
      inspectorOpen: true, inspectorDetent: 'full', outlinerOpen: true, hasSelection: true,
    };
    const seen: SimBackAction[] = [];
    for (let i = 0; i < 20; i++) {
      const action = resolveSimBackAction(state);
      seen.push(action);
      if (action === 'returnToMenu') break;
      switch (action) {
        case 'dismissNotice': state = { ...state, storageNotice: false }; break;
        case 'cancelConfirm': state = { ...state, confirmOpen: false }; break;
        case 'closeSettings': state = { ...state, settingsOpen: false }; break;
        case 'dismissHelper': state = { ...state, helperOpen: false }; break;
        case 'exitCreationMode': state = { ...state, creationMode: false }; break;
        case 'collapseInspector':
          state = { ...state, inspectorDetent: detentBelowName(state.inspectorDetent)! };
          break;
        case 'closeOutliner': state = { ...state, outlinerOpen: false }; break;
        case 'closeInspector': state = { ...state, inspectorOpen: false, hasSelection: false }; break;
        case 'clearSelection': state = { ...state, hasSelection: false }; break;
      }
    }
    expect(seen[seen.length - 1]).toBe('returnToMenu');
    expect(seen.length).toBeLessThanOrEqual(10);
  });
});

describe('detentBelowName', () => {
  it('walks down the ladder and stops at the smallest', () => {
    expect(detentBelowName('full')).toBe('half');
    expect(detentBelowName('half')).toBe('peek');
    expect(detentBelowName('peek')).toBeNull();
    expect(detentBelowName('nonsense')).toBeNull();
  });
});

describe('detent ladder agrees with the store', () => {
  it('matches SHEET_DETENTS and detentBelow', async () => {
    // backNavigation keeps a string-typed mirror so the back-stack policy stays
    // a pure module. This pins the two definitions together.
    const { SHEET_DETENTS, detentBelow } = await import('./store');
    for (const d of SHEET_DETENTS) {
      expect(detentBelowName(d)).toBe(detentBelow(d));
    }
  });
});
