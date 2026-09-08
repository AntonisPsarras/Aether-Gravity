import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional class names with later Tailwind utilities winning over earlier
 * ones of the same group. Both dependencies were already in package.json.
 *
 * Only ever pass complete literal class strings — Tailwind's purge scans source
 * text, so a constructed name like `text-${c}-400` compiles away silently.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
