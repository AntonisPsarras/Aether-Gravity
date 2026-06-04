import React, { useRef, useState } from 'react';

import { useFrame } from '@react-three/fiber';

import { Html } from '@react-three/drei';

import { CelestialBody } from '../types';

import { G_CONSTANT } from '../constants';

import { useStore } from '../utils/store';



/**

 * Dev-only overlay: total mechanical energy (KE + PE) sampled at 1 Hz.

 * Hidden unless isDebugMode is enabled in the store (defaults to false).

 */

const PhysicsDiagnostics: React.FC<{

  bodiesRef: React.MutableRefObject<CelestialBody[]>;

}> = ({ bodiesRef }) => {

  const isDebugMode = useStore((s) => s.isDebugMode);

  const [stats, setStats] = useState({ n: 0, energy: 0, ke: 0, pe: 0 });

  const baselineRef = useRef<number | null>(null);

  const lastSampleRef = useRef(0);



  useFrame((state) => {

    if (!import.meta.env.DEV || !isDebugMode) return;

    const t = state.clock.elapsedTime;

    if (t - lastSampleRef.current < 1.0) return;

    lastSampleRef.current = t;



    const bodies = bodiesRef.current;

    if (!bodies || bodies.length === 0) return;



    let ke = 0;

    let pe = 0;

    const n = bodies.length;



    for (let i = 0; i < n; i++) {

      const b = bodies[i];

      const v2 = b.velocity.lengthSq();

      ke += 0.5 * b.mass * v2;

    }



    for (let i = 0; i < n; i++) {

      const bi = bodies[i];

      for (let j = i + 1; j < n; j++) {

        const bj = bodies[j];

        const dx = bj.position.x - bi.position.x;

        const dy = bj.position.y - bi.position.y;

        const dz = bj.position.z - bi.position.z;

        const r = Math.sqrt(dx * dx + dy * dy + dz * dz + 0.1);

        pe -= (G_CONSTANT * bi.mass * bj.mass) / r;

      }

    }



    const energy = ke + pe;

    if (baselineRef.current === null) baselineRef.current = energy;

    setStats({ n, energy, ke, pe });

  });



  if (!import.meta.env.DEV || !isDebugMode) return null;



  const baseline = baselineRef.current ?? stats.energy;

  const driftPct = baseline !== 0

    ? ((stats.energy - baseline) / Math.abs(baseline)) * 100

    : 0;



  return (

    <Html fullscreen style={{ pointerEvents: 'none' }}>

      <div className="fixed bottom-24 left-4 z-50 font-mono text-[10px] text-emerald-400/80 bg-black/50 px-2 py-1 rounded border border-emerald-500/20 md:bottom-28 md:left-[max(1rem,var(--safe-left))]">

        <div>N = {stats.n}</div>

        <div>E = {stats.energy.toExponential(3)}</div>

        <div>KE = {stats.ke.toExponential(3)}</div>

        <div>PE = {stats.pe.toExponential(3)}</div>

        <div>ΔE = {driftPct.toFixed(3)}%</div>

      </div>

    </Html>

  );

};



export default PhysicsDiagnostics;

