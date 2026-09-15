import React from 'react';
import {
  X, Settings, Hexagon, Sparkles, Globe, Orbit, Waves, Activity, GraduationCap, Gauge,
  HardDrive, Gem, Zap, Wand2,
} from 'lucide-react';
import { useStore } from '../utils/store';
import type { UiMode } from '../utils/displayMode';
import { resolveRenderProfile, type GraphicsMode } from '../utils/graphicsQuality';
import { realSecondsPerEarthYear } from '../utils/simRate';
import { getRealSystem } from '../content/realSystems';
import { presetViews } from '../utils/presetViews';
import { useDeviceTier } from './CanvasSetup';
import { cn } from './ui/cn';
import { CONSERVATIVE_LOCAL_STORAGE_BYTES, getAetherStorageUsage } from '../utils/browserStorage';

/**
 * In-world settings.
 *
 * Two jobs. First, it is the live Beginner ⇄ Advanced switch — reachable at any
 * moment from the control bar rather than only from a pre-game menu, because
 * the thing a user wants when the display overwhelms them is to change it
 * *now*, with their system still on screen. Second, it is where the
 * set-once-and-forget display toggles live.
 *
 * The split from the control bar is by interaction frequency, not importance:
 * undo, pause, speed and camera lock are touched many times a minute while
 * building and need to stay one tap away. The grid, orbit estimates and
 * habitable zone are flipped often enough that they are mirrored on the bar
 * too (the habitable zone only above 390px); dust and stability live here only.
 */

const GRAPHICS_COPY: Record<GraphicsMode, { title: string; blurb: string }> = {
  quality: {
    title: 'Quality',
    blurb: 'Every effect at full detail — the same picture desktop renders. Switching briefly reloads the view.',
  },
  performance: {
    title: 'Performance',
    blurb: 'Lower resolution, fewer particles and lighter post-processing, tuned for a steady 60 fps. No effect is switched off.',
  },
  auto: {
    title: 'Auto',
    blurb: 'Measures your frame rate and moves up to Quality if the device holds 60 fps.',
  },
};

const MODE_COPY: Record<UiMode, { title: string; blurb: string }> = {
  beginner: {
    title: 'Beginner',
    blurb: 'Exaggerated planet wells with depth shading, larger bodies, slower clock, and a reduced set of fields and body types.',
  },
  advanced: {
    title: 'Advanced',
    blurb: 'True-ratio gravity wells (planets barely dent the Sun’s), smaller display sizes, faster clock, and every field and body type. Bodies remain enlarged.',
  },
};

const ToggleRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  hint?: string;
  checked: boolean;
  onToggle: () => void;
  testId?: string;
}> = ({ icon, label, hint, checked, onToggle, testId }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onToggle}
    data-testid={testId}
    className="touch-target w-full min-h-[3rem] flex items-center gap-3 px-3 py-2 rounded-xl border border-white/5 bg-black/20 hover:bg-white/5 transition-colors text-left"
  >
    <span className={cn('shrink-0 transition-colors', checked ? 'text-nova-gold' : 'text-pulsar-white/30')}>
      {icon}
    </span>
    <span className="flex-1 min-w-0">
      <span className="block text-xs font-bold text-pulsar-white/85">{label}</span>
      {hint && <span className="block text-[10px] text-pulsar-white/35 leading-snug">{hint}</span>}
    </span>
    <span
      aria-hidden
      className={cn(
        'shrink-0 h-5 w-9 rounded-full p-0.5 transition-colors',
        checked ? 'bg-nova-gold/70' : 'bg-white/10',
      )}
    >
      <span
        className={cn(
          'block h-4 w-4 rounded-full bg-white transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </span>
  </button>
);

const Group: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-1.5">
    <h3 className="text-[10px] font-bold uppercase tracking-widest text-pulsar-white/35 px-1">{title}</h3>
    {children}
  </section>
);

export const SettingsPanel: React.FC = () => {
  const bodies = useStore(s => s.bodies);
  const paused = useStore(s => s.paused);
  const tier = useDeviceTier();
  const presetBody = bodies.find(b => b.properties?.presetId);
  const preset = getRealSystem(presetBody?.properties?.presetId ?? '');
  const settingsOpen = useStore((s) => s.settingsOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const uiMode = useStore((s) => s.uiMode);
  const setUiMode = useStore((s) => s.setUiMode);
  const graphicsMode = useStore((s) => s.graphicsMode);
  const setGraphicsMode = useStore((s) => s.setGraphicsMode);
  const autoRenderProfile = useStore((s) => s.autoRenderProfile);
  const activeProfile = resolveRenderProfile(graphicsMode, autoRenderProfile);
  const speed = useStore((s) => s.speed);
  const showGrid = useStore((s) => s.showGrid);
  const showDust = useStore((s) => s.showDust);
  const showHabitable = useStore((s) => s.showHabitable);
  const showOrbitPaths = useStore((s) => s.showOrbitPaths);
  const showStability = useStore((s) => s.showStability);
  const isDebugMode = useStore((s) => s.isDebugMode);
  const toggleGrid = useStore((s) => s.toggleGrid);
  const toggleDust = useStore((s) => s.toggleDust);
  const toggleHabitable = useStore((s) => s.toggleHabitable);
  const toggleOrbitPaths = useStore((s) => s.toggleOrbitPaths);
  const toggleStability = useStore((s) => s.toggleStability);
  const toggleDebugMode = useStore((s) => s.toggleDebugMode);

  if (!settingsOpen) return null;

  const close = () => setSettingsOpen(false);
  const yearSeconds = realSecondsPerEarthYear(paused ? 0 : speed, uiMode, bodies, tier);
  const pace = Number.isFinite(yearSeconds)
    ? `At ${speed.toFixed(1)}x, one Earth year takes about ${Math.round(yearSeconds)} s.`
    : 'Paused — the clock is not advancing.';
  const storageUsage = getAetherStorageUsage();
  const usageMiB = storageUsage.bytes / (1024 * 1024);
  const usagePercent = Math.min(100, (storageUsage.bytes / CONSERVATIVE_LOCAL_STORAGE_BYTES) * 100);

  return (
    <div
      className="fixed inset-0 z-[110] safe-pad flex items-center justify-center bg-black/80 backdrop-blur-md ag-fade-in p-4"
      onClick={close}
    >
      <div
        className="relative bg-[rgba(16,20,28,0.98)] border border-white/10 rounded-2xl w-full max-w-[min(28rem,96vw)] max-h-[min(92dvh,44rem)] overflow-hidden shadow-2xl ring-1 ring-white/5 flex flex-col"
        role="dialog"
        aria-labelledby="settings-title"
        aria-modal="true"
        data-testid="settings-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-nova-gold/15 border border-nova-gold/25 rounded-xl flex items-center justify-center text-nova-gold shrink-0">
              <Settings size={18} />
            </div>
            <h2 id="settings-title" className="text-lg font-bold text-pulsar-white tracking-wide truncate">
              Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={close}
            data-testid="settings-close"
            className="touch-target flex h-11 w-11 shrink-0 items-center justify-center text-pulsar-white/40 hover:text-pulsar-white hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close settings"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 space-y-5 scrollbar-custom flex-1">
          <Group title="Experience">
            <div className="flex gap-1.5 p-1 rounded-xl bg-black/30 border border-white/5" role="radiogroup" aria-label="Presentation mode">
              {(['beginner', 'advanced'] as UiMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="radio"
                  aria-checked={uiMode === mode}
                  onClick={() => setUiMode(mode)}
                  data-testid={`ui-mode-${mode}`}
                  className={cn(
                    'touch-target flex-1 min-h-[2.75rem] flex items-center justify-center gap-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all',
                    uiMode === mode
                      ? 'bg-nova-gold/20 text-nova-gold ring-1 ring-inset ring-nova-gold/30'
                      : 'text-pulsar-white/45 hover:text-pulsar-white hover:bg-white/5',
                  )}
                >
                  {mode === 'beginner' ? <GraduationCap size={14} /> : <Gauge size={14} />}
                  {MODE_COPY[mode].title}
                </button>
              ))}
            </div>
            <p className="px-1 text-[11px] leading-snug text-pulsar-white/45">{MODE_COPY[uiMode].blurb}</p>
            <p className="px-1 text-[10px] text-pulsar-white/30 tabular-nums">{pace}</p>
            <p className="px-1 text-[10px] italic text-pulsar-white/25 leading-snug">
              Display and pacing only — the simulation itself is identical in both modes, and
              switching never changes or discards any body.
            </p>
          </Group>

          <Group title="Graphics">
            <div
              className="flex gap-1.5 p-1 rounded-xl bg-black/30 border border-white/5"
              role="radiogroup"
              aria-label="Graphics quality"
              data-testid="graphics-mode-group"
            >
              {(['quality', 'performance', 'auto'] as GraphicsMode[]).map((mode) => {
                const Icon = mode === 'quality' ? Gem : mode === 'performance' ? Zap : Wand2;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={graphicsMode === mode}
                    onClick={() => setGraphicsMode(mode)}
                    data-testid={`graphics-mode-${mode}`}
                    className={cn(
                      'touch-target flex-1 min-h-[2.75rem] flex items-center justify-center gap-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all',
                      graphicsMode === mode
                        ? 'bg-nova-gold/20 text-nova-gold ring-1 ring-inset ring-nova-gold/30'
                        : 'text-pulsar-white/45 hover:text-pulsar-white hover:bg-white/5',
                    )}
                  >
                    <Icon size={14} />
                    {GRAPHICS_COPY[mode].title}
                  </button>
                );
              })}
            </div>
            <p className="px-1 text-[11px] leading-snug text-pulsar-white/45">{GRAPHICS_COPY[graphicsMode].blurb}</p>
            {graphicsMode === 'auto' && (
              <p className="px-1 text-[10px] text-pulsar-white/30" data-testid="graphics-mode-status">
                Currently: {GRAPHICS_COPY[activeProfile].title}
              </p>
            )}
            <p className="px-1 text-[10px] italic text-pulsar-white/25 leading-snug">
              Appearance only — the physics, the timestep and every body are identical in all three
              modes. This setting is remembered across every universe.
            </p>
          </Group>

          <Group title="Display">
            <ToggleRow
              icon={<Hexagon size={16} />} label="Spacetime grid"
              hint={uiMode === 'advanced'
                ? 'Gravitational potential on one true scale for every mass.'
                : 'Heavier bodies sink deeper wells; planet dents are exaggerated.'}
              checked={showGrid} onToggle={toggleGrid} testId="toggle-grid"
            />
            <ToggleRow
              icon={<Sparkles size={16} />} label="Cosmic dust"
              hint="Decorative particles for depth cues."
              checked={showDust} onToggle={toggleDust} testId="toggle-dust"
            />
            <ToggleRow
              icon={<Globe size={16} />} label="Habitable zone"
              hint="Band where liquid water is possible."
              checked={showHabitable} onToggle={toggleHabitable} testId="toggle-habitable"
            />
            <ToggleRow
              icon={<Orbit size={16} />} label="Orbit estimates"
              hint="Instantaneous two-body approximation. Moon paths use the exaggerated display scale."
              checked={showOrbitPaths} onToggle={toggleOrbitPaths} testId="toggle-orbit-paths"
            />
          </Group>

          <Group title="Model limits">
            <p className="text-xs text-pulsar-white/70 p-3">
              Sandbox collisions use enlarged visual contacts. Scientific presets use physical radii.
              Fragmentation and stellar transitions are approximations; reverse time does not undo them.
              Black-hole visuals use isolated Kerr geometry, not relativistic N-body dynamics.
            </p>
          </Group>

          {preset && <Group title="Scientific preset">
            <div data-testid="preset-science" className="text-xs text-pulsar-white/70 p-3 space-y-3">
              <p>Epoch JD {presetBody?.properties?.epochJD} · {presetBody?.properties?.referencePlane}</p>
              <p>Physical distances and collisions. Bodies are enlarged; moon separations are enlarged for visibility. Both modes use the same physics. Playback slows to resolve short orbits.</p>
              <div className="flex flex-wrap gap-2">{presetViews[preset.id]?.map(view => <button key={view} type="button" className="touch-target rounded-lg border border-white/20 px-3 py-2" onClick={() => {
                useStore.setState(s => ({ guidedView: view, selectedId: null, cameraLockedId: null,
                  cameraRecenterNonce: s.cameraRecenterNonce + 1, settingsOpen: false,
                  outlinerOpen: window.innerWidth < 768 ? false : s.outlinerOpen,
                  showGrid: view === 'Overview' ? false : s.showGrid,
                }));
              }}>{view}</button>)}</div>
              <details><summary className="cursor-pointer">Sources and assumptions</summary>
                <p className="my-2">{presetBody?.properties?.scienceNote}</p>
                {preset.sources?.map((url, i) => <a className="block underline py-1" key={url} href={url} target="_blank" rel="noreferrer">Reference {i + 1}</a>)}
              </details>
            </div>
          </Group>}
          {uiMode === 'advanced' && (
            <Group title="Analysis">
              <ToggleRow
                icon={<Waves size={16} />} label="Stability overlay"
                hint="Flags orbits drifting toward escape or collision."
                checked={showStability} onToggle={toggleStability} testId="toggle-stability"
              />
              {import.meta.env.DEV && (
                <ToggleRow
                  icon={<Activity size={16} />} label="Physics diagnostics"
                  hint="Energy-drift HUD. Development builds only."
                  checked={isDebugMode} onToggle={toggleDebugMode} testId="toggle-debug"
                />
              )}
            </Group>
          )}

          <Group title="Data & storage">
            <div data-testid="data-storage-note" className="rounded-xl border border-nebula-rust/25 bg-nebula-rust/[0.07] px-3 py-3 text-[11px] leading-relaxed text-pulsar-white/55">
              <div className="mb-2 flex items-center gap-2 font-bold text-pulsar-white/80">
                <HardDrive size={15} className="text-nebula-rust" /> Stored only on this device
              </div>
              <p>Clearing app storage or uninstalling Aether Gravity permanently deletes every universe and cannot be undone. Android backup and device transfer are disabled, so there is no off-device recovery copy.</p>
              <p className="mt-2 tabular-nums text-pulsar-white/40">
                {storageUsage.available
                  ? `Approximate Aether storage: ${usageMiB < 0.01 ? '<0.01' : usageMiB.toFixed(2)} MiB (${usagePercent.toFixed(1)}% of a conservative 5 MiB planning limit).`
                  : 'Storage usage is unavailable because local storage could not be read.'}
              </p>
            </div>
          </Group>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
