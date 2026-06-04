import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { isE2EMode } from '../utils/e2eConfig';
import {
  markTestBridgeCanvasReady,
  recordTestFrame,
  registerTestMetricsCollector,
  unregisterTestMetricsCollector,
} from '../utils/testBridge';

/**
 * Dev/E2E-only frame sampler — feeds the Playwright perf harness via window.__AETHER_TEST__.
 */
export default function TestMetricsCollector(): null {
  const enabled = isE2EMode();

  useEffect(() => {
    if (!enabled) return;
    registerTestMetricsCollector({ pushFrame: recordTestFrame });
    return () => unregisterTestMetricsCollector();
  }, [enabled]);

  useFrame((_state, delta) => {
    if (!enabled) return;
    markTestBridgeCanvasReady();
    recordTestFrame(delta * 1000);
  });

  return null;
}
