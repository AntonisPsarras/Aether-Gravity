# Environmental rendering

These components are illustrative rendering layers. They never supply mass, forces,
temperatures or orbital elements to the integrator. All resources are generated locally.

`environmentQualityForDevice` in `../CanvasSetup.tsx` is the central quality hook. The
provider receives the effective tier after context-loss fallback, plus touch detection.
Existing grid brightness, device detection and DPR limits are unchanged. The menu now
uses `AdaptivePostFX` too; there is still only one composer per canvas.

## Effects and approximate cost

- **Gas and supernova remnants:** 4 background billboard draws on high, 2 on low;
  up to 2 local emitters share 2 layers each on high or 1 on low. Maximum 8/4 draws
  in the simulation; menu uses 4/2. Transparent fill rate and 5/3 procedural-noise
  octaves dominate cost. Hooks: `gasBackgroundLayers`, `gasLocalLayers`,
  `gasEmitterCap`, `gasOctaves`, `gasOpacity`. Remnants last 24 display seconds and
  clear on a world replacement; pause freezes their age. Reduced motion freezes
  expansion/drift while allowing their opacity to fade. Hot-star selection uses
  luminosity; temperature influences the illustrative gas tint, not chemical data.
- **Reflected environment light:** no additional body draws, one filtered texture
  sample per reflective surface fragment and per active disk layer. One shared
  64×32 RGBA texture (8 KiB) on high, 32×16 (2 KiB) on low, excluding driver overhead.
  Hooks: `reflectionResolution`, `reflectionIntensity` (zero disables the contribution).
  This is blurred procedural ambient radiance, not an exact reflection probe. Existing
  surface GGX, terrain masks, disk emission, redshift and lensing remain intact.
- **Radiation:** 1 wind-shell draw per star or 2 single-pass transparent beam draws
  per compact object. At most 8 emitters on high / 4 on low, prioritizing pulsars and
  black holes. Hooks: `radiationEmitterCap`, `radiationSegments`, `radiationDetail`,
  `radiationAnimationRate`. Zero accretion hides BH jets. Axes follow existing body
  tilt; magnetic-axis misalignment and bounded animation speeds are illustrative,
  not changes to stored periods or magnetic fields. Uses existing bloom; reduced
  motion and pause freeze the new radiation animation.
- **Dust:** 1 draw, 1,500 vertices on desktop high / 525 on touch high / 240 on low.
  Soft, depth-faded sprites with seeded shader drift; no CPU force loop or GPU compute
  render targets. Hooks: `dustCount`, `dustSize`, `dustMotion`. Existing Dust toggle
  controls mounting; pause/reduced motion freeze drift while camera/origin changes
  still update placement.
- **Orbit estimates:** 1 line draw per valid body, 128 segments at 5 Hz on high or
  64 at 2 Hz on low. Cost is linear in samples, plus the existing parent heuristic
  repeated privately after edits. Hooks: `orbitSegments`, `orbitRefreshHz`. Selection
  increases opacity. Escape paths are finite forward conic arcs clipped to 100,000
  render units; invalid/degenerate predictions are omitted. Geometry is independent
  of the live solver, parents translate every frame, and edits invalidate immediately.

TODO for the later low-end pass: profile transparent coverage on older GPUs, then
tune the existing profile fields before adding further shader branches. No second
device-detection system or reflection capture pipeline is needed.

## Validation

The E2E-only scene inspector in `TestMetricsCollector` records geometry counts and
whole-frame renderer calls locally. It is not installed in ordinary application runs.

On this machine's Chromium, a 2-second 21-body Solar System sample at DPR 1 measured
about 60.5 FPS on high (1280×800; 85 total renderer calls in the sampled frame), and
60.3 FPS on low/touch (480×850; 45 calls). Visible effect geometry was 4/2 gas layers,
1 dust draw, 1 stellar wind shell and 20 orbit lines. Whole-frame counts include
existing bodies, grid and post-processing; they vary with visibility. These short
development-server samples are not isolated GPU timing or older-device guarantees.

The compact-object fixture exercised 6 gas layers and 5 radiation draws with active
black-hole lensing. Tests also cover orbital edits while paused, moon display alignment,
floating-origin recentering, visibility toggling, deletion, context restoration,
reduced motion, and remnant expansion/fading/reset. Unit tests cover bound, eccentric,
inclined, parabolic/hyperbolic and degenerate paths and state immutability.

Run the installed tools without writing temporary config bundles into node_modules:

```
npx tsc --noEmit
npx vitest run --configLoader runner
npx vite build --configLoader runner
npx playwright test e2e/environment.spec.ts --workers=1
```

Vite/Vitest caches are under `.cache`. The Vite config uses native ESM path resolution
to support its in-memory runner. No dependencies or lockfiles need modification.
