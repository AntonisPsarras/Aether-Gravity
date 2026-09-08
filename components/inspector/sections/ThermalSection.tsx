import React from 'react';
import { Thermometer } from 'lucide-react';
import { useStore } from '../../../utils/store';
import { getSpectralType, kelvinToRgb, rgbToHex, bodyLuminositySolar } from '../../../utils/physicsUtils';
import { clampStarTemperature } from '../../../utils/physicsBounds';
import { fmtTemp, fmtLuminositySolar } from '../../../utils/units';
import { hasAnalysis } from '../../../utils/inspectorSections';
import { DerivedRow, DerivedGroup } from '../controls/DerivedRow';
import { useInspectorCtx, LOCK_SETS } from '../InspectorContext';

/**
 * Temperature and what follows from it.
 *
 * For a star the surface temperature is a primary the user sets (recorded with
 * `userTempOverride` so the derivation does not stomp it); for a planet the
 * equilibrium temperature is derived from insolation and is read-only.
 */
export const ThermalSection: React.FC = () => {
  const { body, props, updateBody, lockFields, unlockFields } = useInspectorCtx();
  const setInteractingWithUI = useStore((s) => s.setInteractingWithUI);

  const handleTemperatureChange = (temp: number) => {
    const clamped = clampStarTemperature(temp);
    const { r, g, b } = kelvinToRgb(clamped);
    updateBody(body.id, {
      temperature: clamped,
      color: rgbToHex(r, g, b),
      properties: { ...props, userTempOverride: true },
    });
  };

  const tempStart = () => { setInteractingWithUI(true); lockFields(LOCK_SETS.temperature); };
  const tempEnd = () => { setInteractingWithUI(false); unlockFields(LOCK_SETS.temperature); };

  return (
    <div className="space-y-3">
      {hasAnalysis(body) && (
        <DerivedGroup
          title="Equilibrium"
          note="Radiative equilibrium temperature, recomputed from insolation and albedo."
        >
          <DerivedRow label="Equilibrium Temp" value={fmtTemp(body.temperature)} flash />
        </DerivedGroup>
      )}

      {body.type === 'Star' && (
        <>
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] text-pulsar-white/50 uppercase font-bold flex items-center gap-1">
                <Thermometer size={10} /> Surface Temp
              </label>
              <span className="text-xs font-mono font-bold text-nova-gold">
                {body.temperature.toFixed(0)} K
              </span>
            </div>
            <input
              type="range"
              data-testid="inspector-field-star-temp"
              data-no-drag
              min="1000"
              max="40000"
              step="100"
              value={body.temperature}
              onPointerDown={tempStart}
              onPointerUp={tempEnd}
              onPointerCancel={tempEnd}
              onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
              className="inspector-temp-range w-full rounded-lg appearance-none cursor-pointer"
            />
          </div>

          <DerivedGroup title="Stellar" note="Recomputed from surface temperature and radius.">
            <DerivedRow label="Spectral Class" value={getSpectralType(body.temperature)} flash />
            <DerivedRow label="Luminosity" value={fmtLuminositySolar(bodyLuminositySolar(body))} flash />
          </DerivedGroup>
        </>
      )}
    </div>
  );
};
