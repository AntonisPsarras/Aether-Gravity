import React from 'react';
import { useStore } from '../../../utils/store';

/**
 * Numeric primary editor.
 *
 * The `setInteractingWithUI` calls and the `onEditStart` / `onEditEnd` pair are
 * load-bearing and must never be dropped: the first keeps OrbitControls from
 * dragging the camera while the field has focus, the second holds an inspector
 * lock so `syncBodiesFromPhysics` cannot overwrite the value mid-edit.
 */
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
  const setInteractingWithUI = useStore((s) => s.setInteractingWithUI);
  const handleEditEnd = () => {
    onCommit?.();
    onEditEnd?.();
    setInteractingWithUI(false);
  };
  return (
    <input
      type="number"
      data-testid={testId}
      data-no-drag
      value={Math.round(value * 100) / 100}
      onPointerDown={() => setInteractingWithUI(true)}
      onPointerUp={() => setInteractingWithUI(false)}
      onPointerCancel={() => setInteractingWithUI(false)}
      onFocus={() => { setInteractingWithUI(true); onEditStart?.(); }}
      onChange={(e) => {
        const raw = parseFloat(e.target.value);
        if (!isFinite(raw)) return;
        const clamped = min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, raw) : raw)
                      : max !== undefined ? Math.min(max, raw) : raw;
        onChange(clamped);
      }}
      onBlur={handleEditEnd}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') handleEditEnd();
      }}
      className={className}
    />
  );
};
