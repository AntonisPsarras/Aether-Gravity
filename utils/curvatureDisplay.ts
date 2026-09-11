/**
 * Presentation-only shaping of the spacetime grid.
 *
 * WHAT THE DEPTH MEANS. The grid is an embedding diagram of the Newtonian
 * potential, Φ = −Σ G mᵢ / rᵢ. In the weak-field limit that is the time-
 * curvature term of the metric (g_tt ≈ −(1 + 2Φ/c²)), which is what actually
 * bends trajectories into orbits — so depth ∝ −Φ is the right quantity to draw,
 * and the slope of the sheet is the local gravitational acceleration.
 *
 * ONE WELL. Every body contributes
 *
 *     depthᵢ(d) = Kᵢ / √(d² + sᵢ²) = Pᵢ · sᵢ / √(d² + sᵢ²)        (`wellDepthAt`)
 *
 * which is exactly the Newtonian Kᵢ/d outside a display core sᵢ — so the sheet
 * is flat far from every mass — and finite inside it, as for a real extended
 * body. Wells are summed, so superposition is exact. How K and s follow from
 * mass is the mode's choice (utils/displayMode.ts): Advanced uses K = κ·m, the
 * true potential; Beginner exaggerates planets.
 *
 * THE SUM, DRAWN. `displayDepth` is the identity below a knee and continues as
 * knee·(1 + ln(D/knee)) above it: C¹, strictly increasing and never flat. A
 * monotone map preserves the potential's level sets, so equipotentials and
 * saddle points stay exact; only the depth axis is compressed, and only where
 * the potential is deeper than the knee (compact objects). The logarithmic
 * tail is what stops a very heavy hole from sinking the whole visible sheet
 * into a flat plateau, which any saturating ceiling would do.
 *
 * The lattice may widen a core it cannot resolve (utils/gridLattice.ts); it
 * keeps K, so the far field is untouched.
 *
 * NEVER feed any of this back into a physical calculation. The GLSL twins
 * below are shared verbatim by the grid shader (`components/SpaceCanvas.tsx`)
 * and the habitable-zone surface (`components/HabitableZoneVisual.tsx`) so the
 * two can never drift apart.
 */
import { GRID_RENDER_SAFETY_MAX_DEPTH, type WellParams } from './displayMode';

/** Smallest display core, L*. Keeps a well finite; far below any lattice cell. */
export const MIN_WELL_CORE = 1e-3;

/**
 * Peak (central) well depth for a body in Beginner Mode, L*. Power-law
 * compression of mass onto a soft asymptotic ceiling — strictly increasing,
 * unit slope at 0, never reaches `maxDepth`.
 *
 * @param massEarth Body mass, M⊕.
 * @param amplitude Depth of a 1 M⊕ well before the ceiling, L*.
 * @param exponent  Mass compression power, 0 < p ≤ 1.
 * @param maxDepth  Asymptotic ceiling, L*. ≤ 0 disables it.
 */
export const wellPeakDepth = (
  massEarth: number,
  amplitude: number,
  exponent: number,
  maxDepth: number,
): number => {
  if (!isFinite(massEarth) || massEarth <= 0 || !(amplitude > 0)) return 0;
  const raw = amplitude * Math.pow(massEarth, exponent);
  if (maxDepth <= 0) return raw;
  return maxDepth * (1 - Math.exp(-raw / maxDepth));
};

/** Display core radius, L*: a multiple of the drawn radius, never below `floor`. */
export const wellCoreRadius = (drawnRadius: number, factor: number, floor: number): number =>
  Math.max(isFinite(drawnRadius) ? drawnRadius * factor : 0, floor, 1);

/** Display core for a body of the given drawn radius in the active mode, L*. */
export const wellCore = (drawnRadius: number, params: WellParams): number => {
  if (params.model === 'exaggerated') {
    return wellCoreRadius(drawnRadius, params.coreFactor, params.coreFloor);
  }
  const r = Number.isFinite(drawnRadius) && drawnRadius > 0 ? drawnRadius * params.coreFactor : 0;
  return Math.max(r, params.coreFloor, MIN_WELL_CORE);
};

/**
 * Peak (central) depth of a body's well with the given core, L*. In the
 * 'potential' model this is K/s with K = κ·m, so the far field K/d is in true
 * proportion to mass for every body.
 */
export const wellPeak = (massEarth: number, core: number, params: WellParams): number => {
  if (params.model === 'exaggerated') {
    return wellPeakDepth(massEarth, params.amplitude, params.exponent, params.maxDepth);
  }
  if (!Number.isFinite(massEarth) || massEarth <= 0 || !(core > 0) || !(params.kappa > 0)) return 0;
  return (params.kappa * massEarth) / core;
};

/**
 * Depth of one body's well at distance `d`, L*. Equals `peak` at d = 0 and is
 * exactly `peak · core / d` (true 1/r) for d ≫ core.
 */
export const wellDepthAt = (d: number, peak: number, core: number): number => {
  if (!(peak > 0)) return 0;
  const s = core > MIN_WELL_CORE ? core : MIN_WELL_CORE;
  return (peak * s) / Math.sqrt(d * d + s * s);
};

/** GLSL twin of `wellDepthAt`. Keep the bodies of the two versions in step. */
export const CURVATURE_WELL_GLSL = /* glsl */ `
float wellDepthAt(float d, float peak, float core) {
  if (peak <= 0.0) return 0.0;
  float s = max(core, ${MIN_WELL_CORE.toExponential()});
  return peak * s / sqrt(d * d + s * s);
}
`;

/**
 * Drawn depth for a summed raw depth `depth`, L*: identity up to `knee`, then
 * knee·(1 + ln(depth/knee)), clamped only at the render-safety limit.
 */
export const displayDepth = (depth: number, knee: number): number => {
  if (!(depth > 0)) return 0;
  if (!Number.isFinite(depth)) return GRID_RENDER_SAFETY_MAX_DEPTH;
  const k = knee >= 1 ? knee : 1;
  const v = depth <= k ? depth : k * (1 + Math.log(depth / k));
  return v < GRID_RENDER_SAFETY_MAX_DEPTH ? v : GRID_RENDER_SAFETY_MAX_DEPTH;
};

/**
 * GLSL twin of `displayDepth`. `log` is GLSL's natural log, matching
 * `Math.log`, so the two agree to float precision. Keep them in step.
 */
export const DISPLAY_DEPTH_GLSL = /* glsl */ `
float displayDepth(float depth, float knee) {
  if (depth <= 0.0) return 0.0;
  float k = max(knee, 1.0);
  float v = depth <= k ? depth : k * (1.0 + log(depth / k));
  return min(v, ${GRID_RENDER_SAFETY_MAX_DEPTH.toFixed(1)});
}
`;
