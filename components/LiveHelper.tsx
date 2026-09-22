import React from 'react';
import { Lightbulb, X } from 'lucide-react';
import type { HelperDefinition } from '../utils/onboarding';

const LiveHelper: React.FC<{
  helper: HelperDefinition;
  onAcknowledge: () => void;
}> = ({ helper, onAcknowledge }) => (
  <div className="live-helper-host absolute inset-0 z-20 pointer-events-none safe-pad" data-testid="live-helper-host">
    <aside
      className="live-helper-card pointer-events-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-cyan-300/20 bg-[rgba(16,20,28,0.94)] p-4 shadow-2xl ring-1 ring-white/5 backdrop-blur-xl ag-fade-in"
      role="status"
      aria-live="polite"
      aria-labelledby="live-helper-title"
      data-testid={`live-helper-${helper.id}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-cyan-300/10 p-2 text-cyan-300 shrink-0" aria-hidden>
          <Lightbulb size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-cyan-300/65">{helper.eyebrow}</p>
          <h2 id="live-helper-title" className="mt-1 text-sm font-bold text-pulsar-white">{helper.title}</h2>
          <p className="mt-2 text-xs leading-relaxed text-pulsar-white/60">{helper.content}</p>
          {helper.detail && <p className="mt-2 text-[11px] leading-relaxed text-pulsar-white/40">{helper.detail}</p>}
          <button
            type="button"
            onClick={onAcknowledge}
            className="touch-target mt-3 min-h-[2.75rem] rounded-lg bg-cyan-300/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-cyan-200 hover:bg-cyan-300/15 transition-colors"
          >
            Got it
          </button>
        </div>
        <button
          type="button"
          onClick={onAcknowledge}
          aria-label="Dismiss tip"
          className="touch-target -mr-2 -mt-2 shrink-0 rounded-lg p-2 text-pulsar-white/30 hover:bg-white/10 hover:text-pulsar-white transition-colors"
        >
          <X size={17} />
        </button>
      </div>
    </aside>
  </div>
);

export default LiveHelper;
