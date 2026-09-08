/**
 * Inspector information architecture — pure data and predicates.
 *
 * The Inspector used to be one flat scroll of type-gated JSX, with the
 * "which body types is this relevant to?" logic inlined at every field. That
 * made the gating impossible to test and impossible to reorganise. This module
 * owns the structure — which sections exist, which category each field belongs
 * to, and whether a field is a *primary* (a degree of freedom the user sets) or
 * *derived* (recomputed by `utils/bodyDerivation.ts` and read-only) — while the
 * React layer under `components/inspector/sections/` owns the rendering.
 *
 * Deliberately free of React and lucide imports so it runs under the node
 * vitest environment.
 */
import type { BodyType, CelestialBody } from '../types';
import { BODY_CONFIGS } from '../constants';
import { PHYSICS_LIMITS } from './physicsBounds';
import { rocheLimitRadii } from './units';

/* ─── Type-gating predicates ──────────────────────────────────────────────── */

/**
 * Compact objects and stars have their radius fixed by an equation of state
 * or a mass-radius relation, so it is read-only for them; pinning a radius
 * only makes sense where composition is the free parameter.
 */
export const RADIUS_FIXED_TYPES: BodyType[] = [
  'Black Hole', 'Neutron Star', 'Pulsar', 'White Dwarf', 'Brown Dwarf', 'Star', 'Red Giant',
];
export function isRadiusEditable(body: CelestialBody | null | undefined): boolean {
  return !!body && !RADIUS_FIXED_TYPES.includes(body.type);
}

/**
 * Types whose appearance and mass-radius relation are both driven by the
 * iron/silicate/water split, so the composition sliders are worth showing.
 */
export const COMPOSITION_TYPES: BodyType[] = ['Planet', 'Dwarf', 'Moon', 'Asteroid', 'Comet'];
export function hasEditableComposition(body: CelestialBody | null | undefined): boolean {
  return !!body && COMPOSITION_TYPES.includes(body.type);
}

/**
 * Types that can carry a ring system. Rings need a body large enough to hold
 * debris in a stable plane, and they are rendered in the equatorial plane of
 * the spin axis.
 */
export const RING_TYPES: BodyType[] = ['Planet', 'Gas Giant', 'Ice Giant'];
export function canHaveRings(body: CelestialBody | null | undefined): boolean {
  return !!body && RING_TYPES.includes(body.type);
}

/** Types with a meaningful spin axis to tilt. */
export const SPIN_AXIS_TYPES: BodyType[] = [
  'Planet', 'Dwarf', 'Moon', 'Gas Giant', 'Ice Giant', 'Asteroid', 'Comet',
];
export function hasSpinAxis(body: CelestialBody | null | undefined): boolean {
  return !!body && SPIN_AXIS_TYPES.includes(body.type);
}

/** Types that get the habitability / tidal-evolution analysis tab. */
export const ANALYSIS_TYPES: BodyType[] = ['Planet', 'Dwarf', 'Ice Giant'];
export function hasAnalysis(body: CelestialBody | null | undefined): boolean {
  return !!body && ANALYSIS_TYPES.includes(body.type);
}

/** Types with an atmosphere model worth charting. */
export const ATMOSPHERE_TYPES: BodyType[] = ['Planet', 'Ice Giant', 'Gas Giant'];
export function hasAtmosphere(body: CelestialBody | null | undefined): boolean {
  return !!body && ATMOSPHERE_TYPES.includes(body.type);
}

/**
 * Roche limit in body radii for a loose ice aggregate. Ring debris cannot
 * accrete into a moon inside this radius, which is why every ring system in
 * the Solar System sits there — shown so the user can see whether the edges
 * they are dragging are somewhere rings could physically survive.
 */
export function rocheLimitRadiiFor(body: CelestialBody): number {
  const density = body.properties?.bulkDensity;
  const roche = density && density > 0 ? rocheLimitRadii(density) : NaN;
  return Number.isFinite(roche) ? roche : 2.5;
}

/** Sensible default ring edges bracketing the Roche limit. */
export function defaultRingEdges(body: CelestialBody | null | undefined): { inner: number; outer: number } {
  if (!body) return { inner: 1.4, outer: 2.3 };
  const roche = rocheLimitRadiiFor(body);
  const outer = Math.min(Math.max(roche, 1.6), 4.5);
  return { inner: Math.max(outer * 0.6, 1.15), outer };
}

/** Slider bounds: one decade either side of the type's own mass range. */
export function massSliderRange(body: CelestialBody | null | undefined): [number, number] {
  const fallback: [number, number] = [PHYSICS_LIMITS.MIN_MASS, PHYSICS_LIMITS.MAX_MASS];
  if (!body) return fallback;
  const cfg = BODY_CONFIGS[body.type];
  if (!cfg) return fallback;
  return [
    Math.max(PHYSICS_LIMITS.MIN_MASS, cfg.massRange[0] * 0.1),
    Math.min(PHYSICS_LIMITS.MAX_MASS, cfg.massRange[1] * 10),
  ];
}

/* ─── Section / field descriptors ─────────────────────────────────────────── */

/** Which tab a section belongs to on the narrow (tab-based) layouts. */
export type InspectorTab = 'props' | 'orbit' | 'analysis';

export type SectionId =
  | 'physical' | 'thermal' | 'composition' | 'atmosphere'
  | 'relativistic' | 'rings' | 'dynamics' | 'orbital' | 'analysis';

/**
 * `primary` values are degrees of freedom the user owns; `derived` values are
 * recomputed from them and are never editable. The distinction is the core
 * contract of the physics model (see `utils/bodyDerivation.ts`) and the
 * Inspector renders the two tiers differently.
 */
export type FieldTier = 'primary' | 'derived';

export interface FieldMeta {
  /** Stable id — also the `data-testid` suffix. */
  id: string;
  label: string;
  tier: FieldTier;
  /** Static allow-list of body types. Omit for "every type". */
  visibleFor?: BodyType[];
  /** Dynamic gate, evaluated against the live body. */
  visibleWhen?: (body: CelestialBody) => boolean;
  /**
   * Opt in to the nova-gold change flash. Only for values derived from
   * *primaries* — never for readouts that track position or velocity, which
   * legitimately change on every physics tick and would strobe.
   */
  flash?: boolean;
}

export interface SectionMeta {
  id: SectionId;
  label: string;
  /** Resolved to a lucide component in the React layer. */
  iconId: string;
  tab: InspectorTab;
  /** Open on first render (desktop rail and phone tabs alike). */
  defaultOpen: boolean;
  visibleFor?: BodyType[];
  visibleWhen?: (body: CelestialBody) => boolean;
  fields: FieldMeta[];
}

function typeAllowed(types: BodyType[] | undefined, body: CelestialBody): boolean {
  return !types || types.includes(body.type);
}

export const INSPECTOR_SECTIONS: SectionMeta[] = [
  {
    id: 'physical',
    label: 'Physical',
    iconId: 'settings',
    tab: 'props',
    defaultOpen: true,
    fields: [
      { id: 'mass', label: 'Mass', tier: 'primary' },
      { id: 'massScale', label: 'Mass Scale', tier: 'primary' },
      { id: 'radiusKm', label: 'Radius', tier: 'primary', visibleWhen: isRadiusEditable },
      { id: 'radiusFixed', label: 'Radius', tier: 'derived', visibleWhen: (b) => !isRadiusEditable(b) },
      { id: 'bulkDensity', label: 'Density', tier: 'derived', flash: true },
      { id: 'surfaceGravity', label: 'Gravity', tier: 'derived', flash: true },
      { id: 'escapeVelocity', label: 'Esc. Velocity', tier: 'derived', flash: true },
      // Tracks the staged semi-major axis, which moves with the integrator.
      { id: 'orbitalPeriod', label: 'Orbital Period', tier: 'derived' },
      { id: 'texture', label: 'Surface Material', tier: 'primary', visibleWhen: (b) => b.type !== 'Planet' },
      { id: 'metallicity', label: 'Metallicity (Z)', tier: 'primary', visibleFor: ['Star'] },
      { id: 'oblateness', label: 'Rotation (Oblateness)', tier: 'primary', visibleFor: ['Star'] },
      { id: 'convectionScale', label: 'Convection Scale', tier: 'primary', visibleFor: ['Star'] },
      { id: 'massLoss', label: 'Mass Loss Rate', tier: 'primary', visibleFor: ['Red Giant'] },
      { id: 'pulsationSpeed', label: 'Pulsation Freq', tier: 'primary', visibleFor: ['Red Giant'] },
      { id: 'luminosityClass', label: 'Luminosity Class', tier: 'primary', visibleFor: ['Red Giant'] },
      { id: 'tectonics', label: 'Tectonic Activity', tier: 'primary', visibleFor: ['Planet'] },
      { id: 'waterLevel', label: 'Water Level', tier: 'primary', visibleFor: ['Planet'] },
    ],
  },
  {
    id: 'thermal',
    label: 'Thermal',
    iconId: 'thermometer',
    tab: 'props',
    defaultOpen: true,
    visibleFor: ['Star', 'Planet', 'Dwarf', 'Ice Giant'],
    fields: [
      { id: 'equilibriumTemp', label: 'Equilibrium Temp', tier: 'derived', visibleFor: ANALYSIS_TYPES, flash: true },
      { id: 'surfaceTemp', label: 'Surface Temp', tier: 'primary', visibleFor: ['Star'] },
      { id: 'spectralClass', label: 'Spectral Class', tier: 'derived', visibleFor: ['Star'], flash: true },
      { id: 'luminosity', label: 'Luminosity', tier: 'derived', visibleFor: ['Star'], flash: true },
    ],
  },
  {
    id: 'composition',
    label: 'Composition',
    iconId: 'layers',
    tab: 'props',
    defaultOpen: false,
    visibleWhen: hasEditableComposition,
    fields: [
      { id: 'compositionIron', label: 'Iron (Core)', tier: 'primary' },
      { id: 'compositionSilicates', label: 'Silicates (Mantle)', tier: 'primary' },
      { id: 'compositionWater', label: 'Water (Ice/Ocean)', tier: 'primary' },
    ],
  },
  {
    id: 'atmosphere',
    label: 'Atmosphere',
    iconId: 'wind',
    tab: 'props',
    defaultOpen: false,
    visibleFor: ATMOSPHERE_TYPES,
    fields: [
      { id: 'atmosphere', label: 'Atmosphere Density', tier: 'primary', visibleFor: ['Planet'] },
      { id: 'scaleHeight', label: 'Atmosphere Height', tier: 'primary', visibleFor: ['Planet'] },
      { id: 'haze', label: 'Haze Concentration', tier: 'primary', visibleFor: ['Planet'] },
      { id: 'methane', label: 'Methane Conc.', tier: 'primary', visibleFor: ['Ice Giant', 'Gas Giant'] },
      { id: 'cloudDepth', label: 'Cloud Depth', tier: 'primary', visibleFor: ['Ice Giant', 'Gas Giant'] },
      { id: 'atmosphereChart', label: 'Atmospheric Profile', tier: 'derived', visibleFor: ['Planet', 'Ice Giant'] },
    ],
  },
  {
    id: 'rings',
    label: 'Rings',
    iconId: 'disc',
    tab: 'props',
    defaultOpen: false,
    visibleWhen: canHaveRings,
    fields: [
      { id: 'ringOpacity', label: 'Ring Opacity', tier: 'primary' },
      {
        id: 'ringInnerRadius', label: 'Ring Inner Edge (R)', tier: 'primary',
        visibleWhen: (b) => (b.properties?.ringOpacity ?? 0) > 0.01,
      },
      {
        id: 'ringOuterRadius', label: 'Ring Outer Edge (R)', tier: 'primary',
        visibleWhen: (b) => (b.properties?.ringOpacity ?? 0) > 0.01,
      },
      {
        id: 'rocheLimit', label: 'Roche limit', tier: 'derived', flash: true,
        visibleWhen: (b) => (b.properties?.ringOpacity ?? 0) > 0.01,
      },
    ],
  },
  {
    id: 'dynamics',
    label: 'Dynamics',
    iconId: 'activity',
    tab: 'props',
    defaultOpen: false,
    visibleWhen: (b) => hasSpinAxis(b) || b.type === 'Dwarf',
    fields: [
      { id: 'obliquity', label: 'Axial Tilt (Obliquity)', tier: 'primary', visibleWhen: hasSpinAxis },
      { id: 'flareActivity', label: 'Flare Frequency', tier: 'primary', visibleFor: ['Dwarf'] },
      { id: 'magneticIndex', label: 'Magnetic Index', tier: 'primary', visibleFor: ['Dwarf'] },
    ],
  },
  {
    id: 'relativistic',
    label: 'Relativistic',
    iconId: 'aperture',
    tab: 'props',
    defaultOpen: false,
    visibleFor: ['Black Hole'],
    fields: [
      { id: 'spinParameter', label: 'Spin Parameter (a*)', tier: 'primary' },
      { id: 'accretionRate', label: 'Accretion Rate', tier: 'primary' },
      { id: 'schwarzschildRadius', label: 'Schwarzschild r_s', tier: 'derived', flash: true },
      { id: 'eventHorizon', label: 'Event horizon r₊', tier: 'derived', flash: true },
      { id: 'photonSphere', label: 'Photon sphere', tier: 'derived', flash: true },
      { id: 'isco', label: 'ISCO (prograde)', tier: 'derived', flash: true },
      { id: 'diskEfficiency', label: 'Disk efficiency η', tier: 'derived', flash: true },
    ],
  },
  {
    id: 'orbital',
    label: 'Keplerian Elements',
    iconId: 'orbit',
    tab: 'orbit',
    defaultOpen: true,
    fields: [
      { id: 'parent', label: 'Parent', tier: 'derived' },
      // Distance tracks live position — never flash it.
      { id: 'parentDistance', label: 'Distance', tier: 'derived' },
      { id: 'semiMajorAxis', label: 'Semi-major Axis (a)', tier: 'primary' },
      { id: 'eccentricity', label: 'Eccentricity (e)', tier: 'primary' },
      { id: 'trueAnomaly', label: 'True Anomaly (ν)', tier: 'primary' },
      { id: 'inclination', label: 'Inclination (i)', tier: 'primary' },
      { id: 'ascendingNode', label: 'Asc Node (Ω)', tier: 'primary' },
      { id: 'argPeriapsis', label: 'Arg Periapsis (ω)', tier: 'primary' },
    ],
  },
  {
    id: 'analysis',
    label: 'Habitability & Tides',
    iconId: 'microscope',
    tab: 'analysis',
    defaultOpen: true,
    visibleWhen: hasAnalysis,
    fields: [
      { id: 'esi', label: 'Earth Similarity', tier: 'derived' },
      { id: 'rsi', label: 'Rock Similarity', tier: 'derived' },
      { id: 'assessment', label: 'Assessment', tier: 'derived' },
      { id: 'timeToLock', label: 'Time to Tidal Lock', tier: 'derived' },
      { id: 'isTidallyLocked', label: 'Synchronous Rotation', tier: 'primary' },
      {
        id: 'rotationPeriod', label: 'Rotation Speed', tier: 'primary',
        visibleWhen: (b) => !b.properties?.isTidallyLocked,
      },
      { id: 'geophysics', label: 'Geophysics', tier: 'derived', visibleFor: ['Planet'] },
    ],
  },
];

/** Fields of `section` that apply to `body`. */
export function visibleFields(section: SectionMeta, body: CelestialBody): FieldMeta[] {
  return section.fields.filter(
    (f) => typeAllowed(f.visibleFor, body) && (!f.visibleWhen || f.visibleWhen(body)),
  );
}

/**
 * Sections that apply to `body`, in declaration order. A section whose fields
 * are all hidden for this type is dropped — otherwise the IA would show empty
 * collapsibles, which is exactly the noise this overhaul removes.
 */
export function visibleSections(body: CelestialBody): SectionMeta[] {
  return INSPECTOR_SECTIONS.filter((s) => {
    if (!typeAllowed(s.visibleFor, body)) return false;
    if (s.visibleWhen && !s.visibleWhen(body)) return false;
    return visibleFields(s, body).length > 0;
  });
}

/** Tabs that have at least one visible section for `body`, in tab order. */
export function visibleTabs(body: CelestialBody): InspectorTab[] {
  const order: InspectorTab[] = ['props', 'orbit', 'analysis'];
  const present = new Set(visibleSections(body).map((s) => s.tab));
  return order.filter((t) => present.has(t));
}
