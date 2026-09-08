import React from 'react';
import { hasSpinAxis } from '../../../utils/inspectorSections';
import { RangeInput } from '../controls/RangeInput';
import { useInspectorCtx } from '../InspectorContext';

/** Spin axis and per-type activity knobs. */
export const DynamicsSection: React.FC = () => {
  const { body, props, setProp, propEditStart, propEditEnd } = useInspectorCtx();

  return (
    <div className="bg-black/20 rounded-xl p-3 border border-white/5">
      {/* Obliquity is the real spin-axis tilt the presets populate and the
          renderer leans the body by. `axialTilt` was the old ice-giant-only
          value; it is still read as a fallback for worlds saved before the two
          were unified. */}
      {hasSpinAxis(body) && (
        <RangeInput
          testId="inspector-field-obliquity"
          label="Axial Tilt (Obliquity)" min={0} max={180} step={1}
          value={props.obliquity ?? props.axialTilt ?? 0}
          onEditStart={propEditStart} onEditEnd={propEditEnd}
          onChange={(v) => setProp('obliquity', v)}
        />
      )}
      {body.type === 'Dwarf' && (
        <>
          <RangeInput label="Flare Frequency" min={0} max={1} step={0.01} value={props.flareActivity ?? 0.1} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('flareActivity', v)} />
          <RangeInput label="Magnetic Index" min={0} max={1} step={0.01} value={props.magneticIndex ?? 0.1} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('magneticIndex', v)} />
        </>
      )}
    </div>
  );
};
