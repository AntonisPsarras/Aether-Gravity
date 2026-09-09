export type DeviceTier = 'low' | 'high';

export interface DeviceCapabilitySnapshot {
  memoryGb?: number;
  logicalCores?: number;
  isMobile?: boolean;
  isTouch?: boolean;
  webgl2?: boolean;
  renderer?: string;
  vendor?: string;
  maxTextureSize?: number;
  maxRenderbufferSize?: number;
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i;
const LEGACY_MOBILE_GPU = /adreno \(tm\) [345]\d\d|mali-[4t][0-8]\d|powervr sgx|vivante/i;
const LEGACY_INTEL_GPU = /intel.*(?:hd graphics (?:[2345]\d{3}|[45]\d\d)|uhd graphics 6(?:0\d|1\d|2\d|3\d)|iris graphics 5\d{3})/i;

/** Pure, conservative capability classifier. Missing privacy-restricted signals are neutral. */
export function classifyDeviceCapabilities(c: DeviceCapabilitySnapshot): DeviceTier {
  const gpu = `${c.vendor ?? ''} ${c.renderer ?? ''}`;
  if (SOFTWARE_GPU.test(gpu) || LEGACY_MOBILE_GPU.test(gpu) || LEGACY_INTEL_GPU.test(gpu)) return 'low';
  if (c.memoryGb !== undefined && c.memoryGb <= 4) return 'low';
  if (c.logicalCores !== undefined && c.logicalCores <= 4) return 'low';
  if (c.maxTextureSize !== undefined && c.maxTextureSize < 8192) return 'low';
  if (c.maxRenderbufferSize !== undefined && c.maxRenderbufferSize < 4096) return 'low';
  if (c.webgl2 === false && (c.isMobile || c.isTouch)) return 'low';
  return 'high';
}

export function combineDeviceTiers(a: DeviceTier, b: DeviceTier): DeviceTier {
  return a === 'low' || b === 'low' ? 'low' : 'high';
}

/** Allocation-free sustained-frame detector with asymmetric downgrade/upgrade hysteresis. */
export class DeviceTierHysteresis {
  tier: DeviceTier;
  private slowFrames = 0;
  private fastFrames = 0;

  constructor(readonly hardwareCeiling: DeviceTier) {
    this.tier = hardwareCeiling;
  }

  observe(fps: number): DeviceTier | null {
    if (fps < 50) {
      this.slowFrames++;
      this.fastFrames = 0;
    } else if (fps > 58) {
      this.fastFrames++;
      this.slowFrames = 0;
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
      this.fastFrames = Math.max(0, this.fastFrames - 1);
    }
    if (this.tier === 'high' && this.slowFrames >= 90) {
      this.tier = 'low';
      this.slowFrames = 0;
      return this.tier;
    }
    if (this.tier === 'low' && this.hardwareCeiling === 'high' && this.fastFrames >= 300) {
      this.tier = 'high';
      this.fastFrames = 0;
      return this.tier;
    }
    return null;
  }
}
