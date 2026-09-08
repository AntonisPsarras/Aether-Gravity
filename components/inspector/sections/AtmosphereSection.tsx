import React from 'react';
import { RangeInput } from '../controls/RangeInput';
import { AtmosphereChart } from '../controls/AtmosphereChart';
import { useInspectorCtx } from '../InspectorContext';

/** Atmospheric primaries plus the derived temperature-altitude profile. */
export const AtmosphereSection: React.FC = () => {
  const { body, props, setProp, propEditStart, propEditEnd, showField } = useInspectorCtx();
  const isGiant = body.type === 'Ice Giant' || body.type === 'Gas Giant';

  return (
    <div className="space-y-3">
      <div className="bg-black/20 rounded-xl p-3 border border-white/5">
        {body.type === 'Planet' && (
          <>
            <RangeInput label="Atmosphere Density" min={0} max={1} step={0.01} value={props.atmosphere ?? 0.2} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('atmosphere', v)} />
            {showField('scaleHeight') && (
              <RangeInput label="Atmosphere Height" min={0.01} max={1.0} step={0.01} value={props.scaleHeight ?? 0.2} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('scaleHeight', v)} />
            )}
            {showField('haze') && (
              <RangeInput label="Haze Concentration" min={0} max={1} step={0.01} value={props.haze ?? 0.0} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('haze', v)} />
            )}
          </>
        )}
        {isGiant && (
          <>
            {showField('methane') && (
              <RangeInput label="Methane Conc." min={0} max={1} step={0.01} value={props.methane ?? 0.3} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('methane', v)} />
            )}
            <RangeInput label="Cloud Depth" min={0} max={1} step={0.01} value={props.cloudDepth ?? 0.2} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('cloudDepth', v)} />
          </>
        )}
      </div>

      {(body.type === 'Planet' || body.type === 'Ice Giant') && <AtmosphereChart body={body} />}
    </div>
  );
};
