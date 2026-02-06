export const G_CONSTANT = 0.8;
export const SPEED_OF_LIGHT = 60.0; 

export const EVOLUTION_THRESHOLDS = {
  PLANET_TO_STAR: 800,
  STAR_TO_BLACK_HOLE: 3000,
  SUPERNOVA_MASS: 1200 
};

export const COLLISION_PHYSICS = {
  FRAGMENTATION_RATIO: 1.5,
  MERGER_EFFICIENCY: 0.95,
};

export const DUST_CONFIG = {
  COUNT: 1500,
  AREA: 600,
  SPEED_FACTOR: 0.4
};

export interface BodyTypeConfig {
  massRange: [number, number];
  radiusRange: [number, number];
  defaultColor: string;
  description: string;
  visualType: 'plasma' | 'rocky' | 'gaseous' | 'singularity' | 'neutron';
}

export const BODY_CONFIGS: Record<string, BodyTypeConfig> = {
  'Dwarf': {
    massRange: [0.1, 5],
    radiusRange: [0.3, 0.8],
    defaultColor: '#9ca3af',
    description: 'Small rocky or icy bodies, minimum gravity.',
    visualType: 'rocky'
  },
  'Planet': {
    massRange: [5, 150],
    radiusRange: [1.2, 4.0],
    defaultColor: '#3b82f6',
    description: 'Terrestrial or small gas worlds.',
    visualType: 'rocky'
  },
  'Ice Giant': {
    massRange: [100, 500],
    radiusRange: [4.5, 8.0],
    defaultColor: '#a5b4fc',
    description: 'Cold, gaseous worlds.',
    visualType: 'gaseous'
  },
  'Star': {
    massRange: [800, 2000],
    radiusRange: [10, 18],
    defaultColor: '#fbbf24',
    description: 'Main sequence stars.',
    visualType: 'plasma'
  },
  'Red Giant': {
    massRange: [800, 3000],
    radiusRange: [50, 120],
    defaultColor: '#ef4444',
    description: 'Dying stars.',
    visualType: 'plasma'
  },
  'Neutron Star': {
    massRange: [1500, 2500],
    radiusRange: [0.15, 0.4],
    defaultColor: '#60a5fa',
    description: 'Extremely dense remnants.',
    visualType: 'neutron'
  },
  'Black Hole': {
    massRange: [3000, 100000],
    radiusRange: [2.0, 15.0],
    defaultColor: '#000000',
    description: 'Singularity.',
    visualType: 'singularity'
  }
};

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

export const PRESETS = {
  Solar: [
    { type: 'Star', mass: 1000,Hz: 12, pos: [0, 0, 0], vel: [0, 0, 0], color: '#fbbf24', radius: 12 },
    { type: 'Planet', mass: 10, radius: 2.5, pos: [60, 0, 0], vel: [0, 0, 3.8], color: '#3b82f6' },
    { type: 'Planet', mass: 50, radius: 4.0, pos: [110, 0, 0], vel: [0, 0, 2.8], color: '#10b981' },
    { type: 'Dwarf', mass: 0.5, radius: 0.6, pos: [35, 0, 0], vel: [0, 0, 5.0], color: '#9ca3af' },
    { type: 'Ice Giant', mass: 150, radius: 6.5, pos: [180, 0, 0], vel: [0, 0, 2.2], color: '#a5b4fc' },
  ]
};