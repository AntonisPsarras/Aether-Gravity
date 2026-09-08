import React from 'react';
import { Lock } from 'lucide-react';
import { useValueFlash } from '../../hooks/useValueFlash';
import { cn } from '../../ui/cn';

/**
 * Read-only derived quantity.
 *
 * Derived values are recomputed by `utils/bodyDerivation.ts` from the primaries
 * the user edits; they are never editable. The distinction is carried by
 * structure and opacity rather than by a new colour — hue stays reserved for
 * state (nova-gold = accent/active, nebula-rust = warning).
 *
 * `flash` opts a row into a brief nova-gold pulse when its value changes, so an
 * edit to a primary visibly propagates. Only pass it for values derived from
 * *primaries*; a readout that tracks live position or velocity would strobe.
 * See `useValueFlash` for the full set of guards.
 */
export const DerivedRow: React.FC<{
  label: string;
  value: string;
  flash?: boolean;
  testId?: string;
}> = ({ label, value, flash = false, testId }) => {
  const flashing = useValueFlash(value, flash);
  return (
    <div className="flex justify-between items-center gap-2" data-testid={testId}>
      <span className="text-[10px] text-pulsar-white/40 uppercase tracking-wider truncate">{label}</span>
      <span
        className={cn(
          'text-xs font-mono text-pulsar-white/80 shrink-0',
          flashing && 'ag-flash',
        )}
      >
        {value}
      </span>
    </div>
  );
};

/**
 * Container for a run of derived rows.
 *
 * The left rail and the lock glyph are the at-a-glance signal that nothing in
 * here is editable — the same treatment everywhere, so the user learns it once.
 */
export const DerivedGroup: React.FC<{
  /** Short caption, e.g. "Derived" or "Kerr Geometry". */
  title?: string;
  /** Plain-English note about what these values are recomputed from. */
  note?: string;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}> = ({ title = 'Derived', note, children, className, testId }) => (
  <div
    aria-readonly="true"
    data-testid={testId}
    title={note}
    className={cn(
      'bg-black/30 rounded-lg p-3 border border-white/5 border-l-2 border-l-white/10 space-y-1.5',
      className,
    )}
  >
    <div className="flex items-center gap-1 mb-1">
      <Lock size={9} className="text-pulsar-white/25 shrink-0" />
      <span className="text-[9px] uppercase tracking-widest text-pulsar-white/30">{title}</span>
    </div>
    {children}
  </div>
);

/**
 * A value the user cannot set for *this* body type even though it is a primary
 * elsewhere — a star's radius, for instance, follows from its mass-radius
 * relation. Distinct from both an editable field and a derived readout.
 */
export const PinnedValue: React.FC<{
  value: string;
  note?: string;
}> = ({ value, note }) => (
  <>
    <div
      title={note}
      className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-pulsar-white/40 font-mono flex items-center gap-1.5"
    >
      <Lock size={10} className="shrink-0 text-pulsar-white/25" />
      {value}
    </div>
    {note && <p className="text-[9px] text-pulsar-white/25 leading-snug mt-1">{note}</p>}
  </>
);
