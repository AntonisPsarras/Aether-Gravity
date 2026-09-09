import { describe, expect, it } from 'vitest';
import { classifyDeviceCapabilities, combineDeviceTiers, DeviceTierHysteresis } from './deviceCapabilities';

describe('device capability classification', () => {
  it('detects constrained CPU and memory independently of user agent', () => {
    expect(classifyDeviceCapabilities({ memoryGb: 4, logicalCores: 8 })).toBe('low');
    expect(classifyDeviceCapabilities({ memoryGb: 8, logicalCores: 4 })).toBe('low');
  });

  it('detects software, older integrated, and legacy mobile GPUs', () => {
    expect(classifyDeviceCapabilities({ renderer: 'ANGLE (Google, SwiftShader)' })).toBe('low');
    expect(classifyDeviceCapabilities({ renderer: 'Intel(R) UHD Graphics 620' })).toBe('low');
    expect(classifyDeviceCapabilities({ renderer: 'Adreno (TM) 530' })).toBe('low');
  });

  it('keeps capable mobile and privacy-restricted browsers high', () => {
    expect(classifyDeviceCapabilities({ isMobile: true, memoryGb: 8, logicalCores: 8, webgl2: true, maxTextureSize: 16384, maxRenderbufferSize: 8192, renderer: 'Apple GPU' })).toBe('high');
    expect(classifyDeviceCapabilities({})).toBe('high');
  });

  it('never promotes above a low hardware ceiling', () => {
    expect(combineDeviceTiers('low', 'high')).toBe('low');
    expect(combineDeviceTiers('high', 'high')).toBe('high');
  });

  it('uses sustained asymmetric frame-time hysteresis', () => {
    const adaptive = new DeviceTierHysteresis('high');
    for (let i = 0; i < 89; i++) expect(adaptive.observe(45)).toBeNull();
    expect(adaptive.observe(45)).toBe('low');
    for (let i = 0; i < 299; i++) expect(adaptive.observe(60)).toBeNull();
    expect(adaptive.observe(60)).toBe('high');

    const fixedLow = new DeviceTierHysteresis('low');
    for (let i = 0; i < 400; i++) fixedLow.observe(60);
    expect(fixedLow.tier).toBe('low');
  });
});
