import { useStore } from '../../../utils/store';

/** Labelled slider for a `properties.*` primary. See NumberInput on the
 *  `setInteractingWithUI` / `onEditStart` contract — it is identical here. */
export const RangeInput = ({
  label, value, min, max, step, onChange, onEditStart, onEditEnd, testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
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
        <span>{label}</span>
        <span className="text-pulsar-white/80">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        data-testid={testId}
        data-no-drag
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          if (!Number.isFinite(raw)) return;
          onChange(raw);
        }}
        className="w-full rounded-lg appearance-none cursor-pointer accent-nova-gold"
      />
    </div>
  );
};

/**
 * Logarithmic slider, for primaries whose admissible range spans many orders
 * of magnitude (mass: 24 decades; semi-major axis: a moon at ~0.1 units and an
 * outer planet at ~1200). A linear control cannot serve both ends.
 */
export const LogRangeInput = ({
  label, valueLabel, value, min, max, step = 0.01, onChange, onEditStart, onEditEnd, testId,
}: {
  label: string;
  valueLabel: string;
  /** Linear value; the slider works in log10 space internally. */
  value: number;
  min: number;
  max: number;
  step?: number;
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
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] text-pulsar-white/50 uppercase">{label}</span>
        <span className="text-[10px] text-pulsar-white/80 font-mono">{valueLabel}</span>
      </div>
      <input
        type="range"
        data-testid={testId}
        data-no-drag
        min={Math.log10(min)}
        max={Math.log10(max)}
        step={step}
        value={Math.log10(Math.max(value, min))}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          if (!Number.isFinite(raw)) return;
          onChange(Math.pow(10, raw));
        }}
        className="w-full rounded-lg appearance-none cursor-pointer h-1.5 bg-white/10"
      />
    </div>
  );
};
