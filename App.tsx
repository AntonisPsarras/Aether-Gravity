import React, { useState, useEffect, useCallback, useRef } from 'react';
import { CelestialBody, BodyType, WorldData } from './types';
import SpaceCanvas from './components/SpaceCanvas';
import { InspectorPanel, ControlBar, CreationToolbar, ConfirmationModal } from './components/Panels';
import MainMenu from './components/MainMenu';
import UniverseOutliner from './components/UniverseOutliner';
import { getWorld, saveWorld, serializeBodies, markWorldOpened } from './utils/worldStorage';
import { useStore } from './utils/store';

const Simulation: React.FC<{ onReturnToMenu: () => void; }> = ({ onReturnToMenu }) => {
  const {
    bodies, setBodies, selectedId, generateNewSystem, selectBody, worldId, speed, showGrid, showDust, showHabitable, showStability
  } = useStore();

  const [creationMode, setCreationMode] = useState<BodyType | null>(null);
  const [showConfirmGenerate, setShowConfirmGenerate] = useState(false);
  const [history, setHistory] = useState<CelestialBody[][]>([]);
  const [redoStack, setRedoStack] = useState<CelestialBody[][]>([]);

  const pushToHistory = (currentBodies: CelestialBody[]) => {
    setHistory(prev => [...prev.slice(-19), currentBodies.map(b => ({ ...b, position: b.position.clone(), velocity: b.velocity.clone() }))]);
    setRedoStack([]);
  };

  const saveCurrentWorld = useCallback(() => {
    if (worldId) {
      saveWorld({
        id: worldId,
        version: 1,
        bodies: serializeBodies(bodies),
        settings: { speed, showGrid, showDust, showHabitable, showStability }
      });
    }
  }, [worldId, bodies, speed, showGrid, showDust, showHabitable, showStability]);

  useEffect(() => { const interval = setInterval(saveCurrentWorld, 30000); return () => clearInterval(interval); }, [saveCurrentWorld]);
  useEffect(() => { return () => { saveCurrentWorld(); }; }, [saveCurrentWorld]);

  const handleUndo = () => { if (history.length === 0) return; const prev = history[history.length - 1]; setRedoStack(p => [...p, bodies.map(b => ({ ...b, position: b.position.clone(), velocity: b.velocity.clone() }))]); setBodies(prev); setHistory(p => p.slice(0, -1)); useStore.setState(s => ({ historyVersion: s.historyVersion + 1 })); };
  const handleRedo = () => { if (redoStack.length === 0) return; const next = redoStack[redoStack.length - 1]; setHistory(p => [...p, bodies.map(b => ({ ...b, position: b.position.clone(), velocity: b.velocity.clone() }))]); setBodies(next); setRedoStack(p => p.slice(0, -1)); useStore.setState(s => ({ historyVersion: s.historyVersion + 1 })); };

  const handleGenerate = () => { pushToHistory(bodies); generateNewSystem(); };
  const handleReturnToMenu = () => { if (worldId) { saveCurrentWorld(); markWorldOpened(worldId); } onReturnToMenu(); };

  return (
    <div className="w-full h-full relative bg-black text-white font-sans overflow-hidden select-none">
      <div className="absolute inset-0 z-0">
        <SpaceCanvas
          creationMode={creationMode}
          setCreationMode={setCreationMode}
          onBodyCreate={() => pushToHistory(bodies)}
        />
      </div>
      <div className="absolute inset-0 z-10 pointer-events-none">
        <div className="absolute top-6 left-1/2 -translate-x-1/2 pointer-events-auto opacity-50 md:opacity-100 mix-blend-difference hidden md:block">
          <h1 className="text-lg md:text-2xl font-bold tracking-[0.2em] md:tracking-[0.3em] text-cyan-50/40 uppercase drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">Aether</h1>
        </div>
        <div className="pointer-events-auto"><CreationToolbar mode={creationMode} setMode={setCreationMode} onTriggerGenerate={() => setShowConfirmGenerate(true)} mobileHidden={!!selectedId} /></div>
        <div className="pointer-events-auto"><UniverseOutliner /></div>
        <div className="pointer-events-auto"><InspectorPanel /></div>
        <div className="pointer-events-auto">
          <ControlBar
            onUndo={handleUndo} onRedo={handleRedo} canUndo={history.length > 0} canRedo={redoStack.length > 0}
            onReturnToMenu={handleReturnToMenu}
          />
        </div>
      </div>
      <ConfirmationModal isOpen={showConfirmGenerate} onConfirm={handleGenerate} onCancel={() => setShowConfirmGenerate(false)} />
    </div>
  );
};

const App: React.FC = () => {
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
  const { loadWorld, setBodies, generateNewSystem } = useStore();

  const handleOpenWorld = (id: string) => {
    const data = getWorld(id);
    if (data) {
      markWorldOpened(id);
      loadWorld(data);
      setActiveWorldId(id);
    }
  };

  const handleCreateWorld = (id: string) => {
    const data = getWorld(id);
    if (data) {
      loadWorld(data);
      // If empty (new), gen system
      if (data.bodies.length === 0) generateNewSystem();
      setActiveWorldId(id);
    }
  };

  const handleReturnToMenu = () => { setActiveWorldId(null); setBodies([]); };

  if (!activeWorldId) return <MainMenu onOpenWorld={handleOpenWorld} onCreateWorld={handleCreateWorld} />;
  return <Simulation onReturnToMenu={handleReturnToMenu} />;
};

export default App;