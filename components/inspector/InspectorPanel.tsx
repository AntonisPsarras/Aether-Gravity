import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Settings, Thermometer, Layers, Wind, Disc, Activity, Aperture, Orbit, Microscope,
  type LucideIcon,
} from 'lucide-react';
import { useStore } from '../../utils/store';
import { findDominantParent } from '../../utils/physicsUtils';
import {
  isFieldVisibleInMode,
  visibleSections, visibleTabs, type InspectorTab, type SectionId, type SectionMeta,
} from '../../utils/inspectorSections';
import { useBreakpoint } from '../hooks/useMediaQuery';
import { useReducedMotion } from '../hooks/useReducedMotion';

import { Collapsible } from '../ui/Collapsible';
import { TabBar, tabDirection, type TabItem } from '../ui/Tabs';
import { useBottomSheet, DETENT_FRACTION, PEEK_MAX_PX } from '../ui/Sheet';
import { cn } from '../ui/cn';
import { InspectorProvider, LOCK_SETS, type InspectorCtx } from './InspectorContext';
import { InspectorHeader } from './InspectorHeader';
import { PhysicalSection } from './sections/PhysicalSection';
import { ThermalSection } from './sections/ThermalSection';
import { CompositionSection } from './sections/CompositionSection';
import { AtmosphereSection } from './sections/AtmosphereSection';
import { RingsSection } from './sections/RingsSection';
import { DynamicsSection } from './sections/DynamicsSection';
import { RelativisticSection } from './sections/RelativisticSection';
import { OrbitSection } from './sections/OrbitSection';
import { AnalysisSection } from './sections/AnalysisSection';
import type { CelestialBody } from '../../types';
import { getPhysicsBodiesSnapshot } from '../../utils/physicsBridge';

const SECTION_ICONS: Record<string, LucideIcon> = {
  settings: Settings, thermometer: Thermometer, layers: Layers, wind: Wind,
  disc: Disc, activity: Activity, aperture: Aperture, orbit: Orbit, microscope: Microscope,
};

const TAB_LABELS: Record<InspectorTab, string> = {
  props: 'Properties',
  orbit: 'Orbit',
  analysis: 'Analysis',
};

const SectionBody: React.FC<{ id: SectionId; onOrbitDirty: (d: boolean) => void }> = ({ id, onOrbitDirty }) => {
  switch (id) {
    case 'physical':     return <PhysicalSection />;
    case 'thermal':      return <ThermalSection />;
    case 'composition':  return <CompositionSection />;
    case 'atmosphere':   return <AtmosphereSection />;
    case 'rings':        return <RingsSection />;
    case 'dynamics':     return <DynamicsSection />;
    case 'relativistic': return <RelativisticSection />;
    case 'orbital':      return <OrbitSection onDirtyChange={onOrbitDirty} />;
    case 'analysis':     return <AnalysisSection />;
    default: {
      const never: never = id;
      return never;
    }
  }
};

const DirtyDot: React.FC = () => (
  <span
    aria-label="Unapplied changes"
    className="inline-block h-1.5 w-1.5 rounded-full bg-nova-gold shrink-0"
  />
);

export const InspectorPanel: React.FC<{
  onOpen?: (body: CelestialBody) => void;
  onTabVisit?: (tab: 'orbit' | 'analysis') => void;
}> = ({ onOpen, onTabVisit }) => {
  const breakpoint = useBreakpoint();
  const isPhone = breakpoint === 'phone';
  const isDesktop = breakpoint === 'desktop';
  const reducedMotion = useReducedMotion();

  const storeBody = useStore((s) => s.bodies.find((b) => b.id === s.inspectorBodyId));
  const [liveBody, setLiveBody] = useState<CelestialBody | undefined>(storeBody);
  const body = liveBody?.id === storeBody?.id ? liveBody : storeBody;
  const bodies = useStore((s) => s.bodies);
  const updateBody = useStore((s) => s.updateBody);
  const removeBody = useStore((s) => s.removeBody);
  const selectBody = useStore((s) => s.selectBody);
  const closeInspector = useStore((s) => s.closeInspector);
  const lockInspectorFields = useStore((s) => s.lockInspectorFields);
  const unlockInspectorFields = useStore((s) => s.unlockInspectorFields);
  const uiMode = useStore((s) => s.uiMode);
  const detent = useStore((s) => s.inspectorDetent);
  const setDetent = useStore((s) => s.setInspectorDetent);

  const bodyId = body?.id ?? null;

  // Physics stays off the React/store hot path. Only an open inspector samples
  // its selected live body, at 2 Hz, so telemetry never reconciles the canvas.
  useEffect(() => {
    if (!storeBody) {
      setLiveBody(undefined);
      return;
    }
    const refresh = () => {
      const live = getPhysicsBodiesSnapshot().find((candidate) => candidate.id === storeBody.id);
      if (!live) return;
      setLiveBody({
        ...live,
        position: live.position.clone(),
        velocity: live.velocity.clone(),
        properties: live.properties ? { ...live.properties } : live.properties,
      });
    };
    refresh();
    const timer = window.setInterval(refresh, 500);
    return () => window.clearInterval(timer);
  }, [storeBody]);

  const [activeTab, setActiveTab] = useState<InspectorTab>('props');
  const [tabDir, setTabDir] = useState<1 | -1>(1);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [orbitDirty, setOrbitDirty] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const dismiss = useCallback(() => {
    selectBody(null);
    closeInspector();
  }, [selectBody, closeInspector]);

  const sheet = useBottomSheet({
    detent,
    onDetentChange: setDetent,
    onDismiss: dismiss,
    enabled: isPhone && !!bodyId,
  });

  // Collapsible state is per-section, not per-body: keeping "Composition open"
  // across selections is what makes comparing two planets bearable. It is reset
  // only when the layout tier changes, since the tiers open different defaults.
  useEffect(() => { setOpenSections({}); }, [breakpoint]);
  useEffect(() => { setOrbitDirty(false); }, [bodyId]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [bodyId, activeTab]);
  useEffect(() => {
    if (!bodyId) return;
    const openedBody = useStore.getState().bodies.find((candidate) => candidate.id === bodyId);
    if (openedBody) onOpen?.(openedBody);
  }, [bodyId, onOpen]);

  const parent = useMemo(
    () => (body ? findDominantParent(body, bodies) : null),
    [body, bodies],
  );

  // Beginner Mode hides advanced-audience sections and fields. Purely a display
  // filter — no body data is touched, so switching back restores everything,
  // including staged-but-unapplied Orbit edits.
  const sections = useMemo(() => (body ? visibleSections(body, uiMode) : []), [body, uiMode]);
  const tabs = useMemo(() => (body ? visibleTabs(body, uiMode) : []), [body, uiMode]);

  // Fall back to a tab that exists — types differ in which ones they offer.
  useEffect(() => {
    if (tabs.length > 0 && !tabs.includes(activeTab)) setActiveTab(tabs[0]);
  }, [tabs, activeTab]);

  const ctx: InspectorCtx | null = useMemo(() => {
    if (!body) return null;
    const props = body.properties || {};
    const lockFields = (fields: readonly string[]) => lockInspectorFields(body.id, [...fields]);
    const unlockFields = (fields: readonly string[]) => unlockInspectorFields(body.id, [...fields]);
    return {
      body,
      parent,
      props,
      updateBody,
      setProp: (key, value) => updateBody(body.id, { properties: { ...props, [key]: value } }),
      lockFields,
      unlockFields,
      propEditStart: () => lockFields(LOCK_SETS.props),
      propEditEnd: () => unlockFields(LOCK_SETS.props),
      showField: (fieldId: string) => isFieldVisibleInMode(fieldId, uiMode),
    };
  }, [body, parent, updateBody, lockInspectorFields, unlockInspectorFields, uiMode]);

  if (!body || !ctx) return null;

  const isOpen = (section: SectionMeta) => openSections[section.id] ?? section.defaultOpen;
  const toggleSection = (id: string, fallback: boolean) =>
    setOpenSections((prev) => ({ ...prev, [id]: !(prev[id] ?? fallback) }));

  const changeTab = (next: InspectorTab) => {
    setTabDir(tabDirection(tabItems, activeTab, next));
    setActiveTab(next);
    if (next === 'orbit' || next === 'analysis') onTabVisit?.(next);
  };

  const tabItems: TabItem<InspectorTab>[] = tabs.map((id) => ({
    id,
    label: TAB_LABELS[id],
    badge: id === 'orbit' && orbitDirty ? <DirtyDot /> : undefined,
  }));

  // Desktop shows every section in one scroll; the narrow tiers page by tab.
  const shownSections = isDesktop ? sections : sections.filter((s) => s.tab === activeTab);

  // At `peek` the sheet is only tall enough for the header, so suppress the
  // rest rather than letting the user scroll a two-line viewport.
  const showContent = !isPhone || detent !== 'peek';

  // Keyed on the body id so re-selecting replays the entrance. Suppressed under
  // reduced motion, where the panel should simply appear.
  const enterClass = reducedMotion
    ? undefined
    : isPhone ? 'ag-enter-sheet' : isDesktop ? 'ag-enter-rail' : 'ag-enter-card';

  return (
    <>
      {isPhone && (
        <div
          className="ag-scrim z-20"
          data-visible={detent === 'full' ? 'true' : 'false'}
          onClick={() => setDetent('half')}
          aria-hidden
        />
      )}

      <div
        key={body.id}
        data-testid="inspector-panel"
        data-detent={isPhone ? detent : 'docked'}
        data-breakpoint={breakpoint}
        data-dragging={sheet.dragging ? 'true' : 'false'}
        className={cn(
          // `inspector-panel-anchor` must stay on every breakpoint: index.css
          // styles the panel's range inputs through it as an ancestor selector.
          'inspector-panel-anchor fixed z-30 flex flex-col text-pulsar-white shadow-2xl',
          enterClass,
          'bg-[rgba(45,51,64,0.6)] backdrop-blur-xl md:backdrop-blur-md ring-1 ring-white/5',
          // Phone: full-bleed bottom sheet.
          'bottom-0 left-0 w-full rounded-t-2xl border-t border-white/10',
          // Tablet: floating card, as before.
          'md:absolute md:top-auto md:right-4 md:bottom-4 md:left-auto md:w-[min(22rem,92vw)] md:rounded-xl md:border md:max-h-[85vh]',
          // Desktop: full-height docked rail; the canvas insets to match.
          'xl:fixed xl:top-0 xl:right-0 xl:bottom-0 xl:left-auto xl:h-full xl:max-h-none xl:w-[var(--rail-right-w)] xl:rounded-none xl:border-l xl:border-t-0',
        )}
        style={{
          ...(isPhone && sheet.heightPx !== null ? { height: `${sheet.heightPx}px` } : null),
          // Mirrors detentHeight(): peek is capped in px as well as by fraction
          // so it hugs the header instead of leaving a dead band beneath it.
          ...(isPhone
            ? {
                ['--sheet-h' as string]: detent === 'peek'
                  ? `min(${DETENT_FRACTION.peek * 100}dvh, ${PEEK_MAX_PX}px)`
                  : `${DETENT_FRACTION[detent] * 100}dvh`,
              }
            : null),
        }}
      >
        <InspectorHeader
          body={body}
          parent={parent}
          onDelete={() => removeBody(body.id)}
          onDismiss={dismiss}
          showHandle={isPhone}
          handleProps={sheet.handleProps}
        >
          {showContent && !isDesktop && (
            <div className="pb-4 pt-3">
              <TabBar
                tabs={tabItems}
                active={activeTab}
                onChange={changeTab}
                testIdPrefix="inspector-tab"
              />
            </div>
          )}
          {showContent && isDesktop && sections.length > 1 && (
            <nav aria-label="Jump to section" className="flex gap-1 overflow-x-auto scrollbar-custom py-3">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setOpenSections((prev) => ({ ...prev, [s.id]: true }));
                    document
                      .getElementById(`inspector-section-${s.id}`)
                      ?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
                  }}
                  className="shrink-0 px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-white/5 text-pulsar-white/40 border border-white/10 hover:text-nova-gold hover:bg-white/10 transition-colors"
                >
                  {s.label}
                  {s.id === 'orbital' && orbitDirty && <span className="ml-1 text-nova-gold">•</span>}
                </button>
              ))}
            </nav>
          )}
        </InspectorHeader>

        {showContent && (
          <div
            ref={scrollRef}
            className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] overflow-y-auto scrollbar-custom flex-1 overscroll-contain panel-scroll"
          >
            {body.properties?.presetId && body.properties.presetId !== 'solar-system' && body.type !== 'Star' && (
              <p className="text-[11px] leading-relaxed text-pulsar-white/60 py-3" data-testid="exoplanet-assumptions">
                Illustrative surface. Atmosphere, water and habitability are unknown; temperature is a model estimate.
                {body.properties.presetId === 'alpha-centauri' && ' Mass is a radial-velocity minimum; radius and orbital orientation are assumed.'}
              </p>
            )}
            <InspectorProvider value={ctx}>
              <div
                key={isDesktop ? 'all' : activeTab}
                className={reducedMotion ? undefined : 'ag-tab-in'}
                style={{ ['--ag-tab-dir' as string]: tabDir }}
              >
                {shownSections.map((section) => {
                  const Icon = SECTION_ICONS[section.iconId] ?? Settings;
                  const open = isOpen(section);
                  return (
                    <div key={section.id} id={`inspector-section-${section.id}`}>
                      <Collapsible
                        testId={`inspector-section-${section.id}`}
                        title={section.label}
                        icon={<Icon size={12} />}
                        open={open}
                        onToggle={() => toggleSection(section.id, section.defaultOpen)}
                        badge={section.id === 'orbital' && orbitDirty ? <DirtyDot /> : undefined}
                      >
                        <SectionBody id={section.id} onOrbitDirty={setOrbitDirty} />
                      </Collapsible>
                    </div>
                  );
                })}
              </div>
            </InspectorProvider>
          </div>
        )}
      </div>
    </>
  );
};

export default InspectorPanel;
