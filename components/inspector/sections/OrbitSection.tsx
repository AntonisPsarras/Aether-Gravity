import React, { useCallback, useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { getOrbitalElements, calculateOrbitalState } from '../../../utils/physicsUtils';
import { elementsFromDegrees, meanAnomalyFromTrueAnomaly } from '../../../utils/keplerOrbit';
import { getSimTime } from '../../../utils/physicsSoA';
import { fmtDistance, fmtPeriod, orbitalPeriodYears } from '../../../utils/units';
import { LogRangeInput, RangeInput } from '../controls/RangeInput';
import { CircularDial } from '../controls/CircularDial';
import { DerivedRow, DerivedGroup } from '../controls/DerivedRow';
import { useInspectorCtx, LOCK_SETS } from '../InspectorContext';
import { cn } from '../../ui/cn';

export interface OrbitElements {
  a: number; e: number; i: number; Omega: number; omega: number; nu: number;
}

const EMPTY: OrbitElements = { a: 0, e: 0, i: 0, Omega: 0, omega: 0, nu: 0 };


/**
 * Keplerian element editor.
 *
 * Edits are *staged*, not live: they only reach the body when the user presses
 * Apply. Nothing else commits them — not collapsing the section, not switching
 * tab, not dismissing the panel — because a silent commit would move a body
 * the user never asked to move.
 */
export const OrbitSection: React.FC<{
  /** Reported upward so the tab bar and section header can show a dirty dot. */
  onDirtyChange?: (dirty: boolean) => void;
}> = ({ onDirtyChange }) => {
  const { body, parent, updateBody, lockFields, unlockFields, showField } = useInspectorCtx();
  const [elements, setElements] = useState<OrbitElements>(EMPTY);
  /**
   * Dirty means "the user has edited something that has not been applied".
   *
   * Deliberately tracked from the edits themselves rather than by diffing the
   * staged elements against the live orbit: true anomaly advances on every
   * physics tick, so a live comparison reports dirty within a frame of opening
   * the section and the indicator becomes noise.
   */
  const [dirty, setDirty] = useState(false);
  const edit = useCallback((patch: Partial<OrbitElements>) => {
    setDirty(true);
    setElements((prev) => ({ ...prev, ...patch }));
  }, []);

  const readLive = useCallback((): OrbitElements | null => {
    if (!parent) return null;
    try {
      const el = getOrbitalElements(body, parent);
      if (!isFinite(el.a) || el.a <= 0) return null;
      return {
        a: el.a,
        e: Math.max(0, Math.min(0.95, el.e || 0)),
        i: el.i || 0,
        Omega: el.Omega || 0,
        omega: el.omega || 0,
        nu: el.nu || 0,
      };
    } catch {
      return null; // singular orbit
    }
  }, [body, parent]);

  /**
   * Seed the staged elements from the live orbit.
   *
   * Keyed on the body and parent *ids*, not the objects: the store replaces
   * every body on every physics tick, so depending on the objects re-ran this
   * 60 times a second and wiped whatever the user was in the middle of editing.
   * A live orbit that has since drifted is re-read on demand via Reload.
   */
  useEffect(() => {
    const live = readLive();
    if (live) setElements(live);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body.id, parent?.id]);

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const start = () => lockFields(LOCK_SETS.orbit);
  const end = () => unlockFields(LOCK_SETS.orbit);

  /**
   * Apply the staged elements to the body.
   *
   * For a free body this sets position and velocity, and additionally *stores*
   * the elements on `body.orbit` so they survive a save/load round trip — the
   * pre-2.0 tab computed a state vector and threw the elements away, so the
   * sliders reset to whatever the integrator happened to produce.
   *
   * For a satellite on Kepler rails the elements ARE the state, so they are
   * written straight through and the body is re-placed on the next frame.
   */
  const applyOrbitalElements = () => {
    if (!parent) return;
    const clamped = {
      a: Math.max(1e-4, Math.min(20000, elements.a || 40)),
      e: Math.max(0, Math.min(0.95, elements.e || 0)),
      i: Math.max(0, Math.min(180, elements.i || 0)),
      Omega: ((elements.Omega || 0) % 360 + 360) % 360,
      omega: ((elements.omega || 0) % 360 + 360) % 360,
      nu: ((elements.nu || 0) % 360 + 360) % 360,
    };

    const orbit = elementsFromDegrees(
      clamped.a, clamped.e, clamped.i, clamped.Omega, clamped.omega,
      // The tab edits true anomaly; the stored element is mean anomaly.
      (meanAnomalyFromTrueAnomaly((clamped.nu * Math.PI) / 180, clamped.e) * 180) / Math.PI,
      getSimTime(),
    );

    if (body.parentId) {
      updateBody(body.id, { orbit });
      setDirty(false);
      return;
    }

    const state = calculateOrbitalState(
      parent, clamped.a, clamped.e, clamped.i,
      clamped.Omega, clamped.omega, clamped.nu, body.mass,
    );
    if (!isFinite(state.position.x) || !isFinite(state.velocity.x)) return;
    updateBody(body.id, { position: state.position, velocity: state.velocity, orbit });
    setDirty(false);
  };

  const reload = () => {
    const live = readLive();
    if (live) setElements(live);
    setDirty(false);
  };

  return (
    <div className="bg-black/20 rounded-xl border border-white/5">
      <div className="p-3 space-y-3">
        <DerivedGroup title="Reference" note="Read from the body's live state vector.">
          <DerivedRow label="Parent" value={parent ? parent.name : '— None —'} />
          {parent && (
            <>
              <DerivedRow label="Distance" value={fmtDistance(body.position.distanceTo(parent.position))} />
              <DerivedRow
                label="Orbital Period"
                value={fmtPeriod(orbitalPeriodYears(elements.a, parent.mass + body.mass))}
              />
            </>
          )}
        </DerivedGroup>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <LogRangeInput
              testId="inspector-field-semi-major"
              label="Semi-major Axis (a)"
              valueLabel={fmtDistance(elements.a || 40)}
              value={elements.a || 40}
              min={0.005}
              max={2000}
              step={0.001}
              onEditStart={start} onEditEnd={end}
              onChange={(a) => edit({ a })}
            />
            <RangeInput label="Eccentricity (e)" min={0} max={0.95} step={0.01} value={elements.e || 0} onEditStart={start} onEditEnd={end} onChange={(e) => edit({ e })} />
            {/* Orientation angles are Advanced-only. The staged values are still
                carried and still applied, so a beginner never silently
                flattens an inclined orbit by pressing Apply. */}
            {showField('trueAnomaly') && (
              <RangeInput label="True Anomaly (ν)" min={0} max={360} step={1} value={elements.nu || 0} onEditStart={start} onEditEnd={end} onChange={(nu) => edit({ nu })} />
            )}
          </div>
          {showField('inclination') && (
            <div className="grid grid-cols-2 gap-2">
              <CircularDial label="Inclination (i)" value={elements.i || 0} max={180} onEditStart={start} onEditEnd={end} onChange={(i) => edit({ i })} />
              <CircularDial label="Asc Node (Ω)" value={elements.Omega || 0} onEditStart={start} onEditEnd={end} onChange={(Omega) => edit({ Omega })} />
              <div className="col-span-2 flex justify-center">
                <div className="w-1/2">
                  <CircularDial label="Arg Periapsis (ω)" value={elements.omega || 0} onEditStart={start} onEditEnd={end} onChange={(omega) => edit({ omega })} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sticky so the commit stays reachable in a long desktop scroll and at
          the half-height phone detent. */}
      <div className="sticky bottom-0 panel-glass-dark rounded-b-xl px-3 py-2.5 space-y-1.5 border-t border-white/10">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={applyOrbitalElements}
            disabled={!parent}
            data-testid="inspector-apply-orbit"
            data-dirty={dirty ? 'true' : 'false'}
            className={cn(
              'touch-target min-h-[2.75rem] flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all',
              parent
                ? 'bg-nova-gold/20 text-nova-gold hover:bg-nova-gold/30 active:scale-[0.98]'
                : 'bg-white/5 text-white/20 cursor-not-allowed',
            )}
          >
            Apply Orbital State
          </button>
          <button
            type="button"
            onClick={reload}
            disabled={!parent}
            title="Discard staged edits and re-read the live orbit"
            aria-label="Reload from live orbit"
            className="touch-target min-h-[2.75rem] w-11 flex items-center justify-center rounded-lg bg-white/5 text-pulsar-white/50 hover:text-pulsar-white hover:bg-white/10 transition-colors disabled:opacity-30"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <p className="text-[10px] text-pulsar-white/30 italic text-center leading-snug">
          {dirty
            ? 'Unapplied changes — nothing moves until you press Apply. Closing the panel discards them.'
            : 'Computes new position + velocity from the six classical elements and snaps the body onto the prescribed orbit.'}
        </p>
      </div>
    </div>
  );
};
