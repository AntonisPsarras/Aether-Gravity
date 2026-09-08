import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useStore } from '../../utils/store';

/**
 * Debounced search field.
 *
 * Sets `isInteractingWithUI` while focused for the same reason every other
 * text control does: it stops OrbitControls from stealing keystrokes and
 * dragging the camera when the user aims at the field and misses.
 */
export const SearchInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  debounceMs?: number;
  testId?: string;
}> = ({ value, onChange, placeholder = 'Search…', debounceMs = 120, testId }) => {
  const setInteractingWithUI = useStore((s) => s.setInteractingWithUI);
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt an externally cleared value (e.g. the clear button on a parent).
  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const push = (next: string) => {
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(next), debounceMs);
  };

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    setDraft('');
    onChange('');
  };

  return (
    <div className="relative flex items-center">
      <Search size={12} className="absolute left-2.5 text-pulsar-white/30 pointer-events-none" />
      <input
        type="search"
        value={draft}
        placeholder={placeholder}
        data-testid={testId}
        aria-label="Search bodies"
        data-no-drag
        onFocus={() => setInteractingWithUI(true)}
        onBlur={() => setInteractingWithUI(false)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') clear();
        }}
        onChange={(e) => push(e.target.value)}
        className="w-full bg-black/40 border border-white/10 rounded-lg pl-7 pr-8 py-1.5 text-xs text-pulsar-white placeholder:text-pulsar-white/25 focus:outline-none focus:border-nova-gold/40"
      />
      {draft && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-1 flex h-6 w-6 items-center justify-center rounded text-pulsar-white/40 hover:text-pulsar-white hover:bg-white/10 transition-colors"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
};
