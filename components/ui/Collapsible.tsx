import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

/**
 * A titled, animated disclosure section.
 *
 * The body animates via `grid-template-rows: 0fr → 1fr` (see `.ag-collapse` in
 * index.css) so nothing has to measure `scrollHeight` — which matters because
 * several Inspector sections contain charts whose height is content-driven.
 *
 * `data-open` on the root is the stable hook for e2e assertions; never assert
 * on the animated geometry.
 */
export const Collapsible: React.FC<{
  title: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  icon?: React.ReactNode;
  /** Small trailing element, e.g. the orbit tab's unapplied-changes dot. */
  badge?: React.ReactNode;
  testId?: string;
  children: React.ReactNode;
  className?: string;
}> = ({ title, open, onToggle, icon, badge, testId, children, className }) => {
  const bodyId = useId();
  return (
    <section
      className={cn('border-b border-white/5 last:border-b-0', className)}
      data-testid={testId}
      data-open={open ? 'true' : 'false'}
    >
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="touch-target min-h-[2.75rem] w-full flex items-center gap-2 py-2.5 text-left rounded-lg px-1 hover:bg-white/5 transition-colors"
        >
          {icon && <span className="text-pulsar-white/40 shrink-0">{icon}</span>}
          <span className="flex-1 text-[10px] font-bold uppercase tracking-widest text-pulsar-white/40">
            {title}
          </span>
          {badge}
          <ChevronDown
            size={14}
            className="ag-collapse-chevron shrink-0 text-pulsar-white/30"
            data-open={open ? 'true' : 'false'}
          />
        </button>
      </h3>
      <div id={bodyId} className="ag-collapse" data-open={open ? 'true' : 'false'}>
        <div>
          <div className="pb-4 pt-1">{children}</div>
        </div>
      </div>
    </section>
  );
};
