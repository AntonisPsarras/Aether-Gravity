import React from 'react';
import { cn } from './cn';

/**
 * Toggleable filter pill. Uses the same nova-gold active treatment as the
 * Inspector's tab bar, so the two read as one system.
 */
export const FilterChip: React.FC<{
  label: string;
  active: boolean;
  onToggle: () => void;
  count?: number;
  testId?: string;
}> = ({ label, active, onToggle, count, testId }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={active}
    data-testid={testId}
    data-active={active ? 'true' : 'false'}
    className={cn(
      'shrink-0 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-colors',
      active
        ? 'bg-nova-gold/20 text-nova-gold border-nova-gold/30'
        : 'bg-white/5 text-pulsar-white/40 border-white/10 hover:text-pulsar-white/70 hover:bg-white/10',
    )}
  >
    {label}
    {count !== undefined && <span className="ml-1 opacity-60 font-mono">{count}</span>}
  </button>
);
