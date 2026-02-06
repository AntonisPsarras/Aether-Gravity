import React from 'react';
import { Group } from '@visx/group';
import { curveCardinal } from '@visx/curve';
import { LinePath } from '@visx/shape';
import { scaleLinear } from '@visx/scale';
import { AxisLeft, AxisBottom } from '@visx/axis';
import { ComplexityMetric } from '../../utils/PhysicsInterfaces';

const data: ComplexityMetric[] = Array.from({ length: 10 }, (_, i) => {
    const n = (i + 1) * 10;
    return {
        nodeCount: n,
        oNSquaredValue: n * n,
        oNLogNValue: n * Math.log2(n) * 4 // Scaled for comparison
    };
});

const ComplexityChart: React.FC<{ width: number; height: number }> = ({ width, height }) => {
    const margin = { top: 20, right: 30, bottom: 50, left: 60 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const xScale = scaleLinear<number>({
        range: [0, innerWidth],
        domain: [10, 100],
    });

    const yScale = scaleLinear<number>({
        range: [innerHeight, 0],
        domain: [0, 10000],
        nice: true,
    });

    return (
        <svg width={width} height={height}>
            <Group left={margin.left} top={margin.top}>
                <AxisLeft scale={yScale} label="Computational Cost" stroke="#94a3b8" tickStroke="#94a3b8" labelProps={{ fill: '#64748b', fontSize: 10, textAnchor: 'middle' }} tickLabelProps={{ fill: '#64748b', fontSize: 10 }} />
                <AxisBottom scale={xScale} top={innerHeight} label="Number of Bodies (N)" stroke="#94a3b8" tickStroke="#94a3b8" labelProps={{ fill: '#64748b', fontSize: 10, textAnchor: 'middle' }} tickLabelProps={{ fill: '#64748b', fontSize: 10 }} />

                {/* O(N^2) Path */}
                <LinePath<ComplexityMetric>
                    curve={curveCardinal}
                    data={data}
                    x={(d) => xScale(d.nodeCount)}
                    y={(d) => yScale(d.oNSquaredValue)}
                    stroke="#ef4444"
                    strokeWidth={2}
                    strokeDasharray="4,2"
                />

                {/* O(N log N) Path */}
                <LinePath<ComplexityMetric>
                    curve={curveCardinal}
                    data={data}
                    x={(d) => xScale(d.nodeCount)}
                    y={(d) => yScale(d.oNLogNValue)}
                    stroke="#10b981"
                    strokeWidth={3}
                />

                <text x={innerWidth - 80} y={20} fill="#ef4444" fontSize={10} fontWeight="bold">O(N²)</text>
                <text x={innerWidth - 80} y={innerHeight - 40} fill="#10b981" fontSize={10} fontWeight="bold">O(N log N)</text>
            </Group>
        </svg>
    );
};

export default ComplexityChart;
