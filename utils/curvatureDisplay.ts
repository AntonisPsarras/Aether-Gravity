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
 * size), logarithmic above it, then hard-clamped. It is monotonic, so deeper is
 * always drawn deeper; ordering is never inverted.
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
 * @param maxDepth Hard ceiling on the returned depth, L*.
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
  return maxDepth > 0 ? Math.min(mixed, maxDepth) : mixed;
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
  return maxDepth > 0.0 ? min(mixed, maxDepth) : mixed;
}
`;
