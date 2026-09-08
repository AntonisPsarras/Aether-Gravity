import { useEffect, useState } from 'react';

/**
 * Layout tiers for the in-game HUD.
 *
 * These numbers are also encoded in `index.css` media queries and they line up
 * with Tailwind's default `md:` (768) and `xl:` (1280) breakpoints, so the same
 * boundary is expressed once per layer and never diverges. Do not add a
 * `screens` override to tailwind.config.js — it would desync the three.
 */
export const BREAKPOINTS = {
  /** Largest width still treated as a phone. */
  phone: 767,
  /** Largest width still treated as a tablet. */
  tablet: 1279,
} as const;

export type Breakpoint = 'phone' | 'tablet' | 'desktop';

/**
 * Subscribe to a CSS media query.
 *
 * Same shape as the reduced-motion listener this codebase already relies on:
 * lazily initialised from `matchMedia().matches` so the first paint is correct,
 * then kept live through the `change` event.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);

  return matches;
}

const PHONE_QUERY = `(max-width: ${BREAKPOINTS.phone}px)`;
const TABLET_QUERY = `(min-width: ${BREAKPOINTS.phone + 1}px) and (max-width: ${BREAKPOINTS.tablet}px)`;

/** True below the `md` boundary — the bottom-sheet layout. */
export function useIsPhone(): boolean {
  return useMediaQuery(PHONE_QUERY);
}

/** Current layout tier. Desktop (>= 1280) is the only tier with docked rails. */
export function useBreakpoint(): Breakpoint {
  const isPhone = useMediaQuery(PHONE_QUERY);
  const isTablet = useMediaQuery(TABLET_QUERY);
  if (isPhone) return 'phone';
  if (isTablet) return 'tablet';
  return 'desktop';
}
