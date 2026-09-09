import React, { useState, useEffect, useMemo } from 'react';
import { BodyType } from '../types';
import { useStore } from '../utils/store';
import {
  Play, Pause, RotateCcw, Focus, MousePointer2, Sparkles,
  AlertTriangle, X, ChevronUp, ChevronDown, Home, Settings, Hexagon,
} from 'lucide-react';
import { creatableTypesFor, visualFor } from './bodyTypeVisuals';

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




export const ControlBar: React.FC<{ creationMode: BodyType | null, onReturnToMenu: () => void, onUndo: () => void, onRedo: () => void, canUndo: boolean, canRedo: boolean }> = ({ creationMode, onReturnToMenu, onUndo, onRedo, canUndo, canRedo }) => {
  const paused = useStore((s) => s.paused);
  const speed = useStore((s) => s.speed);
  const cameraLockedId = useStore((s) => s.cameraLockedId);
  const selectedId = useStore((s) => s.selectedId);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const showGrid = useStore((s) => s.showGrid);
  const toggleGrid = useStore((s) => s.toggleGrid);
  const setPaused = useStore((s) => s.setPaused);
  const setSpeed = useStore((s) => s.setSpeed);
  const setCameraLock = useStore((s) => s.setCameraLock);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
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

        {/* View & session group.
            The display toggles (dust / habitable zone / orbit paths /
            stability) used to sit here. They are preferences a user sets a few
            times a session, so they moved into the settings sheet behind the
            gear below. The spacetime grid came back: it is the one people flip
            constantly to see what is under it, and burying it behind the gear
            made that a three-tap round trip. It stays mirrored in the settings
            sheet — both drive the same `toggleGrid`. */}
        <div className="flex items-center gap-0.5 md:gap-2 shrink-0">
          <button
            onClick={toggleGrid}
            data-testid="control-toggle-grid"
            title="Toggle spacetime grid"
            aria-label="Toggle spacetime grid"
            aria-pressed={showGrid}
            className={`touch-target p-1.5 md:p-2 rounded-full transition-colors ${showGrid ? 'text-nova-gold bg-nova-gold/10' : 'text-pulsar-white/30 hover:text-white hover:bg-white/10'}`}
          >
            <Hexagon size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <button onClick={handleCameraLock} title="Lock camera to selection" aria-label="Lock camera to selection" className={`touch-target p-1.5 md:p-2 rounded-full transition-colors ${cameraLockedId ? 'text-nebula-rust bg-nebula-rust/10' : 'text-pulsar-white/30'}`}><Focus size={16} className="md:w-[18px] md:h-[18px]" /></button>
          <button
            onClick={() => setSettingsOpen(true)}
            data-testid="open-settings"
            title="Settings"
            aria-label="Open settings"
            className={`touch-target p-1.5 md:p-2 rounded-full transition-colors ${settingsOpen ? 'text-nova-gold bg-nova-gold/10' : 'text-pulsar-white/30 hover:text-white hover:bg-white/10'}`}
          >
            <Settings size={16} className="md:w-[18px] md:h-[18px]" />
          </button>
          <div className="h-4 md:h-6 w-px bg-white/10 mx-1"></div>
          {onReturnToMenu && (
            <button onClick={onReturnToMenu} title="Return to Menu" aria-label="Return to Menu" className="touch-target p-1.5 md:p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors active:scale-90"><Home size={16} className="md:w-[18px] md:h-[18px]" /></button>
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
