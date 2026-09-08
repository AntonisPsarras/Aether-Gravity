import React from 'react';

/** Read-only ring gauge (ESI / RSI). */
export const Gauge = ({
  value, label, color = 'text-nova-gold', subLabel,
}: {
  value: number;
  label: string;
  color?: string;
  subLabel?: string;
}) => {
  const percentage = Math.max(0, Math.min(100, Math.round(value * 100)));
  const strokeDash = 251; // 2 * pi * r (r=40)
  const offset = strokeDash - (percentage / 100) * strokeDash;

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-20 h-20 md:w-24 md:h-24 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          <circle cx="50%" cy="50%" r="40%" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-800" />
          <circle cx="50%" cy="50%" r="40%" stroke="currentColor" strokeWidth="8" fill="transparent" className={`${color} transition-all duration-1000 ease-out`} strokeDasharray={strokeDash} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className={`text-lg md:text-2xl font-bold font-mono ${color}`}>{percentage}%</span>
        </div>
      </div>
      <span className="text-[10px] md:text-xs font-bold uppercase mt-2 text-pulsar-white/60">{label}</span>
      {subLabel && <span className="text-[9px] text-pulsar-white/30 uppercase">{subLabel}</span>}
    </div>
  );
};
