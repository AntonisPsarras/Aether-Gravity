/**
 * Appearance derivations: physical primaries -> shader inputs.
 *
 * Everything here is a pure read of the values the physics pass produces
 * (`properties.composition*`, `temperature`, `obliquity`, `bulkDensity`, ...).
 * Nothing in this file is consumed by the integrator, the derivation chain in
 * `bodyDerivation.ts`, or the habitability model — it exists so the renderer can
 * react to the physics without the renderer being able to change it.
 *
 * Several functions mirror GLSL in `components/Planet/PlanetShaders.ts`
 * (`cloudCoverFrom` in particular). Where they do, the comment says so and the
 * two are kept in step by the tests in `bodyAppearance.test.ts`.
 */

import type { CelestialBody } from '../types';
import { RING_PARTICLE_DENSITY_GCM3, rocheLimitRadii } from './units';

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  if (!(edge1 > edge0)) return x >= edge1 ? 1 : 0;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Default composition, matching `bodyDerivation.ts` and `physicsUtils.ts`. */
const DEFAULT_COMPOSITION = { iron: 0.3, silicates: 0.6, water: 0.1 } as const;

/** Normalised iron/silicate/water mass fractions, defaults filled in. */
export const compositionOf = (body: CelestialBody) => {
  const p = body.properties ?? {};
  const iron = Math.max(p.compositionIron ?? DEFAULT_COMPOSITION.iron, 0);
  const silicates = Math.max(p.compositionSilicates ?? DEFAULT_COMPOSITION.silicates, 0);
  const water = Math.max(p.compositionWater ?? DEFAULT_COMPOSITION.water, 0);
  const total = iron + silicates + water;
  if (!(total > 0)) return { ...DEFAULT_COMPOSITION };
  return { iron: iron / total, silicates: silicates / total, water: water / total };
};

/**
 * Stable per-body noise offset in [0, 100).
 *
 * Two worlds with identical primaries would otherwise be pixel-identical; this
 * gives each its own terrain while staying deterministic across reloads and
 * save/load (FNV-1a over the body id).
 */
export const bodySeed = (id: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 1000;
};

/**
 * Surface volatile budget, 0-1 — how much of the body is available to be ocean,
 * ice cap or cloud.
 *
 * This is deliberately NOT the bulk water mass fraction. Earth's oceans are
 * ~0.02% of its mass, so `compositionWater` rounds to zero for it even though
 * 71% of the surface is water: bulk composition drives the mass-radius
 * relation, `waterLevel` drives the hydrosphere. Bulk water still counts here,
 * because a body that is a third ice by mass is drowned regardless of where the
 * surface dial sits.
 */
export const surfaceVolatilesFor = (waterLevel: number, compositionWater: number): number =>
  clamp01(clamp01(waterLevel) + clamp01(compositionWater) * 1.2);

/**
 * Fraction of the disc under cloud. Mirrors `cloudCoverFrom` in the composition
 * GLSL chunk: cover needs an atmosphere to hold vapour and a volatile reservoir
 * to supply it, rises through the liquid-water window, and saturates in a
 * Venus-style runaway.
 *
 * `volatiles` is the surface budget from `surfaceVolatilesFor`, not the bulk
 * mass fraction. The sqrt on atmosphere is the usual optical-depth-style
 * saturation: cover climbs fast off zero and then flattens, so Earth's
 * 0.3 density gives broken cloud rather than a nearly clear sky.
 */
export const cloudCoverFor = (atmosphere: number, volatiles: number, tempK: number): number => {
  // Both terms need the same high-temperature cutoff: past ~1100 K the water is
  // dissociated and gone, so a runaway greenhouse has nothing left to keep
  // aloft. Without the cutoff on `runaway`, cover kept climbing into the
  // magma-ocean regime.
  const volatilesRemain = 1 - smoothstep(600, 1100, tempK);
  const vapor = smoothstep(240, 330, tempK) * volatilesRemain;
  const runaway = smoothstep(380, 700, tempK) * volatilesRemain;
  const atm = Math.sqrt(clamp01(atmosphere));
  const base = atm * (0.25 + 0.75 * clamp01(volatiles));
  return clamp01(base * (0.3 + 0.85 * vapor) + runaway * atm * 0.8);
};

/**
 * Night-side city-light intensity. Only inhabited worlds glow, and the response
 * is logarithmic so the effect saturates rather than blowing out on a
 * high-population world.
 */
export const nightLightsFor = (population: number | undefined, habitability: string): number => {
  if (habitability !== 'HABITABLE') return 0;
  const pop = Math.max(population ?? 0, 0);
  if (pop <= 0) return 0;
  return clamp01(Math.log10(pop + 1) / 10);
};

/**
 * Atmosphere tint, as a linear RGB triple. The shader multiplies this by the
 * 1/lambda^4 Rayleigh coefficients, so this only carries the *composition* hue:
 * an N2/O2 sky stays blue, a CO2 one goes pale orange, and a cold methane
 * atmosphere goes cyan the way the ice giants do.
 */
export const atmosphereTint = (
  water: number,
  tempK: number,
): [number, number, number] => {
  const methane: [number, number, number] = [0.42, 0.78, 0.90];
  const nitrogen: [number, number, number] = [0.45, 0.65, 1.0];
  const carbonDioxide: [number, number, number] = [0.95, 0.70, 0.45];

  const cold = 1 - smoothstep(90, 200, tempK);
  const hot = smoothstep(330, 620, tempK);

  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const out: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let c = nitrogen[i];
    c = mix(c, methane[i], cold * clamp01(0.4 + water));
    c = mix(c, carbonDioxide[i], hot);
    out[i] = c;
  }
  return out;
};

/**
 * DISPLAY MAPPING — not physics.
 *
 * A real thin-disk peak temperature runs 10^5 K around a supermassive hole to
 * 10^7 K around a stellar-mass one. Every one of those is far into the
 * ultraviolet, so a literal blackbody render of the visible band makes every
 * accretion disk the same saturated blue-white and hides the radial structure
 * entirely.
 *
 * This log-compresses the true peak (`diskPeakTemperatureK` in
 * `utils/relativity.ts`, which is left untouched and is what the derived-values
 * read-outs report) onto the 2000-12000 K band. That band is chosen because it
 * is where blackbody HUE actually varies: above ~10000 K the curve is flat
 * blue-white, so mapping onto 3000-30000 K made every hole the same pale disc
 * and hid both the mass dependence and the radial gradient.
 *
 * The ORDERING and the radial T ~ r^-3/4 falloff are preserved, so a hotter
 * disk still renders bluer than a cooler one and the inner disk still outshines
 * the outer — only the absolute scale is remapped, and only for shading.
 */
export const displayDiskTemperatureK = (realPeakK: number): number => {
  const DISPLAY_MIN = 2000;
  const DISPLAY_MAX = 12000;
  const REAL_MIN = 1e4;
  const REAL_MAX = 1e8;
  if (!(realPeakK > 0)) return DISPLAY_MIN;
  const t = clamp01(
    (Math.log10(realPeakK) - Math.log10(REAL_MIN)) /
      (Math.log10(REAL_MAX) - Math.log10(REAL_MIN)),
  );
  return DISPLAY_MIN + t * (DISPLAY_MAX - DISPLAY_MIN);
};

/** Resolved ring geometry for a body, or null when it has no rings. */
export interface RingVisual {
  opacity: number;
  /** Inner edge, body radii. */
  inner: number;
  /** Outer edge, body radii. */
  outer: number;
}

/**
 * Ring plane for a body, defaulting the edges from the Roche limit when the
 * user has not authored them.
 *
 * Debris cannot accrete into a moon inside the Roche zone, which is why every
 * ring system sits there; anchoring the default inner edge just inside the
 * limit puts an authored ring where one could physically survive. The user can
 * still drag the edges anywhere `sanitizeProperties` allows.
 */
export const ringVisualFor = (body: CelestialBody): RingVisual | null => {
  const p = body.properties ?? {};
  const opacity = clamp01(p.ringOpacity ?? 0);
  if (opacity <= 0.01) return null;

  const density = p.bulkDensity;
  const roche =
    density && density > 0
      ? rocheLimitRadii(density, RING_PARTICLE_DENSITY_GCM3)
      : NaN;
  const defaultOuter = Number.isFinite(roche) ? Math.min(Math.max(roche, 1.6), 4.5) : 2.3;
  const defaultInner = Math.max(defaultOuter * 0.6, 1.15);

  const inner = p.ringInnerRadius ?? defaultInner;
  const outer = Math.max(p.ringOuterRadius ?? defaultOuter, inner + 0.05);
  return { opacity, inner, outer };
};

/**
 * Spin-axis obliquity in degrees.
 *
 * `properties.obliquity` is the real, preset-populated field. `axialTilt` was an
 * Ice-Giant-only inspector value and is kept as a fallback so worlds saved
 * before the two were unified still tilt.
 */
export const obliquityDegOf = (body: CelestialBody): number => {
  const p = body.properties ?? {};
  const v = p.obliquity ?? p.axialTilt;
  return Number.isFinite(v as number) ? (v as number) : 0;
};
