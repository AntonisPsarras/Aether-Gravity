/**
 * Single source of truth for how a body type looks in the UI chrome.
 *
 * This replaces three drifting copies — the outliner's `BodyIcon` switch, its
 * `getTypeColor` switch, and the creation toolbar's inline `tools` array.
 *
 * Lives under `components/` on purpose: Tailwind's `content` globs scan this
 * directory, so the literal class strings below survive the purge. Never build
 * a class name by interpolation here — a constructed `text-${c}-400` compiles
 * away with no error anywhere in the toolchain.
 */
import {
  Sun, Flame, Zap, Aperture, Radio, Sparkle, Moon, Globe, Wind, Snowflake,
  CircleDot, Gem, Sparkles, type LucideIcon,
} from 'lucide-react';
import type { BodyType } from '../types';
import { BODY_CONFIGS } from '../constants';
import { isBeginnerBodyType, type UiMode } from '../utils/displayMode';

export interface BodyTypeVisual {
  icon: LucideIcon;
  /** Text colour utility. */
  text: string;
  /** Matching translucent background utility for chips and tool buttons. */
  bg: string;
  /** Compact label for narrow toolbars and badges. */
  short: string;
}

export const BODY_TYPE_VISUALS: Record<BodyType, BodyTypeVisual> = {
  'Star':         { icon: Sun,        text: 'text-yellow-400',  bg: 'bg-yellow-500/20',  short: 'Star' },
  'Red Giant':    { icon: Flame,      text: 'text-red-500',     bg: 'bg-red-500/20',     short: 'Giant' },
  'Neutron Star': { icon: Zap,        text: 'text-cyan-300',    bg: 'bg-cyan-400/20',    short: 'Neutron' },
  'Black Hole':   { icon: Aperture,   text: 'text-orange-500',  bg: 'bg-orange-500/20',  short: 'Hole' },
  'Planet':       { icon: Globe,      text: 'text-blue-400',    bg: 'bg-blue-500/20',    short: 'Planet' },
  'Ice Giant':    { icon: Snowflake,  text: 'text-indigo-300',  bg: 'bg-indigo-500/20',  short: 'Ice' },
  'Dwarf':        { icon: CircleDot,  text: 'text-gray-400',    bg: 'bg-gray-500/20',    short: 'Dwarf' },
  'Gas Giant':    { icon: Wind,       text: 'text-amber-300',   bg: 'bg-amber-500/20',   short: 'Gas' },
  'White Dwarf':  { icon: Sparkle,    text: 'text-sky-200',     bg: 'bg-sky-400/20',     short: 'W. Dwarf' },
  'Brown Dwarf':  { icon: Moon,       text: 'text-orange-700',  bg: 'bg-orange-800/20',  short: 'B. Dwarf' },
  'Pulsar':       { icon: Radio,      text: 'text-cyan-200',    bg: 'bg-cyan-300/20',    short: 'Pulsar' },
  'Moon':         { icon: Moon,       text: 'text-stone-300',   bg: 'bg-stone-400/20',   short: 'Moon' },
  'Asteroid':     { icon: Gem,        text: 'text-stone-500',   bg: 'bg-stone-600/20',   short: 'Asteroid' },
  'Comet':        { icon: Sparkles,   text: 'text-teal-200',    bg: 'bg-teal-400/20',    short: 'Comet' },
};

const FALLBACK: BodyTypeVisual = {
  icon: CircleDot, text: 'text-slate-400', bg: 'bg-slate-500/20', short: '—',
};

export function visualFor(type: BodyType): BodyTypeVisual {
  return BODY_TYPE_VISUALS[type] ?? FALLBACK;
}

/**
 * Creation-toolbar order: stellar, then planetary, then small bodies.
 *
 * Explicit rather than derived from `BODY_CONFIGS` — that record is authored
 * smallest-mass-first, which is the reverse of what the toolbar wants.
 */
export const CREATION_ORDER: BodyType[] = [
  'Star', 'Red Giant', 'Neutron Star', 'Black Hole',
  'Planet', 'Ice Giant', 'Dwarf', 'Gas Giant',
  'White Dwarf', 'Brown Dwarf', 'Pulsar',
  'Moon', 'Asteroid', 'Comet',
];

/** The types the creation toolbar offers, in display order. */
export const CREATABLE_TYPES: BodyType[] = CREATION_ORDER.filter(
  (t) => BODY_CONFIGS[t]?.creatable !== false,
);

/**
 * Creatable types for a presentation mode, in display order.
 *
 * Beginner Mode offers the subset in `utils/displayMode.ts` — enough to build a
 * recognisable star system without a wall of compact objects to choose between.
 * Nothing is removed from the app: an existing pulsar keeps working, keeps its
 * inspector entry, and stays saveable; it just is not offered in the dock.
 */
export const creatableTypesFor = (mode: UiMode): BodyType[] =>
  mode === 'beginner'
    ? CREATABLE_TYPES.filter(isBeginnerBodyType)
    : CREATABLE_TYPES;

/** Human label for a category chip. */
export const CATEGORY_LABELS: Record<string, string> = {
  stellar: 'Stellar',
  compact: 'Compact',
  singularity: 'Singularity',
  giant: 'Giant',
  solid: 'Solid',
};
