import React from 'react';
import { Trash2, X } from 'lucide-react';
import type { CelestialBody } from '../../types';
import { fmtMass, fmtRadiusRelative } from '../../utils/units';
import { visualFor } from '../bodyTypeVisuals';
import { cn } from '../ui/cn';
import type { BottomSheetHandleProps } from '../ui/Sheet';

/**
 * Sticky inspector header: identity, the always-visible key stats, and the
 * destructive/dismiss actions.
 *
 * The key-stat strip is what makes the `peek` detent useful — at that height
 * it is the only content on screen, so it carries the three numbers worth
 * seeing without expanding: mass, radius and parent.
 */
export const InspectorHeader: React.FC<{
  body: CelestialBody;
  parent: CelestialBody | null;
  onDelete: () => void;
  onDismiss: () => void;
  /** Present on phone only; spread on the grab handle. */
  handleProps?: BottomSheetHandleProps;
  showHandle: boolean;
  children?: React.ReactNode;
}> = ({ body, parent, onDelete, onDismiss, handleProps, showHandle, children }) => {
  const visual = visualFor(body.type);
  const Icon = visual.icon;

  return (
    <div className="sticky top-0 z-10 panel-glass-dark shrink-0">
      {showHandle && (
        <div
          data-testid="inspector-sheet-handle"
          className="flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none"
          {...handleProps}
        >
          <div className="w-12 h-1.5 bg-white/15 rounded-full pointer-events-none" />
        </div>
      )}

      <div className="px-5 pt-4 pb-0">
        <div className="flex justify-between items-start gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg md:text-xl font-bold font-mono text-pulsar-white tracking-tight flex items-center gap-2 truncate min-w-0">
              <Icon size={16} className={cn('shrink-0', visual.text)} />
              <span className="truncate">{body.name}</span>
            </h2>
            <span className="inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-pulsar-white/60 uppercase tracking-wider font-bold">
              {body.type}
            </span>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete ${body.name}`}
              data-testid="inspector-delete"
              className="touch-target flex items-center justify-center w-11 h-11 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors active:scale-95"
            >
              <Trash2 size={18} />
            </button>
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close inspector"
              data-testid="inspector-close"
              className="touch-target flex items-center justify-center w-11 h-11 text-pulsar-white/70 hover:text-nova-gold bg-white/5 hover:bg-white/10 rounded-lg transition-colors active:scale-95"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Key stats — the entire content of the `peek` detent. */}
        <dl className="grid grid-cols-3 gap-2 mt-3 pb-3 border-b border-white/5">
          <div className="min-w-0">
            <dt className="text-[9px] uppercase tracking-widest text-pulsar-white/30">Mass</dt>
            <dd className="text-xs font-mono text-pulsar-white/80 truncate">{fmtMass(body.mass)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[9px] uppercase tracking-widest text-pulsar-white/30">Radius</dt>
            <dd className="text-xs font-mono text-pulsar-white/80 truncate">{fmtRadiusRelative(body.radiusKm)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[9px] uppercase tracking-widest text-pulsar-white/30">Orbits</dt>
            <dd className="text-xs font-mono text-pulsar-white/80 truncate">{parent ? parent.name : '—'}</dd>
          </div>
        </dl>

        {children}
      </div>
    </div>
  );
};
