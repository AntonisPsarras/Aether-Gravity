/**
 * Auto graphics: pick a render profile from measured frame time.
 *
 * Replaces `DeviceTierHysteresis`, which could not do this job. That class
 * gated every upgrade on `hardwareCeiling === 'high'`, and the ceiling was the
 * tier `classifyDeviceCapabilities` guessed before a single frame was drawn.
 * Since that guess returns 'low' whenever `navigator.deviceMemory <= 4` — which
 * is what most Android phones report — a phone was pinned to the cheap profile
 * forever no matter how fast it actually ran. That is why previous "auto
 * quality" passes changed nothing on the reporter's device.
 *
 * The fix is to stop treating a hardware guess as a ceiling. The ONLY input
 * here is measured frame time. The hardware guess seeds the starting profile so
 * a desktop does not spend its first seconds on the cheap path and a weak phone
 * does not spend them stuttering, but from then on the device earns its profile.
 *
 * Everything below is allocation-free on the hot path: `observe` is called once
 * per rendered frame.
 */
import type { RenderProfile } from './graphicsQuality';

export interface AutoGraphicsConfig {
  /** Frames skipped after mount, covering shader compilation and first upload. */
  warmupFrames: number;
  /** Frames per evaluation window. */
  windowFrames: number;
  /** Frame time counted as too slow, ms. 20 ms ≈ 50 fps. */
  slowFrameMs: number;
  /** Frame time counted as comfortably fast, ms. 17.5 ms ≈ 57 fps. */
  fastFrameMs: number;
  /** Consecutive fast windows required before upgrading. */
  upgradeWindows: number;
  /** Consecutive slow windows required before downgrading. Downgrade fails fast. */
  downgradeWindows: number;
  /** Frames ignored after any profile change, covering the geometry rebuild. */
  settleFrames: number;
  /** Failed upgrades tolerated before latching to `performance` for the session. */
  maxUpgradeAttempts: number;
  /** Frames longer than this are stalls (GC, tab switch, world load), not slowness. */
  stallFrameMs: number;
  /** Windows after an upgrade within which a downgrade counts as a failed upgrade. */
  demotionGraceWindows: number;
}

export const DEFAULT_AUTO_GRAPHICS_CONFIG: AutoGraphicsConfig = {
  warmupFrames: 180,
  windowFrames: 120,
  slowFrameMs: 20,
  fastFrameMs: 17.5,
  upgradeWindows: 4,
  downgradeWindows: 1,
  settleFrames: 90,
  maxUpgradeAttempts: 2,
  stallFrameMs: 250,
  demotionGraceWindows: 6,
};

/**
 * Frame-time driven profile controller.
 *
 * Judges a window on its 90th-percentile frame time rather than on
 * consecutive-frame counters: one stutter should not demote a device that is
 * otherwise comfortable, and a handful of fast frames should not promote one
 * that is not. The percentile is computed by counting, not by sorting, so no
 * allocation or O(n log n) work happens per window.
 */
export class AutoGraphicsController {
  private current: RenderProfile;
  private frames = 0;
  private warmed = 0;
  private settle = 0;
  private slowCount = 0;
  private fastCount = 0;
  private fastWindows = 0;
  private slowWindows = 0;
  private failedUpgrades = 0;
  private windowsSinceUpgrade = Number.POSITIVE_INFINITY;
  private isLatched = false;
  private readonly cfg: AutoGraphicsConfig;

  constructor(seed: RenderProfile, config: Partial<AutoGraphicsConfig> = {}) {
    this.current = seed;
    this.cfg = { ...DEFAULT_AUTO_GRAPHICS_CONFIG, ...config };
  }

  get profile(): RenderProfile {
    return this.current;
  }

  /** True once the controller has given up trying to reach `quality`. */
  get latched(): boolean {
    return this.isLatched;
  }

  /**
   * Feed one frame. Returns the new profile when it changes, else null.
   * `deltaSeconds` is the raw frame delta from the render loop.
   */
  observe(deltaSeconds: number): RenderProfile | null {
    if (this.isLatched) return null;

    const ms = deltaSeconds * 1000;
    // A stall is not evidence about sustained capability.
    if (!(ms > 0) || ms > this.cfg.stallFrameMs) return null;

    if (this.warmed < this.cfg.warmupFrames) {
      this.warmed++;
      return null;
    }
    if (this.settle > 0) {
      this.settle--;
      return null;
    }

    this.frames++;
    if (ms > this.cfg.slowFrameMs) this.slowCount++;
    else if (ms < this.cfg.fastFrameMs) this.fastCount++;

    if (this.frames < this.cfg.windowFrames) return null;
    return this.closeWindow();
  }

  /** Evaluate one full window and reset the counters. */
  private closeWindow(): RenderProfile | null {
    const { windowFrames } = this.cfg;
    // "90th percentile is slow" ⇔ more than 10% of frames were slow.
    const windowIsSlow = this.slowCount * 10 > windowFrames;
    // Require a clear majority of comfortably fast frames to call a window fast.
    const windowIsFast = !windowIsSlow && this.fastCount * 10 >= windowFrames * 9;

    this.frames = 0;
    this.slowCount = 0;
    this.fastCount = 0;
    if (this.windowsSinceUpgrade !== Number.POSITIVE_INFINITY) this.windowsSinceUpgrade++;

    if (windowIsSlow) {
      this.slowWindows++;
      this.fastWindows = 0;
    } else if (windowIsFast) {
      this.fastWindows++;
      this.slowWindows = 0;
    } else {
      this.fastWindows = 0;
      this.slowWindows = 0;
      return null;
    }

    if (this.current === 'quality' && this.slowWindows >= this.cfg.downgradeWindows) {
      return this.change('performance');
    }
    if (this.current === 'performance' && this.fastWindows >= this.cfg.upgradeWindows) {
      // Every attempt past the cap would only re-run the geometry rebuild the
      // user sees as a pop, so stop attempting rather than oscillate.
      if (this.failedUpgrades >= this.cfg.maxUpgradeAttempts) {
        this.isLatched = true;
        return null;
      }
      return this.change('quality');
    }
    return null;
  }

  private change(next: RenderProfile): RenderProfile {
    // A downgrade shortly after an upgrade means the upgrade was a mistake.
    if (next === 'performance' && this.windowsSinceUpgrade <= this.cfg.demotionGraceWindows) {
      this.failedUpgrades++;
      if (this.failedUpgrades >= this.cfg.maxUpgradeAttempts) this.isLatched = true;
    }
    this.windowsSinceUpgrade = next === 'quality' ? 0 : Number.POSITIVE_INFINITY;
    this.current = next;
    this.fastWindows = 0;
    this.slowWindows = 0;
    // The profile change itself rebuilds lattice geometry and recompiles
    // shaders, which produces slow frames that would otherwise immediately
    // trigger the opposite change. Ignore them.
    this.settle = this.cfg.settleFrames;
    return next;
  }
}
