import React, { useMemo } from 'react';
import { Group } from '@visx/group';
import { LinePath } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { scaleLinear } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { ParentSize } from '@visx/responsive';
import type { CelestialBody } from '../../../types';

const HEIGHT = 120;
const MARGIN = { top: 10, right: 10, bottom: 20, left: 30 };

const Chart: React.FC<{ body: CelestialBody; width: number }> = ({ body, width }) => {
  const xMax = Math.max(40, width - MARGIN.left - MARGIN.right);
  const yMax = HEIGHT - MARGIN.top - MARGIN.bottom;

  const data = useMemo(() => {
    const points: { h: number; t: number }[] = [];
    const scaleH = body.properties?.scaleHeight || 0.2;
    const surfTemp = body.temperature;
    // Simulate adiabatic lapse rate
    for (let i = 0; i <= 20; i++) {
      const h = i / 20; // 0 to 1 relative height
      const t = surfTemp * Math.pow(Math.E, -h * (1.0 / scaleH) * 2.0); // Simple exp decay
      points.push({ h: h * 100, t }); // h in km approx, t in K
    }
    return points;
  }, [body.temperature, body.properties?.scaleHeight]);

  const xScale = scaleLinear({ domain: [0, 100], range: [0, xMax] });
  const yScale = scaleLinear({ domain: [0, body.temperature], range: [yMax, 0] });

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label="Temperature versus altitude">
      <Group top={MARGIN.top} left={MARGIN.left}>
        <AxisLeft scale={yScale} numTicks={4} stroke="rgba(255,255,255,0.08)" tickStroke="rgba(255,255,255,0.08)" tickLabelProps={() => ({ fill: 'rgba(244,244,251,0.35)', fontSize: 8, textAnchor: 'end', dx: -2, dy: 3 })} />
        <AxisBottom top={yMax} scale={xScale} numTicks={5} stroke="rgba(255,255,255,0.08)" tickStroke="rgba(255,255,255,0.08)" tickLabelProps={() => ({ fill: 'rgba(244,244,251,0.35)', fontSize: 8, textAnchor: 'middle', dy: 2 })} />
        <LinePath
          data={data}
          x={(d) => xScale(d.h)}
          y={(d) => yScale(d.t)}
          stroke="#F9D423"
          strokeWidth={2}
          curve={curveMonotoneX}
        />
      </Group>
    </svg>
  );
};

/**
 * Temperature-vs-altitude profile.
 *
 * Sized by its container rather than the old hard-coded 240px, so it fits both
 * a 375px phone sheet and a 22rem desktop rail. `@visx/responsive` was already
 * a dependency.
 */
export const AtmosphereChart: React.FC<{ body: CelestialBody }> = ({ body }) => (
  <div className="bg-black/30 rounded-xl p-3 border border-white/5">
    <div className="flex justify-between text-[10px] text-pulsar-white/50 uppercase font-bold mb-2">
      <span>Atmospheric Profile</span>
      <span className="text-nova-gold">Temp vs Altitude</span>
    </div>
    <div className="w-full" style={{ height: HEIGHT }}>
      <ParentSize debounceTime={80}>
        {({ width }) => (width > 0 ? <Chart body={body} width={width} /> : null)}
      </ParentSize>
    </div>
  </div>
);
