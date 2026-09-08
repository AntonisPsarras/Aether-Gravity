import React, { useEffect, useState } from 'react';
import { CompositionSlider } from '../controls/CompositionSlider';
import { useInspectorCtx, LOCK_SETS } from '../InspectorContext';

/**
 * Iron / silicate / water split.
 *
 * The three fractions are constrained to sum to 1, so moving one redistributes
 * the remainder across the other two in proportion. Composition is a *primary*:
 * radius, density, gravity and escape velocity are all re-derived from it by
 * the store, which is why the manual-radius override is cleared on every edit.
 */
export const CompositionSection: React.FC = () => {
  const { body, props, updateBody, lockFields, unlockFields } = useInspectorCtx();

  const [iron, setIron] = useState(props.compositionIron ?? 0.3);
  const [silicates, setSilicates] = useState(props.compositionSilicates ?? 0.6);
  const [water, setWater] = useState(props.compositionWater ?? 0.1);

  useEffect(() => {
    setIron(body.properties?.compositionIron ?? 0.3);
    setSilicates(body.properties?.compositionSilicates ?? 0.6);
    setWater(body.properties?.compositionWater ?? 0.1);
    // Re-seed only when the inspected body changes, never on every physics tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body.id]);

  const start = () => lockFields(LOCK_SETS.composition);
  const end = () => unlockFields(LOCK_SETS.composition);

  const handleChange = (type: 'iron' | 'silicates' | 'water', newValue: number) => {
    let nextIron = type === 'iron' ? newValue : iron;
    let nextSil = type === 'silicates' ? newValue : silicates;
    let nextWater = type === 'water' ? newValue : water;

    if (type === 'iron') nextIron = Math.min(Math.max(nextIron, 0), 1);
    if (type === 'silicates') nextSil = Math.min(Math.max(nextSil, 0), 1);
    if (type === 'water') nextWater = Math.min(Math.max(nextWater, 0), 1);

    const remainder = 1.0 - (type === 'iron' ? nextIron : type === 'silicates' ? nextSil : nextWater);
    const other1 = type === 'iron' ? nextSil : nextIron;
    const other2 = type === 'water' ? nextSil : nextWater;
    const sumOthers = other1 + other2;

    let newOther1: number;
    let newOther2: number;
    if (sumOthers <= 0.0001) {
      newOther1 = remainder / 2;
      newOther2 = remainder / 2;
    } else {
      newOther1 = (other1 / sumOthers) * remainder;
      newOther2 = (other2 / sumOthers) * remainder;
    }

    if (type === 'iron') { nextSil = newOther1; nextWater = newOther2; }
    else if (type === 'silicates') { nextIron = newOther1; nextWater = newOther2; }
    else { nextIron = newOther1; nextSil = newOther2; }

    setIron(nextIron);
    setSilicates(nextSil);
    setWater(nextWater);

    // Composition is a primary; radius, density, gravity and escape velocity
    // are re-derived from it by the store (utils/bodyDerivation.ts).
    updateBody(body.id, {
      properties: {
        ...props,
        manualRadius: false,
        manualRadiusKm: undefined,
        compositionIron: nextIron,
        compositionSilicates: nextSil,
        compositionWater: nextWater,
      },
    });
  };

  return (
    <div className="bg-black/20 rounded-xl p-3 border border-white/5">
      <CompositionSlider testId="inspector-field-comp-iron" label="Iron (Core)" value={iron} color="bg-orange-600" onChange={(v) => handleChange('iron', v)} onEditStart={start} onEditEnd={end} />
      <CompositionSlider testId="inspector-field-comp-silicates" label="Silicates (Mantle)" value={silicates} color="bg-stone-500" onChange={(v) => handleChange('silicates', v)} onEditStart={start} onEditEnd={end} />
      <CompositionSlider testId="inspector-field-comp-water" label="Water (Ice/Ocean)" value={water} color="bg-blue-500" onChange={(v) => handleChange('water', v)} onEditStart={start} onEditEnd={end} />
    </div>
  );
};
