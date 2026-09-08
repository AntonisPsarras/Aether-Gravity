import React from 'react';
import { defaultRingEdges, rocheLimitRadiiFor } from '../../../utils/inspectorSections';
import { RangeInput } from '../controls/RangeInput';
import { DerivedRow, DerivedGroup } from '../controls/DerivedRow';
import { useInspectorCtx } from '../InspectorContext';

/**
 * Ring geometry, shown against the Roche limit so the user can see whether the
 * edges they are dragging are somewhere rings could physically survive.
 */
export const RingsSection: React.FC = () => {
  const { body, props, setProp, propEditStart, propEditEnd } = useInspectorCtx();
  const edges = defaultRingEdges(body);
  const roche = rocheLimitRadiiFor(body);
  const opacity = props.ringOpacity ?? 0;
  const outer = props.ringOuterRadius ?? edges.outer;

  return (
    <div className="bg-black/20 rounded-xl p-3 border border-white/5">
      <RangeInput
        testId="inspector-field-ring-opacity"
        label="Ring Opacity" min={0} max={1} step={0.01}
        value={opacity}
        onEditStart={propEditStart} onEditEnd={propEditEnd}
        onChange={(v) => setProp('ringOpacity', v)}
      />
      {opacity > 0.01 && (
        <>
          <RangeInput
            label="Ring Inner Edge (R)" min={1.05} max={6} step={0.05}
            value={props.ringInnerRadius ?? edges.inner}
            onEditStart={propEditStart} onEditEnd={propEditEnd}
            onChange={(v) => setProp('ringInnerRadius', v)}
          />
          <RangeInput
            label="Ring Outer Edge (R)" min={1.1} max={10} step={0.05}
            value={outer}
            onEditStart={propEditStart} onEditEnd={propEditEnd}
            onChange={(v) => setProp('ringOuterRadius', v)}
          />
          <DerivedGroup title="Roche" note="Recomputed from bulk density." className="mt-2">
            <DerivedRow label="Roche limit" value={`${roche.toFixed(2)} R`} flash />
            <p className="text-[9px] text-pulsar-white/30 leading-snug">
              {outer > roche
                ? 'Outer edge is beyond the Roche limit — debris out there would accrete into a moon.'
                : 'Rings sit inside the Roche limit, where tides prevent accretion.'}
            </p>
          </DerivedGroup>
        </>
      )}
    </div>
  );
};
