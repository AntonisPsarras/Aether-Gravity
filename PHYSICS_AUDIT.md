# Current physics model — 14 September 2026

The implementation and current regression evidence are summarized in [PRODUCTION_READINESS](docs/PRODUCTION_READINESS.md) and [Scientific presets](docs/SCIENTIFIC_PRESETS.md). The report below this section is **historical**: its Euler, arbitrary-unit and Float32 descriptions do not describe the current engine.

Current integration uses Velocity-Verlet with double-precision vectors and acceleration buffers. Canonical units are Earth mass, 0.025 AU and Julian year, with G derived from SI. The base fixed step is 1/1024 year; encounter limits and scientific pacing can reduce it to 2^-18 year. Frame catch-up is bounded; discarded elapsed wall time is not silently replayed after backgrounding. Fixed-step reversibility applies only without dissipative events, clamps or changing step selection.

This review repairs partial acceleration-cache initialization and collision accounting. Ordinary impacts conserve total mass and linear momentum; fragment positions are recentered to preserve the barycentre. Orbital angular momentum that cannot be represented after merging is retained in intrinsic angular-momentum fields in canonical M L²/T units. These fields are accounting, not a rigid-body spin model. Compact interactions retain an illustrative 99% mass fraction; events carry the lost mass and momentum. Their wave amplitude is not radiated energy in joules. Supernova loss is similarly explicit. The model is Newtonian; Kerr formulas describe isolated geometry and visual approximations, not relativistic N-body dynamics.

Sandbox visual-radius collisions are retained deliberately; scientific presets use physical radii. Stellar classification, fragmentation, accretion spin and instant supernova transitions are illustrative approximations. Derived SI properties use physical radii. The supported mass bound can prevent an over-limit merger. There is no claim of conservative or historically reversible dynamics through these model boundaries.

New deterministic regressions cover 100 stable orbits, forward/reverse trajectories, partial cache invalidation, collision barycentre, mass, linear momentum and total angular bookkeeping. Existing SI, Kepler, relativity, frame-partition, extreme-input and 1000-orbit scientific tests remain enforced. Tolerances and measured results are in the release report.

---

# Historical physics and data audit (superseded)

# Aether Gravity — Physics & Data Audit Report

> **Environmental rendering update (September 2026):** The unused GPGPU source files and null visualizer are now removed as well. `components/Environment/DecorativeDust.tsx` replaces the old CPU attraction-based dust with one seeded shader point field, with no physics feedback. Gas/remnants, radiation and reflected ambient light share the existing device tiers and bloom pipeline. Persistent orbit estimates read live state and are explicitly labeled as instantaneous two-body approximations; moon paths use the existing display exaggeration. The only simulation-state handoff fix forwards user-edited satellite `orbit` values through `updateBody` to the live body. No integrator, gravitational constants, physical units, body textures or relativistic calculations were changed. Rendering budgets are documented in `components/Environment/README.md`.

> **Note (May 2026):** This document describes an **earlier** engine snapshot. Several items below have since been addressed: Velocity-Verlet fixed stepping (`utils/physicsSoA.ts`), property persistence, input clamping (`utils/physicsBounds.ts`), the disconnected GPGPU path was **removed**, and hot-path GC in `HabitableZoneVisual` / collision FX was reduced. Treat remaining open items (unit-system consistency, SI display calibration) as backlog, not current blockers.

**Audit scope:** `utils/physicsUtils.ts`, `utils/store.ts`, `components/SpaceCanvas.tsx` (`PhysicsEngine`), `components/Panels.tsx`, `components/UniverseOutliner.tsx`, `constants.ts`, `types.ts`.
**Performance target:** 60 FPS @ ≤ 20 interactive bodies on a 2021-class mid-range mobile (Snapdragon 7-series / A14).
**Status (historical):** Engine is functional but mixes arbitrary "game units" with formula-driven derivations, causing inconsistent scientific accuracy. Integration scheme is *partially* symplectic but the orchestration around it (variable-dt substeps, store round-trips, ref clobbering) defeats the stability gains.

---

## 1. Executive Summary

| Concern | Verdict |
|---|---|
| Integration method | Already **Semi-Implicit (Symplectic) Euler** — good baseline, but framerate-coupled `dt` makes it non-deterministic. Recommend **fixed-timestep accumulator + Velocity-Verlet** for orbit fidelity. |
| Force calculation | **Correct** (`a = G·m₂ / r²`, normalized with `invDist`). Softening `ε² = 0.1` is OK but unitless. |
| Unit system | **Inconsistent.** `G = 0.8`, mass in "game units" (Planet 5–150, Star 800–2000), but density (`g/cm³`), gravity (`m/s²`), escape velocity (`km/s`) are *displayed* as SI. This is the single biggest scientific accuracy bug. |
| Property generation | Partially formulaic for terrestrials (composition → density → radius → gravity/escape). **Stars, giants, neutron stars use random ranges** with no mass-radius / mass-luminosity relations. Temperatures are linear `300 − 0.5·d` (not Stefan-Boltzmann). |
| Classification constraints | Not enforced. A `Planet` can have mass 700 and density 0.5 g/cm³ without re-classification. |
| UI units | Mass, radius shown as raw numbers with no unit label. Density/gravity/escape velocity labelled SI but derived from arbitrary mass units → numerically wrong. |
| Performance | Hot path uses a reused `Float32Array` ✓, but: (a) `filter(isValidBody)` allocates every step, (b) `findDominantParent` is O(N²) and called from `BodyMesh.useFrame` per body per frame, (c) `data.position.clone().sub(...)` allocates a Vector3 per body per frame, (d) the `setBodies` store write triggers React reconciliation every ~1 s. |
| GPGPU pipeline | Disconnected from gameplay (`count = 1024` particles seeded once from first 1024 bodies and never synced back). Useful as decorative dust cloud, not as the physics engine. |

---

## 2. Current State — Detailed Findings

### 2.1 Integration loop (`utils/physicsUtils.ts:308` → `calculateGravityInPlace`)

```308:355:utils/physicsUtils.ts
export const calculateGravityInPlace = (bodies: CelestialBody[], Gt: number): CelestialBody[] => {
  // ...
  const validBodies = bodies.filter(isValidBody);          // [A] allocates every step
  // ...
  for (let i = 0; i < len; i++) {                           // [B] O(N²) pairwise accel
    // a_i = Σ_j G·m_j · r̂_ij / |r_ij|²
  }
  for (let i = 0; i < len; i++) {
    b.velocity.x += accel[base] * Gt;                       // [C] v ← v + a·dt   (symplectic)
    b.position.addScaledVector(b.velocity, Gt);             //     x ← x + v·dt   (uses new v)
  }
};
```

**Findings**
- **It is already Semi-Implicit Euler**, not pure forward Euler. This is good news — energy drift over many orbits is bounded, unlike forward Euler which spirals outward. The user's hypothesis "is it naïve Euler?" → answer is **no, but only just**.
- The force math at `[B]` is correct: it computes acceleration on body *i*, not force, so `m₁` is correctly absent. `softening = 0.1` prevents the singularity at close approach.
- `[A]` filters & re-allocates the body array on every substep. With 8 substeps × 60 fps = 480 array allocations/s.

### 2.2 Orchestration (`components/SpaceCanvas.tsx:328` → `PhysicsEngine.useFrame`)

```336:357:components/SpaceCanvas.tsx
const dt = (Math.min(delta, 0.1) * speed) / 8;     // variable dt, then 8 fixed substeps
for (let i = 0; i < 8; i++) {
  activeBodies = calculateGravityInPlace(activeBodies, dt);
  const colResult = checkCollisions(activeBodies, currentTime);
  if (colResult.merged) { ... break; }
}
```

**Problems**
1. `dt` is derived from frame `delta` — so a 30 fps device runs the simulation at half speed (or merges 16× more energy per step). Orbits change shape when the user is on a slow phone.
2. `Math.min(delta, 0.1)` caps to 100 ms but doesn't compensate — frames longer than 100 ms simply *lose* simulated time (slow-motion).
3. The 8 substeps are inside one `useFrame` — fine for stability, but the per-substep collision check re-iterates O(N²) ⇒ 8 × O(N²) per render frame.
4. `setBodies(evolvedBodies)` is called when `elapsedTime % 1.0 < 0.05` — this is a *racy* gate (depends on render phase) and writes the entire physics array back into Zustand, triggering re-renders of every panel and `BodyMesh`. Inspector charts will flicker once per sim-second.
5. The `useEffect([bodies])` on `SpaceCanvas` rebuilds `bodiesRef.current` from store every time the store changes — meaning a UI mass-edit *clobbers* in-progress physics state mid-step.

### 2.3 GPGPU pipeline (`components/Physics/GPGPUPhysics.tsx`)

- Reads bodies **once** at mount (`useEffect` deps: `[count, gl, bodies.current.length]`).
- Runs an O(N²) nested loop *inside the fragment shader* (`for (float y...) for (float x...)`). At `count=1024`, every fragment performs 1024 texture lookups. On mobile WebGL2 with a 32×32 texture this is ≈ 1 M tex2D calls per `compute()` call, but the result is never written back to `CelestialBody`.
- Conclusion: the GPGPU path is **a decorative particle effect** that costs real GPU time. Either wire it to gameplay (best path forward) or remove it.

### 2.4 Property generation (`generateSystem` and `calculatePlanetaryPhysics`)

```460:524:utils/physicsUtils.ts
mass: config.massRange[0] + Math.random() * (config.massRange[1] - config.massRange[0]),
radius: config.radiusRange[0] + Math.random() * (config.radiusRange[1] - config.radiusRange[0]),
// ...
temperature: 300 - (dist * 0.5),     // linear, not Stefan-Boltzmann
```

- **Terrestrial planets**: `calculatePlanetaryPhysics` derives density from composition fractions (`ρ⁻¹ = Σ fᵢ/ρᵢ`), then volume from mass/density, then radius. This is sound (volume-weighted mean of constituent densities), **but** the `RADIUS_SCALE_FACTOR = 1.8` is a fudge to map the result back into "game radius units".
- **`surfaceGravity = G·M/R² × 10`** and **`escapeVelocity = √(2GM/R) × 2`** — both have arbitrary numeric multipliers (`× 10`, `× 2`) to make displayed numbers "look like" SI values. They are not SI.
- **Stars / giants / neutron stars / black holes**: pure random ranges, no mass-luminosity, no Schwarzschild radius, no neutron-star equation of state.
- **Temperature**: `300 − 0.5·d` ignores luminosity, albedo, atmospheric greenhouse. The Habitable Zone visualization uses `L ∝ (M/1000)³` which is in the right ballpark for main sequence (`L ∝ M^3.5`) but is never used to compute planet equilibrium temperature.

### 2.5 Classification constraints

`EVOLUTION_THRESHOLDS` in `constants.ts` only enforces evolution at extreme mass (`Planet → Star` at 800, `Star → Black Hole` at 3000). There is no constraint that:
- An `Ice Giant` must have low density (< 2 g/cm³)
- A `Neutron Star` must have ρ > 10¹⁷ kg/m³
- A `Black Hole` radius must equal the Schwarzschild radius `Rₛ = 2GM/c²`

### 2.6 `findDominantParent` semantics bug

```64:67:utils/physicsUtils.ts
if (bestParent && (bestParent as CelestialBody).mass < body.mass * 0.5) return null;
```

The comment says "Only orbit heavier things". The check returns `null` only if the parent is **less than half** of the body's mass — so a planet of mass 10 can still claim a parent of mass 6 (since 6 ≥ 5). The correct guard for a strict Hill-sphere "parent must dominate" rule is `parent.mass > body.mass` (or better, mass ratio > 10).

Worse, this function is called from **three** hot paths per frame:
1. `BodyMesh.useFrame` for tidally-locked rotation lookup.
2. `BodyMesh.useFrame` for atmosphere sun direction.
3. `StabilityOverlay.useFrame` for Hill/Roche.

That's `O(N²)` *per visible body per frame* — at 20 bodies that's 400 vector ops/frame just for parent discovery, plus a `.filter` allocation each call.

### 2.7 UI display (`Panels.tsx` Inspector + `UniverseOutliner.tsx`)

| Field | Where | Current label | Units shown | Truthful? |
|---|---|---|---|---|
| Mass | Inspector → Properties | `Mass` | none | ✗ unitless game number |
| Radius | Inspector → Properties | `Radius` | none | ✗ unitless game number |
| Temperature | Inspector → Star block only | `Surface Temp` | `K` | ✓ for stars, but planets never show it |
| Density | Inspector → Geophysics | `Density` | `g/cm³` | ✗ numerically wrong if mass isn't in real units |
| Gravity | Inspector → Geophysics | `Gravity` | `m/s²` | ✗ same reason + arbitrary `×10` scaling |
| Esc. Vel | Inspector → Geophysics | `Esc. Vel` | `km/s` | ✗ same reason + arbitrary `×2` scaling |
| Orbital elements | Inspector → Orbit tab | `a, e, i, Ω, ω, ν` | degrees / unitless | computed but **never applied back to body state** (sliders are inert) |
| Type | UniverseOutliner | icon only | — | OK |

The Orbit tab is dead UI: the sliders mutate local `useState` but never call `calculateOrbitalState` to push position/velocity onto the body.

### 2.8 Performance hot spots (allocation audit)

| Site | Per-frame cost | Severity |
|---|---|---|
| `bodies.filter(isValidBody)` in physics loop | 1 new array / substep × 8 | medium |
| `bodies.map(b => ({...b, position: b.position.clone(), velocity: b.velocity.clone()}))` in `useEffect([bodies])` | new array + 2N Vector3 / store change | **high** |
| `body.position.clone().sub(floatingOffset.current)` in `BodyMesh` | 1 Vector3 / body / frame × N bodies | medium |
| `findDominantParent` called per body per frame | new filter array + O(N) Vector3 distance ops × N | **high** |
| `bodies.filter(b => ['Star','Red Giant'].includes(b.type))` in `SpaceCanvas` render | 1 / render | low (cache with `useMemo`) |
| `setBodies(evolvedBodies)` every ~1 s | full React reconciliation of every panel | **high (jank)** |
| GPGPU `compute()` 1024-body O(N²) shader | ~1 M tex2D / frame | medium on mobile |

---

## 3. Proposed Scaling System ("Aether Units")

Adopt one canonical unit set in code, derive everything else from it.

| Quantity | Symbol | Sim unit | SI equivalent |
|---|---|---|---|
| Length | `L*` | 1 = 1 000 km | 10⁶ m |
| Mass | `M*` | 1 = 1 Earth mass (M⊕) | 5.972 × 10²⁴ kg |
| Time | `T*` | 1 = 1 hour | 3 600 s |
| Velocity | `V*` | 1 L*/T* | 277.78 m/s |
| Gravitational constant | `G*` | derived | G·M⊕·T*²/L*³ ≈ **0.4980** |

With this choice:
- Earth: R = 6.371 L*, M = 1 M*, g = 9.81 m/s² ⇒ rendered correctly when we multiply our SI accessors out.
- Jupiter: R ≈ 70 L*, M ≈ 317.8 M*.
- Sun: R ≈ 696 L*, M ≈ 333 000 M* — too large to render at 1:1, so we render stars at logarithmic visual scale while keeping physical mass real.
- Sim domain stays well within float32 precision: positions up to a few thousand L* (≪ 10⁷ where float32 mantissa starts losing sub-unit resolution). The existing `floatingOffset` floating-origin trick is retained for safety on long sessions.

**Visual vs. physical radius split:**
- `body.physicalRadius` — in L*, used for gravity/density/Roche math.
- `body.visualRadius` — computed in render layer (`PlanetMesh`/`BodyMesh`) as `log10(physicalRadius)` for stars or `physicalRadius` for planets, with category-specific multipliers. **Never feed `visualRadius` back into the physics loop.**

---

## 4. Proposed Integration Method: **Velocity-Verlet with fixed-timestep accumulator**

Velocity-Verlet is symplectic, second-order accurate, costs **one** force evaluation per step (same as Semi-Implicit Euler when accelerations are reused), and has dramatically smaller eccentricity drift over thousands of orbits. RK4 is 4× the cost for one extra order of accuracy — not worth it on mobile when our forces are not stiff.

```text
  a₀  = a(x₀)               // computed once at world load
  Loop:
    x₁  = x₀ + v₀·dt + ½·a₀·dt²
    a₁  = a(x₁)              // ONE pair-force pass
    v₁  = v₀ + ½·(a₀ + a₁)·dt
    a₀  ← a₁                 // carry forward, no extra force pass next step
```

Cost per step: 1 × O(N²) force pass + 2 × O(N) state updates — **same** as current symplectic Euler, with strictly better orbit shape preservation.

**Fixed-timestep accumulator** (decouples sim from render frame rate):

```ts
const FIXED_DT = 1 / 240;         // 240 Hz physics ticks (≈ 4.16 ms)
const MAX_CATCHUP = 8;            // never simulate more than ~33 ms of catch-up
let acc = 0;
useFrame((_, delta) => {
  acc += Math.min(delta, 0.1) * speed;
  let steps = 0;
  while (acc >= FIXED_DT && steps < MAX_CATCHUP) {
    verletStep(FIXED_DT);
    acc -= FIXED_DT;
    steps++;
  }
});
```

This guarantees deterministic orbits regardless of device frame rate and survives backgrounded tabs without slingshotting bodies through stars.

---

## 5. Proposed Formulaic Property Pipeline

All properties become **derived** from a small set of primary degrees of freedom. The Inspector edits *primaries only*; derived values are read-only.

### 5.1 Terrestrial / Dwarf / Ice Giant
Primaries: `mass (M⊕)`, `compositionIron`, `compositionSilicates`, `compositionWater` (sum = 1).
Derived:
- `bulkDensity = 1 / Σ(fᵢ / ρᵢ)`  *(unchanged; already correct)*
- `physicalRadius = ∛(3·mass / (4π·bulkDensity))` in L*
- `surfaceGravity = G·mass / R²` → multiply by `(L*/T*²) → m/s²` conversion = **77.16**
- `escapeVelocity = √(2·G·mass / R)` → multiply by `(L*/T*) → km/s` conversion = **0.27778**
- `equilibriumTemperature` — see §5.4

### 5.2 Star
Primary: `mass (M⊕)`.
Derived (main sequence):
- `physicalRadius = R⊕ · (M / M⊕)^0.8` for M < 1 M☉, `… ^0.57` above
- `luminosity   = L☉ · (M / M☉)^3.5`
- `effectiveTemperature = T☉ · (L / R²)^¼` (Stefan-Boltzmann on the star itself)
- `spectralType` from `effectiveTemperature` via existing `getSpectralType`
- Colour from `kelvinToRgb(effectiveTemperature)`

### 5.3 Compact remnants
- **Neutron Star**: enforce `radius ∈ [10, 14] km` → in L* that's `0.010–0.014`. Density follows from `M/V`; if user pushes mass above ~2.16 M☉ (TOV limit) → auto-evolve to Black Hole.
- **Black Hole**: `physicalRadius = 2·G·mass / c²` (Schwarzschild). With `c = 299 792 458 m/s` and our units this becomes `Rₛ = (2·G* / c*²) · M`. Render scale is logarithmic.

### 5.4 Planet equilibrium temperature (Stefan-Boltzmann)

```
T_eq = ( L_star · (1 − α) / (16 · π · σ · d²) )^¼
```
Where:
- `L_star` from §5.2
- `α` (Bond albedo) defaults from composition: water-rich → 0.35, silicate → 0.15, iron → 0.10
- `d` distance to dominant star in metres
- `σ = 5.670374 × 10⁻⁸ W·m⁻²·K⁻⁴`

Greenhouse correction (optional): `T_surf = T_eq · (1 + 0.5·atmosphereDensity)` clamped to ≤ 800 K for non-stellar bodies.

### 5.5 Classification re-validation
After every primary edit, run `classifyBody(mass, density)`:

| Type | Mass range (M⊕) | Density (g/cm³) |
|---|---|---|
| Dwarf | 0.01 – 0.5 | any |
| Planet | 0.5 – 10 | > 3 |
| Ice Giant | 10 – 50 | 1 – 3 |
| Gas Giant *(new)* | 50 – 4 000 | < 1.5 |
| Brown Dwarf *(new)* | 4 000 – 25 000 | 1 – 100 |
| Star | 25 000 – 50 × 10⁶ | depends on stage |
| Neutron Star | 4 × 10⁵ – 7 × 10⁵ | ≈ 4 × 10¹⁷ |
| Black Hole | > 9 × 10⁵ | — (Rₛ defines it) |

If the user pushes a primary out of band, auto-reclassify and emit a `evolution` event so the UI animates the transition (re-using existing `checkEvolution` plumbing).

---

## 6. Proposed UI Standardization

Centralize formatting in a new `utils/units.ts`:

```ts
export const fmtMass     = (m: number) => m < 0.01 ? `${(m*317.8).toFixed(2)} M_J` : `${m.toFixed(2)} M⊕`;
export const fmtRadius   = (rLstar: number) => `${(rLstar*1000).toFixed(0)} km`;
export const fmtTemp     = (k: number) => `${k.toFixed(0)} K`;
export const fmtGravity  = (g: number) => `${g.toFixed(2)} m/s²`;
export const fmtEscVel   = (v: number) => `${v.toFixed(2)} km/s`;
export const fmtDistance = (lstar: number) => lstar > 14959.787 ? `${(lstar/14959.787).toFixed(2)} AU` : `${lstar.toFixed(0)} kL*`;
```

Apply to:
- `Panels.tsx` Inspector → replace raw `selectedBody.mass`, `radius.toFixed(2)`, etc.
- `UniverseOutliner.tsx` → add a compact one-line spec (`1.2 M⊕  •  287 K`).
- Tooltips on graphs (`AtmosphereChart`).

---

## 7. Performance Plan — Keep 60 FPS @ N ≤ 64 bodies

| Action | Expected gain |
|---|---|
| Remove `filter(isValidBody)` from inner loop; validate on insert/update only | -1 alloc / substep |
| Replace `CelestialBody[]` with **parallel `Float32Array` SoA** inside `PhysicsEngine`: `posX, posY, posZ, velX, velY, velZ, mass, accX, accY, accZ` | zero GC, SIMD-friendly cache layout, ~2× speedup of pair loop |
| Cache `findDominantParent` results in a `Map<bodyId, parentId>` rebuilt **once per physics frame**, not per render | -O(N²) per frame |
| Replace `body.position.clone().sub(floatingOffset)` in `BodyMesh.useFrame` with a reused `tmpVec3` and `group.position.copy(...).sub(...)` | -N Vector3 allocs / frame |
| Stop writing the whole physics state back to Zustand at 1 Hz. Instead, expose `bodiesRef` via a `useExternalStore` subscription that only notifies on **structural** changes (count, ids, type). Position/velocity stays on the ref. | eliminates the 1 Hz reconciliation spike |
| Symmetrize the pair loop: for `j > i` compute force once, apply `+a` to *i* and `−(m_i/m_j)·a` to *j` | halves the inner loop |
| Use `requestIdleCallback` (or low-rate `setInterval`) for non-critical recalcs: ESI/RSI, tidal lock time, orbital elements | frees ~5 ms / sim-second |
| Either wire GPGPU to gameplay (for N > 256) OR shrink its `count` to 0 when no Black Hole / dust is active | -1 M shader tex fetches |
| Memoize `hasBlackHole`, star-filter, etc. with proper `useMemo` deps | trivial, but quietens reconciliation |

**Why not RK4 / Barnes-Hut?**
- RK4 is 4 force evaluations per step → at 240 Hz physics that's 4× our current GPU/CPU budget. Not worth the marginal accuracy gain for the orbit regimes the game shows (no close binaries, no extreme eccentricities).
- Barnes-Hut (O(N log N)) only pays off above N ≈ 200. Our gameplay target is ≤ 64 simultaneous bodies — direct sum on SoA is faster up to that bound and has trivial code.

---

## 8. Step-by-Step Implementation Plan

Each step is independently shippable and ends with a runnable build.

### Phase 1 — Foundation (no visual change)
1. **`utils/units.ts`** — constants (`L_STAR`, `M_EARTH`, `T_HOUR`, `G_AETHER`, `STEFAN_BOLTZMANN`, conversion factors) and `fmt*` helpers.
2. **Type extension** — add `physicalRadius: number` and rename existing `radius` to `visualRadius` on `CelestialBody`. Migrate `worldStorage` deserializer to populate `physicalRadius = radius / RADIUS_SCALE_FACTOR` for backward compatibility.
3. **Recompute `G_CONSTANT`** to the new `G_AETHER` (≈ 0.498) inside `constants.ts`. Update `BODY_CONFIGS.massRange` and `radiusRange` to Earth-mass / L*-radius units.
4. **Unit tests** (`utils/__tests__/physicsUtils.test.ts`) — circular orbit at 1 AU around 1 M☉ should yield 1 yr period within 0.5% after 100 orbits.

### Phase 2 — Integration upgrade
5. Replace `calculateGravityInPlace` with `verletStep(soa: PhysicsSoA, dt: number)` operating on flat Float32Arrays.
6. Introduce **fixed-timestep accumulator** in `PhysicsEngine.useFrame` (240 Hz, max 8 catch-up steps).
7. Remove per-substep `filter`; validate bodies only on insertion (`setBodies`, `loadWorld`, `generateNewSystem`).
8. Fix `findDominantParent` semantics (`parent.mass > body.mass * 10`) and cache its results per-frame in a `Map`.

### Phase 3 — Property pipeline
9. Implement `deriveStarProperties(massM⊕)`, `deriveCompactProperties`, `deriveTerrestrialProperties` (existing logic, generalized).
10. Implement `equilibriumTemperature(planet, star, distance)` using Stefan-Boltzmann; call it inside the physics tick at low rate (every 30 ticks) and on Inspector edit.
11. Implement `classifyBody(mass, density)` and auto-reclassification hook inside `updateBody` (Zustand) and `checkEvolution`.
12. Strip arbitrary multipliers (`×10`, `×2`, `RADIUS_SCALE_FACTOR`) from `calculatePlanetaryPhysics`; rely on unit-correct math.

### Phase 4 — UI standardization
13. Update `Panels.tsx` Inspector to use `fmtMass / fmtRadius / fmtTemp / fmtGravity / fmtEscVel`. Show Temperature for planets (not just stars).
14. Add a "Spec line" row in `UniverseOutliner.tsx` (`1.2 M⊕ • 287 K • g = 9.7 m/s²`).
15. Make the Orbit tab functional: wire its sliders to `calculateOrbitalState` and `updateBody({ position, velocity })`.
16. Replace `NumberInput` mass field with a logarithmic slider for stars (1 M☉ – 50 M☉) to make the new mass scale usable on mobile.

### Phase 5 — Performance hardening
17. Convert `BodyMesh` position update to `group.position.copy(soa.pos, i).sub(floatingOffset)` using a pooled vector.
18. Decouple the physics ref from the Zustand `bodies` array; store only `bodyIds`, `typeMap`, and user-edited *primaries* in Zustand. SoA lives in a singleton ref.
19. Gate `setVisualEffects([...])` behind a 100 ms debounce.
20. GPGPU: either remove the standalone `<GPGPUPhysics count={1024} />` or repurpose it to render decorative dust particles (no force feedback to gameplay). Decision deferred — flag it in code.

### Phase 6 — Validation
21. Add a "Physics Diagnostics" debug panel (dev-only) showing: total kinetic energy, total angular momentum, total mechanical energy. Drift should be < 0.1% per 1000 sim-years.
22. Mobile benchmark on a reference device (e.g. Pixel 6) — confirm sustained 60 FPS at N = 24 (typical generated system) and ≥ 45 FPS at N = 64.

---

## 9. Risks & Trade-offs

- **Save-file migration.** Existing worlds in `worldStorage` use the old arbitrary-unit `mass`/`radius`. We must write a migration that detects `worldData.version < 2` and converts (`mass *= 0.012` if the body type ranges suggest old units, etc.). Acceptable migration error: ±5% of final mass — the simulation will then settle.
- **Visual aesthetics.** Real planet:star size ratios are *huge* (Earth is 0.009 % of the Sun's diameter). We must keep separate `visualRadius` so the scene remains legible.
- **Mobile float precision.** Even with the unit system, distances > 10⁵ L* (≈ 1 AU × 6.7) lose sub-km precision in float32. The existing `floatingOffset` mechanism solves this; keep it.
- **Energy from collisions.** `MERGER_EFFICIENCY = 0.95` discards 5% mass-energy silently. With real units this implicitly violates conservation. Decision: emit the lost mass as a `WaveEvent` (gravitational wave) for narrative + visual payoff.
- **Inspector edits during physics tick.** With a 240 Hz fixed timestep and an SoA, a user mass-drag must write through to the SoA *between* steps, not during. Implementation: buffer pending edits in a queue, drain at the start of each `useFrame` before stepping.

---

## 10. Acceptance Criteria

The upgrade is complete when:

1. Generating a Solar preset produces an Earth-analog with `Mass: 1.00 M⊕`, `Radius: 6371 km`, `g: 9.81 m/s²`, `T_eq: 254 K` (or 288 K with greenhouse), `Esc Vel: 11.19 km/s` — within ±2 %.
2. A circular orbit at 1 AU around a 1 M☉ star completes 100 revolutions with total mechanical-energy drift < 0.1 %.
3. A 24-body random system sustains 60 FPS for 60 s on a Pixel 6, measured by the in-app diagnostics panel.
4. No `Vector3`, array, or object allocation occurs inside the steady-state physics tick (verified with Chrome DevTools "Allocations on timeline").
5. The Inspector and Universe Outliner display every numeric property with the correct SI unit label.
6. Saving and reloading a pre-migration world produces a stable system (no bodies fly to infinity within 10 sim-years).

---

*End of audit.*
