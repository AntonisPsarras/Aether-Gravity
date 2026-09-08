import React from 'react';
import { useStore } from '../../../utils/store';

/** Iron / silicate / water fraction. See NumberInput on the edit-lock contract. */
export const CompositionSlider = ({
  label, value, color, onChange, onEditStart, onEditEnd, testId,
}: {
  label: string;
  value: number;
  color: string;
  onChange: (v: number) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  testId?: string;
}) => {
  const setInteractingWithUI = useStore((s) => s.setInteractingWithUI);
  const handleDown = () => { setInteractingWithUI(true);  onEditStart?.(); };
  const handleUp   = () => { setInteractingWithUI(false); onEditEnd?.(); };
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[10px] text-pulsar-white/50 uppercase font-mono mb-1">
        <span className="flex items-center gap-1"><div className={`w-2 h-2 rounded-full ${color}`}></div>{label}</span>
        <span className="text-pulsar-white/80">{(value * 100).toFixed(0)}%</span>
      </div>
      <input
        type="range"
        data-testid={testId}
        data-no-drag
        min="0"
        max="1"
        step="0.01"
        value={value}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          if (!Number.isFinite(raw)) return;
          onChange(raw);
        }}
        className="w-full rounded-lg appearance-none cursor-pointer"
        style={{ accentColor: color.replace('bg-', 'text-').replace('500', '400') }}
      />
    </div>
  );
};
