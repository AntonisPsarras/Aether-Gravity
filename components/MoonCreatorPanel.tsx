import { captureSimulationSnapshot, type SimulationSnapshot } from '../utils/simulationSnapshot';
/**
 * DOM half of the moon creator: parent picker, orbit controls, read-outs and
 * the Create action. A floating card on tablet/desktop and a fixed-height
 * bottom sheet on phone (positioning lives in index.css, `.moon-creator-anchor`).
 *
 * The card and the in-canvas handle edit the same draft (`utils/moonDraft.ts`);
 * limits and clamping are recomputed from the live physics bodies by
 * `resolveMoonDraft`, so neither surface can produce an orbit the other would
 * reject.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Moon, X, AlertTriangle, ArrowLeftRight } from 'lucide-react';
import type { BodyType, CelestialBody } from '../types';
import { useStore } from '../utils/store';
import { getLiveBodies, pickMoonParent, useMoonDraft } from '../utils/moonDraft';
import {
  MOON_HOST_TYPES,
  buildMoonOnOrbit,
  describeMoonSize,
  makeMoonTemplate,
  moonHostStatus,
  moonInclinationRad,
  moonMassFor,
  moonRadiusKm,
  phaseForPlaneChange,
  resolveMoonDraft,
  type MoonMaxReason,
  type MoonMinReason,
} from '../utils/moonCreation';
import { PHYSICS_LIMITS } from '../utils/physicsBounds';
import { getSimTime, resetAccumulator, resetVerletCache, setSimTime } from '../utils/physicsSoA';
import { cancelAllBodyPointerGestures } from '../utils/bodyPointerGesture';
import { fmtDistance, fmtMass, fmtPeriod, fmtRadiusKm, velocityToKmS } from '../utils/units';
import { LogRangeInput, RangeInput } from './inspector/controls/RangeInput';
import { DerivedGroup, DerivedRow } from './inspector/controls/DerivedRow';
import { visualFor } from './bodyTypeVisuals';
import { cn } from './ui/cn';

/** Live limits drift as the parent orbits; refresh read-outs at the outliner's cadence. */
const REFRESH_MS = 500;
/** Speed factors this close to 1 snap to exactly circular. */
const CIRCULAR_SNAP = 0.025;

const MIN_LABEL: Record<MoonMinReason, string> = {
  roche: 'Roche limit',
  surface: 'surface',
  clearance: 'display clearance',
};
const MAX_LABEL: Record<MoonMaxReason, string> = {
  stability: 'Hill stability',
  display: 'display limit',
  isolated: 'no primary star',
};

export const MoonCreatorPanel: React.FC<{
  onCreated: (snapshot: SimulationSnapshot, body: CelestialBody) => void;
  onCancel: () => void;
  onSwitchMode: (mode: BodyType) => void;
}> = ({ onCreated, onCancel, onSwitchMode }) => {
  const uiMode = useStore((s) => s.uiMode);
  const bodyCount = useStore((s) => s.bodies.length);
  const parentId = useMoonDraft((s) => s.parentId);
  const r = useMoonDraft((s) => s.r);
  const f = useMoonDraft((s) => s.f);
  const phase = useMoonDraft((s) => s.phase);
  const tiltDeg = useMoonDraft((s) => s.tiltDeg);
  const retrograde = useMoonDraft((s) => s.retrograde);
  const mass = useMoonDraft((s) => s.mass);
  const hint = useMoonDraft((s) => s.hint);
  const { patch, setParent, setHint } = useMoonDraft.getState();

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const input = useMemo(
    () => ({ parentId, r, f, phase, tiltDeg, retrograde, mass }),
    [parentId, r, f, phase, tiltDeg, retrograde, mass],
  );
  const resolved = useMemo(
    () => resolveMoonDraft(input, getLiveBodies(), uiMode),
    // `tick` and `bodyCount` re-read the live bodies; they are not used directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [input, uiMode, tick, bodyCount],
  );

  const candidates = useMemo(() => {
    if (parentId) return [];
    const bodies = getLiveBodies();
    return bodies
      .filter((b) => MOON_HOST_TYPES.includes(b.type) && !b.parentId)
      .map((body) => {
        const status = moonHostStatus(body, makeMoonTemplate(body, moonMassFor(body, mass)), bodies, uiMode, retrograde);
        return { body, reason: status.ok ? null : status.reason };
      })
      .sort((a, b) => Number(!!a.reason) - Number(!!b.reason) || a.body.name.localeCompare(b.body.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId, mass, uiMode, retrograde, bodyCount, Math.floor(tick / 4)]);

  const atCapacity = bodyCount >= PHYSICS_LIMITS.MAX_BODIES;

  const create = useCallback(() => {
    const bodies = getLiveBodies();
    const res = resolveMoonDraft(useMoonDraft.getState(), bodies, useStore.getState().uiMode);
    if (res.status !== 'ready') return;
    const store = useStore.getState();
    if (store.bodies.length >= PHYSICS_LIMITS.MAX_BODIES) {
      setHint(`The universe is full (${PHYSICS_LIMITS.MAX_BODIES} bodies).`);
      return;
    }
    // Undo must restore the live system, not the store's last synced copy.
    const snapshot = captureSimulationSnapshot(bodies);
    const epoch = getSimTime();
    const moon = buildMoonOnOrbit(res, `created-Moon-${Date.now()}`, `Moon ${store.getNextNumber('Moon')}`, epoch);

    store.appendBody(moon);
    resetVerletCache();
    resetAccumulator();
    setSimTime(epoch);

    cancelAllBodyPointerGestures();
    onCreated(snapshot, moon);
    onCancel();
  }, [onCreated, onCancel, setHint]);

  // Desktop shortcuts. Enter on a focused button already clicks it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key !== 'Enter') return;
      const el = e.target as HTMLElement | null;
      if (el?.closest('button, a, textarea, select')) return;
      e.preventDefault();
      create();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [create, onCancel]);

  const ready = resolved.status === 'ready' ? resolved : null;
  const parentName = resolved.status !== 'no-parent' ? resolved.parent.name : null;
  const ParentIcon = resolved.status !== 'no-parent' ? visualFor(resolved.parent.type).icon : Moon;

  const setDirection = (toRetro: boolean) => {
    if (toRetro === retrograde) return;
    const current = ready?.spec.phase ?? phase;
    patch({
      retrograde: toRetro,
      phase: current == null ? null : phaseForPlaneChange(
        current, moonInclinationRad(tiltDeg, retrograde), moonInclinationRad(tiltDeg, toRetro),
      ),
    });
  };

  return (
    <div
      data-testid="moon-creator"
      role="dialog"
      aria-label="Create a moon"
      className="moon-creator-anchor fixed z-30 flex flex-col overflow-hidden bg-[rgba(16,20,28,0.92)] backdrop-blur-xl border border-white/10 shadow-2xl ring-1 ring-white/5 ag-fade-in"
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 shrink-0">
        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-stone-400/20 text-stone-300 shrink-0">
          <Moon size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider text-pulsar-white/80">New moon</div>
          <div className="text-[10px] text-pulsar-white/40 truncate">
            {ready ? `Orbiting ${parentName}` : 'Step 1 of 2 · choose a planet to orbit'}
          </div>
        </div>
        <button
          type="button"
          onClick={onCancel}
          data-testid="moon-cancel"
          aria-label="Cancel moon creation"
          className="touch-target w-11 h-11 flex items-center justify-center rounded-lg text-pulsar-white/50 hover:text-pulsar-white hover:bg-white/10"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto panel-scroll p-3 space-y-3">
        {hint && (
          <p role="status" data-testid="moon-hint" className="text-[11px] leading-snug text-nebula-rust bg-nebula-rust/10 border border-nebula-rust/25 rounded-lg px-2.5 py-1.5">
            {hint}
          </p>
        )}

        {resolved.status === 'no-parent' && (
          <>
            <p className="text-[11px] text-pulsar-white/50 leading-snug">
              Tap a planet in space, or pick one below. The moon is placed directly on a bound orbit.
            </p>
            {candidates.length === 0 ? (
              <div className="text-center py-4 space-y-2">
                <p className="text-xs text-pulsar-white/40">There is no planet to orbit yet.</p>
                <button
                  type="button"
                  onClick={() => onSwitchMode('Planet')}
                  className="touch-target min-h-[2.75rem] px-4 rounded-lg text-xs font-bold uppercase tracking-wider bg-nova-gold/20 text-nova-gold hover:bg-nova-gold/30"
                >
                  Create a planet first
                </button>
              </div>
            ) : (
              <ul className="space-y-1" aria-label="Planets that can hold a moon">
                {candidates.map(({ body, reason }) => {
                  const v = visualFor(body.type);
                  return (
                    <li key={body.id}>
                      <button
                        type="button"
                        data-testid={`moon-parent-${body.id}`}
                        disabled={!!reason}
                        onClick={() => pickMoonParent(body.id)}
                        className={cn(
                          'touch-target w-full min-h-[2.75rem] flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors',
                          reason
                            ? 'border-transparent opacity-50 cursor-not-allowed'
                            : 'border-white/5 hover:bg-white/5 hover:border-nova-gold/30',
                        )}
                      >
                        <v.icon size={14} className={cn('shrink-0', v.text)} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs text-pulsar-white/80 truncate">{body.name}</span>
                          <span className="block text-[10px] text-pulsar-white/35 leading-snug">
                            {reason ?? `${body.type} · ${fmtMass(body.mass)}`}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {resolved.status === 'ineligible' && (
          <div className="space-y-2">
            <p className="text-[11px] text-nebula-rust leading-snug">{resolved.parent.name}: {resolved.reason}</p>
            <button
              type="button"
              onClick={() => setParent(null)}
              className="touch-target min-h-[2.75rem] w-full rounded-lg text-xs font-bold uppercase tracking-wider bg-white/5 text-pulsar-white/70 hover:bg-white/10"
            >
              Choose another planet
            </button>
          </div>
        )}

        {ready && (
          <>
            <div className="flex items-center gap-2">
              <ParentIcon size={14} className={cn('shrink-0', visualFor(ready.parent.type).text)} />
              <span className="flex-1 text-xs text-pulsar-white/80 truncate" data-testid="moon-parent-name">{parentName}</span>
              <button
                type="button"
                data-testid="moon-change-parent"
                onClick={() => setParent(null)}
                className="touch-target min-h-[2.75rem] px-3 rounded-lg text-[10px] font-bold uppercase tracking-wider text-pulsar-white/50 hover:text-pulsar-white hover:bg-white/5 flex items-center gap-1"
              >
                <ArrowLeftRight size={12} /> Change
              </button>
            </div>

            <div>
              <LogRangeInput
                testId="moon-size"
                label="Size"
                valueLabel={`${fmtRadiusKm(ready.moon.radiusKm)} · ${fmtMass(ready.moon.mass)}`}
                value={ready.moon.mass}
                min={ready.massRange.min}
                max={ready.massRange.max}
                step={0.01}
                onChange={(v) => patch({ mass: v })}
              />
              <p className="text-[9px] font-mono text-pulsar-white/30 -mt-1 leading-snug" data-testid="moon-size-caption">
                {describeMoonSize(ready.moon.mass)}
                {' · '}
                {fmtRadiusKm(moonRadiusKm(ready.massRange.min))} – {fmtRadiusKm(moonRadiusKm(ready.massRange.max))}
                {' '}
                ({ready.massRange.maxReason === 'type' ? 'moon size range' : `max 1/10 of ${parentName}'s mass`})
              </p>
            </div>

            <div>
              <LogRangeInput
                testId="moon-distance"
                label="Distance"
                valueLabel={`${(ready.spec.r / ready.limits.parentRadius).toFixed(1)} R · ${fmtDistance(ready.spec.r)}`}
                value={ready.spec.r}
                min={ready.limits.rMin}
                max={ready.limits.rMax}
                step={0.005}
                onChange={(v) => patch({ r: v })}
              />
              <p className="text-[9px] font-mono text-pulsar-white/30 -mt-1 leading-snug">
                {(ready.limits.rMin / ready.limits.parentRadius).toFixed(1)} R ({MIN_LABEL[ready.limits.minReason]})
                {' – '}
                {(ready.limits.rMax / ready.limits.parentRadius).toFixed(1)} R ({MAX_LABEL[ready.limits.maxReason]})
              </p>
              {ready.limits.maxReason === 'display' && (
                <p className="text-[9px] text-pulsar-white/30 leading-snug mt-0.5">
                  Moon orbits are drawn ~{Math.round(ready.limits.renderScale)}× enlarged; wider ones would be drawn across the star.
                </p>
              )}
            </div>

            {ready.speedRange[1] - ready.speedRange[0] > 0.01 && (
              <div>
                <RangeInput
                  testId="moon-speed"
                  label={ready.spec.f === 1 ? 'Speed · circular' : `Speed · ${ready.spec.f > 1 ? 'faster' : 'slower'} than circular`}
                  value={ready.spec.f}
                  min={ready.speedRange[0]}
                  max={ready.speedRange[1]}
                  step={0.005}
                  onChange={(v) => {
                    // Snap to circular near 1, but never away from an end of the
                    // range: near the outer limit the fastest admissible speed is
                    // itself within the snap zone, and End must still reach it.
                    const [lo, hi] = ready.speedRange;
                    const atEnd = v <= lo + 1e-9 || v >= hi - 1e-9;
                    patch({ f: !atEnd && Math.abs(v - 1) < CIRCULAR_SNAP ? 1 : v });
                  }}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-black/30" role="group" aria-label="Orbit direction">
              {([false, true] as const).map((retro) => (
                <button
                  key={String(retro)}
                  type="button"
                  data-testid={retro ? 'moon-dir-retrograde' : 'moon-dir-prograde'}
                  aria-pressed={retrograde === retro}
                  onClick={() => setDirection(retro)}
                  className={cn(
                    'touch-target min-h-[2.75rem] rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors',
                    retrograde === retro ? 'bg-nova-gold/20 text-nova-gold' : 'text-pulsar-white/50 hover:bg-white/5',
                  )}
                >
                  {retro ? 'Retrograde' : 'Prograde'}
                </button>
              ))}
            </div>

            {uiMode === 'advanced' && (
              <RangeInput
                testId="moon-tilt"
                label="Tilt (°)"
                value={tiltDeg}
                min={0}
                max={90}
                step={1}
                onChange={(v) => patch({ tiltDeg: v })}
              />
            )}

            <DerivedGroup title="Orbit" note="Derived from the settings above; every setting is a bound orbit.">
              <DerivedRow label="Period" value={fmtPeriod(ready.periodYears)} testId="moon-period" />
              <DerivedRow label="Start speed" value={`${velocityToKmS(ready.startSpeed).toFixed(2)} km/s`} />
              <DerivedRow
                label="Shape"
                value={ready.eccentricity < 5e-3 ? 'Circular' : `e = ${ready.eccentricity.toFixed(2)}`}
              />
              {ready.eccentricity >= 5e-3 && (
                <DerivedRow label="Peri / apo" value={`${fmtDistance(ready.periapsis)} / ${fmtDistance(ready.apoapsis)}`} />
              )}
            </DerivedGroup>

            {ready.insideFluidRoche && (
              <p className="flex gap-1.5 text-[10px] leading-snug text-nebula-rust">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                Inside the fluid Roche limit: only a solid, cohesive moon survives here. A rubble pile would be torn into a ring.
              </p>
            )}
          </>
        )}
      </div>

      {ready && (
        <div className="shrink-0 px-3 py-2.5 border-t border-white/10 moon-creator-footer">
          <button
            type="button"
            data-testid="moon-create"
            onClick={create}
            disabled={atCapacity}
            className={cn(
              'touch-target w-full min-h-[2.75rem] rounded-lg text-xs font-bold uppercase tracking-widest transition-all',
              atCapacity
                ? 'bg-white/5 text-white/25 cursor-not-allowed'
                : 'bg-nova-gold text-void-navy hover:bg-nova-gold/90 active:scale-[0.98] shadow-lg shadow-nova-gold/20',
            )}
          >
            {atCapacity ? 'Universe full' : 'Create moon'}
          </button>
        </div>
      )}
    </div>
  );
};

export default MoonCreatorPanel;
