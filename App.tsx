import React, { useState, useEffect, useCallback } from 'react';
import { CelestialBody, BodyType } from './types';
import SpaceCanvas from './components/SpaceCanvas';
import { InspectorPanel, ControlBar, CreationToolbar, ConfirmationModal } from './components/Panels';
import MainMenu from './components/MainMenu';
import UniverseOutliner from './components/UniverseOutliner';
import ErrorBoundary from './components/ErrorBoundary';
import { getWorld, saveWorld, serializeBodies, markWorldOpened, parseWorldData } from './utils/worldStorage';
import { useStore } from './utils/store';
import { getE2EConfig } from './utils/e2eConfig';
import { markTestBridgeAppReady } from './utils/testBridge';
import { deferDoubleFrame } from './utils/deferFrames';
import { registerBackHandler } from './utils/backNavigation';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { consumeBackPress } from './utils/backNavigation';

const Simulation: React.FC<{ onReturnToMenu: () => void; }> = ({ onReturnToMenu }) => {
  const {
    bodies, setBodies, selectedId, inspectorBodyId, generateNewSystem, selectBody, closeInspector,
    worldId, resetSessionUiState,
  } = useStore();
  const inspectorOpen = useStore(
    (s) => s.inspectorBodyId != null && s.bodies.some((b) => b.id === s.inspectorBodyId),
  );

  const [creationMode, setCreationMode] = useState<BodyType | null>(null);
  const [showConfirmGenerate, setShowConfirmGenerate] = useState(false);
  const [history, setHistory] = useState<CelestialBody[][]>([]);
  const [redoStack, setRedoStack] = useState<CelestialBody[][]>([]);

  const pushToHistory = (currentBodies: CelestialBody[]) => {
    setHistory(prev => [...prev.slice(-19), currentBodies.map(b => ({ ...b, position: b.position.clone(), velocity: b.velocity.clone() }))]);
    setRedoStack([]);
  };

  const storageNotice = useStore((s) => s.storageNotice);
  const setStorageNotice = useStore((s) => s.setStorageNotice);

  const saveCurrentWorld = useCallback(() => {
    const state = useStore.getState();
    if (!state.worldId) return;
    const result = saveWorld({
      id: state.worldId,
      version: 1,
      bodies: serializeBodies(state.bodies),
      settings: {
        speed: state.speed,
        showGrid: state.showGrid,
        showDust: state.showDust,
        showHabitable: state.showHabitable,
        showStability: state.showStability,
      },
    });
    if (result === 'quota') {
      setStorageNotice('Device storage is full — your universe could not be saved.');
    } else if (result === 'error') {
      setStorageNotice('Failed to save universe. Changes may be lost if you leave.');
    }
  }, [setStorageNotice]);

  useEffect(() => {
    const interval = setInterval(saveCurrentWorld, 30000);
    return () => clearInterval(interval);
  }, [saveCurrentWorld]);
  useEffect(() => () => saveCurrentWorld(), [saveCurrentWorld]);

  useEffect(() => {
    if (selectedId && !bodies.some((b) => b.id === selectedId)) {
      selectBody(null);
    }
    if (inspectorBodyId && !bodies.some((b) => b.id === inspectorBodyId)) {
      closeInspector();
    }
  }, [bodies, selectedId, inspectorBodyId, selectBody, closeInspector]);

  const handleUndo = () => { if (history.length === 0) return; const prev = history[history.length - 1]; setRedoStack(p => [...p, bodies.map(b => ({ ...b, position: b.position.clone(), velocity: b.velocity.clone() }))]); setBodies(prev); setHistory(p => p.slice(0, -1)); useStore.setState(s => ({ historyVersion: s.historyVersion + 1 })); };
  const handleRedo = () => { if (redoStack.length === 0) return; const next = redoStack[redoStack.length - 1]; setHistory(p => [...p, bodies.map(b => ({ ...b, position: b.position.clone(), velocity: b.velocity.clone() }))]); setBodies(next); setRedoStack(p => p.slice(0, -1)); useStore.setState(s => ({ historyVersion: s.historyVersion + 1 })); };

  const handleGenerate = () => {
    const snapshot = useStore.getState().bodies.map((b) => ({
      ...b,
      position: b.position.clone(),
      velocity: b.velocity.clone(),
    }));
    pushToHistory(snapshot);
    // Defer one frame so confirmation modal unmount does not race camera snap.
    deferDoubleFrame(() => generateNewSystem());
  };
  const handleReturnToMenu = useCallback(() => {
    if (worldId) {
      saveCurrentWorld();
      markWorldOpened(worldId);
    }
    resetSessionUiState();
    onReturnToMenu();
  }, [worldId, saveCurrentWorld, resetSessionUiState, onReturnToMenu]);

  useEffect(() => {
    return registerBackHandler(() => {
      if (storageNotice) {
        setStorageNotice(null);
        return true;
      }
      if (showConfirmGenerate) {
        setShowConfirmGenerate(false);
        return true;
      }
      if (creationMode) {
        setCreationMode(null);
        return true;
      }
      const state = useStore.getState();
      const inspectorOpen =
        state.inspectorBodyId != null &&
        state.bodies.some((b) => b.id === state.inspectorBodyId);
      if (inspectorOpen) {
        state.closeInspector();
        state.selectBody(null);
        return true;
      }
      if (state.selectedId) {
        state.selectBody(null);
        return true;
      }
      handleReturnToMenu();
      return true;
    });
  }, [
    storageNotice,
    showConfirmGenerate,
    creationMode,
    handleReturnToMenu,
    setStorageNotice,
  ]);

  return (
    <div className={`sim-shell bg-void-navy text-pulsar-white font-sans select-none${inspectorOpen ? ' inspector-open' : ''}`} data-testid="simulation-root">
      <div className="absolute inset-0 z-0">
        <SpaceCanvas
          creationMode={creationMode}
          setCreationMode={setCreationMode}
          onBodyCreate={(snapshot: CelestialBody[]) => pushToHistory(snapshot)}
        />
      </div>
      {storageNotice && (
        <div
          role="alert"
          className="pointer-events-auto fixed z-50 left-1/2 -translate-x-1/2 bottom-[max(1.25rem,env(safe-area-inset-bottom))] w-[min(92vw,28rem)] bg-nebula-rust/15 border border-nebula-rust/40 text-pulsar-white px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-start gap-3"
        >
          <p className="text-sm flex-1 leading-snug">{storageNotice}</p>
          <button
            type="button"
            onClick={() => setStorageNotice(null)}
            className="touch-target shrink-0 text-xs font-bold uppercase tracking-wide text-pulsar-white/70 hover:text-pulsar-white"
          >
            Dismiss
          </button>
        </div>
      )}
      <div className="absolute inset-0 z-10 pointer-events-none safe-pad">
        <div className="pointer-events-auto"><CreationToolbar mode={creationMode} setMode={setCreationMode} onTriggerGenerate={() => setShowConfirmGenerate(true)} mobileHidden={inspectorOpen} /></div>
        {!inspectorOpen && (
          <div className="pointer-events-auto"><UniverseOutliner /></div>
        )}
        <div className="pointer-events-auto"><InspectorPanel /></div>
        <div className="pointer-events-auto">
          <ControlBar
            creationMode={creationMode}
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
  const e2eConfig = getE2EConfig();
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
  const [e2eBootstrapping, setE2eBootstrapping] = useState(
    e2eConfig.enabled && !!e2eConfig.fixture,
  );
  const { loadWorld, setBodies, generateNewSystem, loadRealSystem, resetSessionUiState } = useStore();

  useEffect(() => {
    if (!e2eConfig.enabled || !e2eConfig.fixture) {
      markTestBridgeAppReady();
      return;
    }

    let cancelled = false;
    const fixtureName = e2eConfig.fixture;

    // `preset:<id>` loads a real system straight from content/realSystems.ts
    // rather than a JSON fixture, so the perf suite can measure the heaviest
    // scene the app actually ships with.
    if (fixtureName.startsWith('preset:')) {
      const presetId = fixtureName.slice('preset:'.length);
      setActiveWorldId(`e2e-${presetId}`);
      loadRealSystem(presetId);
      markTestBridgeAppReady();
      setE2eBootstrapping(false);
      return;
    }

    fetch(`./e2e/fixtures/${fixtureName}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`Fixture not found: ${fixtureName}`);
        return res.json();
      })
      .then((raw) => {
        if (cancelled) return;
        const world = parseWorldData(raw);
        if (!world) throw new Error(`Invalid fixture: ${fixtureName}`);
        loadWorld(world);
        setActiveWorldId(world.id);
      })
      .catch((err) => {
        console.error('[e2e bootstrap]', err);
      })
      .finally(() => {
        if (cancelled) return;
        markTestBridgeAppReady();
        setE2eBootstrapping(false);
      });

    return () => {
      cancelled = true;
    };
  }, [e2eConfig.enabled, e2eConfig.fixture, loadWorld]);

  // Mobile/Capacitor initialization
  useEffect(() => {
    const initMobile = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          // Configure status bar
          await StatusBar.setStyle({ style: Style.Dark });
          await StatusBar.setBackgroundColor({ color: '#10141C' });

          // Hide splash screen after app is ready
          await SplashScreen.hide();
        } catch (error) {
          console.warn('Mobile initialization error:', error);
        }
      }
    };

    const preventGesture = (e: Event) => e.preventDefault();

    initMobile();
    // iOS Safari proprietary gesture events (two-finger pinch/rotate chrome layer)
    document.addEventListener('gesturestart', preventGesture);
    document.addEventListener('gesturechange', preventGesture);
    document.addEventListener('gestureend', preventGesture);

    return () => {
      document.removeEventListener('gesturestart', preventGesture);
      document.removeEventListener('gesturechange', preventGesture);
      document.removeEventListener('gestureend', preventGesture);
    };
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listener: { remove: () => Promise<void> } | undefined;
    void CapApp.addListener('backButton', () => {
      if (consumeBackPress()) return;
      void CapApp.exitApp();
    }).then((handle) => {
      listener = handle;
    });

    return () => {
      void listener?.remove();
    };
  }, []);

  const handleOpenWorld = (id: string) => {
    const data = getWorld(id);
    if (data) {
      markWorldOpened(id);
      loadWorld(data);
      setActiveWorldId(id);
    }
  };

  const handleCreateWorld = (id: string, presetId?: string) => {
    const data = getWorld(id);
    if (!data) return;
    loadWorld(data);
    setActiveWorldId(id);
    // Mount Simulation first, then populate so CameraRecenter runs with live controls.
    if (data.bodies.length === 0) {
      deferDoubleFrame(() => {
        if (presetId) loadRealSystem(presetId);
        else generateNewSystem();
      });
    }
  };

  const handleReturnToMenu = () => {
    resetSessionUiState();
    setActiveWorldId(null);
    setBodies([]);
  };

  if (e2eBootstrapping) {
    return (
      <div
        data-testid="e2e-loading"
        className="h-dvh flex items-center justify-center bg-void-navy text-pulsar-white/50 text-sm"
      >
        Loading test fixture…
      </div>
    );
  }

  if (!activeWorldId) {
    return (
      <ErrorBoundary label="Main Menu" onReset={handleReturnToMenu}>
        <MainMenu onOpenWorld={handleOpenWorld} onCreateWorld={handleCreateWorld} />
      </ErrorBoundary>
    );
  }
  return (
    <ErrorBoundary label="Simulation" onReset={handleReturnToMenu}>
      <Simulation onReturnToMenu={handleReturnToMenu} />
    </ErrorBoundary>
  );
};

export default App;