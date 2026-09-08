import React, { useState, useEffect } from 'react';
import { BodyType } from '../types';
import { useStore } from '../utils/store';
import {
  Play, Pause, RotateCcw, Focus, Hexagon, MousePointer2, Sparkles, Globe,
  AlertTriangle, X, ChevronUp, ChevronDown, Home, Activity,
} from 'lucide-react';
import { CREATABLE_TYPES, visualFor } from './bodyTypeVisuals';

/**
 * The Inspector now lives in components/inspector/. Re-exported here so the
 * `from './components/Panels'` import in App.tsx keeps working.
 */
export { InspectorPanel } from './inspector/InspectorPanel';

// --- TOOLBAR ---

export const CreationToolbar: React.FC<{ mode: BodyType | null, setMode: (m: BodyType | null) => void, onTriggerGenerate: () => void, mobileHidden: boolean }> = ({ mode, setMode, onTriggerGenerate, mobileHidden }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  // Icon, colour and label all come from components/bodyTypeVisuals.ts, which
  // is the single definition shared with the outliner. The order is the
  // toolbar's own (stellar → planetary → small bodies).
  const tools = CREATABLE_TYPES.map((id) => {
    const v = visualFor(id);
    return { id, label: v.short, icon: v.icon, color: v.text, bg: v.bg };
  });

  return (
    <>
      <div className={`fixed z-20 pointer-events-none transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] creation-toolbar-anchor left-1/2 -translate-x-1/2 flex flex-col items-center justify-end w-auto max-w-[90vw] pt-2 ${mobileHidden ? 'translate-y-[120%]' : 'translate-y-0'} md:absolute md:left-[max(1rem,var(--safe-left))] md:translate-x-0 md:max-w-[95vw] md:items-start`}>
        <div className={`pointer-events-auto w-auto max-w-full overflow-x-auto md:overflow-visible overscroll-x-contain touch-pan-x scrollbar-hide rounded-full md:rounded-none`}>
          <div className={`bg-[rgba(45,51,64,0.6)] backdrop-blur-xl md:backdrop-blur-md border border-white/10 rounded-full md:rounded-xl shadow-2xl flex flex-row flex-nowrap md:flex-col items-center md:items-stretch md:w-auto md:min-w-[8.75rem] gap-0 md:gap-1.5 md:p-2 ring-1 ring-white/5 ag-fade-in transition-[padding,width,min-width,height] duration-400 ease-[cubic-bezier(0.23,1,0.32,1)] ${isExpanded ? 'w-max min-w-0 py-1.5 pl-3 pr-3 justify-start' : 'w-[4.25rem] h-[4.25rem] min-w-0 p-3 justify-center'}`}>
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
          className="control-bar-hint bg-[rgba(45,51,64,0.6)] backdrop-blur-md border border-white/10 text-pulsar-white px-3 py-1.5 rounded-xl shadow-2xl ring-1 ring-white/5 flex items-center gap-2 ag-fade-in pointer-events-auto"
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
          className="control-bar-hint text-[11px] md:text-xs text-nebula-rust bg-nebula-rust/10 border border-nebula-rust/25 px-3 py-1.5 rounded-lg shadow-lg ag-fade-in whitespace-nowrap pointer-events-none"
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ag-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-generate-title"
      onClick={onCancel}
    >
      <div
        className="bg-[rgba(16,20,28,0.98)] border border-white/10 p-6 rounded-xl shadow-2xl max-w-sm w-full mx-4 ring-1 ring-white/5 ag-fade-in"
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