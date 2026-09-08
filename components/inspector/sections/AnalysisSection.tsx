import React, { useMemo } from 'react';
import { Lock } from 'lucide-react';
import { calculateESI, calculateRSI, calculateTidalLockTime } from '../../../utils/physicsUtils';
import { fmtDensity, fmtGravity, fmtEscVel } from '../../../utils/units';
import { Gauge } from '../controls/Gauge';
import { RangeInput } from '../controls/RangeInput';
import { DerivedRow, DerivedGroup } from '../controls/DerivedRow';
import { useInspectorCtx } from '../InspectorContext';
import { cn } from '../../ui/cn';

function formatLockTime(years: number): string {
  if (years === Infinity) return 'Never';
  if (years > 1_000_000_000) return '> 1B yrs';
  if (years < 1) return 'Locked';
  return `${Math.round(years).toLocaleString()} yrs`;
}

/** Habitability indices, tidal evolution, and the bulk geophysics summary. */
export const AnalysisSection: React.FC = () => {
  const { body, parent, props, setProp, propEditStart, propEditEnd, showField } = useInspectorCtx();

  const esi = useMemo(() => calculateESI(body), [body]);
  const rsi = useMemo(() => calculateRSI(body), [body]);
  const timeToLock = useMemo(
    () => formatLockTime(calculateTidalLockTime(body, parent)),
    [body, parent],
  );

  return (
    <div className="space-y-4">
      <div className="bg-black/20 rounded-xl p-4 border border-white/5 space-y-4">
        <div className="flex justify-around">
          <Gauge value={esi} label="Earth Similarity" subLabel="ESI" color={esi > 0.8 ? 'text-emerald-400' : esi > 0.5 ? 'text-yellow-400' : 'text-orange-400'} />
          {showField('rsi') && (
            <Gauge value={rsi} label="Rock Similarity" subLabel="RSI (Extreme)" color={rsi > 0.7 ? 'text-rose-400' : rsi > 0.4 ? 'text-orange-300' : 'text-slate-600'} />
          )}
        </div>
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <span className="text-[10px] text-pulsar-white/40 uppercase tracking-widest block mb-1">Assessment</span>
          <span className={cn(
            'text-sm font-bold',
            esi > 0.8 ? 'text-emerald-300' : esi > 0.6 ? 'text-nova-gold' : 'text-pulsar-white/60',
          )}>
            {esi > 0.8 ? 'Potential Garden World'
              : esi > 0.6 ? 'Marginally Habitable'
              : rsi > 0.6 ? 'Extremophile Candidate'
              : 'Dead World'}
          </span>
        </div>
      </div>

      <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-3">
        <DerivedGroup title="Tidal Evolution" note="Recomputed from mass, radius and orbital distance.">
          {showField('timeToLock') && <DerivedRow label="Time to Tidal Lock" value={timeToLock} />}
          <DerivedRow label="Rotation Period" value={`${(props.rotationPeriod || 24).toFixed(1)} hrs`} />
        </DerivedGroup>

        <div className="flex items-center justify-between gap-3">
          <label className="text-[10px] text-pulsar-white/50 uppercase font-bold">Synchronous Rotation</label>
          <button
            type="button"
            onClick={() => setProp('isTidallyLocked', !props.isTidallyLocked)}
            className={cn(
              'touch-target min-h-[2.75rem] flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all',
              props.isTidallyLocked
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                : 'bg-white/5 text-pulsar-white/50 border-white/10 hover:bg-white/10',
            )}
          >
            <Lock size={12} />
            {props.isTidallyLocked ? 'LOCKED' : 'FORCE LOCK'}
          </button>
        </div>

        {!props.isTidallyLocked && (
          <RangeInput label="Rotation Speed" min={1} max={100} step={1} value={props.rotationPeriod ?? 24} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('rotationPeriod', v)} />
        )}
      </div>

      {body.type === 'Planet' && showField('geophysics') && (
        <DerivedGroup title="Geophysics" note="Recomputed from mass, radius and composition.">
          <DerivedRow label="Density" value={fmtDensity(props.bulkDensity ?? NaN)} flash />
          <DerivedRow label="Gravity" value={fmtGravity(props.surfaceGravity ?? NaN)} flash />
          <DerivedRow label="Esc. Velocity" value={fmtEscVel(props.escapeVelocity ?? NaN)} flash />
        </DerivedGroup>
      )}
    </div>
  );
};
