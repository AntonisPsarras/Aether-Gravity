import type { BodyType } from './types';
import {
  G_AETHER,
  M_JUPITER_IN_EARTH,
  M_SUN_IN_EARTH,
} from './utils/units';

/**
 * Gravitational constant in Aether units (M⊕ / 0.025 AU / year).
 * DERIVED from SI in `utils/units.ts` — do not tune this by hand. Changing it
 * silently breaks the correspondence between simulated orbits and displayed
 * masses, which is what the pre-2.0 engine got wrong.
 */
export const G_CONSTANT = G_AETHER;

/**
 * Physically meaningful classification / evolution boundaries, all in M⊕.
 * These replace the former arbitrary game thresholds (800 / 1200 / 3000).
 */
export const EVOLUTION_THRESHOLDS = {
  /** Deuterium burning: planets become brown dwarfs above ~13 M♃. */
  DEUTERIUM_BURNING: 13 * M_JUPITER_IN_EARTH,          // ≈ 4 132
  /** Sustained hydrogen fusion: the substellar/stellar boundary, ~0.075 M☉. */
  HYDROGEN_BURNING: 0.075 * M_SUN_IN_EARTH,            // ≈ 24 971
  /** Chandrasekhar limit: maximum white dwarf mass, 1.4 M☉. */
  CHANDRASEKHAR: 1.4 * M_SUN_IN_EARTH,                 // ≈ 466 124
  /**
   * Tolman-Oppenheimer-Volkoff limit: maximum non-rotating neutron star mass.
   * Current multimessenger + NICER constraints cluster near 2.2 M☉; above it
   * collapse to a black hole is unavoidable.
   */
  TOV: 2.2 * M_SUN_IN_EARTH,                           // ≈ 732 481
  /** Core-collapse supernova progenitor threshold, ~8 M☉. */
  CORE_COLLAPSE: 8 * M_SUN_IN_EARTH,                   // ≈ 2 663 568
} as const;

export const COLLISION_PHYSICS = {
  FRAGMENTATION_RATIO: 1.5,
  /**
   * Fraction of combined mass retained by a merger remnant. The deficit is
   * radiated (gravitational waves / ejecta) and is reported as an event rather
   * than silently discarded.
   */
  MERGER_EFFICIENCY: 0.99,
};

export const DUST_CONFIG = {
  COUNT: 1500,
  AREA: 600,
  SPEED_FACTOR: 0.4
};

/** Broad behavioural family, used to collapse per-type switches. */
export type BodyCategory = 'solid' | 'giant' | 'stellar' | 'compact' | 'singularity';

export interface BodyTypeConfig {
  /** Plausible mass range in M⊕ (used by the random generator and UI sliders). */
  massRange: [number, number];
  defaultColor: string;
  description: string;
  visualType: 'plasma' | 'rocky' | 'gaseous' | 'singularity' | 'neutron';
  category: BodyCategory;
  /** Whether this type is offered in the creation toolbar. */
  creatable: boolean;
}

export const BODY_CONFIGS: Record<BodyType, BodyTypeConfig> = {
  'Asteroid': {
    massRange: [1e-9, 5e-4],
    defaultColor: '#8b7d6b',
    description: 'Rocky or metallic minor body; too small for hydrostatic equilibrium.',
    visualType: 'rocky',
    category: 'solid',
    creatable: true,
  },
  'Comet': {
    // Halley's nucleus is ~2.2 × 10¹³ kg ≈ 3.7 × 10⁻¹² M⊕.
    massRange: [1e-13, 1e-8],
    defaultColor: '#bfe6f5',
    description: 'Icy nucleus on an eccentric orbit; grows a coma and tail near a star.',
    visualType: 'rocky',
    category: 'solid',
    creatable: true,
  },
  'Moon': {
    // Phobos is 1.8 × 10⁻⁹ M⊕ at the small end; Ganymede 0.025 M⊕ at the large.
    massRange: [1e-10, 0.05],
    defaultColor: '#c8c8c8',
    description: 'Natural satellite bound to a planet.',
    visualType: 'rocky',
    category: 'solid',
    creatable: true,
  },
  'Dwarf': {
    // Ceres 1.57 × 10⁻⁴ M⊕ … Pluto 2.18 × 10⁻³ M⊕ … Eris 2.8 × 10⁻³ M⊕.
    massRange: [1e-4, 0.1],
    defaultColor: '#9ca3af',
    description: 'Dwarf planet: rounded by gravity but has not cleared its orbit.',
    visualType: 'rocky',
    category: 'solid',
    creatable: true,
  },
  'Planet': {
    massRange: [0.02, 10],
    defaultColor: '#3b82f6',
    description: 'Terrestrial world with an iron/silicate/ice interior.',
    visualType: 'rocky',
    category: 'solid',
    creatable: true,
  },
  'Ice Giant': {
    // Uranus 14.5 M⊕, Neptune 17.1 M⊕.
    massRange: [5, 50],
    defaultColor: '#a5b4fc',
    description: 'Water/ammonia/methane envelope over a rocky core.',
    visualType: 'gaseous',
    category: 'giant',
    creatable: true,
  },
  'Gas Giant': {
    // Saturn 95.2 M⊕, Jupiter 317.8 M⊕, up to the deuterium-burning limit.
    massRange: [50, 13 * M_JUPITER_IN_EARTH],
    defaultColor: '#d8a35a',
    description: 'Hydrogen/helium dominated giant.',
    visualType: 'gaseous',
    category: 'giant',
    creatable: true,
  },
  'Brown Dwarf': {
    massRange: [13 * M_JUPITER_IN_EARTH, 0.075 * M_SUN_IN_EARTH],
    defaultColor: '#8c4a3f',
    description: 'Substellar object: burns deuterium but never hydrogen.',
    visualType: 'plasma',
    category: 'stellar',
    creatable: true,
  },
  'Star': {
    // 0.075 M☉ (hydrogen burning limit) to 50 M☉.
    massRange: [0.075 * M_SUN_IN_EARTH, 50 * M_SUN_IN_EARTH],
    defaultColor: '#fbbf24',
    description: 'Main sequence star fusing hydrogen in its core.',
    visualType: 'plasma',
    category: 'stellar',
    creatable: true,
  },
  'Red Giant': {
    massRange: [0.3 * M_SUN_IN_EARTH, 8 * M_SUN_IN_EARTH],
    defaultColor: '#ef4444',
    description: 'Evolved star with an inflated envelope and a degenerate core.',
    visualType: 'plasma',
    category: 'stellar',
    creatable: true,
  },
  'White Dwarf': {
    massRange: [0.17 * M_SUN_IN_EARTH, 1.4 * M_SUN_IN_EARTH],
    defaultColor: '#dbeafe',
    description: 'Electron-degenerate remnant; radius shrinks as mass grows.',
    visualType: 'plasma',
    category: 'compact',
    creatable: true,
  },
  'Neutron Star': {
    massRange: [1.1 * M_SUN_IN_EARTH, 2.2 * M_SUN_IN_EARTH],
    defaultColor: '#60a5fa',
    description: 'Neutron-degenerate remnant, ~12 km across.',
    visualType: 'neutron',
    category: 'compact',
    creatable: true,
  },
  'Pulsar': {
    massRange: [1.1 * M_SUN_IN_EARTH, 2.2 * M_SUN_IN_EARTH],
    defaultColor: '#a5f3fc',
    description: 'Rapidly rotating, strongly magnetised neutron star.',
    visualType: 'neutron',
    category: 'compact',
    creatable: true,
  },
  'Black Hole': {
    // 3 M☉ (lower mass gap) up to an intermediate-mass 30 000 M☉.
    massRange: [3 * M_SUN_IN_EARTH, 3e4 * M_SUN_IN_EARTH],
    defaultColor: '#000000',
    description: 'Region bounded by an event horizon; Kerr if spinning.',
    visualType: 'singularity',
    category: 'singularity',
    creatable: true,
  },
};

/** Types that emit their own light and can heat other bodies. */
export const LUMINOUS_TYPES: readonly BodyType[] = [
  'Star', 'Red Giant', 'White Dwarf', 'Neutron Star', 'Pulsar', 'Brown Dwarf',
];

/** Types whose interior is modelled from an iron/silicate/water mixture. */
export const TERRESTRIAL_TYPES: readonly BodyType[] = [
  'Planet', 'Dwarf', 'Moon', 'Asteroid', 'Comet',
];

/** Types modelled by the giant-planet mass-radius relation. */
export const GIANT_TYPES: readonly BodyType[] = ['Ice Giant', 'Gas Giant'];

export const TEXTURE_TYPES = [
  { label: 'Rocky', value: 'rock' },
  { label: 'Gas Giant', value: 'gas' },
  { label: 'Molten', value: 'lava' },
  { label: 'Ice', value: 'ice' },
  { label: 'Solid', value: 'solid' },
  { label: 'Plasma', value: 'plasma' },
  { label: 'Neutron', value: 'neutron' },
];

export const TEXTURE_IDS: Record<string, number> = {
  'solid': 0, 'rock': 1, 'gas': 2, 'ice': 3, 'lava': 4, 'plasma': 5, 'neutron': 6
};
