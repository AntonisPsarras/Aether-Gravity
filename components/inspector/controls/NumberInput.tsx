import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../../utils/store';

/** Keep the draft as text so partial decimals/exponents survive telemetry refreshes. */
export const NumberInput = ({
  value, onChange, className, onCommit, onEditStart, onEditEnd, min, max, testId,
}: {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  onCommit?: () => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  min?: number;
  max?: number;
  testId?: string;
}) => {
  const [draft, setDraft] = useState(String(value));
  const editing = useRef(false);
  const dirty = useRef(false);
  const endRef = useRef(onEditEnd);
  endRef.current = onEditEnd;
  const setInteractingWithUI = useStore(s => s.setInteractingWithUI);
  useEffect(() => { if (!editing.current) setDraft(String(value)); }, [value]);
  useEffect(() => () => {
    if (editing.current) {
      endRef.current?.();
      useStore.getState().setInteractingWithUI(false);
    }
  }, []);
  const finish = () => {
    if (!editing.current) return;
    editing.current = false;
    const raw = draft.trim() === '' ? NaN : Number(draft);
    if (dirty.current && Number.isFinite(raw)) {
      const next = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, raw));
      onChange(next);
      setDraft(String(next));
      onCommit?.();
    } else setDraft(String(value));
    dirty.current = false;
    onEditEnd?.();
    setInteractingWithUI(false);
  };
  return <input
    type="text"
    inputMode="decimal"
    data-testid={testId}
    data-no-drag
    value={draft}
    onPointerDown={() => setInteractingWithUI(true)}
    onPointerUp={() => setInteractingWithUI(false)}
    onPointerCancel={() => setInteractingWithUI(false)}
    onFocus={() => { editing.current = true; dirty.current = false; setInteractingWithUI(true); onEditStart?.(); }}
    onChange={e => { dirty.current = true; setDraft(e.target.value); }}
    onBlur={finish}
    onKeyDown={e => {
      e.stopPropagation();
      if (e.key === 'Escape') { dirty.current = false; e.currentTarget.blur(); }
      if (e.key === 'Enter') e.currentTarget.blur();
    }}
    className={className}
  />;
};
