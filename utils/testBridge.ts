import { G_CONSTANT } from '../constants';
import type { CelestialBody, WorldData } from '../types';
import { getE2EConfig, isE2EMode } from './e2eConfig';
import { getPhysicsBodiesSnapshot } from './physicsBridge';
import { getRenderSnapshot, type RenderSnapshot } from './renderBridge';
import { isSatellite } from './moonSystem';
import { parseWorldData, serializeBodies } from './worldStorage';
import { getSimTime } from './physicsSoA';
import { useStore } from './store';
import type { UiMode } from './displayMode';
import { getGridFrame } from './gridWells';

export interface SerializedBody {
  id: string;
  type: string;
  mass: number;
  radius: number;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  name: string;
  parentId?: string;
  isSatellite: boolean;
}

export interface StoreSnapshot {
  paused: boolean;
  speed: number;
  bodyCount: number;
  selectedId: string | null;
  showGrid: boolean;
  showDust: boolean;
  showHabitable: boolean;
  showOrbitPaths: boolean;
  uiMode: UiMode;
  worldId: string | null;
}

export interface PhysicsEnergySample {
  n: number;
  kinetic: number;
  potential: number;
  total: number;
  driftPercent: number | null;
}

export interface PerfStats {
  avg: number;
  p50: number;
  p95: number;
  min: number;
}

export interface PerfReport {
  durationMs: number;
  fps: PerfStats;
  frameTimeMs: { avg: number; p95: number };
  jsHeapMb: { start: number; peak: number; end: number };
  retainedJsHeapMb?: { start: number; end: number; delta: number };
  bodyCount: number;
  deviceTier: string;
  renderProfile: string;
  graphicsMode: string;
  physicsTier: string;
  contextLostCount: number;
  sampleCount: number;
}

export interface TestMetricsSnapshot {
  ready: boolean;
  canvasReady: boolean;
  contextLostCount: number;
  deviceTier: string;
  renderProfile: string;
  graphicsMode: string;
  physicsTier: string;
  bodyCount: number;
}

/** The spacetime grid as drawn this frame (utils/gridWells.ts). */
export interface GridSnapshot {
  mode: UiMode;
  /** Render-space centre of the primary lattice and the body it rides. */
  primary: { bodyId: string | null; x: number; z: number };
  /** Secondary disc lattices. */
  discs: Array<{ bodyId: string; x: number; z: number; radius: number }>;
  /** Every well: render-space centre and peak/core after lattice LOD. */
  wells: Array<{ bodyId: string; x: number; y: number; z: number; peak: number; core: number }>;
}

export interface AetherTestAPI {
  isE2E: boolean;
  getStore: () => StoreSnapshot;
  getPhysicsSnapshot: () => SerializedBody[];
  getWorldSnapshot: () => WorldData;
  /** What is actually drawn: each body mesh's render-space position. */
  getRenderSnapshot: () => RenderSnapshot;
  /** The grid surface's inputs this frame, or null when neither grid nor habitable zone is shown. */
  getGridSnapshot: () => GridSnapshot | null;
  getEnergy: () => PhysicsEnergySample;
  loadFixture: (world: WorldData) => void;
  setPaused: (paused: boolean) => void;
  setSpeed: (speed: number) => void;
  openInspector: (bodyId: string) => void;
  getMetrics: () => TestMetricsSnapshot;
  startMetricsCollection: () => void;
  stopMetricsCollection: () => PerfReport;
  waitForReady: (timeoutMs?: number) => Promise<boolean>;
}

type MetricsCollector = {
  pushFrame: (deltaMs: number) => void;
};

let metricsCollector: MetricsCollector | null = null;
let appReady = false;
let canvasReady = false;
let contextLostCount = 0;
let deviceTierLabel = 'high';
let renderProfileLabel = 'quality';
let graphicsModeLabel = 'auto';
let physicsTierLabel = 'high';

let collecting = false;
let collectStart = 0;
let heapStartMb = 0;
let heapPeakMb = 0;
const frameTimesMs: number[] = [];
let energyBaseline: number | null = null;

function readHeapMb(): number {
  const mem = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  if (!mem) return 0;
  return mem.usedJSHeapSize / (1024 * 1024);
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function computeStats(values: number[]): PerfStats {
  if (values.length === 0) {
    return { avg: 0, p50: 0, p95: 0, min: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const fpsValues = sorted.map((ms) => (ms > 0 ? 1000 / ms : 0)).sort((a, b) => a - b);
  return {
    avg: fpsValues.reduce((a, b) => a + b, 0) / fpsValues.length,
    p50: percentile(fpsValues, 50),
    p95: percentile(fpsValues, 95),
    min: fpsValues[0],
  };
}

function serializeBody(b: CelestialBody): SerializedBody {
  return {
    id: b.id,
    type: b.type,
    mass: b.mass,
    radius: b.radius,
    position: { x: b.position.x, y: b.position.y, z: b.position.z },
    velocity: { x: b.velocity.x, y: b.velocity.y, z: b.velocity.z },
    name: b.name,
    // Kepler-rail satellites are drawn at an exaggerated separation from their
    // parent, so a render-vs-physics comparison has to know which these are.
    parentId: b.parentId,
    isSatellite: isSatellite(b),
  };
}

function computeEnergy(bodies: readonly CelestialBody[]): PhysicsEnergySample {
  const n = bodies.length;
  if (n === 0) {
    return { n: 0, kinetic: 0, potential: 0, total: 0, driftPercent: null };
  }

  let kinetic = 0;
  let potential = 0;

  for (let i = 0; i < n; i++) {
    const b = bodies[i];
    kinetic += 0.5 * b.mass * b.velocity.lengthSq();
  }

  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx = bj.position.x - bi.position.x;
      const dy = bj.position.y - bi.position.y;
      const dz = bj.position.z - bi.position.z;
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz + 0.1);
      potential -= (G_CONSTANT * bi.mass * bj.mass) / r;
    }
  }

  const total = kinetic + potential;
  if (energyBaseline === null) energyBaseline = total;
  const driftPercent =
    energyBaseline !== 0
      ? (Math.abs((total - energyBaseline) / energyBaseline) * 100)
      : null;

  return { n, kinetic, potential, total, driftPercent };
}

function buildApi(): AetherTestAPI {
  return {
    getWorldSnapshot: () => {
      const s = useStore.getState();
      return { id: s.worldId ?? 'test', version: 2, bodies: serializeBodies(getPhysicsBodiesSnapshot()),
        settings: { simTime: getSimTime(), speed: s.speed, showGrid: s.showGrid, showDust: s.showDust,
          showHabitable: s.showHabitable, showStability: s.showStability, showOrbitPaths: s.showOrbitPaths } };
    },
    isE2E: isE2EMode(),

    getStore: () => {
      const s = useStore.getState();
      return {
        paused: s.paused,
        speed: s.speed,
        bodyCount: s.bodies.length,
        selectedId: s.selectedId,
        showGrid: s.showGrid,
        showDust: s.showDust,
        showHabitable: s.showHabitable,
        showOrbitPaths: s.showOrbitPaths,
        uiMode: s.uiMode,
        worldId: s.worldId,
      };
    },

    getPhysicsSnapshot: () =>
      getPhysicsBodiesSnapshot().map(serializeBody),

    getEnergy: () => computeEnergy(getPhysicsBodiesSnapshot()),
    getRenderSnapshot: () => getRenderSnapshot(),
    getGridSnapshot: () => {
      const f = getGridFrame();
      if (!f) return null;
      const L = f.layout;
      const discs: GridSnapshot['discs'] = [];
      for (let j = 0; j < L.discCount; j++) {
        discs.push({ bodyId: f.ids[L.discIndex[j]], x: L.discX[j], z: L.discZ[j], radius: L.discRadius[j] });
      }
      const wells: GridSnapshot['wells'] = [];
      for (let i = 0; i < f.count; i++) {
        wells.push({
          bodyId: f.ids[i],
          x: f.positions[i * 3], y: f.positions[i * 3 + 1], z: f.positions[i * 3 + 2],
          peak: f.peaks[i], core: f.cores[i],
        });
      }
      return {
        mode: f.mode,
        primary: { bodyId: L.primary >= 0 ? f.ids[L.primary] : null, x: L.primaryX, z: L.primaryZ },
        discs,
        wells,
      };
    },

    loadFixture: (world) => {
      const parsed = parseWorldData(world);
      if (!parsed) throw new Error('Invalid fixture world data');
      energyBaseline = null;
      useStore.getState().loadWorld(parsed);
    },

    setPaused: (paused) => useStore.getState().setPaused(paused),
    setSpeed: (speed) => useStore.getState().setSpeed(speed),
    openInspector: (bodyId) => {
      useStore.getState().selectBody(bodyId);
      useStore.getState().openInspector(bodyId);
    },

    getMetrics: () => ({
      ready: appReady && canvasReady,
      canvasReady,
      contextLostCount,
      deviceTier: deviceTierLabel,
      renderProfile: renderProfileLabel,
      graphicsMode: graphicsModeLabel,
      physicsTier: physicsTierLabel,
      bodyCount: useStore.getState().bodies.length,
    }),

    startMetricsCollection: () => {
      collecting = true;
      collectStart = performance.now();
      frameTimesMs.length = 0;
      heapStartMb = readHeapMb();
      heapPeakMb = heapStartMb;
      energyBaseline = null;
    },

    stopMetricsCollection: () => {
      collecting = false;
      const durationMs = performance.now() - collectStart;
      const heapEndMb = readHeapMb();
      const fps = computeStats(frameTimesMs);
      const sortedFrames = [...frameTimesMs].sort((a, b) => a - b);
      const avgFrame =
        frameTimesMs.length > 0
          ? frameTimesMs.reduce((a, b) => a + b, 0) / frameTimesMs.length
          : 0;

      return {
        durationMs,
        fps,
        frameTimeMs: {
          avg: avgFrame,
          p95: percentile(sortedFrames, 95),
        },
        jsHeapMb: {
          start: heapStartMb,
          peak: heapPeakMb,
          end: heapEndMb,
        },
        bodyCount: useStore.getState().bodies.length,
        deviceTier: deviceTierLabel,
        renderProfile: renderProfileLabel,
        graphicsMode: graphicsModeLabel,
        physicsTier: physicsTierLabel,
        contextLostCount,
        sampleCount: frameTimesMs.length,
      };
    },

    waitForReady: (timeoutMs = 30_000) =>
      new Promise((resolve) => {
        const deadline = performance.now() + timeoutMs;
        const tick = () => {
          if (appReady && canvasReady) {
            resolve(true);
            return;
          }
          if (performance.now() >= deadline) {
            resolve(false);
            return;
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
  };
}

export function installTestBridge(): void {
  if (typeof window === 'undefined') return;
  window.__AETHER_TEST__ = buildApi();
}

export function markTestBridgeAppReady(): void {
  appReady = true;
}

export function markTestBridgeCanvasReady(): void {
  canvasReady = true;
}

/**
 * `deviceTier` keeps meaning the RENDER tier, which is what the existing visual
 * and perf specs assert on. The graphics mode, the resolved profile and the
 * hardware/physics tier are reported alongside it rather than folded into it,
 * so a spec can tell "the user picked Performance" apart from "this device is
 * slow" — they are now genuinely different things.
 */
export function setTestBridgeGraphics(
  renderTier: string,
  profile: string,
  mode: string,
  physicsTier: string,
): void {
  deviceTierLabel = renderTier;
  renderProfileLabel = profile;
  graphicsModeLabel = mode;
  physicsTierLabel = physicsTier;
}

export function incrementTestBridgeContextLost(): void {
  contextLostCount += 1;
}

export function registerTestMetricsCollector(collector: MetricsCollector): void {
  metricsCollector = collector;
}

export function unregisterTestMetricsCollector(): void {
  metricsCollector = null;
}

export function recordTestFrame(deltaMs: number): void {
  if (!collecting) return;
  frameTimesMs.push(deltaMs);
  const heap = readHeapMb();
  if (heap > heapPeakMb) heapPeakMb = heap;
}

declare global {
  interface Window {
    __AETHER_TEST__?: AetherTestAPI;
  }
}
