import React from 'react';
import {
  schwarzschildRadiusKm, kerrOuterHorizonKm, iscoRadiusKm, photonSphereRadiusKm,
  diskEfficiency, MAX_SPIN_PARAMETER,
} from '../../../utils/relativity';
import { fmtRadiusKm } from '../../../utils/units';
import { RangeInput } from '../controls/RangeInput';
import { DerivedRow, DerivedGroup } from '../controls/DerivedRow';
import { useInspectorCtx } from '../InspectorContext';

/** Black hole spin and accretion, plus the Kerr geometry they determine. */
export const RelativisticSection: React.FC = () => {
  const { body, props, setProp, propEditStart, propEditEnd } = useInspectorCtx();
  const spin = props.spinParameter ?? 0;

  return (
    <div className="bg-black/20 rounded-xl p-3 border border-white/5">
      {/* Thorne limit: photon capture from the disk caps accretion-driven
          spin at a* = 0.998. */}
      <RangeInput
        testId="inspector-field-spin"
        label="Spin Parameter (a*)" min={0} max={MAX_SPIN_PARAMETER} step={0.002}
        value={spin}
        onEditStart={propEditStart} onEditEnd={propEditEnd}
        onChange={(v) => setProp('spinParameter', v)}
      />
      <RangeInput
        label="Accretion Rate" min={0} max={1.0} step={0.01}
        value={props.accretionRate ?? 0.5}
        onEditStart={propEditStart} onEditEnd={propEditEnd}
        onChange={(v) => setProp('accretionRate', v)}
      />

      {/* Everything below is derived Kerr geometry — read-only, recomputed
          from mass and spin. */}
      <DerivedGroup
        title="Kerr Geometry"
        note="Recomputed from mass and spin parameter."
        className="mt-2"
        testId="inspector-derived-kerr"
      >
        <DerivedRow label="Schwarzschild r_s" value={fmtRadiusKm(schwarzschildRadiusKm(body.mass))} flash />
        <DerivedRow label="Event horizon r₊" value={fmtRadiusKm(kerrOuterHorizonKm(body.mass, spin))} flash />
        <DerivedRow label="Photon sphere" value={fmtRadiusKm(photonSphereRadiusKm(body.mass, spin))} flash />
        <DerivedRow label="ISCO (prograde)" value={fmtRadiusKm(iscoRadiusKm(body.mass, spin, true))} flash />
        <DerivedRow label="Disk efficiency η" value={`${(diskEfficiency(spin) * 100).toFixed(1)} %`} flash />
      </DerivedGroup>
    </div>
  );
};
