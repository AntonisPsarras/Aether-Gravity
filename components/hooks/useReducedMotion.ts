import { useEffect, useState } from 'react';

/**
 * Tracks the OS "reduce motion" preference.
 *
 * Lives here rather than in Environment/ because both the 3D shaders and every
 * DOM panel need it; `components/Environment/EnvironmentContext.tsx` re-exports
 * this so existing importers keep working.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}
