# Low-end performance optimization report

## Hot spots and fixes

- **Steady-state physics allocation:** captured fractional `accumulator` / `simTime`
  values were boxed by V8, `Set.clear()` replaced an already-empty collision set,
  and collision/evolution wrappers created empty result arrays and objects. The clocks
  now live in a reusable `Float64Array`, empty collision sets are not cleared, the
  engine owns reusable event buffers, and the hot fixed-step API returns a primitive.
  A warmed three-second Chromium heap-allocation sample at a 64-byte interval now
  reports zero sampled bytes in Verlet, acceleration, bounds, collision, and fixed-step
  functions (the first measurement found 264 bytes in `runFixedSteps` and
  `scanCollisionsInPlace`).
- **Low-tier force budget:** high tier remains at 1/1024 year and eight catch-up steps.
  Low tier uses 1/512 year and six catch-up steps, cutting normal force evaluations by
  approximately 50% while retaining enough budget for 4x playback at 30 FPS. A ten-year
  orbit regression keeps radial drift below 0.1% and the high/low phase separation below
  one rendered pixel for a 360-pixel projected orbit radius.
- **Environment selection:** gas previously allocated and sorted two arrays every frame
  (roughly 120 temporary arrays/second at 60 FPS). A caller-owned, capped insertion
  buffer now refreshes at 2 Hz. Radiation emitter selection is memoized and emitters
  read live positions without per-frame callback allocation or render-object lookup.
- **React/store reconciliation:** periodic full-body Zustand synchronization was
  removed. Physics writes the full store only for structural collision/evolution
  events; saving reads the registered live snapshot, and only an open inspector samples
  its selected body at 2 Hz. Broad store subscriptions were split into primitive
  selectors and body meshes are memoized. The perf regression confirms the store body
  array retains identity throughout a collision-free soak.
- **Playwright teardown:** Playwright's Windows process-tree termination hung after
  otherwise completed suites. The test server now uses Vite's JS API and a cache-only
  teardown sentinel, allowing the server to close its sockets and every suite to exit
  normally.

## Low-tier visual paths

- Planet surfaces and rings use 3/6 and 2/4 procedural octaves respectively only while
  their projected radius is below 110 pixels. Atmospheres use 4/8 samples under the
  same rule. Selected or close bodies restore the detailed shader path, including the
  volumetric cloud shell.
- Black-hole lensing remains enabled: one shared 128x128 capture every sixth frame
  replaces 256x256 every third frame, an 87.5% reduction in captured pixels per display
  frame. The low disk samples it once across its three analytic parallax layers, and a
  cheap analytic ergosphere remains visible.
- Low tier retains bloom through a quarter-resolution, three-level, zero-MSAA bloom-only
  composer. Film grain and vignette are omitted; calibrated exposure and grid gain retain
  the scene's distant luminance. High/touch-high/desktop post-processing is unchanged.
- Gas uses 2/4 background layers, 1/2 local layers, and 3/5 noise octaves. Radiation uses
  12/24 radial segments and a noise-free distant path. Dust uses 240 deterministic points
  versus 1,500 on desktop, with compensated size/opacity to retain distant density.
- Existing low-tier orbit, grid, reflection, star-field, and geometry budgets remain in
  the central quality profile rather than being duplicated by individual effects.

High-tier shader branches, raymarch counts, geometry segments, particle counts, DPR
range, black-hole capture cadence/resolution, and post-processing constants are unchanged.
The resulting capable-hardware output follows the same rendering path and is
perceptually unchanged.

## Explicit low-tier-only exceptions

- Simulation canvas DPR is capped to 1.25 on positively detected low tier. This is the
  only broadly perceptible quality/cost tradeoff and is necessary to bound fill rate on
  older integrated/mobile GPUs. Close-body procedural detail is restored independently
  of DPR so the selected object remains crisp.
- Film grain and vignette remain omitted on low tier because their full-screen passes
  have negligible scene-information value at the capped DPR. Bloom, lensing, clouds,
  radiation, dust, reflections, and gas are retained through cheaper equivalents rather
  than disabled.

## Verification

- `npx tsc --noEmit`: pass.
- `npx vitest run --configLoader runner`: pass (340 tests).
- `npx vite build --configLoader runner`: pass.
- `npx playwright test e2e/environment.spec.ts --workers=1`: pass (7 tests; high and
  low distant/close screenshots attached, context restoration and compact objects
  covered).
- Ten-second perf soak: minimal scene 62.1 FPS average, 20-body stress 60.3 FPS,
  21-body Solar System 60.3 FPS, and low-tier mobile 60.7 FPS. All had zero context
  losses and flat sampled heap readings. The allocation/Zustand regression also passed.

No dependency or lockfile was installed, updated, or modified.
