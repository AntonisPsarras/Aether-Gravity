import type { BodyType, CelestialBody } from '../types';
import { BODY_CONFIGS } from '../constants';
import { calculateStabilityMetrics, findDominantParent } from './physicsUtils';
import {
  MAX_SPIN_PARAMETER,
  diskEfficiency,
  iscoRadiusKm,
  kerrOuterHorizonKm,
} from './relativity';
import { fmtRadiusKm } from './units';
import { readStorageJson, reportStorageIssue, writeStorageJsonVerified } from './browserStorage';

export type TutorialIconId =
  | 'model' | 'navigate' | 'outliner' | 'create' | 'orbit'
  | 'inspect' | 'evolve' | 'habitability' | 'overlays';

export interface TutorialStep {
  id: string;
  title: string;
  summary: string;
  bullets: string[];
  physicsNote?: string;
  icon: TutorialIconId;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'model', icon: 'model', title: 'A physical sandbox, with a readable scale',
    summary: 'Aether Gravity evolves bodies with real mass, radius, temperature, and orbital relationships. The scene is a model, not a literal photograph.',
    bullets: [
      'Mass is stored in Earth or solar masses and physical radii are stored in kilometres.',
      'Stars, compact objects, and small moons are visually enlarged so radically different scales remain visible together.',
      'That display scaling never changes the values used by the simulation or Inspector.',
    ],
    physicsNote: 'When a visual is simplified or exaggerated, the Inspector remains the source of the physical value.',
  },
  {
    id: 'navigate', icon: 'navigate', title: 'Move through the system',
    summary: 'Explore the same system from any angle without changing its physics.',
    bullets: [
      'Drag to orbit the camera, use the secondary button to pan, and scroll or pinch to zoom.',
      'Tap or click a body to highlight it. Long-press, double-click, or use the outliner to open its Inspector.',
      'Camera focus follows the selected body; it does not attach or alter that body’s orbit.',
    ],
  },
  {
    id: 'outliner', icon: 'outliner', title: 'Read the system hierarchy',
    summary: 'The Universe Outliner turns a moving 3D scene into a searchable map of its bodies.',
    bullets: [
      'Tree mode groups bodies beneath their current dominant parent; filters switch to a flat comparison list.',
      'The hierarchy can change as gravity, collisions, ejections, or explicit orbit edits change the system.',
      'Use it to select distant bodies or open the Inspector without hunting through the scene.',
    ],
  },
  {
    id: 'create', icon: 'create', title: 'Create by launching',
    summary: 'Choosing a body type puts the canvas into creation mode. The gesture defines both where and how it enters the simulation.',
    bullets: [
      'Press where the body should spawn, then drag and release to give it an initial velocity.',
      'A longer drag produces a faster launch; the direction indicator shows the velocity before release.',
      'Select Cancel to leave creation mode. Undo restores the complete pre-launch body snapshot.',
    ],
  },
  {
    id: 'orbits', icon: 'orbit', title: 'Gravity makes trajectories—not guarantees',
    summary: 'A sideways launch can become an orbit, but only when its speed and distance produce a bound trajectory.',
    bullets: [
      'Too little tangential speed falls inward; too much can produce an escape trajectory.',
      'The time controls change how quickly simulation time advances, not the strength of gravity.',
      'Orbit estimates use an instantaneous dominant-parent approximation inside the evolving many-body system.',
    ],
  },
  {
    id: 'inspector', icon: 'inspect', title: 'Edit causes; read consequences',
    summary: 'The Inspector separates primary inputs from values derived by the physics model.',
    bullets: [
      'Editable controls change quantities such as mass, composition, temperature, spin, or orbital elements.',
      'Read-only groups recalculate density, gravity, escape velocity, luminosity, and relativistic geometry.',
      'Orbit edits are staged and move nothing until Apply is pressed; closing the panel discards them.',
    ],
  },
  {
    id: 'evolution', icon: 'evolve', title: 'Mass constrains what an object can be',
    summary: 'Names do not override physical limits. Changing mass can reclassify or collapse a body when its current type is no longer admissible.',
    bullets: [
      'A white dwarf beyond the Chandrasekhar limit becomes a neutron star.',
      'A neutron star beyond the TOV limit collapses into a black hole.',
      'Black holes do not “uncollapse” if their mass is later reduced; compact-object evolution is one-way.',
    ],
  },
  {
    id: 'habitability', icon: 'habitability', title: 'Habitability is evidence, not a verdict',
    summary: 'Temperature and similarity metrics help compare worlds, but they cannot establish that a world supports life.',
    bullets: [
      'Equilibrium temperature is derived from stellar luminosity and distance before local greenhouse effects.',
      'A habitable-zone ring marks where surface liquid water may be possible under assumptions—it is not a life detector.',
      'ESI measures similarity to Earth from selected physical properties; a high score is not a probability of life.',
    ],
  },
  {
    id: 'overlays', icon: 'overlays', title: 'Use overlays as measuring aids',
    summary: 'Visual tools reveal relationships that are difficult to see in the raw scene, while contextual lessons continue as you experiment.',
    bullets: [
      'The gravity grid is a qualitative curvature visualization, not a literal fabric or numerical graph of general relativity.',
      'Habitable zones, orbit paths, trails, Hill spheres, and Roche limits each answer a different question.',
      'Dismissible tips will explain a panel or object type on its first meaningful use and will stay dismissed afterward.',
    ],
  },
];

export type PanelHelperId =
  | 'panel:creation' | 'panel:moon' | 'panel:outliner' | 'panel:inspector'
  | 'panel:orbit' | 'panel:analysis';
export type BodyHelperId = `body:${BodyType}`;
export type HelperId = PanelHelperId | BodyHelperId;

export type HelperTrigger =
  | { kind: 'creation-mode'; mode?: BodyType | null }
  | { kind: 'outliner-interaction' }
  | { kind: 'inspector-open'; body: CelestialBody }
  | { kind: 'inspector-tab'; tab: 'orbit' | 'analysis' }
  | { kind: 'body-created'; body: CelestialBody };

export interface HelperDefinition {
  id: HelperId;
  eyebrow: string;
  title: string;
  content: string;
  detail?: string;
}

export interface OnboardingProgress {
  version: 1;
  tutorialSeen: boolean;
  seenHelperIds: HelperId[];
}

export interface QueuedHelper {
  id: HelperId;
  bodyId?: string;
}

export const ONBOARDING_STORAGE_KEY = 'aether:onboarding:v1';

const PANEL_IDS: PanelHelperId[] = [
  'panel:creation', 'panel:moon', 'panel:outliner', 'panel:inspector', 'panel:orbit', 'panel:analysis',
];
const BODY_TYPES = Object.keys(BODY_CONFIGS) as BodyType[];
const KNOWN_HELPER_IDS = new Set<HelperId>([
  ...PANEL_IDS,
  ...BODY_TYPES.map((type): BodyHelperId => `body:${type}`),
]);

const emptyProgress = (): OnboardingProgress => ({ version: 1, tutorialSeen: false, seenHelperIds: [] });
let memoryProgress = emptyProgress();

export function parseOnboardingProgress(raw: unknown): OnboardingProgress {
  if (!raw || typeof raw !== 'object') return emptyProgress();
  const value = raw as Partial<OnboardingProgress>;
  const ids = Array.isArray(value.seenHelperIds)
    ? value.seenHelperIds.filter((id): id is HelperId => typeof id === 'string' && KNOWN_HELPER_IDS.has(id as HelperId))
    : [];
  return {
    version: 1,
    tutorialSeen: value.tutorialSeen === true,
    seenHelperIds: Array.from(new Set(ids)),
  };
}

export function getOnboardingProgress(): OnboardingProgress {
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('e2e') === '1' &&
    new URLSearchParams(window.location.search).get('onboarding') === 'seen'
  ) {
    return { version: 1, tutorialSeen: true, seenHelperIds: [...KNOWN_HELPER_IDS] };
  }
  try {
    if (typeof localStorage === 'undefined') return { ...memoryProgress, seenHelperIds: [...memoryProgress.seenHelperIds] };
    const stored = readStorageJson(ONBOARDING_STORAGE_KEY);
    if (stored === null) return { ...memoryProgress, seenHelperIds: [...memoryProgress.seenHelperIds] };
    if (!stored || typeof stored !== 'object') {
      reportStorageIssue({
        kind: 'corrupt', key: ONBOARDING_STORAGE_KEY,
        message: 'The saved onboarding progress has an invalid shape.',
      });
    }
    memoryProgress = parseOnboardingProgress(stored);
  } catch {
    // Private browsing, quota policies, and corrupt JSON must not block the app.
  }
  return { ...memoryProgress, seenHelperIds: [...memoryProgress.seenHelperIds] };
}

export function saveOnboardingProgress(progress: OnboardingProgress): OnboardingProgress {
  memoryProgress = parseOnboardingProgress(progress);
  try {
    if (typeof localStorage !== 'undefined') {
      writeStorageJsonVerified(ONBOARDING_STORAGE_KEY, memoryProgress);
    }
  } catch {
    // Keep the session-level memory fallback when persistent storage is unavailable.
  }
  return getOnboardingProgress();
}

export function markTutorialSeen(): OnboardingProgress {
  return saveOnboardingProgress({ ...getOnboardingProgress(), tutorialSeen: true });
}

export function markHelperSeen(id: HelperId): OnboardingProgress {
  const progress = getOnboardingProgress();
  if (progress.seenHelperIds.includes(id)) return progress;
  return saveOnboardingProgress({ ...progress, seenHelperIds: [...progress.seenHelperIds, id] });
}

export function resetOnboardingMemoryForTests(): void {
  memoryProgress = emptyProgress();
}

export function helpersForTrigger(trigger: HelperTrigger): QueuedHelper[] {
  switch (trigger.kind) {
    case 'creation-mode': return [{ id: trigger.mode === 'Moon' ? 'panel:moon' : 'panel:creation' }];
    case 'outliner-interaction': return [{ id: 'panel:outliner' }];
    case 'inspector-tab': return [{ id: `panel:${trigger.tab}` }];
    case 'body-created': return [{ id: `body:${trigger.body.type}`, bodyId: trigger.body.id }];
    case 'inspector-open': return [
      { id: 'panel:inspector' },
      { id: `body:${trigger.body.type}`, bodyId: trigger.body.id },
    ];
  }
}

export function enqueueUnseenHelpers(
  queue: QueuedHelper[],
  trigger: HelperTrigger,
  seen: readonly HelperId[],
): QueuedHelper[] {
  const unavailable = new Set<HelperId>([...seen, ...queue.map((item) => item.id)]);
  const additions = helpersForTrigger(trigger).filter((item) => !unavailable.has(item.id));
  return additions.length > 0 ? [...queue, ...additions] : queue;
}

const PANEL_HELPERS: Record<PanelHelperId, Omit<HelperDefinition, 'id'>> = {
  'panel:creation': {
    eyebrow: 'Creation', title: 'Launch, don’t just place',
    content: 'Press where the new body should appear, then drag and release. The drag becomes its initial velocity; a longer drag launches faster.',
    detail: 'Cancel exits creation mode, and Undo restores the complete pre-launch system.',
  },
  'panel:moon': {
    eyebrow: 'Moon creation', title: 'Place it on a real orbit',
    content: 'Pick a planet, then drag the ghost moon or use the sliders. Every setting is a bound Kepler orbit, kept between the planet’s Roche limit and the stable part of its Hill sphere.',
    detail: 'Want a free-flying rock instead? Choose Asteroid and throw it.',
  },
  'panel:outliner': {
    eyebrow: 'Universe Outliner', title: 'A live map of the hierarchy',
    content: 'Tree mode groups bodies beneath their current dominant parent. Search, filters, or alternate sorting produce a flat comparison list.',
    detail: 'Select a row to find a body; use the row’s Inspector gesture to edit and analyse it.',
  },
  'panel:inspector': {
    eyebrow: 'Inspector', title: 'Inputs and consequences are separated',
    content: 'Interactive controls are primary physical inputs. Read-only groups are derived from those inputs and update automatically.',
    detail: 'Changing mass can also change a body’s valid classification; derived numbers are never independent sliders.',
  },
  'panel:orbit': {
    eyebrow: 'Orbit', title: 'Orbital elements are staged',
    content: 'Semi-major axis, eccentricity, inclination, and orientation describe a two-body orbit around the displayed parent.',
    detail: 'Edits move nothing until Apply is pressed. The surrounding many-body simulation can still perturb the resulting trajectory.',
  },
  'panel:analysis': {
    eyebrow: 'Analysis', title: 'Interpret habitability cautiously',
    content: 'Equilibrium temperature, tidal locking, and similarity scores summarize selected physics; none is a direct measurement of life.',
    detail: 'ESI means Earth-like under its inputs, while a habitable zone only describes possible liquid-water conditions.',
  },
};

const BODY_COPY: Record<BodyType, { title: string; content: string; detail?: string }> = {
  Asteroid: {
    title: 'Asteroids are minor bodies',
    content: 'Their gravity is too weak to force hydrostatic equilibrium, so irregular rocky or metallic shapes are physically expected.',
  },
  Comet: {
    title: 'Comets become active near stars',
    content: 'An icy nucleus on an eccentric trajectory can sublimate near a luminous star, producing a coma and a tail directed by the local environment.',
  },
  Moon: {
    title: 'A Moon needs a stable gravitational neighbourhood',
    content: 'A Hill sphere is the region around an orbiting body where that body’s gravity can dominate enough for satellites to remain bound.',
    detail: 'Tides can also drive a moon toward synchronous rotation, while an orbit beyond the Hill sphere is promoted back to free-body motion.',
  },
  Dwarf: {
    title: 'A dwarf planet is rounded but not dominant',
    content: 'It is massive enough for gravity to make it approximately round, but it has not cleared other bodies from its orbital neighbourhood.',
  },
  Planet: {
    title: 'Planet structure follows mass and composition',
    content: 'Iron, silicate, and water fractions help determine physical radius, density, surface gravity, and escape velocity.',
    detail: 'Temperature and ESI describe environmental similarity; neither is a probability that life exists.',
  },
  'Ice Giant': {
    title: 'Ice giants are not small gas giants',
    content: 'Their envelopes are rich in water, ammonia, and methane around a rocky core, unlike the hydrogen/helium-dominated gas giants.',
  },
  'Gas Giant': {
    title: 'Gas giants are deep hydrogen-helium worlds',
    content: 'Their visible surface is an atmosphere rather than solid ground. Ring stability is related to the Roche limit, where tides can prevent material from accreting into a moon.',
  },
  'Brown Dwarf': {
    title: 'Brown dwarfs bridge planets and stars',
    content: 'They can burn deuterium but do not sustain ordinary hydrogen fusion, so they remain substellar even while glowing from retained heat.',
  },
  Star: {
    title: 'Main-sequence stars fuse hydrogen',
    content: 'Mass sets the broad scale of luminosity, radius, temperature, lifetime, and the distance of the habitable zone.',
  },
  'Red Giant': {
    title: 'Red giants are evolved stars',
    content: 'After core hydrogen is depleted, the envelope expands and cools while shell burning and mass loss reshape the star’s future.',
  },
  'White Dwarf': {
    title: 'White dwarfs are electron-degenerate remnants',
    content: 'Adding mass makes the radius shrink. Beyond the Chandrasekhar limit, electron degeneracy cannot support the remnant and it collapses further.',
  },
  'Neutron Star': {
    title: 'Neutron stars compress stellar mass into kilometres',
    content: 'Degenerate nuclear matter supports a remnant roughly 10–14 km in radius. Beyond the TOV limit, the model collapses it into a black hole.',
  },
  Pulsar: {
    title: 'A pulsar is a lighthouse neutron star',
    content: 'Rapid rotation and a strong, tilted magnetic field sweep radiation beams through space; a pulse is seen when a beam crosses the observer.',
    detail: 'Its pulsar spin period is distinct from the general rotation-period field used by ordinary bodies.',
  },
  'Black Hole': {
    title: 'Spin changes Kerr geometry',
    content: 'The dimensionless spin a* measures angular momentum relative to mass. Higher prograde spin pulls the event horizon and ISCO inward and raises ideal disk efficiency.',
    detail: `Accretion-driven spin is capped at the Thorne limit a* = ${MAX_SPIN_PARAMETER}.`,
  },
};

export function helperDefinition(
  item: QueuedHelper,
  bodies: readonly CelestialBody[],
): HelperDefinition {
  if (item.id.startsWith('panel:')) {
    const panelId = item.id as PanelHelperId;
    return { id: panelId, ...PANEL_HELPERS[panelId] };
  }

  const type = item.id.slice('body:'.length) as BodyType;
  const copy = BODY_COPY[type];
  const body = item.bodyId ? bodies.find((candidate) => candidate.id === item.bodyId) : undefined;
  let detail = copy.detail;

  if (type === 'Moon' && body) {
    const parent = body.parentId && body.orbit
      ? bodies.find((candidate) => candidate.id === body.parentId) ?? null
      : null;
    if (parent) {
      const { hillKm } = calculateStabilityMetrics(parent, findDominantParent(parent, [...bodies]));
      detail = Number.isFinite(hillKm) && hillKm > 0
        ? `${body.name} is currently associated with ${parent.name}. ${parent.name}’s Hill radius is ${fmtRadiusKm(hillKm)} in its present orbit.`
        : `${body.name} has ${parent.name} as its dominant parent, but that parent has no higher orbit from which to derive a finite Hill sphere.`;
    } else {
      detail = `${body.name} currently has no explicit parent orbit, so it is a free body—not yet a bound satellite.`;
    }
  }

  if (type === 'Black Hole' && body) {
    const spin = body.properties?.spinParameter ?? 0;
    detail = `At a* = ${spin.toFixed(3)}, the outer horizon is ${fmtRadiusKm(kerrOuterHorizonKm(body.mass, spin))}, the prograde ISCO is ${fmtRadiusKm(iscoRadiusKm(body.mass, spin, true))}, and ideal disk efficiency is ${(diskEfficiency(spin) * 100).toFixed(1)}%. The slider stops at the Thorne limit ${MAX_SPIN_PARAMETER}.`;
  }

  return { id: item.id, eyebrow: type, ...copy, detail };
}
