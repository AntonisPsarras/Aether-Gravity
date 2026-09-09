/**
 * Presentation-only remap of the spacetime grid's well depth.
 *
 * The grid's vertex shader sums a Plummer-softened potential,
 * `Σ mᵢ / sqrt(dᵢ² + soft)`, with masses in M⊕. That is physically faithful and
 * visually unusable: a Sun-mass primary (3.3 × 10⁵ M⊕) digs a well of order
 * 10⁴ L* into a 5000 L* plane, so the star's dip clips off-screen while a
 * planet's dip is sub-pixel. The dynamic range is the problem, not the formula.
 *
 * `curvatureDisplayScale` compresses that range with a soft-knee log curve —
 * near-identity below the knee (small wells keep their true shape and relative
 * size), logarithmic above it, then eased onto a soft asymptotic ceiling. It is
 * strictly increasing, so deeper is always drawn deeper and ordering is never
 * inverted — and because the ceiling is asymptotic rather than a clamp, no
 * region of the grid is ever flattened into a plateau.
 *
 * APPLY IT PER BODY, INSIDE THE LOOP, BEFORE SUMMING. Compressing the summed
 * potential instead looks equivalent and is not: log's derivative is `k/depth`,
 * so once one dominant body has built a deep pedestal, every other body's well
 * is scaled by a near-zero slope and vanishes. A black hole (≥ 3 M☉ ≈ 1.0e6 M⊕)
 * digs a pedestal of ~8.7e4 L* and flattened the entire plane this way. Summing
 * already-compressed per-body wells keeps each body's own dip at its own scale,
 * and superposition still holds.
 *
 * NEVER feed the result of this back into a physical calculation. The GLSL twin
 * below is the same function, shared verbatim by the grid shader
 * (`components/SpaceCanvas.tsx`) and the habitable-zone surface
 * (`components/HabitableZoneVisual.tsx`) so the two can never drift apart.
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
