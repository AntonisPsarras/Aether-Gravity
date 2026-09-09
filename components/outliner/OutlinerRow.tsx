import React from 'react';
import { ChevronDown, ChevronRight, Droplets } from 'lucide-react';
import type { CelestialBody } from '../../types';
import { useStore } from '../../utils/store';
import { fmtMass, fmtTemp } from '../../utils/units';
import { useDomTapLongPress, type BodyGestureKind } from '../../utils/bodyPointerGesture';
import { visualFor } from '../bodyTypeVisuals';
import { cn } from '../ui/cn';

export interface OutlinerRowProps {
  body: CelestialBody;
  depth: number;
  childCount: number;
  collapsed: boolean;
  selected: boolean;
  habitable: boolean;
  /** Suppress the tree indent and guide rail in flat / filtered views. */
  flat: boolean;
  onToggleCollapse: (id: string) => void;
  onGesture: (id: string, kind: BodyGestureKind) => void;
}

const OutlinerRowImpl: React.FC<OutlinerRowProps> = ({
  body, depth, childCount, collapsed, selected, habitable, flat,
  onToggleCollapse, onGesture,
}) => {
  const visual = visualFor(body.type);
  const Icon = visual.icon;
  const hasChildren = childCount > 0;
  // Shared detector: same thresholds, same timer semantics and the same cancel
  // registry as the 3D hitboxes, so a canvas pointer-missed cancels a row press.
  const gesture = useDomTapLongPress(body.id, onGesture);

  /**
   * Subscribe to the *formatted* spec line rather than to the body.
   *
   * The store replaces every body object on every physics tick, so selecting
   * the body itself would re-render this row 60 times a second. Selecting the
   * rendered string means zustand's Object.is check short-circuits until the
   * displayed text actually changes — which, given the rounding in
   * `utils/units.ts`, is rare.
   */
  const spec = useStore((s) => {
    const live = s.bodies.find((b) => b.id === body.id);
    return live ? `${fmtMass(live.mass)} · ${fmtTemp(live.temperature)}` : '';
  });

  return (
    <div
      data-testid={`outliner-row-${body.id}`}
      data-selected={selected ? 'true' : 'false'}
      className={cn(
        'touch-target flex items-center gap-2 py-1.5 px-2 rounded-lg cursor-pointer transition-colors group border',
        selected ? 'bg-nova-gold/15 border-nova-gold/30' : 'hover:bg-white/5 border-transparent',
      )}
      style={flat ? undefined : { paddingLeft: `${depth * 16 + 8}px` }}
      onPointerDown={gesture.onPointerDown}
      // Drops the pending long press once the hold turns into a list scroll.
      onPointerMove={gesture.onPointerMove}
      onPointerUp={gesture.onPointerUp}
      onPointerCancel={gesture.onPointerCancel}
    >
      {hasChildren && !flat ? (
        <button
          type="button"
          aria-label={collapsed ? `Expand ${body.name}` : `Collapse ${body.name}`}
          onClick={(e) => { e.stopPropagation(); onToggleCollapse(body.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          className="touch-target flex h-11 w-11 shrink-0 items-center justify-center hover:bg-white/10 rounded transition-colors"
        >
          {collapsed
            ? <ChevronRight size={12} className="text-pulsar-white/30" />
            : <ChevronDown size={12} className="text-pulsar-white/30" />}
        </button>
      ) : (
        <div className="w-4 shrink-0" />
      )}

      <Icon size={14} className={cn('shrink-0', visual.text)} />

      <div className="flex-1 min-w-0">
        <div
          data-testid="outliner-name"
          className={cn(
            'text-xs font-medium truncate',
            selected ? 'text-nova-gold' : 'text-pulsar-white/60 group-hover:text-pulsar-white',
          )}
        >
          {body.name}
        </div>
        <div className="text-[9px] font-mono text-pulsar-white/30 truncate">{spec}</div>
      </div>

      {hasChildren && collapsed && (
        <span className="text-[9px] font-mono text-pulsar-white/25 shrink-0">
          {childCount}
        </span>
      )}

      {habitable && (
        <span title="In the habitable zone" className="text-emerald-400 shrink-0">
          <Droplets size={10} fill="currentColor" />
        </span>
      )}

      <span className={cn('text-[9px] uppercase font-bold opacity-50 shrink-0', visual.text)}>
        {visual.short}
      </span>
    </div>
  );
};

export const OutlinerRow = React.memo(OutlinerRowImpl);
