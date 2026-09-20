import { acquireWorld, mutateArchive, type WorldLease } from './utils/worldOwnership';
import { manageNativeListener, reportDiagnostic } from './utils/diagnostics';
import { captureSimulationSnapshot, type SimulationSnapshot } from './utils/simulationSnapshot';
import React, { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import { CelestialBody, BodyType } from './types';
import { InspectorPanel, ControlBar, CreationToolbar, ConfirmationModal } from './components/Panels';
import MainMenu from './components/MainMenu';
import UniverseOutliner from './components/UniverseOutliner';
import MoonCreatorPanel from './components/MoonCreatorPanel';
import { pickMoonParent, useMoonDraft } from './utils/moonDraft';
import ErrorBoundary from './components/ErrorBoundary';
import WebGL2RequiredScreen from './components/WebGL2RequiredScreen';
import { isWebGL2Available } from './utils/webgl2Support';
import {
  CURRENT_WORLD_VERSION,
  getWorld,
  saveWorld,
  serializeBodies,
  markWorldOpened,
  parseWorldData,
  type SaveWorldResult,
} from './utils/worldStorage';
import { useStore, detentBelow } from './utils/store';
import { BREAKPOINTS, useBreakpoint } from './components/hooks/useMediaQuery';
import { getE2EConfig } from './utils/e2eConfig';
import { markTestBridgeAppReady } from './utils/testBridge';
import { deferDoubleFrame } from './utils/deferFrames';
import { registerBackHandler, resolveSimBackAction } from './utils/backNavigation';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { consumeBackPress } from './utils/backNavigation';
import LiveHelper from './components/LiveHelper';
import { getPhysicsBodiesSnapshot } from './utils/physicsBridge';
import { getSimTime } from './utils/physicsSoA';
import SettingsPanel from './components/SettingsPanel';
import {
  enqueueUnseenHelpers, getOnboardingProgress, helperDefinition, markHelperSeen,
  type HelperId, type HelperTrigger, type QueuedHelper,
} from './utils/onboarding';
import { StorageOperationError, storageIssueMessage, subscribeStorageIssues } from './utils/browserStorage';

// The simulation renderer (shaders, physics visuals) is the bulk of the app
// bundle; loading it on demand keeps the main menu's cold start light.
const SpaceCanvas = lazy(() => import('./components/SpaceCanvas'));

const StorageNotice: React.FC = () => {
  const notice = useStore((state) => state.storageNotice);
  const setNotice = useStore((state) => state.setStorageNotice);
  if (!notice) return null;
  return (
    <div
      role="alert"
      className="pointer-events-auto fixed z-[160] left-1/2 -translate-x-1/2 bottom-[max(1.25rem,env(safe-area-inset-bottom))] w-[min(92vw,32rem)] bg-nebula-rust/15 border border-nebula-rust/40 text-pulsar-white px-4 py-3 rounded-xl shadow-2xl backdrop-blur-md flex items-start gap-3"
    >
      <p className="text-sm flex-1 leading-snug">{notice}</p>
      <button
        type="button"
        onClick={() => setNotice(null)}
        className="touch-target shrink-0 text-xs font-bold uppercase tracking-wide text-pulsar-white/70 hover:text-pulsar-white"
      >
        Dismiss
      </button>
    </div>
  );
};

const Simulation: React.FC<{ onReturnToMenu: () => void; }> = ({ onReturnToMenu }) => {
  const worldReadOnly = useStore(s => s.worldReadOnly);
  const bodies = useStore((s) => s.bodies);
  const selectedId = useStore((s) => s.selectedId);
  const inspectorBodyId = useStore((s) => s.inspectorBodyId);
  const generateNewSystem = useStore((s) => s.generateNewSystem);
  const selectBody = useStore((s) => s.selectBody);
  const closeInspector = useStore((s) => s.closeInspector);
  const worldId = useStore((s) => s.worldId);
  const resetSessionUiState = useStore((s) => s.resetSessionUiState);
  const inspectorOpen = useStore(
    (s) => s.inspectorBodyId != null && s.bodies.some((b) => b.id === s.inspectorBodyId),
  );
  const outlinerOpen = useStore((s) => s.outlinerOpen);
  const breakpoint = useBreakpoint();
  const isPhone = breakpoint === 'phone';

  const [creationMode, setCreationMode] = useState<BodyType | null>(null);
  const [showConfirmGenerate, setShowConfirmGenerate] = useState(false);
  const [history, setHistory] = useState<SimulationSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<SimulationSnapshot[]>([]);
  const seenHelpersRef = useRef(new Set<HelperId>(getOnboardingProgress().seenHelperIds));
  const [helperQueue, setHelperQueue] = useState<QueuedHelper[]>([]);

  const enqueueHelperTrigger = useCallback((trigger: HelperTrigger) => {
    setHelperQueue((queue) => enqueueUnseenHelpers(queue, trigger, [...seenHelpersRef.current]));
  }, []);
  const handleOutlinerInteract = useCallback(
    () => enqueueHelperTrigger({ kind: 'outliner-interaction' }),
    [enqueueHelperTrigger],
  );
  const handleInspectorOpen = useCallback(
    (body: CelestialBody) => enqueueHelperTrigger({ kind: 'inspector-open', body }),
    [enqueueHelperTrigger],
  );
  const handleInspectorTabVisit = useCallback(
    (tab: 'orbit' | 'analysis') => enqueueHelperTrigger({ kind: 'inspector-tab', tab }),
    [enqueueHelperTrigger],
  );

  const acknowledgeHelper = useCallback(() => {
    setHelperQueue((queue) => {
      const [current, ...remaining] = queue;
      if (current) {
        seenHelpersRef.current.add(current.id);
        markHelperSeen(current.id);
      }
      return remaining;
    });
  }, []);

  const activeHelper = useMemo(
    () => helperQueue[0] ? helperDefinition(helperQueue[0], bodies) : null,
    [helperQueue, bodies],
  );

  useEffect(() => {
    if (creationMode) enqueueHelperTrigger({ kind: 'creation-mode', mode: creationMode });
  }, [creationMode, enqueueHelperTrigger]);

  // The grid explainer: on the grid's first switch-on. The grid starts on, so
  // body creation below also queues it (after the body's lesson) while the
  // grid is visible.
  const showGrid = useStore((s) => s.showGrid);
  const previousShowGrid = useRef(showGrid);
  useEffect(() => {
    if (showGrid && !previousShowGrid.current) enqueueHelperTrigger({ kind: 'grid-visible' });
    previousShowGrid.current = showGrid;
  }, [showGrid, enqueueHelperTrigger]);

  const moonMode = creationMode === 'Moon';

  /**
   * Moon mode session. The draft starts fresh (new mass variate), an eligible
   * selection becomes the parent immediately, and the camera follows the chosen
   * parent so the preview ring stays on screen while it orbits. The previous
   * camera lock is restored on the way out.
   */
  useEffect(() => {
    if (!moonMode) return;
    const store = useStore.getState();
    const previousLock = store.cameraLockedId;
    // Below desktop the inspector sits where the moon card goes; on phone the
    // outliner shares the bottom edge with the moon sheet.
    if (window.matchMedia(`(max-width: ${BREAKPOINTS.tablet}px)`).matches) store.closeInspector();
    if (window.matchMedia(`(max-width: ${BREAKPOINTS.phone}px)`).matches) store.setOutlinerOpen(false);

    useMoonDraft.getState().begin();
    if (store.selectedId) pickMoonParent(store.selectedId, { silent: true });

    const follow = (id: string | null) => { if (id) useStore.getState().setCameraLock(id); };
    follow(useMoonDraft.getState().parentId);
    const unsubscribe = useMoonDraft.subscribe((s, prev) => {
      if (s.parentId !== prev.parentId) follow(s.parentId);
    });
    return () => {
      unsubscribe();
      useMoonDraft.getState().reset();
      const { bodies, setCameraLock } = useStore.getState();
      setCameraLock(previousLock && bodies.some((b) => b.id === previousLock) ? previousLock : null);
    };
  }, [moonMode]);

  const pushToHistory = (snapshot: SimulationSnapshot) => {
    setHistory(prev => [...prev.slice(-19), snapshot]);
    setRedoStack([]);
  };

  const handleBodyCreate = (snapshot: SimulationSnapshot, createdBody: CelestialBody) => {
    pushToHistory(snapshot);
    enqueueHelperTrigger({ kind: 'body-created', body: createdBody, gridVisible: useStore.getState().showGrid });
  };

  const storageNotice = useStore((s) => s.storageNotice);
  const setStorageNotice = useStore((s) => s.setStorageNotice);
  const [showLeaveWithoutSaving, setShowLeaveWithoutSaving] = useState(false);
  const skipUnmountSaveRef = useRef(false);

  const saveCurrentWorld = useCallback((): SaveWorldResult => {
    const state = useStore.getState();
    if (!state.worldId || state.worldReadOnly) return 'ok';
    const physicsBodies = getPhysicsBodiesSnapshot(state.bodies);
    let savedBodies;
    try { savedBodies = serializeBodies(physicsBodies); }
    catch (error) {
      if (!(error instanceof StorageOperationError)) throw error;
      setStorageNotice('This universe exceeds the supported save limits. Its previous save was preserved.');
      return 'error';
    }
    const result = saveWorld({
      id: state.worldId,
      version: CURRENT_WORLD_VERSION,
      bodies: savedBodies,
      settings: {
        simTime: getSimTime(),
        speed: state.speed,
        showGrid: state.showGrid,
        showDust: state.showDust,
        showHabitable: state.showHabitable,
        showStability: state.showStability,
        showOrbitPaths: state.showOrbitPaths,
      },
    });
    if (result === 'quota') {
      setStorageNotice('Device storage is full — your universe could not be saved.');
    } else if (result === 'error') {
      setStorageNotice('Failed to save universe. Changes may be lost if you leave.');
    } else if (result === 'conflict') {
      setStorageNotice('This universe changed in another tab. Saving was stopped to avoid overwriting it.');
    }
    return result;
  }, [setStorageNotice]);

  useEffect(() => {
    const interval = setInterval(saveCurrentWorld, 30000);
    return () => clearInterval(interval);
  }, [saveCurrentWorld]);
  useEffect(() => () => {
    if (!skipUnmountSaveRef.current) saveCurrentWorld();
  }, [saveCurrentWorld]);

  useEffect(() => {
    const saveWhenHidden = () => {
      if (document.visibilityState === 'hidden') saveCurrentWorld();
    };
    const saveOnPageHide = () => { saveCurrentWorld(); };
    document.addEventListener('visibilitychange', saveWhenHidden);
    window.addEventListener('pagehide', saveOnPageHide);

    let disposeNative = () => {};
    if (Capacitor.isNativePlatform()) {
      disposeNative = manageNativeListener(CapApp.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) saveCurrentWorld();
      }));
    }
    return () => {
      document.removeEventListener('visibilitychange', saveWhenHidden);
      window.removeEventListener('pagehide', saveOnPageHide);
      disposeNative();
    };
  }, [saveCurrentWorld]);

  useEffect(() => {
    if (selectedId && !bodies.some((b) => b.id === selectedId)) {
      selectBody(null);
    }
    if (inspectorBodyId && !bodies.some((b) => b.id === inspectorBodyId)) {
      closeInspector();
    }
  }, [bodies, selectedId, inspectorBodyId, selectBody, closeInspector]);

  const handleUndo = () => {
    if (worldReadOnly || !history.length) return;
    setRedoStack(prev => [...prev, captureSimulationSnapshot(useStore.getState().bodies)]);
    useStore.getState().restoreSimulation(history[history.length - 1]);
    setHistory(prev => prev.slice(0, -1));
  };
  const handleRedo = () => {
    if (worldReadOnly || !redoStack.length) return;
    setHistory(prev => [...prev.slice(-19), captureSimulationSnapshot(useStore.getState().bodies)]);
    useStore.getState().restoreSimulation(redoStack[redoStack.length - 1]);
    setRedoStack(prev => prev.slice(0, -1));
  };
  const handleGenerate = () => {
    deferDoubleFrame(() => {
      pushToHistory(captureSimulationSnapshot(useStore.getState().bodies));
      generateNewSystem();
    });
  };
  const handleReturnToMenu = useCallback(() => {
    if (worldId) {
      const result = saveCurrentWorld();
      if (result !== 'ok') {
        setShowLeaveWithoutSaving(true);
        return;
      }
    }
    resetSessionUiState();
    onReturnToMenu();
  }, [worldId, saveCurrentWorld, resetSessionUiState, onReturnToMenu]);

  const leaveWithoutSaving = useCallback(() => {
    skipUnmountSaveRef.current = true;
    resetSessionUiState();
    onReturnToMenu();
  }, [resetSessionUiState, onReturnToMenu]);

  useEffect(() => {
    return registerBackHandler(() => {
      const state = useStore.getState();
      const action = resolveSimBackAction({
        storageNotice: !!storageNotice,
        confirmOpen: showConfirmGenerate || showLeaveWithoutSaving,
        settingsOpen: state.settingsOpen,
        helperOpen: helperQueue.length > 0,
        creationMode: !!creationMode,
        isPhone: window.matchMedia(`(max-width: ${BREAKPOINTS.phone}px)`).matches,
        inspectorOpen:
          state.inspectorBodyId != null &&
          state.bodies.some((b) => b.id === state.inspectorBodyId),
        inspectorDetent: state.inspectorDetent,
        outlinerOpen: state.outlinerOpen,
        hasSelection: !!state.selectedId,
      });

      switch (action) {
        case 'dismissNotice': setStorageNotice(null); return true;
        case 'cancelConfirm':
          if (showLeaveWithoutSaving) setShowLeaveWithoutSaving(false);
          else setShowConfirmGenerate(false);
          return true;
        case 'closeSettings': state.setSettingsOpen(false); return true;
        case 'dismissHelper': acknowledgeHelper(); return true;
        case 'exitCreationMode': setCreationMode(null); return true;
        case 'collapseInspector': {
          const below = detentBelow(state.inspectorDetent);
          if (below) state.setInspectorDetent(below);
          return true;
        }
        case 'closeOutliner': state.setOutlinerOpen(false); return true;
        case 'closeInspector':
          state.closeInspector();
          state.selectBody(null);
          return true;
        case 'clearSelection': state.selectBody(null); return true;
        case 'returnToMenu': handleReturnToMenu(); return true;
      }
    });
  }, [
    storageNotice,
    showConfirmGenerate,
    showLeaveWithoutSaving,
    creationMode,
    helperQueue.length,
    acknowledgeHelper,
    handleReturnToMenu,
    setStorageNotice,
  ]);

  return (
    <div
      className={[
        'sim-shell bg-void-navy text-pulsar-white font-sans select-none',
        inspectorOpen ? 'inspector-open' : '',
        // The rail classes only do anything inside the >=1280 media query, so
        // they are safe to set at every width.
        inspectorOpen ? 'rail-right-open' : '',
        outlinerOpen ? 'rail-left-open' : '',
        moonMode ? 'moon-creating' : '',
      ].filter(Boolean).join(' ')}
      data-testid="simulation-root"
      data-breakpoint={breakpoint}
    >
      {/* Inset by the docked rails so the WebGL surface is never occluded.
          index.css pins `transition: none` here on purpose: each width change
          reallocates the framebuffer, so it must happen once per toggle rather
          than once per animation frame. */}
      <div
        className="canvas-viewport absolute inset-y-0 z-0"
        style={{ left: 'var(--rail-left)', right: 'var(--rail-right)' }}
      >
        {/* Code-split so the main menu starts without parsing the simulation.
            The fallback matches the canvas clear colour, so there is no flash. */}
        <Suspense fallback={<div className="absolute inset-0 bg-[#050505]" />}>
          <SpaceCanvas
            creationMode={creationMode}
            setCreationMode={setCreationMode}
            onBodyCreate={handleBodyCreate}
          />
        </Suspense>
        {activeHelper && <LiveHelper helper={activeHelper} onAcknowledge={acknowledgeHelper} />}
      </div>
      <div className="absolute inset-0 z-10 pointer-events-none safe-pad">
        <div className="pointer-events-auto">
          {!worldReadOnly && <CreationToolbar
            mode={creationMode}
            setMode={setCreationMode}
            onTriggerGenerate={() => setShowConfirmGenerate(true)}
            mobileHidden={isPhone && (inspectorOpen || outlinerOpen || moonMode)}
          />}
        </div>
        {moonMode && (
          <div className="pointer-events-auto">
            <MoonCreatorPanel
              onCreated={handleBodyCreate}
              onCancel={() => setCreationMode(null)}
              onSwitchMode={setCreationMode}
            />
          </div>
        )}
        {/* The outliner stays mounted alongside the inspector now. On phone the
            two are mutually exclusive presentations of the bottom edge, which
            the store actions enforce. */}
        <div className="pointer-events-auto">
          <UniverseOutliner onInteract={handleOutlinerInteract} />
        </div>
        <div className="pointer-events-auto">
          <InspectorPanel
            onOpen={handleInspectorOpen}
            onTabVisit={handleInspectorTabVisit}
          />
        </div>
        <div className="pointer-events-auto">
          <ControlBar
            creationMode={creationMode}
            onUndo={handleUndo} onRedo={handleRedo} canUndo={!worldReadOnly && history.length > 0} canRedo={!worldReadOnly && redoStack.length > 0}
            onReturnToMenu={handleReturnToMenu}
          />
        </div>
      </div>
      <ConfirmationModal isOpen={showConfirmGenerate} onConfirm={handleGenerate} onCancel={() => setShowConfirmGenerate(false)} />
      <ConfirmationModal
        isOpen={showLeaveWithoutSaving}
        onConfirm={leaveWithoutSaving}
        onCancel={() => setShowLeaveWithoutSaving(false)}
        title="Leave without saving?"
        message="The latest changes could not be saved. Leaving now will permanently discard those unsaved changes."
        confirmLabel="Leave without saving"
        danger
      />
      {/* Renders nothing until opened; reads `settingsOpen` from the store so
          the control-bar gear and the Android back handler share one source. */}
      {worldReadOnly && <div role="status" className="fixed top-2 left-1/2 -translate-x-1/2 z-[160] bg-void-navy text-pulsar-white p-3 rounded-lg text-sm">
        Read-only universe. Close other editing tabs, then return to the menu and reopen to edit. A browser with storage locks is required.
      </div>}
      <SettingsPanel />
    </div>
  );
};

const App: React.FC = () => {
  const e2eConfig = getE2EConfig();
  const [activeWorldId, setActiveWorldId] = useState<string | null>(null);
  const [e2eBootstrapping, setE2eBootstrapping] = useState(
    e2eConfig.enabled && !!e2eConfig.fixture,
  );
  const [webgl2Ok] = useState(() => isWebGL2Available());
  const loadWorld = useStore((s) => s.loadWorld);
  const setBodies = useStore((s) => s.setBodies);
  const generateNewSystem = useStore((s) => s.generateNewSystem);
  const loadRealSystem = useStore((s) => s.loadRealSystem);
  const resetSessionUiState = useStore((s) => s.resetSessionUiState);
  const setStorageNotice = useStore((s) => s.setStorageNotice);

  useEffect(() => subscribeStorageIssues((issue) => {
    setStorageNotice(storageIssueMessage(issue));
  }), [setStorageNotice]);

  useEffect(() => {
    if (!import.meta.env.DEV || !e2eConfig.enabled || !e2eConfig.fixture) {
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
          /**
           * Lay the WebView out behind the status bar.
           *
           * This is what makes `env(safe-area-inset-*)` — and therefore the
           * --safe-* variables the whole HUD is positioned against — report
           * anything at all. It pairs with the SHORT_EDGES cutout mode set in
           * MainActivity.java; on targetSdk 36 edge-to-edge is force-enabled
           * anyway, so declaring it here is the honest description of what the
           * window is already doing. Must come before setStyle: some OEM builds
           * clobber the style when the overlay flag flips after it.
           *
           * Caveat that the CSS depends on: Chromium derives the insets from the
           * display *cutout*, not from the system bars. A notchless phone reports
           * --safe-top: 0 while its status bar still overlays us, and
           * --safe-bottom is 0 even with a gesture bar. The max(..., floor)
           * fallbacks in index.css cover those cases and are not optional.
           */
          await StatusBar.setOverlaysWebView({ overlay: true });

          await StatusBar.setStyle({ style: Style.Dark });
          // No-op under overlay:true on targetSdk 36 (edge-to-edge ignores the
          // status-bar colour). Kept, and kept consistent with the theme-color
          // meta and capacitor.config.ts, for any future non-overlay path.
          await StatusBar.setBackgroundColor({ color: '#10141C' });

          // Hide splash screen after app is ready
          await SplashScreen.hide();
        } catch (error) {
          reportDiagnostic('native-init-failed', error);
        }
      }
    };


    initMobile();
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    return manageNativeListener(CapApp.addListener('backButton', () => {
      if (consumeBackPress()) return;
      void CapApp.exitApp().catch(error => reportDiagnostic('native-exit-failed', error));
    }));
  }, []);

  const leaseRef = useRef<WorldLease | null>(null);
  const openSequence = useRef(0);
  useEffect(() => () => { openSequence.current++; leaseRef.current?.release(); }, []);
  const openWorld = async (id: string, presetId?: string, populate = false) => {
    const sequence = ++openSequence.current;
    const lease = await acquireWorld(id);
    if (sequence !== openSequence.current) { lease.release(); return; }
    const data = getWorld(id, lease.writable);
    if (!data) { lease.release(); return; }
    leaseRef.current?.release();
    leaseRef.current = lease;
    loadWorld(data);
    useStore.setState({ worldReadOnly: !lease.writable, paused: !lease.writable });
    setActiveWorldId(id);
    if (lease.writable) void mutateArchive(() => markWorldOpened(id)).catch(() => {
      setStorageNotice('The universe opened, but its last-opened time could not be saved.');
    });
    if (populate && lease.writable && data.bodies.length === 0) deferDoubleFrame(() => {
      if (sequence !== openSequence.current) return;
      if (presetId) loadRealSystem(presetId);
      else generateNewSystem();
    });
  };
  const handleOpenWorld = (id: string) => { void openWorld(id); };
  const handleCreateWorld = (id: string, presetId?: string) => { void openWorld(id, presetId, true); };

  const handleReturnToMenu = () => {
    openSequence.current++;
    leaseRef.current?.release();
    leaseRef.current = null;
    resetSessionUiState();
    setActiveWorldId(null);
    setBodies([]);
  };

  if (!webgl2Ok) {
    return <WebGL2RequiredScreen />;
  }

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
      <>
        <ErrorBoundary label="Main Menu" onReset={handleReturnToMenu}>
          <MainMenu onOpenWorld={handleOpenWorld} onCreateWorld={handleCreateWorld} />
        </ErrorBoundary>
        <StorageNotice />
      </>
    );
  }
  return (
    <>
      <ErrorBoundary label="Simulation" onReset={handleReturnToMenu}>
        <Simulation onReturnToMenu={handleReturnToMenu} />
      </ErrorBoundary>
      <StorageNotice />
    </>
  );
};

export default App;
