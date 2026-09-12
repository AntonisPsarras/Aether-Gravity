import { describe, expect, it } from 'vitest';
import { AutoGraphicsController, DEFAULT_AUTO_GRAPHICS_CONFIG } from './autoGraphics';
import type { RenderProfile } from './graphicsQuality';

const CFG = DEFAULT_AUTO_GRAPHICS_CONFIG;
const FAST = 1 / 120; // 8.3 ms — comfortably inside the 60fps budget
const SLOW = 1 / 30;  // 33 ms

/** Feed n frames of the same delta, returning every profile change observed. */
function feed(c: AutoGraphicsController, seconds: number, n: number): RenderProfile[] {
  const changes: RenderProfile[] = [];
  for (let i = 0; i < n; i++) {
    const next = c.observe(seconds);
    if (next) changes.push(next);
  }
  return changes;
}

describe('auto graphics controller', () => {
  it('ignores everything during warmup', () => {
    const c = new AutoGraphicsController('performance');
    expect(feed(c, FAST, CFG.warmupFrames)).toEqual([]);
    expect(c.profile).toBe('performance');
  });

  /**
   * The regression guard for the reported bug. `DeviceTierHysteresis` gated its
   * upgrade on `hardwareCeiling === 'high'`, so a phone that
   * `classifyDeviceCapabilities` called 'low' — which is any phone reporting
   * `deviceMemory: 4` — could never be promoted no matter how fast it ran. The
   * old test suite asserted that as intended behaviour.
   */
  it('promotes a device seeded as performance once it sustains 60fps', () => {
    const c = new AutoGraphicsController('performance');
    feed(c, FAST, CFG.warmupFrames);
    const changes = feed(c, FAST, CFG.windowFrames * CFG.upgradeWindows);
    expect(changes).toEqual(['quality']);
    expect(c.profile).toBe('quality');
  });

  it('does not promote on a single fast window', () => {
    const c = new AutoGraphicsController('performance');
    feed(c, FAST, CFG.warmupFrames);
    expect(feed(c, FAST, CFG.windowFrames)).toEqual([]);
    expect(c.profile).toBe('performance');
  });

  it('demotes a struggling device quickly', () => {
    const c = new AutoGraphicsController('quality');
    feed(c, FAST, CFG.warmupFrames);
    const changes = feed(c, SLOW, CFG.windowFrames * CFG.downgradeWindows);
    expect(changes).toEqual(['performance']);
  });

  it('ignores stalls rather than counting them as slowness', () => {
    const c = new AutoGraphicsController('quality');
    feed(c, FAST, CFG.warmupFrames);
    // A tab switch, a GC pause or a world load: seconds-long frames that say
    // nothing about sustained capability.
    expect(feed(c, 2, CFG.windowFrames * 4)).toEqual([]);
    expect(c.profile).toBe('quality');
  });

  it('suppresses observation while the scene settles after a change', () => {
    const c = new AutoGraphicsController('quality');
    feed(c, FAST, CFG.warmupFrames);
    feed(c, SLOW, CFG.windowFrames * CFG.downgradeWindows);
    expect(c.profile).toBe('performance');
    // The geometry rebuild and shader recompile that the change itself causes
    // must not immediately be read as evidence about the new profile.
    const during = feed(c, SLOW, CFG.settleFrames);
    expect(during).toEqual([]);
  });

  /**
   * Each profile flip rebuilds and disposes both lattice geometries, which the
   * user sees as a pop. A device on the boundary must settle rather than
   * oscillate forever.
   */
  it('latches to performance after repeated failed upgrades', () => {
    const c = new AutoGraphicsController('performance');
    feed(c, FAST, CFG.warmupFrames);

    for (let attempt = 0; attempt < CFG.maxUpgradeAttempts; attempt++) {
      feed(c, FAST, CFG.windowFrames * CFG.upgradeWindows);
      expect(c.profile).toBe('quality');
      feed(c, FAST, CFG.settleFrames);
      // Quality turns out to be too slow, so it falls straight back.
      feed(c, SLOW, CFG.windowFrames * CFG.downgradeWindows);
      expect(c.profile).toBe('performance');
      feed(c, FAST, CFG.settleFrames);
    }

    expect(c.latched).toBe(true);
    // However fast it now looks, no further churn is produced.
    expect(feed(c, FAST, CFG.windowFrames * CFG.upgradeWindows * 4)).toEqual([]);
    expect(c.profile).toBe('performance');
  });

  it('reports no change when frame times sit between the thresholds', () => {
    const c = new AutoGraphicsController('performance');
    feed(c, FAST, CFG.warmupFrames);
    // ~54fps: not comfortable enough to promote, not slow enough to demote.
    expect(feed(c, 1 / 54, CFG.windowFrames * CFG.upgradeWindows * 2)).toEqual([]);
    expect(c.profile).toBe('performance');
  });

  it('tolerates an occasional slow frame inside an otherwise fast window', () => {
    const c = new AutoGraphicsController('performance');
    feed(c, FAST, CFG.warmupFrames);
    const changes: RenderProfile[] = [];
    for (let i = 0; i < CFG.windowFrames * CFG.upgradeWindows; i++) {
      // One frame in fifty misses the budget.
      const next = c.observe(i % 50 === 0 ? SLOW : FAST);
      if (next) changes.push(next);
    }
    expect(changes).toEqual(['quality']);
  });
});
