import React from 'react';
import { TEXTURE_TYPES } from '../../../constants';
import {
  fmtMass, fmtRadiusKm, fmtRadiusRelative, fmtDensity, fmtGravity, fmtEscVel,
  massToEarth,
} from '../../../utils/units';
import { PHYSICS_LIMITS } from '../../../utils/physicsBounds';
import { isRadiusEditable, massSliderRange } from '../../../utils/inspectorSections';
import { useStore } from '../../../utils/store';
import { NumberInput } from '../controls/NumberInput';
import { RangeInput, LogRangeInput } from '../controls/RangeInput';
import { DerivedRow, DerivedGroup, PinnedValue } from '../controls/DerivedRow';
import { useInspectorCtx, LOCK_SETS } from '../InspectorContext';

/**
 * Mass, radius and the bulk quantities that follow from them, plus the
 * per-type structural knobs (stellar metallicity, giant mass loss, tectonics)
 * that are physical rather than thermal or orbital.
 */
export const PhysicalSection: React.FC = () => {
  const { body, props, updateBody, setProp, lockFields, unlockFields, propEditStart, propEditEnd } =
    useInspectorCtx();
  const setInteractingWithUI = useStore((s) => s.setInteractingWithUI);

  const physicalStart = () => lockFields(LOCK_SETS.physical);
  const physicalEnd = () => unlockFields(LOCK_SETS.physical);
  const [massMin, massMax] = massSliderRange(body);
  const radiusEditable = isRadiusEditable(body);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-pulsar-white/50 mb-1.5 uppercase flex items-center justify-between">
            <span>Mass</span>
            <span className="text-pulsar-white/30 normal-case font-mono">{fmtMass(body.mass)}</span>
          </label>
          <NumberInput
            testId="inspector-field-mass"
            value={body.mass}
            onChange={(v) => updateBody(body.id, { mass: v })}
            onEditStart={physicalStart}
            onEditEnd={physicalEnd}
            min={PHYSICS_LIMITS.MIN_MASS}
            max={PHYSICS_LIMITS.MAX_MASS}
            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-pulsar-white font-mono"
          />
        </div>
        <div>
          <label className="text-[10px] text-pulsar-white/50 mb-1.5 uppercase flex items-center justify-between">
            <span>Radius</span>
            <span className="text-pulsar-white/30 normal-case font-mono">{fmtRadiusRelative(body.radiusKm)}</span>
          </label>
          {radiusEditable ? (
            <NumberInput
              testId="inspector-field-radius"
              value={body.radiusKm}
              onChange={(v) => updateBody(body.id, { radiusKm: v })}
              onEditStart={physicalStart}
              onEditEnd={physicalEnd}
              min={PHYSICS_LIMITS.MIN_RADIUS_KM}
              max={PHYSICS_LIMITS.MAX_RADIUS_KM}
              className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-pulsar-white font-mono"
            />
          ) : (
            <PinnedValue
              value={fmtRadiusKm(body.radiusKm)}
              note="Fixed by this type's equation of state — radius follows from mass."
            />
          )}
        </div>
      </div>

      <LogRangeInput
        testId="inspector-field-mass-scale"
        label="Mass Scale"
        valueLabel={`${massToEarth(body.mass).toExponential(2)} M⊕`}
        value={body.mass}
        min={massMin}
        max={massMax}
        onChange={(v) => updateBody(body.id, { mass: v })}
        onEditStart={physicalStart}
        onEditEnd={physicalEnd}
      />

      <DerivedGroup
        testId="inspector-derived-physical"
        note="Recomputed from mass, radius and composition."
      >
        <DerivedRow label="Density" value={fmtDensity(props.bulkDensity ?? NaN)} flash />
        <DerivedRow label="Gravity" value={fmtGravity(props.surfaceGravity ?? NaN)} flash />
        <DerivedRow label="Esc. Velocity" value={fmtEscVel(props.escapeVelocity ?? NaN)} flash />
      </DerivedGroup>

      {body.type === 'Star' && (
        <>
          <RangeInput label="Metallicity (Z)" min={0} max={1} step={0.01} value={props.metallicity ?? 0.2} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('metallicity', v)} />
          <RangeInput label="Rotation (Oblateness)" min={0} max={0.5} step={0.01} value={props.oblateness ?? 0} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('oblateness', v)} />
          <RangeInput label="Convection Scale" min={1} max={10} step={0.1} value={props.convectionScale ?? 5} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('convectionScale', v)} />
        </>
      )}

      {body.type === 'Red Giant' && (
        <>
          <RangeInput label="Mass Loss Rate" min={0} max={1} step={0.01} value={props.massLoss ?? 0.1} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('massLoss', v)} />
          <RangeInput label="Pulsation Freq" min={0} max={5} step={0.1} value={props.pulsationSpeed ?? 0.5} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('pulsationSpeed', v)} />
          <div className="flex items-center gap-2 mt-2">
            <label className="text-[10px] text-pulsar-white/50 uppercase font-mono flex-1">Luminosity Class</label>
            <button
              type="button"
              onClick={() => setProp('luminosityClass', (props.luminosityClass || 0) === 0 ? 1 : 0)}
              className="touch-target min-h-[2.75rem] text-[10px] px-3 py-2 bg-white/10 hover:bg-white/15 rounded transition-colors"
            >
              {props.luminosityClass === 1 ? 'Supergiant' : 'Giant'}
            </button>
          </div>
        </>
      )}

      {body.type === 'Planet' && (
        <>
          <RangeInput label="Tectonic Activity" min={0} max={1} step={0.01} value={props.tectonics ?? 0} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('tectonics', v)} />
          <RangeInput label="Water Level" min={0} max={1} step={0.01} value={props.waterLevel ?? 0.5} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('waterLevel', v)} />
        </>
      )}

      {body.type !== 'Planet' && (
        <div>
          <label className="text-[10px] text-pulsar-white/50 block mb-1.5 uppercase">Surface Material</label>
          <select
            value={body.texture}
            data-no-drag
            onFocus={() => setInteractingWithUI(true)}
            onBlur={() => setInteractingWithUI(false)}
            onChange={(e) => updateBody(body.id, { texture: e.target.value })}
            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-pulsar-white font-mono"
          >
            {TEXTURE_TYPES.map((t) => (
              <option key={t.value} value={t.value} className="bg-slate-900">{t.label}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};
