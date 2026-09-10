/**
 * Presentation-only shaping of the spacetime grid.
 *
 * WHAT THE DEPTH MEANS. The grid is an embedding diagram of the Newtonian
 * potential, Φ = −Σ G mᵢ / rᵢ. In the weak-field limit that is the time-
 * curvature term of the metric (g_tt ≈ −(1 + 2Φ/c²)), which is what actually
 * bends trajectories into orbits — so depth ∝ −Φ is the right quantity to draw.
 *
 * WHAT HAS TO BE COMPRESSED, AND WHAT MUST NOT BE. The true Sun : Earth depth
 * ratio is 3.3 × 10⁵ : 1; no plane can show both. The earlier version therefore
 * log-compressed the *field* value at every grid vertex. That also compressed
 * the *shape*: a 1/r well became ~log(1/r), which barely decays, so a single
 * star sank the entire visible plane into a pedestal (depth 121 at the Sun, 73
 * at Neptune, still 45 six thousand units out) and its funnel read as flat.
 *
 * Now only the AMPLITUDE is compressed, per body, and the shape is left alone:
 *
 *     depthᵢ(d) = Pᵢ · sᵢ / √(d² + sᵢ²)        (`wellDepthAt`)
 *     Pᵢ        = softCeil(A · mᵢ^p)            (`wellPeakDepth`)
 *
 * Outside the core radius sᵢ this is exactly ∝ 1/d — the true Newtonian
 * falloff — so the grid is flat far from any mass. Inside it is a smooth finite
 * core, as a real extended body has. The power law keeps mass ordering and is
 * scale-free (every 10× in mass is 10^p× deeper); the soft ceiling bounds black
 * holes without a plateau. Superposition holds because wells are summed.
 *
 * `curvatureDisplayScale` (soft-knee log) is still used for the tidal tint.
 *
 * NEVER feed any of this back into a physical calculation. The GLSL twins
 * below are shared verbatim by the grid shader (`components/SpaceCanvas.tsx`)
 * and the habitable-zone surface (`components/HabitableZoneVisual.tsx`) so the
 * two can never drift apart.
 */

/**
 * @param depth    Raw well depth, L*, non-negative (i.e. `-displacement`).
 * @param knee     Depth below which the curve is ~identity, L*.
 * @param amount   0 = raw physical depth, 1 = fully compressed.
 * @param maxDepth Asymptotic ceiling on the returned depth, L*. Approached but
 *                 never reached, so the funnel never develops a flat bottom.
 */
export const curvatureDisplayScale = (
  depth: number,
  knee: number,
  amount: number,
  maxDepth: number,
): number => {
  if (!isFinite(depth) || depth <= 0) return 0;
  if (amount <= 0) return depth;
  const k = knee > 0 ? knee : 1;
  const compressed = k * Math.log(1 + depth / k);
  const a = amount >= 1 ? 1 : amount;
  const mixed = depth * (1 - a) + compressed * a;
  if (maxDepth <= 0) return mixed;
  // Soft ceiling, not `min(mixed, maxDepth)`. A hard clamp flattens every
  // vertex whose well is past the ceiling into one plateau — for a 100 M☉ hole
  // that is a disc ~500 L* across with a hard crease at its rim, which is the
  // same "the grid went flat" failure in miniature. `M(1 - e^(-x/M))` is
  // strictly increasing, has unit slope at 0 (so small wells are still drawn at
  // their true depth), and tends to `maxDepth` without ever touching it.
  return maxDepth * (1 - Math.exp(-mixed / maxDepth));
};

/**
 * The same function in GLSL, injected into both curvature shaders.
 *
 * `log` is GLSL's natural log, matching `Math.log`, so the two implementations
 * agree to float precision. Keep the bodies of the two versions in step.
 */
export const CURVATURE_DISPLAY_GLSL = /* glsl */ `
float curvatureDisplayScale(float depth, float knee, float amount, float maxDepth) {
  if (depth <= 0.0) return 0.0;
  if (amount <= 0.0) return depth;
  float k = max(knee, 1.0);
  float compressed = k * log(1.0 + depth / k);
  float mixed = mix(depth, compressed, clamp(amount, 0.0, 1.0));
  if (maxDepth <= 0.0) return mixed;
  return maxDepth * (1.0 - exp(-mixed / maxDepth));
}
`;

/**
 * Peak (central) well depth for a body, L*. Power-law compression of mass onto
 * a soft asymptotic ceiling — strictly increasing, unit slope at 0, never
 * reaches `maxDepth`. Computed on the CPU once per body per frame.
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

/**
 * Depth of one body's well at distance `d`, L*. Equals `peak` at d = 0 and is
 * exactly `peak · core / d` (true 1/r) for d ≫ core.
 */
export const wellDepthAt = (d: number, peak: number, core: number): number => {
  if (!(peak > 0)) return 0;
  const s = core > 1 ? core : 1;
  return (peak * s) / Math.sqrt(d * d + s * s);
};

/** GLSL twin of `wellDepthAt`. Keep the bodies of the two versions in step. */
export const CURVATURE_WELL_GLSL = /* glsl */ `
float wellDepthAt(float d, float peak, float core) {
  if (peak <= 0.0) return 0.0;
  float s = max(core, 1.0);
  return peak * s / sqrt(d * d + s * s);
}
`;
