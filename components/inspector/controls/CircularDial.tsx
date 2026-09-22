import { useStore } from '../../../utils/store';

/** Angle editor for a Keplerian element. See NumberInput on the edit-lock
 *  contract — the pointer handlers here serve the same purpose. */
export const CircularDial = ({
  label, value, onChange, min = 0, max = 360, onEditStart, onEditEnd, testId,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  testId?: string;
}) => {
  const setInteractingWithUI = useStore((s) => s.setInteractingWithUI);
  const handleDown = () => { setInteractingWithUI(true); onEditStart?.(); };
  const handleUp = () => { setInteractingWithUI(false); onEditEnd?.(); };
  return (
    <div className="flex flex-col items-center justify-center p-2 bg-black/20 rounded-lg border border-white/5 w-full">
      <div className="relative w-12 h-12 mb-2 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-white/10"></div>
        <div
          className="absolute w-full h-0.5 bg-nova-gold origin-center"
          style={{ transform: `rotate(${value - 90}deg)`, width: '50%', left: '50%', transformOrigin: '0% 50%' }}
        ></div>
        <div className="w-1.5 h-1.5 bg-pulsar-white rounded-full z-10"></div>
      </div>
      <span className="text-[9px] text-pulsar-white/50 uppercase font-mono text-center mb-1 h-3 overflow-hidden">{label}</span>
      <input
        type="range"
        data-testid={testId}
        data-no-drag
        min={min}
        max={max}
        step="1"
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
      <span className="text-[10px] font-bold text-pulsar-white mt-1">{Math.round(value)}°</span>
    </div>
  );
};
