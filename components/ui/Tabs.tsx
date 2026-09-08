import React from 'react';
import { cn } from './cn';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Rendered after the label — used for the unapplied-orbit-changes dot. */
  badge?: React.ReactNode;
}

/**
 * Segmented tab bar. Used on phone and tablet, where vertical space is the
 * binding constraint; the desktop rail renders every section at once instead.
 */
export function TabBar<T extends string>({
  tabs, active, onChange, testIdPrefix,
}: {
  tabs: TabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  testIdPrefix?: string;
}) {
  if (tabs.length < 2) return null;
  return (
    <div role="tablist" className="flex gap-1 bg-black/20 p-1 rounded-lg">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            data-testid={testIdPrefix ? `${testIdPrefix}-${tab.id}` : undefined}
            onClick={() => onChange(tab.id)}
            className={cn(
              'touch-target min-h-[2.75rem] flex-1 py-2 rounded-md text-[10px] uppercase font-bold tracking-wider transition-all flex items-center justify-center gap-1.5',
              isActive
                ? 'bg-nova-gold/20 text-nova-gold shadow-sm'
                : 'text-pulsar-white/30 hover:text-pulsar-white/70 hover:bg-white/5',
            )}
          >
            {tab.label}
            {tab.badge}
          </button>
        );
      })}
    </div>
  );
}

/** Index of a tab id, for deciding which way the panel should slide in. */
export function tabDirection<T extends string>(tabs: TabItem<T>[], from: T, to: T): 1 | -1 {
  return tabs.findIndex((t) => t.id === to) >= tabs.findIndex((t) => t.id === from) ? 1 : -1;
}
