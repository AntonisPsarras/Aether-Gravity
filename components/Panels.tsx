import React, { useState, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CelestialBody, BodyType } from '../types';
import { useStore } from '../utils/store';
import {
  Play, Pause, RotateCcw, Trash2, Thermometer,
  Focus, Hexagon, Sun, Globe, CircleDot, MousePointer2, Sparkles,
  Aperture, AlertTriangle, X, Flame, Snowflake, Zap, ChevronUp, ChevronDown, Settings, Home, Sliders, Layers, Scale, Weight, Wind, Orbit, Disc, Microscope, Timer, Lock, Activity, List
} from 'lucide-react';
import { calculateESI, calculateRSI, kelvinToRgb, rgbToHex, getSpectralType, calculatePlanetaryPhysics, calculateTidalLockTime, findDominantParent } from '../utils/physicsUtils';
import { TEXTURE_TYPES } from '../constants';
import { Group } from '@visx/group';
import { LinePath } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { scaleLinear } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { LinearGradient } from '@visx/gradient';

const NumberInput = ({ value, onChange, className, onCommit }: { value: number, onChange: (val: number) => void, className?: string, onCommit?: () => void }) => {
  return (
    <input
      type="number"
      value={Math.round(value * 100) / 100}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      onBlur={onCommit}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && onCommit) onCommit(); }}
      className={className}
    />
  );
};

const RangeInput = ({ label, value, min, max, step, onChange }: { label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void }) => (
  <div className="mb-2">
    <div className="flex justify-between text-[10px] text-slate-400 uppercase font-mono mb-1">
      <span>{label}</span>
      <span>{value.toFixed(2)}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
  </div>
);

const CircularDial = ({ label, value, onChange, min = 0, max = 360 }: { label: string, value: number, onChange: (v: number) => void, min?: number, max?: number }) => {
  return (
    <div className="flex flex-col items-center justify-center p-2 bg-black/20 rounded-lg border border-white/5 w-full">
      <div className="relative w-12 h-12 mb-2 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-slate-700"></div>
        <div
          className="absolute w-full h-0.5 bg-cyan-500 origin-center"
          style={{ transform: `rotate(${value - 90}deg)`, width: '50%', left: '50%', transformOrigin: '0% 50%' }}
        ></div>
        <div className="w-1.5 h-1.5 bg-white rounded-full z-10"></div>
      </div>
      <span className="text-[9px] text-slate-400 uppercase font-mono text-center mb-1 h-3 overflow-hidden">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-slate-700 rounded-full appearance-none cursor-pointer accent-cyan-500"
      />
      <span className="text-[10px] font-bold text-white mt-1">{Math.round(value)}°</span>
    </div>
  );
};

const Gauge = ({ value, label, color = "text-cyan-400", subLabel }: { value: number, label: string, color?: string, subLabel?: string }) => {
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
      <span className="text-[10px] md:text-xs font-bold uppercase mt-2 text-slate-300">{label}</span>
      {subLabel && <span className="text-[9px] text-slate-500 uppercase">{subLabel}</span>}
    </div>
  );
};

const CompositionSlider = ({ label, value, color, onChange }: { label: string, value: number, color: string, onChange: (v: number) => void }) => (
  <div className="mb-2">
    <div className="flex justify-between text-[10px] text-slate-400 uppercase font-mono mb-1">
      <span className="flex items-center gap-1"><div className={`w-2 h-2 rounded-full ${color}`}></div>{label}</span>
      <span>{(value * 100).toFixed(0)}%</span>
    </div>
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
      style={{ accentColor: color.replace('bg-', 'text-').replace('500', '400') }}
    />
  </div>
);

// --- VISX CHARTS ---

const AtmosphereChart = ({ body }: { body: CelestialBody }) => {
  const width = 240;
  const height = 120;
  const margin = { top: 10, right: 10, bottom: 20, left: 30 };
  const xMax = width - margin.left - margin.right;
  const yMax = height - margin.top - margin.bottom;

  const data = useMemo(() => {
    const points = [];
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
    <div className="bg-black/30 rounded-xl p-3 border border-white/5">
      <div className="flex justify-between text-[10px] text-slate-400 uppercase font-bold mb-2">
        <span>Atmospheric Profile</span>
        <span className="text-cyan-400">Temp vs Altitude</span>
      </div>
      <svg width={width} height={height}>
        <LinearGradient id="area-gradient" from="#22d3ee" to="#22d3ee" toOpacity={0} />
        <Group top={margin.top} left={margin.left}>
          <AxisLeft scale={yScale} numTicks={4} stroke="#334155" tickStroke="#334155" tickLabelProps={() => ({ fill: '#64748b', fontSize: 8, textAnchor: 'end', dx: -2, dy: 3 })} />
          <AxisBottom top={yMax} scale={xScale} numTicks={5} stroke="#334155" tickStroke="#334155" tickLabelProps={() => ({ fill: '#64748b', fontSize: 8, textAnchor: 'middle', dy: 2 })} />
          <LinePath
            data={data}
            x={d => xScale(d.h)}
            y={d => yScale(d.t)}
            stroke="#22d3ee"
            strokeWidth={2}
            curve={curveMonotoneX}
          />
        </Group>
      </svg>
    </div>
  );
};

// --- TOOLBAR ---

export const CreationToolbar: React.FC<{ mode: BodyType | null, setMode: (m: BodyType | null) => void, onTriggerGenerate: () => void, mobileHidden: boolean }> = ({ mode, setMode, onTriggerGenerate, mobileHidden }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const tools = [
    { id: 'Star', label: 'Star', icon: Sun, color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
    { id: 'Red Giant', label: 'Giant', icon: Flame, color: 'text-red-500', bg: 'bg-red-500/20' },
    { id: 'Neutron Star', label: 'Neutron', icon: Zap, color: 'text-cyan-300', bg: 'bg-cyan-400/20' },
    { id: 'Black Hole', label: 'Hole', icon: Aperture, color: 'text-orange-500', bg: 'bg-orange-500/20' },
    { id: 'Planet', label: 'Planet', icon: Globe, color: 'text-blue-400', bg: 'bg-blue-500/20' },
    { id: 'Ice Giant', label: 'Ice', icon: Snowflake, color: 'text-indigo-300', bg: 'bg-indigo-500/20' },
    { id: 'Dwarf', label: 'Dwarf', icon: CircleDot, color: 'text-gray-400', bg: 'bg-gray-500/20' },
  ];

  return (
    <>
      <div className={`fixed z-20 transition-all duration-300 ease-in-out pointer-events-none top-20 left-1/2 -translate-x-1/2 w-64 md:top-auto md:bottom-6 md:left-[220px] md:translate-x-0 ${mode ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'}`}>
        <div className="bg-slate-900/90 backdrop-blur-md border border-white/10 text-slate-200 p-4 rounded-xl shadow-2xl pointer-events-auto ring-1 ring-white/5">
          <div className="font-bold text-sm text-cyan-400 mb-3 uppercase tracking-wider flex items-center gap-2 border-b border-white/10 pb-2">
            {mode} Selected
          </div>
          <div className="text-xs space-y-2 font-mono">
            <div className="flex items-center gap-3 text-slate-300"><div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center text-white"><MousePointer2 size={14} /></div><span>Drag to Launch</span></div>
            <button onClick={() => setMode(null)} className="flex items-center gap-3 text-slate-500 pt-1 hover:text-red-400 transition-colors w-full text-left group active:scale-95">
              <div className="w-6 h-6 rounded bg-white/5 group-hover:bg-red-500/20 group-hover:text-red-400 flex items-center justify-center transition-colors border border-transparent group-hover:border-red-500/30"><X size={14} /></div>
              <span>Cancel (Tap or ESC)</span>
            </button>
          </div>
        </div>
      </div>

      <div className={`fixed z-20 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] bottom-0 left-0 w-full p-2 pb-4 flex flex-col justify-end ${mobileHidden ? 'translate-y-[120%]' : 'translate-y-0'} md:absolute md:bottom-6 md:left-6 md:w-auto md:p-0 md:translate-y-0 md:items-start`}>
        {!isExpanded && (
          <button onClick={() => setIsExpanded(true)} className="md:hidden p-3 rounded-xl bg-slate-900/90 backdrop-blur-md border border-white/10 text-cyan-400 shadow-2xl active:scale-90 transition-all shrink-0 h-12 w-12 flex items-center justify-center ring-1 ring-white/5">
            <ChevronUp size={24} />
          </button>
        )}
        {isExpanded && (
          <div className="bg-slate-900/90 backdrop-blur-xl md:backdrop-blur-md border border-white/10 rounded-2xl md:rounded-xl shadow-2xl flex flex-row md:grid md:grid-cols-1 gap-1.5 p-1.5 md:p-2 overflow-x-auto md:overflow-visible scrollbar-hide max-w-full ring-1 ring-white/5 animate-in slide-in-from-bottom-2 fade-in duration-300">
            <div className="flex flex-row md:flex-col gap-1.5 items-center">
              <button onClick={() => setIsExpanded(false)} className="p-3 rounded-xl bg-white/5 text-slate-400 hover:text-white active:scale-90 transition-transform md:hidden shrink-0 h-10 w-10 flex items-center justify-center"><ChevronDown size={20} /></button>
              <button onClick={() => setMode(null)} className={`p-2.5 rounded-xl md:rounded-lg transition-all flex flex-col md:flex-row items-center md:gap-3 justify-center min-w-[50px] md:min-w-[140px] md:w-full md:justify-start md:px-3 active:scale-95 ${mode === null ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20 font-bold' : 'bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:text-red-300'}`}>
                {mode === null ? <MousePointer2 size={18} /> : <X size={18} />}
                <span className="text-[9px] md:text-xs font-bold uppercase mt-1 md:mt-0">{mode === null ? 'Select' : 'Cancel'}</span>
              </button>
            </div>
            <div className="w-px h-8 md:h-px md:w-full bg-white/10 my-auto md:my-1 shrink-0"></div>
            <div className="flex flex-row md:flex-col gap-1 transition-all">
              {tools.map((t) => (
                <button key={t.id} onClick={() => setMode(t.id as BodyType)} className={`p-2.5 rounded-xl md:rounded-lg transition-all flex flex-col md:flex-row items-center md:gap-3 justify-center min-w-[50px] md:min-w-[140px] md:justify-start md:px-3 relative group shrink-0 active:scale-95 ${mode === t.id ? t.bg + ' ' + t.color + ' ring-1 ring-inset ring-white/20' : 'bg-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}>
                  <t.icon size={18} />
                  <span className="text-[9px] md:text-xs font-bold uppercase mt-1 md:mt-0">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="w-px h-8 md:h-px md:w-full bg-white/10 my-auto md:my-1 shrink-0"></div>
            <button onClick={onTriggerGenerate} className="p-2.5 rounded-xl md:rounded-lg transition-all flex flex-col md:flex-row items-center md:gap-3 justify-center min-w-[50px] md:min-w-[140px] md:justify-start md:px-3 bg-gradient-to-br from-indigo-500 to-purple-600 text-white hover:from-indigo-400 hover:to-purple-500 shrink-0 shadow-lg shadow-purple-500/20 active:scale-95">
              <Sparkles size={18} />
              <span className="text-[9px] md:text-xs font-bold uppercase mt-1 md:mt-0">Gen</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
};

// --- INSPECTOR PANEL ---

export const InspectorPanel: React.FC = () => {
  const { selectedId, updateBody, removeBody, selectBody, bodies } = useStore();
  const selectedBody = useStore(state => state.bodies.find(b => b.id === state.selectedId));

  const [activeTab, setActiveTab] = useState<'props' | 'orbit' | 'analysis'>('props');
  const [esi, setEsi] = useState(0);
  const [rsi, setRsi] = useState(0);
  const [timeToLock, setTimeToLock] = useState<string>('∞');
  const [elements, setElements] = useState({ a: 0, e: 0, i: 0, Omega: 0, omega: 0, nu: 0 });

  const props = selectedBody?.properties || {};
  const [compIron, setCompIron] = useState(props.compositionIron ?? 0.3);
  const [compSil, setCompSil] = useState(props.compositionSilicates ?? 0.6);
  const [compWater, setCompWater] = useState(props.compositionWater ?? 0.1);

  useEffect(() => {
    if (selectedBody) {
      setCompIron(selectedBody.properties?.compositionIron ?? 0.3);
      setCompSil(selectedBody.properties?.compositionSilicates ?? 0.6);
      setCompWater(selectedBody.properties?.compositionWater ?? 0.1);
      setEsi(calculateESI(selectedBody));
      setRsi(calculateRSI(selectedBody));

      const parent = findDominantParent(selectedBody, bodies);
      const years = calculateTidalLockTime(selectedBody, parent);
      if (years === Infinity) setTimeToLock('Never');
      else if (years > 1000000000) setTimeToLock('> 1B yrs');
      else if (years < 1) setTimeToLock('Locked');
      else setTimeToLock(`${Math.round(years).toLocaleString()} yrs`);
    }
  }, [selectedBody, bodies]);

  const setProp = (key: string, value: any) => {
    if (selectedBody) updateBody(selectedBody.id, { properties: { ...props, [key]: value } });
  };

  const handleTemperatureChange = (temp: number) => {
    const { r, g, b } = kelvinToRgb(temp);
    const hex = rgbToHex(r, g, b);
    if (selectedBody) updateBody(selectedBody.id, { temperature: temp, color: hex });
  };

  const handleCompositionChange = (type: 'iron' | 'silicates' | 'water', newValue: number) => {
    let iron = type === 'iron' ? newValue : compIron;
    let sil = type === 'silicates' ? newValue : compSil;
    let water = type === 'water' ? newValue : compWater;

    if (type === 'iron') iron = Math.min(Math.max(iron, 0), 1);
    if (type === 'silicates') sil = Math.min(Math.max(sil, 0), 1);
    if (type === 'water') water = Math.min(Math.max(water, 0), 1);

    const remainder = 1.0 - (type === 'iron' ? iron : (type === 'silicates' ? sil : water));
    const other1 = type === 'iron' ? sil : (type === 'silicates' ? iron : iron);
    const other2 = type === 'iron' ? water : (type === 'silicates' ? water : sil);
    const sumOthers = other1 + other2;

    let newOther1 = 0;
    let newOther2 = 0;

    if (sumOthers <= 0.0001) {
      newOther1 = remainder / 2;
      newOther2 = remainder / 2;
    } else {
      newOther1 = (other1 / sumOthers) * remainder;
      newOther2 = (other2 / sumOthers) * remainder;
    }

    if (type === 'iron') { sil = newOther1; water = newOther2; }
    else if (type === 'silicates') { iron = newOther1; water = newOther2; }
    else { iron = newOther1; sil = newOther2; }

    setCompIron(iron);
    setCompSil(sil);
    setCompWater(water);

    if (selectedBody) {
      const physics = calculatePlanetaryPhysics(selectedBody.mass, iron, sil, water);
      updateBody(selectedBody.id, {
        radius: physics.radius,
        properties: {
          ...props,
          compositionIron: iron,
          compositionSilicates: sil,
          compositionWater: water,
          bulkDensity: physics.bulkDensity,
          surfaceGravity: physics.surfaceGravity,
          escapeVelocity: physics.escapeVelocity
        }
      });
    }
  };

  if (!selectedBody) return null;

  return (
    <div className="fixed md:absolute z-30 bottom-0 left-0 w-full rounded-t-2xl border-t border-white/10 md:top-4 md:right-4 md:bottom-auto md:left-auto md:w-80 md:rounded-xl md:border bg-slate-900/90 backdrop-blur-xl md:backdrop-blur-md text-slate-100 shadow-2xl max-h-[85vh] overflow-y-auto scrollbar-custom animate-in slide-in-from-bottom-10 md:slide-in-from-right-10 fade-in duration-500 flex flex-col ring-1 ring-white/5">
      <div className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur-md p-5 pb-0 border-b border-white/10">
        <div className="w-12 h-1.5 bg-slate-700/50 rounded-full mx-auto mb-4 md:hidden"></div>
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg md:text-xl font-bold font-mono text-white tracking-tight flex items-center gap-2">{selectedBody.name}</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-slate-300 uppercase tracking-wider font-bold">{selectedBody.type}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => removeBody(selectedBody.id)} className="text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 p-2 rounded-lg transition-colors active:scale-95"><Trash2 size={18} /></button>
            <button onClick={() => selectBody(null)} className="text-white hover:text-cyan-400 bg-white/5 hover:bg-white/10 p-2 rounded-lg transition-colors active:scale-95"><X size={18} /></button>
          </div>
        </div>

        <div className="flex gap-1 bg-black/20 p-1 rounded-lg mb-4">
          <button onClick={() => setActiveTab('props')} className={`flex-1 py-1.5 rounded-md text-[10px] uppercase font-bold tracking-wider transition-all ${activeTab === 'props' ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>Properties</button>
          <button onClick={() => setActiveTab('orbit')} className={`flex-1 py-1.5 rounded-md text-[10px] uppercase font-bold tracking-wider transition-all ${activeTab === 'orbit' ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>Orbit</button>
          {['Planet', 'Dwarf', 'Ice Giant'].includes(selectedBody.type) && (
            <button onClick={() => setActiveTab('analysis')} className={`flex-1 py-1.5 rounded-md text-[10px] uppercase font-bold tracking-wider transition-all ${activeTab === 'analysis' ? 'bg-cyan-500/20 text-cyan-400 shadow-sm' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>Analysis</button>
          )}
        </div>
      </div>

      <div className="p-5 space-y-6">
        {/* PROPERTIES TAB */}
        {activeTab === 'props' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h3 className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2 mb-3 tracking-widest"><Settings size={12} /> Physical</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1.5 uppercase">Mass</label>
                    <NumberInput value={selectedBody.mass} onChange={(v) => updateBody(selectedBody.id, { mass: v })} className="w-full bg-black/40 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono" />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1.5 uppercase">Radius</label>
                    <div className="w-full bg-black/40 border border-slate-700 rounded px-3 py-2 text-sm text-slate-400 font-mono cursor-not-allowed" title="Radius is determined by Mass and Composition">
                      {selectedBody.radius.toFixed(2)}
                    </div>
                  </div>
                </div>
                {selectedBody.type === 'Star' && (
                  <div className="bg-black/30 rounded-lg p-3 border border-white/5">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] text-slate-400 uppercase font-bold flex items-center gap-1"><Thermometer size={10} /> Surface Temp</label>
                      <span className="text-xs font-mono font-bold text-cyan-400">{selectedBody.temperature.toFixed(0)} K</span>
                    </div>
                    <input
                      type="range"
                      min="1000"
                      max="40000"
                      step="100"
                      value={selectedBody.temperature}
                      onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
                      className="w-full h-2 rounded-lg appearance-none cursor-pointer mb-2"
                      style={{ background: 'linear-gradient(to right, #ff3300, #ffaa33, #ffffff, #99ccff, #3366ff)' }}
                    />
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">Spectral Class</span>
                      <span className={`text-base font-bold font-mono px-2 rounded ${selectedBody.temperature > 10000 ? 'text-blue-200 bg-blue-900/30' : selectedBody.temperature > 6000 ? 'text-white bg-white/10' : 'text-orange-200 bg-orange-900/30'}`}>
                        {getSpectralType(selectedBody.temperature)}
                      </span>
                    </div>
                  </div>
                )}

                {selectedBody.type !== 'Planet' && (
                  <div>
                    <label className="text-[10px] text-slate-400 block mb-1.5 uppercase">Surface Material</label>
                    <select value={selectedBody.texture} onChange={(e) => updateBody(selectedBody.id, { texture: e.target.value })} className="w-full bg-black/40 border border-slate-700 rounded px-3 py-2 text-sm text-white font-mono">
                      {TEXTURE_TYPES.map(t => <option key={t.value} value={t.value} className="bg-slate-900">{t.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {selectedBody.type === 'Planet' && (
              <div>
                <h3 className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2 mb-3 tracking-widest"><Layers size={12} /> Composition</h3>
                <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-4">
                  <div>
                    <CompositionSlider label="Iron (Core)" value={compIron} color="bg-orange-600" onChange={(v) => handleCompositionChange('iron', v)} />
                    <CompositionSlider label="Silicates (Mantle)" value={compSil} color="bg-stone-500" onChange={(v) => handleCompositionChange('silicates', v)} />
                    <CompositionSlider label="Water (Ice/Ocean)" value={compWater} color="bg-blue-500" onChange={(v) => handleCompositionChange('water', v)} />
                  </div>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2 mb-3 tracking-widest"><Sliders size={12} /> Properties</h3>
              <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                {selectedBody.type === 'Star' && (
                  <>
                    <RangeInput label="Metallicity (Z)" min={0} max={1} step={0.01} value={props.metallicity ?? 0.2} onChange={(v) => setProp('metallicity', v)} />
                    <RangeInput label="Rotation (Oblateness)" min={0} max={0.5} step={0.01} value={props.oblateness ?? 0} onChange={(v) => setProp('oblateness', v)} />
                    <RangeInput label="Convection Scale" min={1} max={10} step={0.1} value={props.convectionScale ?? 5} onChange={(v) => setProp('convectionScale', v)} />
                  </>
                )}
                {selectedBody.type === 'Red Giant' && (
                  <>
                    <RangeInput label="Mass Loss Rate" min={0} max={1} step={0.01} value={props.massLoss ?? 0.1} onChange={(v) => setProp('massLoss', v)} />
                    <RangeInput label="Pulsation Freq" min={0} max={5} step={0.1} value={props.pulsationSpeed ?? 0.5} onChange={(v) => setProp('pulsationSpeed', v)} />
                    <div className="flex items-center gap-2 mt-2">
                      <label className="text-[10px] text-slate-400 uppercase font-mono flex-1">Luminosity Class</label>
                      <button onClick={() => setProp('luminosityClass', (props.luminosityClass || 0) === 0 ? 1 : 0)} className="text-[10px] px-2 py-1 bg-white/10 rounded">
                        {props.luminosityClass === 1 ? 'Supergiant' : 'Giant'}
                      </button>
                    </div>
                  </>
                )}
                {selectedBody.type === 'Planet' && (
                  <>
                    <RangeInput label="Tectonic Activity" min={0} max={1} step={0.01} value={props.tectonics ?? 0} onChange={(v) => setProp('tectonics', v)} />
                    <RangeInput label="Atmosphere Density" min={0} max={1} step={0.01} value={props.atmosphere ?? 0.2} onChange={(v) => setProp('atmosphere', v)} />
                    <RangeInput label="Water Level" min={0} max={1} step={0.01} value={props.waterLevel ?? 0.5} onChange={(v) => setProp('waterLevel', v)} />

                    <div className="pt-2 mt-2 border-t border-white/5">
                      <RangeInput label="Atmosphere Height" min={0.01} max={1.0} step={0.01} value={props.scaleHeight ?? 0.2} onChange={(v) => setProp('scaleHeight', v)} />
                      <RangeInput label="Haze Concentration" min={0} max={1} step={0.01} value={props.haze ?? 0.0} onChange={(v) => setProp('haze', v)} />
                    </div>
                  </>
                )}
                {selectedBody.type === 'Ice Giant' && (
                  <>
                    <RangeInput label="Methane Conc." min={0} max={1} step={0.01} value={props.methane ?? 0.3} onChange={(v) => setProp('methane', v)} />
                    <RangeInput label="Cloud Depth" min={0} max={1} step={0.01} value={props.cloudDepth ?? 0.2} onChange={(v) => setProp('cloudDepth', v)} />
                    <RangeInput label="Axial Tilt" min={0} max={180} step={1} value={props.axialTilt ?? 0} onChange={(v) => setProp('axialTilt', v)} />
                  </>
                )}
                {selectedBody.type === 'Dwarf' && (
                  <>
                    <RangeInput label="Flare Frequency" min={0} max={1} step={0.01} value={props.flareActivity ?? 0.1} onChange={(v) => setProp('flareActivity', v)} />
                    <RangeInput label="Magnetic Index" min={0} max={1} step={0.01} value={props.magneticIndex ?? 0.1} onChange={(v) => setProp('magneticIndex', v)} />
                  </>
                )}
                {selectedBody.type === 'Black Hole' && (
                  <>
                    <RangeInput label="Spin Parameter (a*)" min={0} max={1.0} step={0.01} value={props.spinParameter ?? 0.0} onChange={(v) => setProp('spinParameter', v)} />
                    <RangeInput label="Accretion Rate" min={0} max={1.0} step={0.01} value={props.accretionRate ?? 0.5} onChange={(v) => setProp('accretionRate', v)} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ORBIT TAB */}
        {activeTab === 'orbit' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2 mb-3 tracking-widest"><Orbit size={12} /> Keplerian Elements</h3>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <RangeInput label="Semi-major Axis (a)" min={10} max={500} step={1} value={elements.a || 50} onChange={(v) => setElements({ ...elements, a: v })} />
                  <RangeInput label="Eccentricity (e)" min={0} max={0.95} step={0.01} value={elements.e || 0} onChange={(v) => setElements({ ...elements, e: v })} />
                  <RangeInput label="Mean Anomaly (ν)" min={0} max={360} step={1} value={elements.nu || 0} onChange={(v) => setElements({ ...elements, nu: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CircularDial label="Inclination (i)" value={elements.i || 0} onChange={(v) => setElements({ ...elements, i: v })} max={180} />
                  <CircularDial label="Asc Node (Ω)" value={elements.Omega || 0} onChange={(v) => setElements({ ...elements, Omega: v })} />
                  <div className="col-span-2 flex justify-center">
                    <div className="w-1/2">
                      <CircularDial label="Arg Periapsis (ω)" value={elements.omega || 0} onChange={(v) => setElements({ ...elements, omega: v })} />
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-[10px] text-slate-500 italic text-center">
                Simulating N-Body dynamics override.
              </div>
            </div>
          </div>
        )}

        {/* ANALYSIS TAB */}
        {activeTab === 'analysis' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h3 className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2 mb-3 tracking-widest"><Microscope size={12} /> Habitability Analytics</h3>
              <div className="bg-black/20 rounded-xl p-4 border border-white/5 space-y-6">
                <div className="flex justify-around">
                  <Gauge value={esi} label="Earth Similarity" subLabel="ESI" color={esi > 0.8 ? 'text-emerald-400' : esi > 0.5 ? 'text-yellow-400' : 'text-orange-400'} />
                  <Gauge value={rsi} label="Rock Similarity" subLabel="RSI (Extreme)" color={rsi > 0.7 ? 'text-rose-400' : rsi > 0.4 ? 'text-orange-300' : 'text-slate-600'} />
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">Assessment</span>
                  <span className={`text-sm font-bold ${esi > 0.8 ? 'text-emerald-300' : esi > 0.6 ? 'text-cyan-300' : 'text-slate-300'}`}>
                    {esi > 0.8 ? 'Potential Garden World' : esi > 0.6 ? 'Marginally Habitable' : rsi > 0.6 ? 'Extremophile Candidate' : 'Dead World'}
                  </span>
                </div>
              </div>
            </div>

            {/* Atmospheric Profile Chart (Visx) */}
            {['Planet', 'Ice Giant'].includes(selectedBody.type) && (
              <div>
                <h3 className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2 mb-3 tracking-widest"><Wind size={12} /> Atmosphere</h3>
                <AtmosphereChart body={selectedBody} />
              </div>
            )}

            {/* Tidal Locking Section */}
            {['Planet', 'Dwarf', 'Ice Giant'].includes(selectedBody.type) && (
              <div>
                <h3 className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2 mb-3 tracking-widest"><Timer size={12} /> Tidal Evolution</h3>
                <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-4">
                  <div className="flex justify-between items-center p-2 bg-white/5 rounded-lg">
                    <div>
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Time to Tidal Lock</div>
                      <div className="text-sm font-bold font-mono text-cyan-300">{timeToLock}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Rotation Period</div>
                      <div className="text-sm font-bold font-mono text-white">{(props.rotationPeriod || 24).toFixed(1)} hrs</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <label className="text-[10px] text-slate-400 uppercase font-bold">Synchronous Rotation</label>
                    <button
                      onClick={() => setProp('isTidallyLocked', !props.isTidallyLocked)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${props.isTidallyLocked
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                        : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'}`}
                    >
                      <Lock size={12} />
                      {props.isTidallyLocked ? 'LOCKED' : 'FORCE LOCK'}
                    </button>
                  </div>
                  {!props.isTidallyLocked && (
                    <RangeInput label="Rotation Speed" min={1} max={100} step={1} value={props.rotationPeriod ?? 24} onChange={(v) => setProp('rotationPeriod', v)} />
                  )}
                </div>
              </div>
            )}

            {selectedBody.type === 'Planet' && (
              <div>
                <h3 className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-2 mb-3 tracking-widest"><Weight size={12} /> Geophysics</h3>
                <div className="bg-black/20 rounded-xl p-3 border border-white/5 grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase mb-1">Density</div>
                    <div className="text-xs font-mono font-bold text-white">{(props.bulkDensity || 5.5).toFixed(2)}</div>
                    <div className="text-[9px] text-slate-600">g/cm³</div>
                  </div>
                  <div className="text-center border-l border-white/5">
                    <div className="text-[9px] text-slate-500 uppercase mb-1">Gravity</div>
                    <div className="text-xs font-mono font-bold text-white">{(props.surfaceGravity || 9.8).toFixed(2)}</div>
                    <div className="text-[9px] text-slate-600">m/s²</div>
                  </div>
                  <div className="text-center border-l border-white/5">
                    <div className="text-[9px] text-slate-500 uppercase mb-1">Esc. Vel</div>
                    <div className="text-xs font-mono font-bold text-white">{(props.escapeVelocity || 11.2).toFixed(1)}</div>
                    <div className="text-[9px] text-slate-600">km/s</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const ControlBar: React.FC<{ onReturnToMenu: () => void, onUndo: () => void, onRedo: () => void, canUndo: boolean, canRedo: boolean }> = ({ onReturnToMenu, onUndo, onRedo, canUndo, canRedo }) => {
  const { paused, speed, showGrid, showDust, showHabitable, showStability, cameraLockedId, selectedId, showOutliner } = useStore();
  const { setPaused, setSpeed, toggleGrid, toggleDust, toggleHabitable, toggleStability, toggleOutliner, setCameraLock } = useStore();

  return (
    <div className="fixed z-40 md:bottom-6 bottom-auto top-4 md:top-auto left-1/2 -translate-x-1/2 flex flex-col md:flex-row items-center gap-3 w-[95%] md:w-auto max-w-full">
      <div className="bg-slate-900/90 backdrop-blur-md border border-white/10 shadow-2xl rounded-full p-1.5 px-3 md:px-6 py-2 flex items-center justify-between md:justify-start gap-2 md:gap-6 ring-1 ring-white/5 w-full md:w-auto overflow-x-auto scrollbar-hide">

        {/* Undo/Redo & Playback Group */}
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <div className="flex items-center gap-0.5 md:gap-1">
            <button onClick={onUndo} disabled={!canUndo} className={`p-1.5 md:p-2 rounded-full transition-colors active:scale-90 ${canUndo ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-700 cursor-not-allowed'}`}><RotateCcw size={16} className="md:w-[18px] md:h-[18px]" /></button>
            <button onClick={onRedo} disabled={!canRedo} className={`p-1.5 md:p-2 rounded-full transition-colors rotate-180 active:scale-90 ${canRedo ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-700 cursor-not-allowed'}`}><RotateCcw size={16} className="md:w-[18px] md:h-[18px]" /></button>
          </div>
          <div className="h-4 md:h-6 w-px bg-white/10"></div>
          <div className="flex items-center gap-2 md:gap-3">
            <button onClick={() => setPaused(!paused)} className={`p-1.5 md:p-2 rounded-full transition-colors active:scale-90 ${paused ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-white/10 text-slate-200'}`}>
              {paused ? <Play size={18} className="md:w-[20px] md:h-[20px]" fill="currentColor" /> : <Pause size={18} className="md:w-[20px] md:h-[20px]" fill="currentColor" />}
            </button>
            <div className="flex items-center gap-1.5 md:gap-2">
              <input type="range" min="-2" max="4" step="0.1" value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))} className="w-12 md:w-20 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
              <span className="text-[9px] md:text-xs font-mono text-cyan-400 w-6 md:w-8 text-right shrink-0">{speed.toFixed(1)}x</span>
            </div>
          </div>
        </div>

        <div className="h-4 md:h-6 w-px bg-white/10 shrink-0"></div>

        {/* Toggles Group */}
        <div className="flex items-center gap-0.5 md:gap-2 shrink-0">
          <button onClick={toggleOutliner} className={`md:hidden p-1.5 rounded-full ${showOutliner ? 'text-cyan-400 bg-white/10' : 'text-slate-500'}`}><List size={16} /></button>
          <div className="h-3 w-px bg-white/10 md:hidden mx-0.5"></div>
          <button onClick={toggleGrid} className={`p-1.5 md:p-2 rounded-full ${showGrid ? 'text-cyan-400 bg-white/10' : 'text-slate-500'}`}><Hexagon size={16} className="md:w-[18px] md:h-[18px]" /></button>
          <button onClick={toggleDust} className={`p-1.5 md:p-2 rounded-full ${showDust ? 'text-blue-400 bg-white/10' : 'text-slate-500'}`}><Sparkles size={16} className="md:w-[18px] md:h-[18px]" /></button>
          <button onClick={toggleHabitable} className={`p-1.5 md:p-2 rounded-full ${showHabitable ? 'text-emerald-400 bg-white/10' : 'text-slate-500'}`}><Globe size={16} className="md:w-[18px] md:h-[18px]" /></button>
          <button onClick={() => setCameraLock(cameraLockedId ? null : selectedId)} className={`p-1.5 md:p-2 rounded-full ${cameraLockedId ? 'text-red-400 bg-white/10' : 'text-slate-500'}`}><Focus size={16} className="md:w-[18px] md:h-[18px]" /></button>
          {onReturnToMenu && (
            <>
              <div className="h-4 md:h-6 w-px bg-white/10 mx-1"></div>
              <button onClick={onReturnToMenu} className="p-1.5 md:p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors active:scale-90"><Home size={16} className="md:w-[18px] md:h-[18px]" /></button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export const ConfirmationModal = ({ isOpen, onConfirm, onCancel }: { isOpen: boolean, onConfirm: () => void, onCancel: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 ring-1 ring-white/5 animate-in zoom-in-95 duration-200">
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><AlertTriangle className="text-yellow-500" size={20} /> New System</h3>
        <p className="text-slate-400 text-sm mb-6">This will generate a new random star system. Current simulation state will be pushed to undo history.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={() => { onConfirm(); onCancel(); }} className="px-4 py-2 rounded-lg text-sm font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20 transition-all">Generate</button>
        </div>
      </div>
    </div>
  );
};