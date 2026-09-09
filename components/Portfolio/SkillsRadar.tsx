import React from 'react';
import { Group } from '@visx/group';
import { scaleLinear } from '@visx/scale';
import { LinePath } from '@visx/shape';

const skillData = [
    { subject: 'TypeScript', value: 95 },
    { subject: 'Physics', value: 90 },
    { subject: 'React', value: 85 },
    { subject: 'AI Workflow', value: 98 },
    { subject: 'Advanced Math', value: 80 },
];

const SkillsRadar: React.FC<{ width: number; height: number }> = ({ width, height }) => {
    const radius = Math.max(0, Math.min(width, height) / 2 - 40);
    const centerX = width / 2;
    const centerY = height / 2;

    if (width === 0 || height === 0) return null;

    const scale = scaleLinear({
        range: [0, radius],
        domain: [0, 100],
    });

    const points = skillData.map((d, i) => {
        const angle = (Math.PI * 2 * i) / skillData.length - Math.PI / 2;
        return {
            x: centerX + scale(d.value) * Math.cos(angle),
            y: centerY + scale(d.value) * Math.sin(angle),
        };
    });

    return (
        <svg width={width} height={height}>
            <Group>
                {[20, 40, 60, 80, 100].map((r) => (
                    <circle
                        key={`mesh-${r}`}
                        cx={centerX}
                        cy={centerY}
                        r={scale(r)}
                        fill="none"
                        stroke="rgba(255, 255, 255, 0.1)"
                        strokeWidth={1}
                    />
                ))}
                {skillData.map((d, i) => {
                    const angle = (Math.PI * 2 * i) / skillData.length - Math.PI / 2;
                    return (
                        <line
                            key={`axis-${i}`}
                            x1={centerX}
                            y1={centerY}
                            x2={centerX + radius * Math.cos(angle)}
                            y2={centerY + radius * Math.sin(angle)}
                            stroke="rgba(255, 255, 255, 0.1)"
                            strokeWidth={1}
                        />
                    );
                })}
                <LinePath
                    data={[...points, points[0]]}
                    x={(d) => d.x}
                    y={(d) => d.y}
                    stroke="#F9D423"
                    strokeWidth={2}
                    fill="rgba(249, 212, 35, 0.16)"
                />
                {skillData.map((d, i) => {
                    const angle = (Math.PI * 2 * i) / skillData.length - Math.PI / 2;
                    return (
                        <text
                            key={`label-${i}`}
                            x={centerX + (radius + 15) * Math.cos(angle)}
                            y={centerY + (radius + 15) * Math.sin(angle)}
                            fill="rgba(220, 229, 243, 0.55)"
                            fontSize={10}
                            fontWeight="bold"
                            textAnchor="middle"
                            alignmentBaseline="middle"
                        >
                            {d.subject}
                        </text>
                    );
                })}
            </Group>
        </svg>
    );
};

export default SkillsRadar;
