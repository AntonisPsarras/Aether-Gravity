import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CelestialBody, BodyType } from '../types';
import { useStore } from '../utils/store';
import {
  Play, Pause, RotateCcw, Trash2, Thermometer,
  Focus, Hexagon, Sun, Globe, CircleDot, MousePointer2, Sparkles,
  Aperture, AlertTriangle, X, Flame, Snowflake, Zap, ChevronUp, ChevronDown, Settings, Home, Sliders, Layers, Scale, Weight, Wind, Orbit, Disc, Microscope, Timer, Lock, Activity, HelpCircle
} from 'lucide-react';
import { calculateESI, calculateRSI, kelvinToRgb, rgbToHex, getSpectralType, calculateTidalLockTime, findDominantParent, getOrbitalElements, calculateOrbitalState, calculateStabilityMetrics, bodyLuminositySolar } from '../utils/physicsUtils';
import { TEXTURE_TYPES, BODY_CONFIGS } from '../constants';
import {
  fmtMass, fmtRadiusKm, fmtRadiusRelative, fmtTemp, fmtGravity, fmtEscVel, fmtDensity,
  fmtDistance, fmtLuminositySolar, fmtPeriod, massToEarth, radiusKmToEarth,
  orbitalPeriodYears, distToKm,
} from '../utils/units';
import {
  schwarzschildRadiusKm, kerrOuterHorizonKm, iscoRadiusKm, photonSphereRadiusKm,
  diskEfficiency, MAX_SPIN_PARAMETER,
} from '../utils/relativity';
import { Group } from '@visx/group';
import { LinePath } from '@visx/shape';
import { curveMonotoneX } from '@visx/curve';
import { scaleLinear } from '@visx/scale';
import { AxisBottom, AxisLeft } from '@visx/axis';
import { LinearGradient } from '@visx/gradient';
import { clampStarTemperature, PHYSICS_LIMITS } from '../utils/physicsBounds';

/** One read-only derived quantity in the Inspector. */
const DerivedRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between items-center">
    <span className="text-[10px] text-pulsar-white/40 uppercase tracking-wider">{label}</span>
    <span className="text-xs font-mono text-pulsar-white/80">{value}</span>
  </div>
);

const NumberInput = ({
  value, onChange, className, onCommit, onEditStart, onEditEnd, min, max,
}: {
  value: number;
  onChange: (val: number) => void;
  className?: string;
  onCommit?: () => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
  min?: number;
  max?: number;
}) => {
  const setInteractingWithUI = useStore((s) => s.setInteractingWithUI);
  const handleEditEnd = () => {
    onCommit?.();
    onEditEnd?.();
    setInteractingWithUI(false);
  };
  return (
    <input
      type="number"
      value={Math.round(value * 100) / 100}
      onPointerDown={() => setInteractingWithUI(true)}
      onPointerUp={() => setInteractingWithUI(false)}
      onPointerCancel={() => setInteractingWithUI(false)}
      onFocus={() => { setInteractingWithUI(true); onEditStart?.(); }}
      onChange={(e) => {
        const raw = parseFloat(e.target.value);
        if (!isFinite(raw)) return;
        const clamped = min !== undefined ? Math.max(min, max !== undefined ? Math.min(max, raw) : raw)
                      : max !== undefined ? Math.min(max, raw) : raw;
        onChange(clamped);
      }}
      onBlur={handleEditEnd}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') handleEditEnd();
      }}
      className={className}
    />
  );
};

const RangeInput = ({
  label, value, min, max, step, onChange, onEditStart, onEditEnd,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}) => {
  const setInteractingWithUI = useStore((s) => s.setInteractingWithUI);
  const handleDown = () => { setInteractingWithUI(true);  onEditStart?.(); };
  const handleUp   = () => { setInteractingWithUI(false); onEditEnd?.(); };
  return (
    <div className="mb-2">
      <div className="flex justify-between text-[10px] text-pulsar-white/50 uppercase font-mono mb-1">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          if (!Number.isFinite(raw)) return;
          onChange(raw);
        }}
        className="w-full rounded-lg appearance-none cursor-pointer accent-nova-gold"
      />
    </div>
  );
};

const CircularDial = ({
  label, value, onChange, min = 0, max = 360, onEditStart, onEditEnd,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}) => {
  const setInteractingWithUI = useStore((s) => s.setInteractingWithUI);
  const handleDown = () => { setInteractingWithUI(true); onEditStart?.(); };
  const handleUp = () => { setInteractingWithUI(false); onEditEnd?.(); };
  return (
    <div className="flex flex-col items-center justify-center p-2 bg-black/20 rounded-lg border border-white/5 w-full">
      <div className="relative w-12 h-12 mb-2 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-white/10"></div>
        <div
          className="absolute w-full h-0.5 bg-nova-gold origin-center"
          style={{ transform: `rotate(${value - 90}deg)`, width: '50%', left: '50%', transformOrigin: '0% 50%' }}
        ></div>
        <div className="w-1.5 h-1.5 bg-pulsar-white rounded-full z-10"></div>
      </div>
      <span className="text-[9px] text-pulsar-white/50 uppercase font-mono text-center mb-1 h-3 overflow-hidden">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step="1"
        value={value}
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          if (!Number.isFinite(raw)) return;
          onChange(raw);
        }}
        className="w-full rounded-lg appearance-none cursor-pointer accent-nova-gold"
      />
      <span className="text-[10px] font-bold text-pulsar-white mt-1">{Math.round(value)}°</span>
    </div>
  );
};

const Gauge = ({ value, label, color = "text-nova-gold", subLabel }: { value: number, label: string, color?: string, subLabel?: string }) => {
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

const CompositionSlider = ({
  label, value, color, onChange, onEditStart, onEditEnd,
}: {
  label: string;
  value: number;
  color: string;
  onChange: (v: number) => void;
  onEditStart?: () => void;
  onEditEnd?: () => void;
}) => {
  const setInteractingWithUI = useStore((s) => s.setInteractingWithUI);
  const handleDown = () => { setInteractingWithUI(true);  onEditStart?.(); };
  const handleUp   = () => { setInteractingWithUI(false); onEditEnd?.(); };
  return (
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
        onPointerDown={handleDown}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        onChange={(e) => {
          const raw = parseFloat(e.target.value);
          if (!Number.isFinite(raw)) return;
          onChange(raw);
        }}
        className="w-full rounded-lg appearance-none cursor-pointer"
        style={{ accentColor: color.replace('bg-', 'text-').replace('500', '400') }}
      />
    </div>
  );
};

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
      <div className="flex justify-between text-[10px] text-pulsar-white/50 uppercase font-bold mb-2">
        <span>Atmospheric Profile</span>
        <span className="text-nova-gold">Temp vs Altitude</span>
      </div>
      <svg width={width} height={height}>
        <LinearGradient id="area-gradient" from="#F9D423" to="#F9D423" toOpacity={0} />
        <Group top={margin.top} left={margin.left}>
          <AxisLeft scale={yScale} numTicks={4} stroke="rgba(255,255,255,0.08)" tickStroke="rgba(255,255,255,0.08)" tickLabelProps={() => ({ fill: 'rgba(244,244,251,0.35)', fontSize: 8, textAnchor: 'end', dx: -2, dy: 3 })} />
          <AxisBottom top={yMax} scale={xScale} numTicks={5} stroke="rgba(255,255,255,0.08)" tickStroke="rgba(255,255,255,0.08)" tickLabelProps={() => ({ fill: 'rgba(244,244,251,0.35)', fontSize: 8, textAnchor: 'middle', dy: 2 })} />
          <LinePath
            data={data}
            x={d => xScale(d.h)}
            y={d => yScale(d.t)}
            stroke="#F9D423"
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
      <div className={`fixed z-20 pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] creation-toolbar-anchor left-1/2 -translate-x-1/2 flex flex-col items-center justify-end w-auto max-w-[90vw] pt-2 ${mobileHidden ? 'translate-y-[120%]' : 'translate-y-0'} md:absolute md:left-[max(1rem,var(--safe-left))] md:translate-x-0 md:max-w-[95vw] md:items-start`}>
        <div className={`pointer-events-auto w-auto max-w-full overflow-x-auto md:overflow-visible overscroll-x-contain touch-pan-x scrollbar-hide rounded-full md:rounded-none`}>
          <div className={`bg-[rgba(45,51,64,0.6)] backdrop-blur-xl md:backdrop-blur-md border border-white/10 rounded-full md:rounded-xl shadow-2xl flex flex-row flex-nowrap md:flex-col items-center md:items-stretch md:w-auto md:min-w-[8.75rem] gap-0 md:gap-1.5 md:p-2 ring-1 ring-white/5 animate-in slide-in-from-bottom-2 fade-in duration-300 transition-[padding,width,min-width,height] duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] ${isExpanded ? 'w-max min-w-0 py-1.5 pl-3 pr-3 justify-start' : 'w-[4.25rem] h-[4.25rem] min-w-0 p-3 justify-center'}`}>
            <button onClick={() => setIsExpanded(!isExpanded)} className="touch-target rounded-full bg-white/5 text-slate-400 hover:text-white active:scale-90 transition-transform md:hidden shrink-0 h-11 w-11 flex items-center justify-center">
              {isExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </button>
            <div
              className={`flex flex-row flex-nowrap md:contents items-center justify-evenly md:items-stretch gap-0 md:gap-1.5 overflow-hidden transition-[max-width,opacity,margin] duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] ${isExpanded ? 'max-w-[80rem] opacity-100 ml-0' : 'max-w-0 opacity-0 ml-0 pointer-events-none'} md:max-w-none md:opacity-100 md:pointer-events-auto`}
            >
            <button
              onClick={() => setMode(null)}
              className={`touch-target flex flex-col md:flex-row items-center md:gap-3 justify-center min-w-[2.75rem] md:min-w-0 md:w-full md:justify-start md:px-3 active:scale-95 p-1 md:p-2.5 transition-all font-bold rounded-lg shrink-0
                ${mode === null
                  ? 'text-nova-gold md:bg-nova-gold/20 md:ring-1 md:ring-inset md:ring-nova-gold/25'
                  : 'text-red-400 hover:text-red-300 md:border md:border-red-500/30 md:hover:bg-red-500/20'
                }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all md:hidden
                ${mode === null
                  ? 'bg-nova-gold/25 ring-1 ring-inset ring-nova-gold/35'
                  : 'bg-red-500/10 border border-red-500/30'
                }`}
              >
                {mode === null ? <MousePointer2 size={18} /> : <X size={18} />}
              </div>
              <span className="hidden md:block">{mode === null ? <MousePointer2 size={18} /> : <X size={18} />}</span>
              <span className="text-[9px] md:text-xs font-bold uppercase mt-0.5 md:mt-0">{mode === null ? 'Select' : 'Cancel'}</span>
            </button>
            <div className="w-px self-stretch min-h-[2.75rem] md:min-h-0 md:h-px md:w-full bg-white/10 shrink-0 md:my-1" aria-hidden />
            {tools.map((t) => (
              <button
                key={t.id}
                onClick={() => setMode(t.id as BodyType)}
                className={`touch-target flex flex-col md:flex-row items-center md:gap-3 justify-center min-w-[2.75rem] md:min-w-0 md:w-full md:justify-start md:px-3 relative group shrink-0 active:scale-95 p-1 md:p-2.5 transition-all
                  ${mode === t.id
                    ? t.color + ' md:' + t.bg + ' md:rounded-lg md:ring-1 md:ring-inset md:ring-white/20'
                    : 'text-slate-400 hover:text-slate-200 md:bg-transparent md:hover:bg-white/5 md:rounded-lg'
                  }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all md:hidden
                  ${mode === t.id
                    ? t.bg + ' ring-1 ring-inset ring-white/20 shadow-md'
                    : 'group-hover:bg-white/5'
                  }`}
                >
                  <t.icon size={18} />
                </div>
                <t.icon size={18} className="hidden md:block shrink-0" />
                <span className="text-[9px] md:text-xs font-bold uppercase mt-0.5 md:mt-0">{t.label}</span>
              </button>
            ))}
            <div className="w-px self-stretch min-h-[2.75rem] md:min-h-0 md:h-px md:w-full bg-white/10 shrink-0 md:my-1" aria-hidden />
            <button
              onClick={onTriggerGenerate}
              className="touch-target flex flex-col md:flex-row items-center md:gap-3 justify-center min-w-[2.75rem] md:min-w-0 md:w-full md:justify-start md:px-3 text-white shrink-0 active:scale-95 p-1 md:p-2.5 transition-all md:bg-gradient-to-br md:from-indigo-500 md:to-purple-600 md:hover:from-indigo-400 md:hover:to-purple-500 md:rounded-lg md:shadow-lg md:shadow-purple-500/20"
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-purple-500/20 md:hidden">
                <Sparkles size={18} />
              </div>
              <Sparkles size={18} className="hidden md:block shrink-0" />
              <span className="text-[9px] md:text-xs font-bold uppercase mt-0.5 md:mt-0">Gen</span>
            </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// --- INSPECTOR PANEL ---

export const InspectorPanel: React.FC = () => {
  const {
    inspectorBodyId, updateBody, removeBody, selectBody, closeInspector, bodies,
    lockInspectorFields, unlockInspectorFields,
  } = useStore();
  const selectedBody = useStore(state => state.bodies.find(b => b.id === state.inspectorBodyId));
  const [sheetVisible, setSheetVisible] = useState(false);

  const lockFields = (fields: string[]) => {
    if (selectedBody) lockInspectorFields(selectedBody.id, fields);
  };
  const unlockFields = (fields: string[]) => {
    if (selectedBody) unlockInspectorFields(selectedBody.id, fields);
  };
  const physicalLock = ['mass', 'radius', 'properties', 'composition'] as const;
  const propLock = ['properties'] as const;
  const compositionLock = ['composition', 'radius', 'properties'] as const;
  const tempLock = ['temperature', 'color', 'properties'] as const;
  const orbitLock = ['position', 'velocity'] as const;
  const orbitEditStart = () => lockFields([...orbitLock]);
  const orbitEditEnd = () => unlockFields([...orbitLock]);

  const [activeTab, setActiveTab] = useState<'props' | 'orbit' | 'analysis'>('props');

  const panelRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const dragOffsetRef = useRef(0);
  dragOffsetRef.current = dragOffset;

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    setDragOffset(0);
  }, [selectedBody?.id]);

  useEffect(() => {
    if (!selectedBody) {
      setSheetVisible(false);
      return;
    }
    setSheetVisible(false);
    let cancelled = false;
    let outerFrame = 0;
    let innerFrame = 0;
    outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        if (!cancelled) setSheetVisible(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(outerFrame);
      cancelAnimationFrame(innerFrame);
    };
  }, [selectedBody?.id]);

  const getCloseDragThreshold = () => {
    const panelH = panelRef.current?.offsetHeight ?? 400;
    return Math.min(140, Math.max(72, panelH * 0.14));
  };

  const finishSheetDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    if (e.currentTarget.dataset.dragging !== 'true') return;
    e.currentTarget.dataset.dragging = 'false';
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    const offset = dragOffsetRef.current;
    if (offset > getCloseDragThreshold()) {
      selectBody(null);
      closeInspector();
      setDragOffset(0);
      return;
    }
    setDragOffset(0);
  };

  const handleSheetPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.dataset.startY = e.clientY.toString();
    e.currentTarget.dataset.dragging = 'true';
  };

  const handleSheetPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isMobile) return;
    if (e.currentTarget.dataset.dragging !== 'true') return;
    const startY = parseFloat(e.currentTarget.dataset.startY!);
    const delta = Math.max(0, e.clientY - startY);
    setDragOffset(delta);
  };
  const [esi, setEsi] = useState(0);
  const [rsi, setRsi] = useState(0);
  const [timeToLock, setTimeToLock] = useState<string>('∞');
  const [elements, setElements] = useState({ a: 0, e: 0, i: 0, Omega: 0, omega: 0, nu: 0 });

  const props = selectedBody?.properties || {};
  const [compIron, setCompIron] = useState(props.compositionIron ?? 0.3);
  const [compSil, setCompSil] = useState(props.compositionSilicates ?? 0.6);
  const [compWater, setCompWater] = useState(props.compositionWater ?? 0.1);

  const parentBody = useMemo(
    () => (selectedBody ? findDominantParent(selectedBody, bodies) : null),
    [selectedBody, bodies],
  );

  /**
   * Compact objects and stars have their radius fixed by an equation of state
   * or a mass-radius relation, so it is read-only for them; pinning a radius
   * only makes sense where composition is the free parameter.
   */
  const isRadiusEditable =
    !!selectedBody &&
    !['Black Hole', 'Neutron Star', 'Pulsar', 'White Dwarf', 'Brown Dwarf', 'Star', 'Red Giant']
      .includes(selectedBody.type);

  /** Slider bounds: one decade either side of the type's own mass range. */
  const massSliderRange = useMemo<[number, number]>(() => {
    if (!selectedBody) return [PHYSICS_LIMITS.MIN_MASS, PHYSICS_LIMITS.MAX_MASS];
    const cfg = BODY_CONFIGS[selectedBody.type];
    if (!cfg) return [PHYSICS_LIMITS.MIN_MASS, PHYSICS_LIMITS.MAX_MASS];
    return [
      Math.max(PHYSICS_LIMITS.MIN_MASS, cfg.massRange[0] * 0.1),
      Math.min(PHYSICS_LIMITS.MAX_MASS, cfg.massRange[1] * 10),
    ];
  }, [selectedBody?.type]);

  useEffect(() => {
    if (selectedBody) {
      setCompIron(selectedBody.properties?.compositionIron ?? 0.3);
      setCompSil(selectedBody.properties?.compositionSilicates ?? 0.6);
      setCompWater(selectedBody.properties?.compositionWater ?? 0.1);
    }
  }, [selectedBody?.id]);

  useEffect(() => {
    if (selectedBody) {
      setEsi(calculateESI(selectedBody));
      setRsi(calculateRSI(selectedBody));

      const parent = parentBody;
      const years = calculateTidalLockTime(selectedBody, parent);
      if (years === Infinity) setTimeToLock('Never');
      else if (years > 1000000000) setTimeToLock('> 1B yrs');
      else if (years < 1) setTimeToLock('Locked');
      else setTimeToLock(`${Math.round(years).toLocaleString()} yrs`);

      // Populate Orbit tab with current Keplerian elements derived from
      // the body's actual position + velocity relative to its parent.
      if (parent) {
        try {
          const el = getOrbitalElements(selectedBody, parent);
          if (isFinite(el.a) && el.a > 0) {
            setElements({
              a: el.a,
              e: Math.max(0, Math.min(0.95, el.e || 0)),
              i: el.i || 0,
              Omega: el.Omega || 0,
              omega: el.omega || 0,
              nu: el.nu || 0,
            });
          }
        } catch { /* singular orbit — leave defaults */ }
      }
    }
  }, [selectedBody, parentBody]);

  const applyOrbitalElements = () => {
    if (!selectedBody || !parentBody) return;
    const clamped = {
      a: Math.max(10, Math.min(500, elements.a || 50)),
      e: Math.max(0, Math.min(0.95, elements.e || 0)),
      i: Math.max(0, Math.min(180, elements.i || 0)),
      Omega: ((elements.Omega || 0) % 360 + 360) % 360,
      omega: ((elements.omega || 0) % 360 + 360) % 360,
      nu: ((elements.nu || 0) % 360 + 360) % 360,
    };
    const state = calculateOrbitalState(
      parentBody,
      clamped.a, clamped.e, clamped.i,
      clamped.Omega, clamped.omega, clamped.nu
    );
    if (!isFinite(state.position.x) || !isFinite(state.velocity.x)) return;
    updateBody(selectedBody.id, {
      position: state.position,
      velocity: state.velocity,
    });
  };

  const setProp = <K extends keyof NonNullable<CelestialBody['properties']>>(
    key: K,
    value: NonNullable<CelestialBody['properties']>[K],
  ) => {
    if (selectedBody) updateBody(selectedBody.id, { properties: { ...props, [key]: value } });
  };
  const propEditStart = () => lockFields([...propLock]);
  const propEditEnd = () => unlockFields([...propLock]);

  const handleTemperatureChange = (temp: number) => {
    const clamped = clampStarTemperature(temp);
    const { r, g, b } = kelvinToRgb(clamped);
    const hex = rgbToHex(r, g, b);
    if (selectedBody) {
      updateBody(selectedBody.id, {
        temperature: clamped,
        color: hex,
        properties: { ...props, userTempOverride: true },
      });
    }
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
      // Composition is a primary; radius, density, gravity and escape velocity
      // are re-derived from it by the store (utils/bodyDerivation.ts).
      updateBody(selectedBody.id, {
        properties: {
          ...props,
          manualRadius: false,
          manualRadiusKm: undefined,
          compositionIron: iron,
          compositionSilicates: sil,
          compositionWater: water,
        }
      });
    }
  };

  if (!selectedBody) return null;

  const dismissInspector = () => {
    selectBody(null);
    closeInspector();
  };

  const sheetTransform = isMobile
    ? (dragOffset > 0
      ? `translateY(${dragOffset}px)`
      : sheetVisible ? 'translateY(0)' : 'translateY(100%)')
    : (sheetVisible ? 'translateY(0)' : 'translateY(1.5rem)');

  return (
    <div
      ref={panelRef}
      className="inspector-panel-anchor fixed md:absolute z-30 bottom-0 left-0 w-full rounded-t-2xl border-t border-white/10 md:top-auto md:right-4 md:bottom-4 md:left-auto md:w-[min(22rem,92vw)] md:rounded-xl md:border bg-[rgba(45,51,64,0.6)] backdrop-blur-xl md:backdrop-blur-md text-pulsar-white shadow-2xl md:max-h-[85vh] flex flex-col ring-1 ring-white/5 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] opacity-100"
      style={{
        transform: sheetTransform,
        transition: dragOffset > 0 ? 'none' : 'transform 0.5s cubic-bezier(0.32, 0.72, 0, 1)',
      }}
    >
      <div className="sticky top-0 z-10 bg-[rgba(16,20,28,0.95)] backdrop-blur-md border-b border-white/10 shrink-0">
        <div
          className="md:hidden flex justify-center pt-3 pb-1 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={handleSheetPointerDown}
          onPointerMove={handleSheetPointerMove}
          onPointerUp={finishSheetDrag}
          onPointerCancel={finishSheetDrag}
        >
          <div className="w-12 h-1.5 bg-white/15 rounded-full pointer-events-none" />
        </div>
        <div className="p-5 pb-0">
        <div className="flex justify-between items-start mb-4 gap-3 min-w-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg md:text-xl font-bold font-mono text-pulsar-white tracking-tight flex items-center gap-2 truncate min-w-0">{selectedBody.name}</h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-pulsar-white/60 uppercase tracking-wider font-bold">{selectedBody.type}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => removeBody(selectedBody.id)} className="touch-target flex items-center justify-center shrink-0 w-11 h-11 text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors active:scale-95"><Trash2 size={18} /></button>
            <button onClick={dismissInspector} className="touch-target flex items-center justify-center shrink-0 w-11 h-11 text-pulsar-white/70 hover:text-nova-gold bg-white/5 hover:bg-white/10 rounded-lg transition-colors active:scale-95"><X size={18} /></button>
          </div>
        </div>

        <div className="flex gap-1 bg-black/20 p-1 rounded-lg mb-4">
          <button onClick={() => setActiveTab('props')} className={`touch-target min-h-[2.75rem] flex-1 py-2 rounded-md text-[10px] uppercase font-bold tracking-wider transition-all ${activeTab === 'props' ? 'bg-nova-gold/20 text-nova-gold shadow-sm' : 'text-pulsar-white/30 hover:text-pulsar-white/70 hover:bg-white/5'}`}>Properties</button>
          <button onClick={() => setActiveTab('orbit')} className={`touch-target min-h-[2.75rem] flex-1 py-2 rounded-md text-[10px] uppercase font-bold tracking-wider transition-all ${activeTab === 'orbit' ? 'bg-nova-gold/20 text-nova-gold shadow-sm' : 'text-pulsar-white/30 hover:text-pulsar-white/70 hover:bg-white/5'}`}>Orbit</button>
          {['Planet', 'Dwarf', 'Ice Giant'].includes(selectedBody.type) && (
            <button onClick={() => setActiveTab('analysis')} className={`touch-target min-h-[2.75rem] flex-1 py-2 rounded-md text-[10px] uppercase font-bold tracking-wider transition-all ${activeTab === 'analysis' ? 'bg-nova-gold/20 text-nova-gold shadow-sm' : 'text-pulsar-white/30 hover:text-pulsar-white/70 hover:bg-white/5'}`}>Analysis</button>
          )}
        </div>
        </div>
      </div>

      <div className="p-5 space-y-6 overflow-y-auto scrollbar-custom flex-1 pb-[max(1.25rem,env(safe-area-inset-bottom))] overscroll-contain panel-scroll">
        {/* PROPERTIES TAB */}
        {activeTab === 'props' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h3 className="text-[10px] font-bold uppercase text-pulsar-white/40 flex items-center gap-2 mb-3 tracking-widest"><Settings size={12} /> Physical</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-pulsar-white/50 block mb-1.5 uppercase flex items-center justify-between">
                      <span>Mass</span>
                      <span className="text-pulsar-white/30 normal-case font-mono">{fmtMass(selectedBody.mass)}</span>
                    </label>
                    <NumberInput
                      value={selectedBody.mass}
                      onChange={(v) => updateBody(selectedBody.id, { mass: v })}
                      onEditStart={() => lockFields([...physicalLock])}
                      onEditEnd={() => unlockFields([...physicalLock])}
                      min={PHYSICS_LIMITS.MIN_MASS}
                      max={PHYSICS_LIMITS.MAX_MASS}
                      className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-pulsar-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-pulsar-white/50 block mb-1.5 uppercase flex items-center justify-between">
                      <span>Radius</span>
                      <span className="text-pulsar-white/30 normal-case font-mono">{fmtRadiusRelative(selectedBody.radiusKm)}</span>
                    </label>
                    {isRadiusEditable ? (
                      <NumberInput
                        value={selectedBody.radiusKm}
                        onChange={(v) => updateBody(selectedBody.id, { radiusKm: v })}
                        onEditStart={() => lockFields([...physicalLock])}
                        onEditEnd={() => unlockFields([...physicalLock])}
                        min={PHYSICS_LIMITS.MIN_RADIUS_KM}
                        max={PHYSICS_LIMITS.MAX_RADIUS_KM}
                        className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-pulsar-white font-mono"
                      />
                    ) : (
                      <div className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-pulsar-white/40 font-mono">
                        {fmtRadiusKm(selectedBody.radiusKm)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Mass on a logarithmic scale: the admissible range now spans
                    24 orders of magnitude, so a linear slider is unusable. */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-pulsar-white/50 uppercase">Mass Scale</span>
                    <span className="text-[10px] text-pulsar-white/30 font-mono">
                      {massToEarth(selectedBody.mass) >= 1
                        ? `${massToEarth(selectedBody.mass).toExponential(2)} M⊕`
                        : `${massToEarth(selectedBody.mass).toExponential(2)} M⊕`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={Math.log10(massSliderRange[0])}
                    max={Math.log10(massSliderRange[1])}
                    step={0.01}
                    value={Math.log10(Math.max(selectedBody.mass, massSliderRange[0]))}
                    onPointerDown={() => { useStore.getState().setInteractingWithUI(true); lockFields([...physicalLock]); }}
                    onPointerUp={() => { useStore.getState().setInteractingWithUI(false); unlockFields([...physicalLock]); }}
                    onPointerCancel={() => { useStore.getState().setInteractingWithUI(false); unlockFields([...physicalLock]); }}
                    onChange={(e) => updateBody(selectedBody.id, { mass: Math.pow(10, parseFloat(e.target.value)) })}
                    className="w-full rounded-lg appearance-none cursor-pointer h-1.5 bg-white/10"
                  />
                </div>

                {/* Derived, read-only. Recomputed from the primaries above. */}
                <div className="bg-black/30 rounded-lg p-3 border border-white/5 space-y-1.5">
                  <div className="text-[9px] uppercase tracking-widest text-pulsar-white/30 mb-1">Derived</div>
                  <DerivedRow label="Density" value={fmtDensity(props.bulkDensity ?? NaN)} />
                  <DerivedRow label="Gravity" value={fmtGravity(props.surfaceGravity ?? NaN)} />
                  <DerivedRow label="Esc. Velocity" value={fmtEscVel(props.escapeVelocity ?? NaN)} />
                  {parentBody && (
                    <DerivedRow
                      label="Orbital Period"
                      value={fmtPeriod(orbitalPeriodYears(elements.a, parentBody.mass + selectedBody.mass))}
                    />
                  )}
                </div>
                {['Planet', 'Dwarf', 'Ice Giant'].includes(selectedBody.type) && (
                  <div className="bg-black/30 rounded-lg p-3 border border-white/5 flex justify-between items-center">
                    <label className="text-[10px] text-pulsar-white/50 uppercase font-bold flex items-center gap-1"><Thermometer size={10} /> Equilibrium Temp</label>
                    <span className="text-xs font-mono font-bold text-nova-gold">{fmtTemp(selectedBody.temperature)}</span>
                  </div>
                )}
                {selectedBody.type === 'Star' && (
                  <div className="bg-black/30 rounded-lg p-3 border border-white/5">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] text-pulsar-white/50 uppercase font-bold flex items-center gap-1"><Thermometer size={10} /> Surface Temp</label>
                      <span className="text-xs font-mono font-bold text-nova-gold">{selectedBody.temperature.toFixed(0)} K</span>
                    </div>
                    <input
                      type="range"
                      min="1000"
                      max="40000"
                      step="100"
                      value={selectedBody.temperature}
                      onPointerDown={() => { useStore.getState().setInteractingWithUI(true);  lockFields([...tempLock]); }}
                      onPointerUp={() => { useStore.getState().setInteractingWithUI(false); unlockFields([...tempLock]); }}
                      onPointerCancel={() => { useStore.getState().setInteractingWithUI(false); unlockFields([...tempLock]); }}
                      onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
                      className="inspector-temp-range w-full mb-2 rounded-lg appearance-none cursor-pointer"
                    />
                    <div className="flex justify-between items-center pt-1">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">Spectral Class</span>
                      <span className={`text-base font-bold font-mono px-2 rounded ${selectedBody.temperature > 10000 ? 'text-blue-200 bg-blue-900/30' : selectedBody.temperature > 6000 ? 'text-white bg-white/10' : 'text-orange-200 bg-orange-900/30'}`}>
                        {getSpectralType(selectedBody.temperature)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-white/5">
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">Luminosity</span>
                      <span className="text-xs font-mono font-bold text-nova-gold">{fmtLuminositySolar(bodyLuminositySolar(selectedBody))}</span>
                    </div>
                  </div>
                )}

                {selectedBody.type !== 'Planet' && (
                  <div>
                    <label className="text-[10px] text-pulsar-white/50 block mb-1.5 uppercase">Surface Material</label>
                    <select value={selectedBody.texture} onChange={(e) => updateBody(selectedBody.id, { texture: e.target.value })} className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-pulsar-white font-mono">
                      {TEXTURE_TYPES.map(t => <option key={t.value} value={t.value} className="bg-slate-900">{t.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {selectedBody.type === 'Planet' && (
              <div>
                <h3 className="text-[10px] font-bold uppercase text-pulsar-white/40 flex items-center gap-2 mb-3 tracking-widest"><Layers size={12} /> Composition</h3>
                <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-4">
                  <div>
                    <CompositionSlider label="Iron (Core)" value={compIron} color="bg-orange-600" onChange={(v) => handleCompositionChange('iron', v)} onEditStart={() => lockFields([...compositionLock])} onEditEnd={() => unlockFields([...compositionLock])} />
                    <CompositionSlider label="Silicates (Mantle)" value={compSil} color="bg-stone-500" onChange={(v) => handleCompositionChange('silicates', v)} onEditStart={() => lockFields([...compositionLock])} onEditEnd={() => unlockFields([...compositionLock])} />
                    <CompositionSlider label="Water (Ice/Ocean)" value={compWater} color="bg-blue-500" onChange={(v) => handleCompositionChange('water', v)} onEditStart={() => lockFields([...compositionLock])} onEditEnd={() => unlockFields([...compositionLock])} />
                  </div>
                </div>
              </div>
            )}

            <div>
              <h3 className="text-[10px] font-bold uppercase text-pulsar-white/40 flex items-center gap-2 mb-3 tracking-widest"><Sliders size={12} /> Properties</h3>
              <div className="bg-black/20 rounded-xl p-3 border border-white/5">
                {selectedBody.type === 'Star' && (
                  <>
                    <RangeInput label="Metallicity (Z)" min={0} max={1} step={0.01} value={props.metallicity ?? 0.2} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('metallicity', v)} />
                    <RangeInput label="Rotation (Oblateness)" min={0} max={0.5} step={0.01} value={props.oblateness ?? 0} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('oblateness', v)} />
                    <RangeInput label="Convection Scale" min={1} max={10} step={0.1} value={props.convectionScale ?? 5} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('convectionScale', v)} />
                  </>
                )}
                {selectedBody.type === 'Red Giant' && (
                  <>
                    <RangeInput label="Mass Loss Rate" min={0} max={1} step={0.01} value={props.massLoss ?? 0.1} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('massLoss', v)} />
                    <RangeInput label="Pulsation Freq" min={0} max={5} step={0.1} value={props.pulsationSpeed ?? 0.5} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('pulsationSpeed', v)} />
                    <div className="flex items-center gap-2 mt-2">
                      <label className="text-[10px] text-slate-400 uppercase font-mono flex-1">Luminosity Class</label>
                      <button onClick={() => setProp('luminosityClass', (props.luminosityClass || 0) === 0 ? 1 : 0)} className="touch-target min-h-[2.75rem] text-[10px] px-3 py-2 bg-white/10 rounded">
                        {props.luminosityClass === 1 ? 'Supergiant' : 'Giant'}
                      </button>
                    </div>
                  </>
                )}
                {selectedBody.type === 'Planet' && (
                  <>
                    <RangeInput label="Tectonic Activity" min={0} max={1} step={0.01} value={props.tectonics ?? 0} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('tectonics', v)} />
                    <RangeInput label="Atmosphere Density" min={0} max={1} step={0.01} value={props.atmosphere ?? 0.2} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('atmosphere', v)} />
                    <RangeInput label="Water Level" min={0} max={1} step={0.01} value={props.waterLevel ?? 0.5} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('waterLevel', v)} />

                    <div className="pt-2 mt-2 border-t border-white/5">
                      <RangeInput label="Atmosphere Height" min={0.01} max={1.0} step={0.01} value={props.scaleHeight ?? 0.2} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('scaleHeight', v)} />
                      <RangeInput label="Haze Concentration" min={0} max={1} step={0.01} value={props.haze ?? 0.0} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('haze', v)} />
                    </div>
                  </>
                )}
                {selectedBody.type === 'Ice Giant' && (
                  <>
                    <RangeInput label="Methane Conc." min={0} max={1} step={0.01} value={props.methane ?? 0.3} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('methane', v)} />
                    <RangeInput label="Cloud Depth" min={0} max={1} step={0.01} value={props.cloudDepth ?? 0.2} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('cloudDepth', v)} />
                    <RangeInput label="Axial Tilt" min={0} max={180} step={1} value={props.axialTilt ?? 0} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('axialTilt', v)} />
                  </>
                )}
                {selectedBody.type === 'Dwarf' && (
                  <>
                    <RangeInput label="Flare Frequency" min={0} max={1} step={0.01} value={props.flareActivity ?? 0.1} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('flareActivity', v)} />
                    <RangeInput label="Magnetic Index" min={0} max={1} step={0.01} value={props.magneticIndex ?? 0.1} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('magneticIndex', v)} />
                  </>
                )}
                {selectedBody.type === 'Black Hole' && (
                  <>
                    <RangeInput label="Spin Parameter (a*)" min={0} max={1.0} step={0.01} value={props.spinParameter ?? 0.0} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('spinParameter', v)} />
                    <RangeInput label="Accretion Rate" min={0} max={1.0} step={0.01} value={props.accretionRate ?? 0.5} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('accretionRate', v)} />
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ORBIT TAB */}
        {activeTab === 'orbit' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <h3 className="text-[10px] font-bold uppercase text-pulsar-white/40 flex items-center gap-2 mb-3 tracking-widest"><Orbit size={12} /> Keplerian Elements</h3>
            <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-4">
              <div className="flex justify-between text-[10px] text-pulsar-white/50 uppercase font-mono">
                <span>Parent</span>
                <span className="text-nova-gold normal-case font-bold">{parentBody ? parentBody.name : '— None —'}</span>
              </div>
              {parentBody && (
                <div className="flex justify-between text-[10px] text-pulsar-white/50 uppercase font-mono">
                  <span>Distance</span>
                  <span className="text-pulsar-white normal-case">{fmtDistance(selectedBody.position.distanceTo(parentBody.position))}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <RangeInput label="Semi-major Axis (a)" min={10} max={500} step={1} value={elements.a || 50} onEditStart={orbitEditStart} onEditEnd={orbitEditEnd} onChange={(v) => setElements({ ...elements, a: v })} />
                  <RangeInput label="Eccentricity (e)" min={0} max={0.95} step={0.01} value={elements.e || 0} onEditStart={orbitEditStart} onEditEnd={orbitEditEnd} onChange={(v) => setElements({ ...elements, e: v })} />
                  <RangeInput label="True Anomaly (ν)" min={0} max={360} step={1} value={elements.nu || 0} onEditStart={orbitEditStart} onEditEnd={orbitEditEnd} onChange={(v) => setElements({ ...elements, nu: v })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <CircularDial label="Inclination (i)" value={elements.i || 0} onEditStart={orbitEditStart} onEditEnd={orbitEditEnd} onChange={(v) => setElements({ ...elements, i: v })} max={180} />
                  <CircularDial label="Asc Node (Ω)" value={elements.Omega || 0} onEditStart={orbitEditStart} onEditEnd={orbitEditEnd} onChange={(v) => setElements({ ...elements, Omega: v })} />
                  <div className="col-span-2 flex justify-center">
                    <div className="w-1/2">
                      <CircularDial label="Arg Periapsis (ω)" value={elements.omega || 0} onEditStart={orbitEditStart} onEditEnd={orbitEditEnd} onChange={(v) => setElements({ ...elements, omega: v })} />
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={applyOrbitalElements}
                disabled={!parentBody}
                className={`touch-target min-h-[2.75rem] w-full py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${parentBody ? 'bg-nova-gold/20 text-nova-gold hover:bg-nova-gold/30 active:scale-[0.98]' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}
              >
                Apply Orbital State
              </button>
              <div className="text-[10px] text-slate-500 italic text-center">
                Computes new position + velocity from the six classical elements
                and snaps the body onto the prescribed orbit.
              </div>
            </div>
          </div>
        )}

        {/* ANALYSIS TAB */}
        {activeTab === 'analysis' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h3 className="text-[10px] font-bold uppercase text-pulsar-white/40 flex items-center gap-2 mb-3 tracking-widest"><Microscope size={12} /> Habitability Analytics</h3>
              <div className="bg-black/20 rounded-xl p-4 border border-white/5 space-y-6">
                <div className="flex justify-around">
                  <Gauge value={esi} label="Earth Similarity" subLabel="ESI" color={esi > 0.8 ? 'text-emerald-400' : esi > 0.5 ? 'text-yellow-400' : 'text-orange-400'} />
                  <Gauge value={rsi} label="Rock Similarity" subLabel="RSI (Extreme)" color={rsi > 0.7 ? 'text-rose-400' : rsi > 0.4 ? 'text-orange-300' : 'text-slate-600'} />
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest block mb-1">Assessment</span>
                  <span className={`text-sm font-bold ${esi > 0.8 ? 'text-emerald-300' : esi > 0.6 ? 'text-nova-gold' : 'text-pulsar-white/60'}`}>
                    {esi > 0.8 ? 'Potential Garden World' : esi > 0.6 ? 'Marginally Habitable' : rsi > 0.6 ? 'Extremophile Candidate' : 'Dead World'}
                  </span>
                </div>
              </div>
            </div>

            {/* Atmospheric Profile Chart (Visx) */}
            {['Planet', 'Ice Giant'].includes(selectedBody.type) && (
              <div>
                <h3 className="text-[10px] font-bold uppercase text-pulsar-white/40 flex items-center gap-2 mb-3 tracking-widest"><Wind size={12} /> Atmosphere</h3>
                <AtmosphereChart body={selectedBody} />
              </div>
            )}

            {/* Tidal Locking Section */}
            {['Planet', 'Dwarf', 'Ice Giant'].includes(selectedBody.type) && (
              <div>
                <h3 className="text-[10px] font-bold uppercase text-pulsar-white/40 flex items-center gap-2 mb-3 tracking-widest"><Timer size={12} /> Tidal Evolution</h3>
                <div className="bg-black/20 rounded-xl p-3 border border-white/5 space-y-4">
                  <div className="flex justify-between items-center p-2 bg-white/5 rounded-lg">
                    <div>
                      <div className="text-[10px] text-pulsar-white/50 uppercase tracking-wider mb-1">Time to Tidal Lock</div>
                      <div className="text-sm font-bold font-mono text-nova-gold">{timeToLock}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-pulsar-white/50 uppercase tracking-wider mb-1">Rotation Period</div>
                      <div className="text-sm font-bold font-mono text-pulsar-white">{(props.rotationPeriod || 24).toFixed(1)} hrs</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <label className="text-[10px] text-slate-400 uppercase font-bold">Synchronous Rotation</label>
                    <button
                      onClick={() => setProp('isTidallyLocked', !props.isTidallyLocked)}
                      className={`touch-target min-h-[2.75rem] flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${props.isTidallyLocked
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                        : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'}`}
                    >
                      <Lock size={12} />
                      {props.isTidallyLocked ? 'LOCKED' : 'FORCE LOCK'}
                    </button>
                  </div>
                  {!props.isTidallyLocked && (
                    <RangeInput label="Rotation Speed" min={1} max={100} step={1} value={props.rotationPeriod ?? 24} onEditStart={propEditStart} onEditEnd={propEditEnd} onChange={(v) => setProp('rotationPeriod', v)} />
                  )}
                </div>
              </div>
            )}

            {selectedBody.type === 'Planet' && (
              <div>
                <h3 className="text-[10px] font-bold uppercase text-pulsar-white/40 flex items-center gap-2 mb-3 tracking-widest"><Weight size={12} /> Geophysics</h3>
                <div className="bg-black/20 rounded-xl p-3 border border-white/5 grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-[9px] text-slate-500 uppercase mb-1">Density</div>
                    <div className="text-xs font-mono font-bold text-white">{fmtDensity(props.bulkDensity ?? 5.5)}</div>
                  </div>
                  <div className="text-center border-l border-white/5">
                    <div className="text-[9px] text-slate-500 uppercase mb-1">Gravity</div>
                    <div className="text-xs font-mono font-bold text-white">{fmtGravity(props.surfaceGravity ?? 9.8)}</div>
                  </div>
                  <div className="text-center border-l border-white/5">
                    <div className="text-[9px] text-slate-500 uppercase mb-1">Esc. Vel</div>
                    <div className="text-xs font-mono font-bold text-white">{fmtEscVel(props.escapeVelocity ?? 11.2)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div >
  );
};

export const ControlBar: React.FC<{ creationMode: BodyType | null, onReturnToMenu: () => void, onUndo: () => void, onRedo: () => void, canUndo: boolean, canRedo: boolean }> = ({ creationMode, onReturnToMenu, onUndo, onRedo, canUndo, canRedo }) => {
  const { paused, speed, showGrid, showDust, showHabitable, showStability, cameraLockedId, selectedId, isDebugMode } = useStore();
  const { setPaused, setSpeed, toggleGrid, toggleDust, toggleHabitable, toggleStability, setCameraLock, toggleDebugMode } = useStore();
  const [lockWarning, setLockWarning] = useState(false);

  const handleCameraLock = () => {
    if (cameraLockedId) {
      setCameraLock(null);
      return;
    }
    if (!selectedId) {
      setLockWarning(true);
      return;
    }
    setCameraLock(selectedId);
  };

  useEffect(() => {
    if (!lockWarning) return;
    const timer = window.setTimeout(() => setLockWarning(false), 2500);
    return () => clearTimeout(timer);
  }, [lockWarning]);

  return (
    <div className="fixed z-40 control-bar-anchor bottom-auto left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[min(95vw,44rem)] md:w-auto max-w-full">
      <div className="sim-toolbar bg-[rgba(45,51,64,0.6)] backdrop-blur-md border border-white/10 shadow-2xl rounded-[2rem] p-1.5 px-3 md:px-6 py-2 flex items-center justify-between md:justify-start gap-2 md:gap-6 ring-1 ring-white/5 w-full md:w-auto overflow-x-auto touch-pan-x scrollbar-hide" data-testid="control-bar">

        {/* Undo/Redo & Playback Group */}
        <div className="flex items-center gap-2 md:gap-4 shrink-0">
          <div className="flex items-center gap-0.5 md:gap-1">
            <button onClick={onUndo} disabled={!canUndo} className={`touch-target p-1.5 md:p-2 rounded-full transition-colors active:scale-90 ${canUndo ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-700 cursor-not-allowed'}`}><RotateCcw size={16} className="md:w-[18px] md:h-[18px]" /></button>
            <button onClick={onRedo} disabled={!canRedo} className={`touch-target p-1.5 md:p-2 rounded-full transition-colors rotate-180 active:scale-90 ${canRedo ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-700 cursor-not-allowed'}`}><RotateCcw size={16} className="md:w-[18px] md:h-[18px]" /></button>
          </div>
          <div className="h-4 md:h-6 w-px bg-white/10"></div>
          <div className="flex items-center gap-2 md:gap-3">
            <button onClick={() => setPaused(!paused)} data-testid="control-pause" className={`touch-target p-1.5 md:p-2 rounded-full transition-colors active:scale-90 ${paused ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-white/10 text-slate-200'}`}>
              {paused ? <Play size={18} className="md:w-[20px] md:h-[20px]" fill="currentColor" /> : <Pause size={18} className="md:w-[20px] md:h-[20px]" fill="currentColor" />}
            </button>
            <div className="flex items-center gap-1.5 md:gap-2">
              <input type="range" min="-2" max="4" step="0.1" value={speed} data-testid="control-speed"
                onPointerDown={() => useStore.getState().setInteractingWithUI(true)}
                onPointerUp={() => useStore.getState().setInteractingWithUI(false)}
                onPointerCancel={() => useStore.getState().setInteractingWithUI(false)}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                className="speed-slider w-12 md:w-20 rounded-lg appearance-none cursor-pointer accent-nova-gold" />
              <span className="text-[11px] md:text-sm font-mono text-nova-gold w-7 md:w-9 text-right shrink-0 tabular-nums">{speed.toFixed(1)}x</span>
            </div>
          </div>
        </div>

        <div className="h-4 md:h-6 w-px bg-white/10 shrink-0"></div>

        {/* Toggles Group */}
        <div className="flex items-center gap-0.5 md:gap-2 shrink-0">
          <button onClick={toggleGrid} data-testid="toggle-grid" className={`touch-target p-1.5 md:p-2 rounded-full transition-colors ${showGrid ? 'text-nova-gold bg-nova-gold/10' : 'text-pulsar-white/30'}`}><Hexagon size={16} className="md:w-[18px] md:h-[18px]" /></button>
          <button onClick={toggleDust} data-testid="toggle-dust" className={`touch-target p-1.5 md:p-2 rounded-full transition-colors ${showDust ? 'text-blue-400 bg-white/10' : 'text-pulsar-white/30'}`}><Sparkles size={16} className="md:w-[18px] md:h-[18px]" /></button>
          <button onClick={toggleHabitable} data-testid="toggle-habitable" className={`touch-target p-1.5 md:p-2 rounded-full transition-colors ${showHabitable ? 'text-emerald-400 bg-white/10' : 'text-pulsar-white/30'}`}><Globe size={16} className="md:w-[18px] md:h-[18px]" /></button>
          <button onClick={handleCameraLock} className={`touch-target p-1.5 md:p-2 rounded-full transition-colors ${cameraLockedId ? 'text-nebula-rust bg-nebula-rust/10' : 'text-pulsar-white/30'}`}><Focus size={16} className="md:w-[18px] md:h-[18px]" /></button>
          {import.meta.env.DEV && (
            <button
              onClick={toggleDebugMode}
              title="Physics diagnostics HUD"
              className={`touch-target p-1.5 md:p-2 rounded-full transition-colors ${isDebugMode ? 'text-emerald-400 bg-emerald-500/10' : 'text-pulsar-white/30'}`}
            >
              <Activity size={16} className="md:w-[18px] md:h-[18px]" />
            </button>
          )}
          <div className="h-4 md:h-6 w-px bg-white/10 mx-1"></div>
          {onReturnToMenu && (
            <button onClick={onReturnToMenu} className="touch-target p-1.5 md:p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors active:scale-90"><Home size={16} className="md:w-[18px] md:h-[18px]" /></button>
          )}
        </div>
      </div>
      {creationMode && (
        <div
          className="control-bar-hint bg-[rgba(45,51,64,0.6)] backdrop-blur-md border border-white/10 text-pulsar-white px-3 py-1.5 rounded-xl shadow-2xl ring-1 ring-white/5 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200 pointer-events-auto"
        >
          <div className="font-bold text-[10px] md:text-xs text-nova-gold uppercase tracking-wide flex items-center gap-1.5 border-r border-white/10 pr-2">
            {creationMode}
          </div>
          <div className="text-[9px] md:text-[11px] font-mono flex items-center gap-1.5 text-pulsar-white/60 whitespace-nowrap">
            <MousePointer2 size={11} className="w-[11px] h-[11px] md:w-[12px] md:h-[12px]" /> Drag to Launch
          </div>
        </div>
      )}
      {lockWarning && (
        <p
          role="alert"
          className="control-bar-hint text-[11px] md:text-xs text-nebula-rust bg-nebula-rust/10 border border-nebula-rust/25 px-3 py-1.5 rounded-lg shadow-lg animate-in fade-in slide-in-from-top-1 duration-200 whitespace-nowrap pointer-events-none"
        >
          An object must be selected first.
        </p>
      )}
    </div>
  );
};

export const ConfirmationModal = ({ isOpen, onConfirm, onCancel }: { isOpen: boolean, onConfirm: () => void, onCancel: () => void }) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-generate-title"
      onClick={onCancel}
    >
      <div
        className="bg-[rgba(16,20,28,0.98)] border border-white/10 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 ring-1 ring-white/5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirm-generate-title" className="text-lg font-bold text-pulsar-white mb-2 flex items-center gap-2"><AlertTriangle className="text-nebula-rust" size={20} /> New System</h3>
        <p className="text-pulsar-white/50 text-sm mb-6">This will generate a new random star system. Current simulation state will be pushed to undo history.</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="touch-target min-h-[2.75rem] px-4 py-2.5 rounded-lg text-sm font-medium text-pulsar-white/60 hover:text-pulsar-white hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={() => { onConfirm(); onCancel(); }} className="touch-target min-h-[2.75rem] px-4 py-2.5 rounded-lg text-sm font-bold bg-nova-gold hover:bg-nova-gold/90 text-void-navy shadow-lg shadow-nova-gold/20 transition-all">Generate</button>
        </div>
      </div>
    </div>
  );
};