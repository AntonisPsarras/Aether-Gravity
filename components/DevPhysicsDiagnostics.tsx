import React, { Suspense, lazy } from 'react';
import { CelestialBody } from '../types';

const LazyPhysicsDiagnostics = import.meta.env.DEV
  ? lazy(() => import('./PhysicsDiagnostics'))
  : null;

/** Dev-only physics HUD — excluded from production bundles via dead-code elimination. */
export default function DevPhysicsDiagnostics({
  bodiesRef,
}: {
  bodiesRef: React.MutableRefObject<CelestialBody[]>;
}): React.ReactElement | null {
  if (!import.meta.env.DEV || !LazyPhysicsDiagnostics) return null;
  return (
    <Suspense fallback={null}>
      <LazyPhysicsDiagnostics bodiesRef={bodiesRef} />
    </Suspense>
  );
}
