import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BodyType } from '../types';
import { useStore } from '../utils/store';
import {
  Play, Pause, RotateCcw, Focus, MousePointer2, Sparkles,
  AlertTriangle, X, ChevronUp, ChevronDown, Home, Settings, Hexagon,
  Rewind, FastForward, Square, Orbit, Globe,
  type LucideIcon,
} from 'lucide-react';
import { creatableTypesFor, visualFor } from './bodyTypeVisuals';
import { useMoonDraft } from '../utils/moonDraft';
import { PHYSICS_LIMITS } from '../utils/physicsBounds';
import {
  formatSpeedReadout,
  snapSpeed,
  speedDetentIndex,
  timeStateFor,
  TIME_STATE_VISUALS,
  type TimeState,
} from '../utils/timeState';
import {
  hapticSelectionEnd,
  hapticSelectionStart,
  hapticSelectionTick,
  hapticTimeState,
} from '../utils/haptics';

/**
 * The Inspector now lives in components/inspector/. Re-exported here so the
 * `from './components/Panels'` import in App.tsx keeps working.
 */
export { InspectorPanel } from './inspector/InspectorPanel';

// --- TOOLBAR ---

export const CreationToolbar: React.FC<{ mode: BodyType | null, setMode: (m: BodyType | null) => void, onTriggerGenerate: () => void, mobileHidden: boolean }> = ({ mode, setMode, onTriggerGenerate, mobileHidden }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const uiMode = useStore((s) => s.uiMode);
  // Icon, colour and label all come from components/bodyTypeVisuals.ts, which
  // is the single definition shared with the outliner. The order is the
  // toolbar's own (stellar → planetary → small bodies). Beginner Mode offers a
  // smaller set; existing bodies of a hidden type are unaffected.
  const tools = useMemo(() => creatableTypesFor(uiMode).map((id) => {
    const v = visualFor(id);
    return { id, label: v.short, icon: v.icon, color: v.text, bg: v.bg };
  }), [uiMode]);

  return (
    <>
      <div className={`fixed z-20 pointer-events-none transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] creation-toolbar-anchor flex flex-col items-center justify-end pt-2 ${mobileHidden ? 'translate-y-[120%]' : 'translate-y-0'}`}>
        <div
          data-testid="creation-toolbar"
          data-expanded={isExpanded}
          className="creation-toolbar-surface pointer-events-auto max-w-full overflow-x-auto overscroll-x-contain touch-pan-x scrollbar-hide rounded-full bg-[rgba(45,51,64,0.6)] backdrop-blur-xl border border-white/10 shadow-2xl ring-1 ring-white/5 ag-fade-in md:w-max md:h-auto md:py-1.5 md:pl-3 md:pr-3"
        >
          <div className="creation-toolbar-row flex flex-row flex-nowrap items-center gap-0">
            <button
              onClick={() => setIsExpanded((expanded) => !expanded)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Collapse creation toolbar' : 'Expand creation toolbar'}
              className="touch-target rounded-full bg-white/5 text-slate-400 hover:text-white active:scale-90 transition-transform md:hidden shrink-0 h-11 w-11 flex items-center justify-center"
            >
              {isExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </button>
            <div
              className="creation-toolbar-tools flex flex-row flex-nowrap items-center justify-evenly gap-0 overflow-hidden md:max-w-[80rem] md:opacity-100 md:pointer-events-auto"
            >
            <button
              onClick={() => setMode(null)}
              className={`touch-target flex flex-col items-center justify-center min-w-[2.75rem] active:scale-95 p-1 transition-all font-bold rounded-lg shrink-0
                ${mode === null
                  ? 'text-nova-gold bg-nova-gold/10 ring-1 ring-inset ring-nova-gold/20'
                  : 'text-red-400 hover:text-red-300 hover:bg-red-500/10'
                }`}
            >
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all
                ${mode === null
                  ? 'bg-nova-gold/25 ring-1 ring-inset ring-nova-gold/35'
                  : 'bg-red-500/10 border border-red-500/30'
                }`}
              >
                {mode === null ? <MousePointer2 size={18} /> : <X size={18} />}
              </div>
              <span className="text-[9px] font-bold uppercase mt-0.5">{mode === null ? 'Select' : 'Cancel'}</span>
            </button>
            <div className="w-px self-stretch min-h-[2.75rem] bg-white/10 shrink-0" aria-hidden />
            {tools.map((t) => (
              <button
                key={t.id}
                onClick={() => setMode(t.id as BodyType)}
                className={`touch-target flex flex-col items-center justify-center min-w-[2.75rem] relative group shrink-0 active:scale-95 p-1 transition-all rounded-lg
                  ${mode === t.id
                    ? t.color + ' ' + t.bg + ' ring-1 ring-inset ring-white/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all
                  ${mode === t.id
                    ? t.bg + ' ring-1 ring-inset ring-white/20 shadow-md'
                    : 'group-hover:bg-white/5'
                  }`}
                >
                  <t.icon size={18} />
                </div>
                <span className="text-[9px] font-bold uppercase mt-0.5">{t.label}</span>
              </button>
            ))}
            <div className="w-px self-stretch min-h-[2.75rem] bg-white/10 shrink-0" aria-hidden />
            <button
              onClick={onTriggerGenerate}
              className="touch-target flex flex-col items-center justify-center min-w-[2.75rem] text-white shrink-0 active:scale-95 p-1 transition-all rounded-lg hover:bg-white/5"
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-purple-500/20">
                <Sparkles size={18} />
              </div>
              <span className="text-[9px] font-bold uppercase mt-0.5">Gen</span>
            </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};




const TIME_STATE_ICONS: Record<TimeState, LucideIcon> = {
  reverse: Rewind,
  stopped: Square,
  slow: Play,
  normal: Play,
  fast: FastForward,
};

const SPEED_SPAN = PHYSICS_LIMITS.SPEED_MAX - PHYSICS_LIMITS.SPEED_MIN;
/** Where a speed sits along the slider, 0–100. */
const speedPercent = (speed: number) => ((speed - PHYSICS_LIMITS.SPEED_MIN) / SPEED_SPAN) * 100;
const ZERO_PCT = speedPercent(0);
const ONE_PCT = speedPercent(1);
/** Track zones — reverse | slow | fast — in the TIME_STATE_VISUALS colours. */
const TRACK_ZONES = `linear-gradient(to right, rgba(167,139,250,0.35) 0%, rgba(167,139,250,0.35) ${ZERO_PCT}%, rgba(34,211,238,0.3) ${ZERO_PCT}%, rgba(34,211,238,0.3) ${ONE_PCT}%, rgba(249,212,35,0.35) ${ONE_PCT}%, rgba(251,146,60,0.45) 100%)`;

/**
 * The speed slider, drawn as a bipolar timeline around 0x.
 *
 * The coloured zones tell you where "backwards", "slow" and "fast" are before
 * you touch it; the fill grows out of the 0x mark toward the thumb in the
 * current state's colour; 0x and 1x are sticky detents with tick marks. The
 * native range input stays underneath for keyboard and screen-reader access
 * and supplies the thumb and the 44px hit area — the decoration is inset by
 * half a thumb so the percentages line up with where the thumb actually sits.
 */
const TimeScrubber: React.FC<{ speed: number; state: TimeState; effectiveSpeed: number; resolvingEncounter: boolean }> = ({ speed, state, effectiveSpeed, resolvingEncounter }) => {
  const setSpeed = useStore((s) => s.setSpeed);
  const color = TIME_STATE_VISUALS[state].color;
  const at = speedPercent(speed);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { speed: prev, paused } = useStore.getState();
    const next = snapSpeed(parseFloat(e.target.value));
    if (next === prev) return;
    setSpeed(next);
    // A zone change gets its own, stronger pattern from ControlBar's effect;
    // this is the light detent tick at each whole multiple in between.
    if (timeStateFor(next, paused) === timeStateFor(prev, paused)
      && speedDetentIndex(next) !== speedDetentIndex(prev)) {
      hapticSelectionTick();
    }
  };

  const endInteraction = () => {
    useStore.getState().setInteractingWithUI(false);
    hapticSelectionEnd();
  };

  return (
    <div
      className="relative flex-1 min-w-0 md:flex-none md:w-32 lg:w-44 h-11 flex items-center"
      style={{ '--thumb': color } as React.CSSProperties}
    >
      <div className="absolute inset-y-0 left-[9px] right-[9px] pointer-events-none" aria-hidden>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full" style={{ background: TRACK_ZONES }} />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full transition-colors duration-200"
          style={{ left: `${Math.min(ZERO_PCT, at)}%`, width: `${Math.abs(at - ZERO_PCT)}%`, backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
        />
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-4 rounded-full bg-white/70" style={{ left: `${ZERO_PCT}%` }} />
        <span className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-0.5 h-3 rounded-full bg-nova-gold/80" style={{ left: `${ONE_PCT}%` }} />
      </div>
      <input
        type="range"
        min={PHYSICS_LIMITS.SPEED_MIN}
        max={PHYSICS_LIMITS.SPEED_MAX}
        step="0.1"
        value={speed}
        data-testid="control-speed"
        aria-label="Simulation speed"
        aria-valuetext={state === 'stopped'
          ? TIME_STATE_VISUALS[state].label
          : `${TIME_STATE_VISUALS[state].label}, ${formatSpeedReadout(speed, state)}${resolvingEncounter ? `, currently ${formatSpeedReadout(effectiveSpeed, timeStateFor(effectiveSpeed, false))} while resolving a close encounter` : ''}`}
        onPointerDown={() => {
          useStore.getState().setInteractingWithUI(true);
          hapticSelectionStart();
        }}
        onPointerUp={endInteraction}
        onPointerCancel={endInteraction}
        onChange={handleChange}
        className="speed-slider relative w-full h-11 cursor-pointer"
      />
    </div>
  );
};

export const ControlBar: React.FC<{ creationMode: BodyType | null, onReturnToMenu: () => void, onUndo: () => void, onRedo: () => void, canUndo: boolean, canRedo: boolean }> = ({ creationMode, onReturnToMenu, onUndo, onRedo, canUndo, canRedo }) => {
  const paused = useStore((s) => s.paused);
  const speed = useStore((s) => s.speed);
  const scientificPacingScale = useStore((s) => s.scientificPacingScale);
  const cameraLockedId = useStore((s) => s.cameraLockedId);
  const selectedId = useStore((s) => s.selectedId);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const showGrid = useStore((s) => s.showGrid);
  const toggleGrid = useStore((s) => s.toggleGrid);
  const showOrbitPaths = useStore((s) => s.showOrbitPaths);
  const toggleOrbitPaths = useStore((s) => s.toggleOrbitPaths);
  const showHabitable = useStore((s) => s.showHabitable);
  const toggleHabitable = useStore((s) => s.toggleHabitable);
  const setPaused = useStore((s) => s.setPaused);
  const setCameraLock = useStore((s) => s.setCameraLock);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const moonParentId = useMoonDraft((s) => s.parentId);
  const [lockWarning, setLockWarning] = useState(false);
  const creationHint = creationMode === 'Moon'
    ? (moonParentId ? 'Drag the moon to shape its orbit' : 'Tap a planet')
    : 'Drag to Launch';

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

  // One classification drives the slider colour, the readout, the transient
  // pill, the reverse-time edge glow and the haptic, so they always agree.
  const timeState = timeStateFor(speed, paused);
  const timeVisual = TIME_STATE_VISUALS[timeState];
  const TimeIcon = TIME_STATE_ICONS[timeState];
  const effectiveSpeed = speed * scientificPacingScale;
  const resolvingEncounter = !paused && Math.abs(speed) > 0.01 && scientificPacingScale < 0.995;
  const lastTimeState = useRef(timeState);
  // Nonce for the transient state pill; 0 hides it. Bumping it (rather than a
  // boolean) restarts both the fade-in and the hide timer on rapid changes.
  const [timeFlash, setTimeFlash] = useState(0);

  useEffect(() => {
    if (lastTimeState.current === timeState) return;
    lastTimeState.current = timeState;
    hapticTimeState(timeState);
    setTimeFlash((n) => n + 1);
  }, [timeState]);

  useEffect(() => {
    if (!timeFlash) return;
    const timer = window.setTimeout(() => setTimeFlash(0), 1400);
    return () => clearTimeout(timer);
  }, [timeFlash]);

  const iconButton = 'touch-target p-1.5 md:p-2 rounded-full transition-colors flex items-center justify-center';
  const toggleButton = (on: boolean) => `${iconButton} ${on ? 'text-nova-gold bg-nova-gold/10' : 'text-pulsar-white/30 hover:text-white hover:bg-white/10'}`;
  const divider = 'hidden md:block h-6 w-px bg-white/10 shrink-0';

  return (
    <>
    {/* Outside the anchor: its -translate-x-1/2 would otherwise become the
        containing block for this fixed overlay. */}
    {timeState === 'reverse' && <div className="reverse-time-glow" data-testid="reverse-time-glow" aria-hidden />}
    <div className="fixed z-40 control-bar-anchor bottom-auto left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 w-[calc(100vw-1rem)] md:w-auto max-w-full">
      {/* Phone (<768px): two rows. The time group is ordered first and spans
          the full width so the slider gets most of the screen; history, view
          and session share the second row. DOM order stays history-first, so
          keyboard order and `button.nth(0)` = undo are unchanged. Desktop is a
          single row in DOM order. */}
      <div className="sim-toolbar bg-[rgba(45,51,64,0.6)] backdrop-blur-md border border-white/10 shadow-2xl rounded-[2rem] px-2 md:px-5 py-2 flex flex-wrap md:flex-nowrap items-center justify-between md:justify-start gap-x-0 gap-y-1 md:gap-3 ring-1 ring-white/5 w-full md:w-auto overflow-visible md:overflow-x-auto md:touch-pan-x scrollbar-hide" data-testid="control-bar">

        {/* History */}
        <div className="flex items-center gap-0 md:gap-1 shrink-0">
          <button onClick={onUndo} disabled={!canUndo} data-testid="control-undo" title="Undo" aria-label="Undo" className={`touch-target p-1.5 md:p-2 rounded-full transition-colors active:scale-90 ${canUndo ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-700 cursor-not-allowed'}`}><RotateCcw size={16} className="md:w-[18px] md:h-[18px]" /></button>
          <button onClick={onRedo} disabled={!canRedo} data-testid="control-redo" title="Redo" aria-label="Redo" className={`touch-target p-1.5 md:p-2 rounded-full transition-colors rotate-180 active:scale-90 ${canRedo ? 'text-slate-400 hover:text-white hover:bg-white/10' : 'text-slate-700 cursor-not-allowed'}`}><RotateCcw size={16} className="md:w-[18px] md:h-[18px]" /></button>
        </div>

        <div className={divider}></div>

        {/* Time */}
        <div className="order-first md:order-none basis-full md:basis-auto flex items-center gap-2 md:gap-3 min-w-0">
          <button onClick={() => setPaused(!paused)} data-testid="control-pause" aria-label={paused ? 'Resume' : 'Pause'} title={paused ? 'Resume' : 'Pause'} className={`touch-target p-1.5 md:p-2 rounded-full transition-colors active:scale-90 shrink-0 ${paused ? 'bg-orange-500/20 text-orange-400' : 'hover:bg-white/10 text-slate-200'}`}>
            {paused ? <Play size={18} className="md:w-[20px] md:h-[20px]" fill="currentColor" /> : <Pause size={18} className="md:w-[20px] md:h-[20px]" fill="currentColor" />}
          </button>
          <TimeScrubber speed={speed} state={timeState} effectiveSpeed={effectiveSpeed} resolvingEncounter={resolvingEncounter} />
          <span
            data-testid="control-speed-readout"
            className="flex flex-col items-end justify-center shrink-0 min-w-[3.75rem] text-[11px] md:text-sm font-mono font-bold tabular-nums transition-colors duration-200 leading-tight"
            style={{ color: timeVisual.color }}
          >
            <span className="flex items-center gap-1 whitespace-nowrap">
              <TimeIcon size={12} className="shrink-0" fill="currentColor" aria-hidden />
              {formatSpeedReadout(speed, timeState)}
              {resolvingEncounter && <> → {formatSpeedReadout(effectiveSpeed, timeStateFor(effectiveSpeed, false))}</>}
            </span>
            {resolvingEncounter && <span className="text-[9px] font-medium opacity-80 whitespace-nowrap">resolving close encounter</span>}
          </span>
        </div>

        <div className={divider}></div>

        {/* View group.
            Set-once preferences (dust, stability) live in the settings sheet
            behind the gear. The grid, orbit estimates and habitable zone are
            the ones people flip constantly to see what is under them, so they
            sit here and stay mirrored in the sheet — both drive the same store
            toggles. Below 390px there is no room for all eight row-two
            buttons at 44px, so the habitable zone drops back to the sheet only. */}
        <div className="flex items-center gap-0 md:gap-1 shrink-0">
          <button
            onClick={toggleGrid}
            data-testid="control-toggle-grid"
            title="Toggle spacetime grid"
            aria-label="Toggle spacetime grid"
            aria-pressed={showGrid}
            className={toggleButton(showGrid)}
          >
            <Hexagon size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <button
            onClick={toggleOrbitPaths}
            data-testid="control-toggle-orbits"
            title="Toggle orbit estimates"
            aria-label="Toggle orbit estimates"
            aria-pressed={showOrbitPaths}
            className={toggleButton(showOrbitPaths)}
          >
            <Orbit size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <button
            onClick={toggleHabitable}
            data-testid="control-toggle-habitable"
            title="Toggle habitable zone"
            aria-label="Toggle habitable zone"
            aria-pressed={showHabitable}
            className={`${toggleButton(showHabitable)} max-[389px]:hidden`}
          >
            <Globe size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <button onClick={handleCameraLock} title="Lock camera to selection" aria-label="Lock camera to selection" className={`${iconButton} ${cameraLockedId ? 'text-nebula-rust bg-nebula-rust/10' : 'text-pulsar-white/30'}`}><Focus size={16} className="md:w-[18px] md:h-[18px]" /></button>
          <button
            onClick={() => setSettingsOpen(true)}
            data-testid="open-settings"
            title="Settings"
            aria-label="Open settings"
            className={toggleButton(settingsOpen)}
          >
            <Settings size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
        </div>

        {onReturnToMenu && (
          <>
            <div className={divider}></div>
            {/* Session */}
            <button onClick={onReturnToMenu} title="Return to Menu" aria-label="Return to Menu" className={`${iconButton} shrink-0 text-slate-400 hover:text-white hover:bg-white/10 active:scale-90`}><Home size={16} className="md:w-[18px] md:h-[18px]" /></button>
          </>
        )}
      </div>
      {timeFlash > 0 && (
        <div
          key={timeFlash}
          role="status"
          data-testid="time-state-pill"
          className="control-bar-hint bg-[rgba(45,51,64,0.6)] backdrop-blur-md border px-3 py-1.5 rounded-xl shadow-2xl ring-1 ring-white/5 flex items-center gap-2 ag-fade-in pointer-events-none"
          style={{ borderColor: `${timeVisual.color}66`, color: timeVisual.color }}
        >
          <TimeIcon size={12} fill="currentColor" aria-hidden />
          <span className="font-bold text-[10px] md:text-xs uppercase tracking-wide whitespace-nowrap">
            {timeVisual.label}
            {timeState !== 'stopped' && <span className="font-mono tabular-nums opacity-80"> · {formatSpeedReadout(speed, timeState)}</span>}
          </span>
        </div>
      )}
      {creationMode && (
        <div
          className="control-bar-hint bg-[rgba(45,51,64,0.6)] backdrop-blur-md border border-white/10 text-pulsar-white px-3 py-1.5 rounded-xl shadow-2xl ring-1 ring-white/5 flex items-center gap-2 ag-fade-in pointer-events-auto"
        >
          <div className="font-bold text-[10px] md:text-xs text-nova-gold uppercase tracking-wide flex items-center gap-1.5 border-r border-white/10 pr-2">
            {creationMode}
          </div>
          <div className="text-[9px] md:text-[11px] font-mono flex items-center gap-1.5 text-pulsar-white/60 whitespace-nowrap">
            <MousePointer2 size={11} className="w-[11px] h-[11px] md:w-[12px] md:h-[12px]" /> {creationHint}
          </div>
        </div>
      )}
      {lockWarning && (
        <p
          role="alert"
          className="control-bar-hint text-[11px] md:text-xs text-nebula-rust bg-nebula-rust/10 border border-nebula-rust/25 px-3 py-1.5 rounded-lg shadow-lg ag-fade-in whitespace-nowrap pointer-events-none"
        >
          An object must be selected first.
        </p>
      )}
    </div>
    </>
  );
};

export const ConfirmationModal = ({
  isOpen,
  onConfirm,
  onCancel,
  title = 'New System',
  message = 'This will generate a new random star system. Current simulation state will be pushed to undo history.',
  confirmLabel = 'Generate',
  danger = false,
}: {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title?: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}) => {
  if (!isOpen) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ag-fade-in"
      role="dialog"
      aria-modal="true"
        aria-labelledby="confirmation-title"
      onClick={onCancel}
    >
      <div
        className="bg-[rgba(16,20,28,0.98)] border border-white/10 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 ring-1 ring-white/5 ag-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="confirmation-title" className="text-lg font-bold text-pulsar-white mb-2 flex items-center gap-2"><AlertTriangle className="text-nebula-rust" size={20} /> {title}</h3>
        <p className="text-pulsar-white/50 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="touch-target min-h-[2.75rem] px-4 py-2.5 rounded-lg text-sm font-medium text-pulsar-white/60 hover:text-pulsar-white hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={() => { onConfirm(); onCancel(); }} className={`touch-target min-h-[2.75rem] px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${danger ? 'bg-red-500/25 text-red-200 border border-red-500/40 hover:bg-red-500/35' : 'bg-nova-gold hover:bg-nova-gold/90 text-void-navy shadow-lg shadow-nova-gold/20'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
};
