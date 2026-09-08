import React from 'react';
import { ListTree, Rows3 } from 'lucide-react';
import type { BodyCategory } from '../../constants';
import { OUTLINER_CATEGORIES, type OutlinerSort } from '../../utils/outlinerModel';
import { CATEGORY_LABELS } from '../bodyTypeVisuals';
import { SearchInput } from '../ui/SearchInput';
import { FilterChip } from '../ui/FilterChip';
import { cn } from '../ui/cn';

const SORT_LABELS: Record<OutlinerSort, string> = {
  hierarchy: 'Tree',
  name: 'Name',
  mass: 'Mass',
  distance: 'Distance',
  type: 'Type',
};

/**
 * Search, category filters, sort and the tree/flat switch.
 *
 * Every category chip label comes from the shared `BODY_CONFIGS.category`
 * taxonomy rather than a new one invented here, so the outliner groups bodies
 * the same way the rest of the engine does.
 */
export const OutlinerToolbar: React.FC<{
  query: string;
  onQueryChange: (q: string) => void;
  categories: ReadonlySet<BodyCategory>;
  onToggleCategory: (c: BodyCategory) => void;
  counts: Record<string, number>;
  sort: OutlinerSort;
  onSortChange: (s: OutlinerSort) => void;
  flat: boolean;
  flatForced: boolean;
  onToggleFlat: () => void;
}> = ({
  query, onQueryChange, categories, onToggleCategory, counts,
  sort, onSortChange, flat, flatForced, onToggleFlat,
}) => (
  <div className="px-2 pt-2 pb-1.5 space-y-1.5 border-b border-white/5 shrink-0">
    <SearchInput
      value={query}
      onChange={onQueryChange}
      placeholder="Search bodies…"
      testId="outliner-search"
    />

    <div className="flex items-center gap-1.5">
      <div className="flex-1 flex gap-1 overflow-x-auto scrollbar-custom touch-pan-x">
        {OUTLINER_CATEGORIES.filter((c) => (counts[c] ?? 0) > 0).map((c) => (
          <FilterChip
            key={c}
            label={CATEGORY_LABELS[c] ?? c}
            count={counts[c]}
            active={categories.has(c)}
            onToggle={() => onToggleCategory(c)}
            testId={`outliner-chip-${c}`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onToggleFlat}
        disabled={flatForced}
        title={flatForced ? 'Filtered views are always flat' : flat ? 'Show as tree' : 'Show as flat list'}
        aria-label={flat ? 'Show as tree' : 'Show as flat list'}
        className={cn(
          'shrink-0 flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
          flatForced
            ? 'border-white/5 text-pulsar-white/15 cursor-not-allowed'
            : 'border-white/10 text-pulsar-white/40 hover:text-nova-gold hover:bg-white/10',
        )}
      >
        {flat ? <Rows3 size={12} /> : <ListTree size={12} />}
      </button>

      <select
        value={sort}
        aria-label="Sort bodies"
        data-testid="outliner-sort"
        data-no-drag
        onChange={(e) => onSortChange(e.target.value as OutlinerSort)}
        className="shrink-0 bg-black/40 border border-white/10 rounded-md px-1.5 py-1 text-[9px] uppercase tracking-wider font-bold text-pulsar-white/60"
      >
        {(Object.keys(SORT_LABELS) as OutlinerSort[]).map((s) => (
          <option key={s} value={s} className="bg-slate-900 normal-case">
            {SORT_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  </div>
);
