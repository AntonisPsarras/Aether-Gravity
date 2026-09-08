import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, List } from 'lucide-react';
import type { BodyCategory } from '../../constants';
import { useStore } from '../../utils/store';
import { checkHabitability } from '../../utils/HabitabilityService';
import { findPrimaryStar } from '../../utils/physicsUtils';
import {
  buildHierarchy, flattenHierarchy, filterBodies, sortBodies, hierarchySignature,
  categoryOf, forcesFlatMode, capRows, AUTO_COLLAPSE_CHILD_COUNT,
  type FlatRow, type OutlinerSort,
} from '../../utils/outlinerModel';
import { useBreakpoint } from '../hooks/useMediaQuery';
import { useBodySelectionGesture } from '../hooks/useBodySelectionGesture';
import { OutlinerToolbar } from './OutlinerToolbar';
import { OutlinerRow } from './OutlinerRow';
import { cn } from '../ui/cn';

/** Types whose habitability is worth evaluating at all. */
const HABITABLE_CANDIDATES = ['Planet', 'Ice Giant', 'Dwarf'];

/**
 * How often the gravitationally-resolved part of the hierarchy is refreshed.
 *
 * Matches the orbit-path refresh cadence in CanvasSetup. See the epoch comment
 * in the component for why a signature alone is not enough.
 */
const HIERARCHY_REFRESH_MS = 500;

const UniverseOutliner: React.FC<{ onInteract?: () => void }> = ({ onInteract }) => {
  const breakpoint = useBreakpoint();
  const isPhone = breakpoint === 'phone';
  const selectedId = useStore((s) => s.selectedId);
  const historyVersion = useStore((s) => s.historyVersion);
  const outlinerOpen = useStore((s) => s.outlinerOpen);
  const setOutlinerOpen = useStore((s) => s.setOutlinerOpen);
  const uiMode = useStore((s) => s.uiMode);
  const handleGesture = useBodySelectionGesture();

  /**
   * Subscribe to a *string* fingerprint rather than to `bodies`.
   *
   * The store hands back a new array on every integrator step, so selecting the
   * array itself would re-render (and rebuild) this panel at 60 Hz. The
   * signature only changes when a body is added, removed, or explicitly
   * reparented, so zustand's Object.is check absorbs the churn.
   */
  const signature = useStore((s) => hierarchySignature(s.bodies));
  const bodyCount = useStore((s) => s.bodies.length);

  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<ReadonlySet<BodyCategory>>(new Set());
  const [sort, setSort] = useState<OutlinerSort>('hierarchy');
  const [flatPreference, setFlatPreference] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [rowLimit, setRowLimit] = useState<number | undefined>(undefined);

  /**
   * `buildParentMap` resolves the parent of an unparented body *gravitationally*,
   * from live positions and masses — so a memo keyed on the signature alone
   * would freeze the tree and stop reflecting captures, ejections and mass
   * edits. This low-frequency counter bounds that staleness to 500 ms while
   * still cutting rebuilds from ~60/s to 2/s. It only runs while the list is
   * actually on screen.
   */
  const [epoch, setEpoch] = useState(0);
  const listVisible = outlinerOpen;
  useEffect(() => {
    if (!listVisible) return;
    const timer = setInterval(() => setEpoch((e) => e + 1), HIERARCHY_REFRESH_MS);
    return () => clearInterval(timer);
  }, [listVisible]);
  // Structural edits and undo/redo must land immediately, not on the next tick.
  useEffect(() => { setEpoch((e) => e + 1); }, [signature, historyVersion]);

  const model = useMemo(() => {
    // Read the array imperatively: the memo key above is what decides when this
    // is allowed to be stale, not the array's identity.
    const bodies = useStore.getState().bodies;
    const primary = findPrimaryStar(bodies);

    // One pass for habitability instead of an O(n) star scan inside every row.
    const habitable = new Map<string, boolean>();
    for (const body of bodies) {
      if (HABITABLE_CANDIDATES.includes(body.type)) {
        habitable.set(body.id, primary ? checkHabitability(body, primary) : false);
      }
    }

    const counts: Record<string, number> = {};
    for (const body of bodies) {
      const c = categoryOf(body.type);
      counts[c] = (counts[c] ?? 0) + 1;
    }

    return { bodies, primary, habitable, counts, total: bodies.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, epoch, bodyCount]);

  const filter = useMemo(() => ({ query, categories }), [query, categories]);
  const flatForced = forcesFlatMode(filter, sort);
  const flat = flatForced || flatPreference;

  const rows: FlatRow[] = useMemo(() => {
    if (flat) {
      const filtered = sortBodies(filterBodies(model.bodies, filter), sort, model.primary);
      return filtered.map((body) => ({ body, depth: 0, childCount: 0 }));
    }
    const tree = buildHierarchy(model.bodies);
    // Dense satellite systems (an asteroid belt is N individual bodies) start
    // folded so one parent cannot flood the list.
    const autoCollapsed = new Set(collapsed);
    const markDense = (nodes: ReturnType<typeof buildHierarchy>) => {
      for (const node of nodes) {
        if (node.children.length > AUTO_COLLAPSE_CHILD_COUNT && !collapsed.has(node.body.id)) {
          autoCollapsed.add(node.body.id);
        }
        markDense(node.children);
      }
    };
    markDense(tree);
    return flattenHierarchy(tree, autoCollapsed);
  }, [model, filter, sort, flat, collapsed]);

  const capped = useMemo(() => capRows(rows, rowLimit), [rows, rowLimit]);

  const toggleCategory = useCallback((c: BodyCategory) => {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const filtering = query.trim().length > 0 || categories.size > 0;

  // Open state lives in the store for every breakpoint: on phone the back
  // handler needs to read it, and on desktop `App.tsx` needs it to decide
  // whether the left rail is claiming canvas width.
  const isOpen = outlinerOpen;
  const toggleOpen = () => setOutlinerOpen(!outlinerOpen);

  return (
    <div
      data-testid="outliner-panel"
      onPointerDownCapture={onInteract}
      onKeyDownCapture={onInteract}
      data-mode={flat ? 'flat' : 'tree'}
      data-open={isOpen ? 'true' : 'false'}
      className={cn(
        'universe-outliner-anchor fixed z-20 flex flex-col overflow-hidden',
        'bg-[rgba(45,51,64,0.6)] backdrop-blur-md border border-white/10',
        'rounded-xl shadow-2xl ring-1 ring-white/5',
        'transition-[max-height] duration-300 ease-out',
        isOpen && 'is-expanded',
      )}
    >
      <button
        type="button"
        onClick={toggleOpen}
        aria-expanded={isOpen}
        className="touch-target flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 hover:bg-white/5 transition-colors text-left shrink-0"
      >
        <span className="flex items-center gap-2 min-w-0">
          <List size={16} className="text-nova-gold shrink-0" />
          <span className="text-xs font-bold uppercase tracking-wider text-pulsar-white/70 truncate">
            Universe Outliner
          </span>
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono text-pulsar-white/30">
            {filtering ? `${rows.length} / ${model.total}` : `${model.total} objects`}
          </span>
          {isOpen
            ? <ChevronUp size={14} className="text-pulsar-white/30" />
            : <ChevronDown size={14} className="text-pulsar-white/30" />}
        </span>
      </button>

      {isOpen && (
        <>
          <OutlinerToolbar
            query={query}
            onQueryChange={setQuery}
            categories={categories}
            onToggleCategory={toggleCategory}
            counts={model.counts}
            sort={sort}
            onSortChange={setSort}
            flat={flat}
            flatForced={flatForced}
            onToggleFlat={() => setFlatPreference((f) => !f)}
            showListOptions={uiMode === 'advanced'}
          />

          <div className="flex-1 overflow-y-auto p-2 scrollbar-custom panel-scroll">
            {model.total === 0 ? (
              <div className="text-center py-8 text-pulsar-white/30 text-xs">
                No objects in simulation
              </div>
            ) : capped.rows.length === 0 ? (
              <div className="text-center py-8 text-pulsar-white/30 text-xs">
                No bodies match this filter
              </div>
            ) : (
              <>
                {capped.rows.map((row) => (
                  <OutlinerRow
                    key={row.body.id}
                    body={row.body}
                    depth={row.depth}
                    childCount={row.childCount}
                    collapsed={collapsed.has(row.body.id) || row.childCount > AUTO_COLLAPSE_CHILD_COUNT}
                    selected={selectedId === row.body.id}
                    habitable={model.habitable.get(row.body.id) === true}
                    flat={flat}
                    onToggleCollapse={toggleCollapse}
                    onGesture={handleGesture}
                  />
                ))}
                {capped.hidden > 0 && (
                  <button
                    type="button"
                    onClick={() => setRowLimit((capped.rows.length) + 200)}
                    className="touch-target w-full mt-1 py-2 rounded-lg text-[10px] uppercase tracking-wider font-bold text-pulsar-white/40 hover:text-nova-gold hover:bg-white/5 transition-colors"
                  >
                    Show {capped.hidden} more
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default UniverseOutliner;
