/**
 * World-anchored polar lattices for the spacetime grid.
 *
 * WHY THE OLD GRID SHOOK. The grid used to be a 5000×5000 plane re-centred on
 * the camera every frame and stretched outward from it. Every camera motion —
 * a drag, OrbitControls' damping inertia, the follow lerp — slid the whole
 * vertex lattice under the wells, so each well was re-sampled at new points
 * every frame (shaking), and a different viewing angle gave a different
 * sampling (a different funnel). The stretch also put the coarsest cells
 * exactly where a tilted view places the Sun.
 *
 * WHAT REPLACES IT. The grid surface is now a pure function of the bodies:
 *
 *  - Vertices sit on a POLAR lattice whose ring radius is r = c·sinh(u), with
 *    u evenly spaced. That is linear near the centre and logarithmic outside,
 *    so the cell size grows ∝ r — exactly the curvature scale of a 1/r well at
 *    radius r. At the default budget a cell is ~0.2 L* at the centre, ~1 L*
 *    at Earth's orbit and ~5 L* at Jupiter's, and the tail reaches 2×10⁷ L*
 *    so the sheet still runs to the horizon.
 *  - The PRIMARY lattice is centred on the body with the strongest well and
 *    rides it every frame, so that well is always sampled identically.
 *  - Up to two SECONDARY lattices are small discs centred on the bodies that
 *    would otherwise lose the most depth to resolution (far planets in
 *    Beginner Mode, a second star, a black hole flying past). The primary
 *    lattice is carved out under each disc, so every pixel of the sheet is
 *    shaded by exactly one lattice and nothing is drawn twice.
 *  - Any well narrower than 2.5 cells of the lattice that draws it gets a
 *    wider core but the SAME far-field strength K = peak·core (see
 *    `applyLatticeLod`): only a tip the lattice cannot resolve is rounded, and
 *    the tip of a moving well can no longer pulse as it crosses vertices.
 *
 * Nothing here reads the camera. Anchor choice and LOD depend on body state
 * alone, which is what makes the curvature independent of the viewing angle.
 * The camera still drives the horizon alpha fade and fwidth line
 * anti-aliasing in the shader; neither changes the surface.
 *
 * Every per-frame entry point is allocation-free.
 */
import * as THREE from 'three';

/** Uniform array length in the grid and habitable-zone shaders. */
export const GRID_MAX_BODIES = 50;

/** Secondary (disc) lattices at most; the shader carve loop is sized to this. */
export const GRID_MAX_DISCS = 2;

/**
 * Per-tier lattice budget. Lives in `environmentQualityForDevice`
 * (components/CanvasSetup.tsx) with every other rendering budget, so the low
 * tier cheapens the grid in one place.
 */
export interface GridLatticeBudget {
  /** Rings of the primary lattice out to `LATTICE_FINE_RADIUS` (linear core included). */
  gridRings: number;
  /** Rings of the primary lattice's coarsening tail out to `LATTICE_OUTER_RADIUS`. */
  gridTailRings: number;
  /** Spokes of the primary lattice. */
  gridSpokes: number;
  /** Rings of each secondary disc lattice. */
  gridDiscRings: number;
  /** Spokes of each secondary disc lattice. */
  gridDiscSpokes: number;
  /** Primary plus secondary lattices, 1…1 + GRID_MAX_DISCS. */
  gridMaxAnchors: number;
  /** Grid-line levels the fragment shader blends per pixel: 2 cross-fades, 1 snaps. */
  gridLineLevels: number;
}

/** Scale c of r = c·sinh(u): the lattice is linear inside ~c and logarithmic outside, L*. */
export const LATTICE_CORE_SCALE = 8;
/** Outer radius of the evenly spaced (in u) fine zone, L*. */
export const LATTICE_FINE_RADIUS = 4000;
/** Outer radius of the tail — past MAX_POSITION_ABS (5×10⁶) plus the horizon fade, L*. */
export const LATTICE_OUTER_RADIUS = 2e7;

/**
 * A well is resolved when its core spans at least this many lattice cells.
 * At 2.5 the linearly interpolated surface stays within ~4% of the analytic
 * peak wherever the well centre falls inside a cell (see gridLattice.test.ts).
 */
export const LOD_CELLS_PER_CORE = 2.5;

/** Largest radius a secondary disc may claim, L*. */
export const DISC_MAX_RADIUS = 4000;
/** Scale c of a disc lattice's own sinh ring profile, L* (capped at a quarter of the disc). */
export const DISC_CORE_SCALE = 8;

/** A secondary must lose at least this much peak depth to resolution to earn a disc, L*. */
const SECONDARY_MIN_LOSS = 0.5;
/** Anchors closer than this many cores (or MIN_ANCHOR_SEPARATION) would give a disc too small to help. */
const ANCHOR_SEPARATION_CORES = 6;
const MIN_ANCHOR_SEPARATION = 40;
/** A new primary must be this much stronger than the incumbent. */
const PRIMARY_HYSTERESIS = 1.25;
/** A challenger must lose this much more depth than the weakest incumbent secondary. */
const SECONDARY_HYSTERESIS = 1.5;
/** Secondaries are re-ranked at most this often unless the body set changes, s. */
const RERANK_INTERVAL_S = 0.5;
/** Primary vertices within this many primary cells of a disc edge are left in place. */
const CARVE_MARGIN_CELLS = 1.5;

// ---------------------------------------------------------------------------
// Ring profile
// ---------------------------------------------------------------------------

export interface RingTable {
  /** Ring radii, L*. radii[0] = 0 (the centre). */
  radii: Float64Array;
  spokes: number;
}

/**
 * Radii of the primary lattice's rings.
 *
 * Fine zone: r = c·sinh(k·δ) for k = 0…fineRings, reaching `fineRadius`
 * exactly. Tail: the step in u grows geometrically from δ, so each cell is a
 * fixed factor larger than the one before — no jump where the fine zone ends
 * — and the last ring lands on `outerRadius`.
 */
export function buildRingTable(
  fineRings: number,
  tailRings: number,
  spokes: number,
  coreScale = LATTICE_CORE_SCALE,
  fineRadius = LATTICE_FINE_RADIUS,
  outerRadius = LATTICE_OUTER_RADIUS,
): RingTable {
  const fine = Math.max(1, Math.floor(fineRings));
  const tail = Math.max(0, Math.floor(tailRings));
  const uFine = Math.asinh(fineRadius / coreScale);
  const step = uFine / fine;
  const radii = new Float64Array(fine + tail + 1);
  for (let k = 0; k <= fine; k++) radii[k] = coreScale * Math.sinh(k * step);
  if (tail > 0) {
    const span = Math.asinh(outerRadius / coreScale) - uFine;
    const g = tailGrowth(step, tail, span);
    let u = uFine;
    let du = step;
    for (let j = 1; j <= tail; j++) {
      du *= g;
      u += du;
      radii[fine + j] = coreScale * Math.sinh(u);
    }
    radii[fine + tail] = outerRadius;
  }
  return { radii, spokes: Math.max(3, Math.floor(spokes)) };
}

/** Growth g with Σ_{j=1..T} δ·gʲ = span. The sum increases with g, so bisect. */
function tailGrowth(step: number, tail: number, span: number): number {
  const sum = (g: number) =>
    Math.abs(g - 1) < 1e-12 ? tail * step : (step * g * (Math.pow(g, tail) - 1)) / (g - 1);
  let lo = 0.5;
  let hi = 8;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    if (sum(mid) < span) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Size of the primary-lattice cell at radius `r` from its centre, L*: the
 * larger of the ring spacing and the spoke chord at the cell's outer edge.
 * The ring spacing is interpolated towards the next interval's, so the size
 * is continuous in r and a body crossing a ring never steps its LOD core.
 */
export function latticeCellSize(table: RingTable, r: number): number {
  const radii = table.radii;
  const last = radii.length - 1;
  const rr = r > 0 ? r : 0;
  let lo = 0;
  let hi = last;
  if (rr >= radii[last]) {
    lo = last - 1;
  } else {
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (radii[mid] <= rr) lo = mid;
      else hi = mid;
    }
  }
  const here = radii[hi] - radii[lo];
  const next = hi < last ? radii[hi + 1] - radii[hi] : here;
  const frac = Math.min(1, Math.max(0, (rr - radii[lo]) / here));
  const radial = here + (next - here) * frac;
  const tangential = (2 * Math.PI * (rr + radial)) / table.spokes;
  return radial > tangential ? radial : tangential;
}

// ---------------------------------------------------------------------------
// Secondary disc profile (closed form — the disc radius changes every frame)
// ---------------------------------------------------------------------------

/**
 * Ring radius of the outermost disc ring: the spoke polygon circumscribes the
 * disc's circle so no sliver between the polygon and the circle goes undrawn.
 */
export const discOuterRing = (radius: number, spokes: number): number =>
  radius / Math.cos(Math.PI / Math.max(3, spokes));

/** Disc sinh scale for a given outer ring, L*. */
export const discCoreScale = (outerRing: number): number =>
  Math.max(1e-3, Math.min(DISC_CORE_SCALE, outerRing / 4));

/**
 * Disc cell size at distance `r` from the disc centre, L*. Rings are
 * r = c·sinh(t·U), t = k/rings, so dr/dt = U·√(c² + r²).
 */
export function discCellSize(r: number, coreScale: number, u: number, rings: number, spokes: number): number {
  const rr = r > 0 ? r : 0;
  const radial = (Math.sqrt(coreScale * coreScale + rr * rr) * u) / Math.max(1, rings);
  const tangential = (2 * Math.PI * (rr + radial)) / Math.max(3, spokes);
  return radial > tangential ? radial : tangential;
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Index buffer for a (rings + 1) × spokes polar vertex grid. */
function polarIndex(rings: number, spokes: number): THREE.BufferAttribute {
  const index = new Uint32Array(rings * spokes * 6);
  let o = 0;
  for (let k = 0; k < rings; k++) {
    const inner = k * spokes;
    const outer = (k + 1) * spokes;
    for (let j = 0; j < spokes; j++) {
      const jn = j + 1 === spokes ? 0 : j + 1;
      const a = inner + j;
      const b = inner + jn;
      const c = outer + j;
      const d = outer + jn;
      index[o++] = a; index[o++] = c; index[o++] = b;
      index[o++] = b; index[o++] = c; index[o++] = d;
    }
  }
  return new THREE.BufferAttribute(index, 1);
}

/** Number of vertices in a polar lattice with `rings` rings (plus the centre) and `spokes` spokes. */
export const polarVertexCount = (rings: number, spokes: number): number => (rings + 1) * spokes;

/**
 * Primary lattice in the XZ plane (y = 0), in world units around its anchor.
 * The mesh is translated to the anchor; the shader displaces y.
 */
export function buildPrimaryLatticeGeometry(table: RingTable): THREE.BufferGeometry {
  const rings = table.radii.length - 1;
  const spokes = table.spokes;
  const pos = new Float32Array(polarVertexCount(rings, spokes) * 3);
  let o = 0;
  for (let k = 0; k <= rings; k++) {
    const r = table.radii[k];
    for (let j = 0; j < spokes; j++) {
      const a = (2 * Math.PI * j) / spokes;
      pos[o++] = r * Math.cos(a);
      pos[o++] = 0;
      pos[o++] = r * Math.sin(a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(polarIndex(rings, spokes));
  return g;
}

/**
 * Secondary lattice: a unit disc. `position.xz` is the spoke direction and
 * `position.y` the normalised ring parameter t ∈ [0, 1]; the shader turns it
 * into r = c·sinh(t·U) and scales to the disc's radius, so one static
 * geometry serves a disc whose radius changes every frame.
 */
export function buildDiscLatticeGeometry(rings: number, spokes: number): THREE.BufferGeometry {
  const r = Math.max(1, Math.floor(rings));
  const s = Math.max(3, Math.floor(spokes));
  const pos = new Float32Array(polarVertexCount(r, s) * 3);
  let o = 0;
  for (let k = 0; k <= r; k++) {
    const t = k / r;
    for (let j = 0; j < s; j++) {
      const a = (2 * Math.PI * j) / s;
      pos[o++] = Math.cos(a);
      pos[o++] = t;
      pos[o++] = Math.sin(a);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(polarIndex(r, s));
  return g;
}

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

/** Caller-owned, struct-of-arrays view of this frame's wells. */
export interface WellSet {
  count: number;
  /** Stable body ids, for anchor hysteresis. */
  ids: string[];
  /** Well centre in render space (the orbital plane is y = 0), L*. */
  x: Float64Array;
  z: Float64Array;
  /** Far-field strength K = peak·core: depth(d) → K/d outside the core, L*². */
  strength: Float64Array;
  /** Display core before LOD, L*. */
  core: Float64Array;
}

export const createWellSet = (capacity = GRID_MAX_BODIES): WellSet => ({
  count: 0,
  ids: new Array<string>(capacity).fill(''),
  x: new Float64Array(capacity),
  z: new Float64Array(capacity),
  strength: new Float64Array(capacity),
  core: new Float64Array(capacity),
});

export interface AnchorLayout {
  /** Index of the primary anchor's body in the WellSet, -1 when there are no bodies. */
  primary: number;
  primaryX: number;
  primaryZ: number;
  discCount: number;
  /** WellSet index of each disc's body. */
  discIndex: Int32Array;
  discX: Float64Array;
  discZ: Float64Array;
  /** Fragments within this radius of the disc centre belong to the disc, L*. */
  discRadius: Float64Array;
  /** Circumscribed outer ring of the disc geometry, L*. */
  discOuterRing: Float64Array;
  /** Disc sinh scale c, L*. */
  discCoreScale: Float64Array;
  /** U = asinh(outerRing / c): the disc's ring parameter at t = 1. */
  discU: Float64Array;
  /** Primary vertices inside this radius are pushed onto its circle, L*. */
  carveRadius: Float64Array;
}

export const createAnchorLayout = (): AnchorLayout => ({
  primary: -1,
  primaryX: 0,
  primaryZ: 0,
  discCount: 0,
  discIndex: new Int32Array(GRID_MAX_DISCS),
  discX: new Float64Array(GRID_MAX_DISCS),
  discZ: new Float64Array(GRID_MAX_DISCS),
  discRadius: new Float64Array(GRID_MAX_DISCS),
  discOuterRing: new Float64Array(GRID_MAX_DISCS),
  discCoreScale: new Float64Array(GRID_MAX_DISCS),
  discU: new Float64Array(GRID_MAX_DISCS),
  carveRadius: new Float64Array(GRID_MAX_DISCS),
});

const dist2 = (w: WellSet, i: number, x: number, z: number): number => {
  const dx = w.x[i] - x;
  const dz = w.z[i] - z;
  return Math.sqrt(dx * dx + dz * dz);
};

const separated = (w: WellSet, i: number, j: number): boolean => {
  const need = Math.max(MIN_ANCHOR_SEPARATION, ANCHOR_SEPARATION_CORES * Math.max(w.core[i], w.core[j]));
  return dist2(w, i, w.x[j], w.z[j]) >= need;
};

/**
 * Chooses and lays out the anchors each frame. Stateful only for hysteresis:
 * the output depends on the body state and on previous choices, never on the
 * camera.
 */
export class LatticeAnchors {
  readonly layout: AnchorLayout = createAnchorLayout();
  private primaryId: string | null = null;
  private readonly secondaryIds: (string | null)[] = new Array(GRID_MAX_DISCS).fill(null);
  private lastRank = -Infinity;
  private lastCount = -1;
  private readonly loss = new Float64Array(GRID_MAX_BODIES);
  private readonly chosen = new Int32Array(GRID_MAX_DISCS);

  reset(): void {
    this.primaryId = null;
    this.secondaryIds.fill(null);
    this.lastRank = -Infinity;
    this.lastCount = -1;
    this.layout.primary = -1;
    this.layout.discCount = 0;
  }

  update(wells: WellSet, table: RingTable, budget: GridLatticeBudget, nowSeconds: number): AnchorLayout {
    const L = this.layout;
    const n = Math.min(wells.count, GRID_MAX_BODIES);
    if (n <= 0) {
      this.reset();
      L.primaryX = 0;
      L.primaryZ = 0;
      return L;
    }

    // --- Primary: strongest well, sticky ---------------------------------
    let best = 0;
    for (let i = 1; i < n; i++) if (wells.strength[i] > wells.strength[best]) best = i;
    const current = this.indexOf(wells, n, this.primaryId);
    const primary = current < 0 || wells.strength[best] > PRIMARY_HYSTERESIS * wells.strength[current]
      ? best
      : current;
    const primaryChanged = wells.ids[primary] !== this.primaryId;
    this.primaryId = wells.ids[primary];
    L.primary = primary;
    L.primaryX = wells.x[primary];
    L.primaryZ = wells.z[primary];

    // --- Secondaries ------------------------------------------------------
    const maxSecondary = Math.max(0, Math.min(GRID_MAX_DISCS, Math.floor(budget.gridMaxAnchors) - 1));
    const rerank = primaryChanged || n !== this.lastCount
      || nowSeconds - this.lastRank >= RERANK_INTERVAL_S || nowSeconds < this.lastRank;
    let count = 0;
    if (maxSecondary > 0 && rerank) {
      count = this.rank(wells, n, primary, table, maxSecondary);
      this.lastRank = nowSeconds;
      this.lastCount = n;
    } else if (maxSecondary > 0) {
      for (let s = 0; s < GRID_MAX_DISCS; s++) {
        const i = this.indexOf(wells, n, this.secondaryIds[s]);
        if (i >= 0 && i !== primary) this.chosen[count++] = i;
        if (count >= maxSecondary) break;
      }
    } else {
      this.secondaryIds.fill(null);
    }

    // --- Disc layout from this frame's positions -------------------------
    let discs = 0;
    for (let s = 0; s < count; s++) {
      const i = this.chosen[s];
      let nearest = dist2(wells, i, L.primaryX, L.primaryZ);
      for (let t = 0; t < count; t++) {
        if (t === s) continue;
        const j = this.chosen[t];
        const d = dist2(wells, i, wells.x[j], wells.z[j]);
        if (d < nearest) nearest = d;
      }
      const radius = Math.min(0.5 * nearest, DISC_MAX_RADIUS);
      // Bodies drift between re-ranks; a disc that no longer fits its well is skipped.
      if (!(radius >= Math.max(3 * wells.core[i], 10))) continue;
      const outer = discOuterRing(radius, budget.gridDiscSpokes);
      const c = discCoreScale(outer);
      const far = dist2(wells, i, L.primaryX, L.primaryZ) + radius;
      const carve = radius - CARVE_MARGIN_CELLS * latticeCellSize(table, far);
      L.discIndex[discs] = i;
      L.discX[discs] = wells.x[i];
      L.discZ[discs] = wells.z[i];
      L.discRadius[discs] = radius;
      L.discOuterRing[discs] = outer;
      L.discCoreScale[discs] = c;
      L.discU[discs] = Math.asinh(outer / c);
      L.carveRadius[discs] = carve > 0 ? carve : 0;
      discs++;
    }
    L.discCount = discs;
    return L;
  }

  private indexOf(wells: WellSet, n: number, id: string | null): number {
    if (id === null) return -1;
    for (let i = 0; i < n; i++) if (wells.ids[i] === id) return i;
    return -1;
  }

  /** Depth body `i` loses to the primary lattice's resolution, L*. */
  private lossUnderPrimary(wells: WellSet, i: number, primary: number, table: RingTable): number {
    const s = wells.core[i];
    const h = latticeCellSize(table, dist2(wells, i, wells.x[primary], wells.z[primary]));
    const sEff = Math.max(s, LOD_CELLS_PER_CORE * h);
    return wells.strength[i] * (1 / s - 1 / sEff);
  }

  private compatible(wells: WellSet, i: number, primary: number, count: number, skip: number): boolean {
    if (!separated(wells, i, primary)) return false;
    for (let t = 0; t < count; t++) {
      if (t === skip) continue;
      if (!separated(wells, i, this.chosen[t])) return false;
    }
    return true;
  }

  private isChosen(i: number, count: number): boolean {
    for (let t = 0; t < count; t++) if (this.chosen[t] === i) return true;
    return false;
  }

  /** Best unchosen body by loss; `compatibleWith` = number of chosen entries it must be separated from. */
  private bestCandidate(wells: WellSet, n: number, primary: number, count: number, compatibleWith: number): number {
    let best = -1;
    for (let i = 0; i < n; i++) {
      if (i === primary || this.isChosen(i, count)) continue;
      if (!(this.loss[i] >= SECONDARY_MIN_LOSS)) continue;
      if (!this.compatible(wells, i, primary, compatibleWith, -1)) continue;
      if (best < 0 || this.loss[i] > this.loss[best]) best = i;
    }
    return best;
  }

  private rank(wells: WellSet, n: number, primary: number, table: RingTable, maxSecondary: number): number {
    for (let i = 0; i < n; i++) {
      this.loss[i] = i === primary ? -1 : this.lossUnderPrimary(wells, i, primary, table);
    }
    let count = 0;
    // 1. Incumbents keep their slot while they still need it.
    for (let s = 0; s < GRID_MAX_DISCS && count < maxSecondary; s++) {
      const i = this.indexOf(wells, n, this.secondaryIds[s]);
      if (i < 0 || i === primary || this.isChosen(i, count)) continue;
      if (!(this.loss[i] >= 0.5 * SECONDARY_MIN_LOSS)) continue;
      if (!this.compatible(wells, i, primary, count, -1)) continue;
      this.chosen[count++] = i;
    }
    // 2. Fill free slots, strongest loss first.
    while (count < maxSecondary) {
      const c = this.bestCandidate(wells, n, primary, count, count);
      if (c < 0) break;
      this.chosen[count++] = c;
    }
    // 3. One challenge per re-rank: a much needier body displaces the weakest incumbent.
    if (count > 0) {
      const c = this.bestCandidate(wells, n, primary, count, 0);
      if (c >= 0) {
        let weakest = 0;
        for (let t = 1; t < count; t++) if (this.loss[this.chosen[t]] < this.loss[this.chosen[weakest]]) weakest = t;
        if (this.loss[c] > SECONDARY_HYSTERESIS * this.loss[this.chosen[weakest]]
          && this.compatible(wells, c, primary, count, weakest)) {
          this.chosen[weakest] = c;
        }
      }
    }
    for (let s = 0; s < GRID_MAX_DISCS; s++) this.secondaryIds[s] = s < count ? wells.ids[this.chosen[s]] : null;
    return count;
  }
}

// ---------------------------------------------------------------------------
// Resolution-aware cores
// ---------------------------------------------------------------------------

/**
 * Cell size of whichever lattice draws the point at render-space (x, z).
 * Inside a disc it is the disc's; in a band around a disc edge it rises
 * continuously to the coarser of the two, since a well there is drawn by
 * both.
 */
export function cellSizeAt(
  layout: AnchorLayout,
  table: RingTable,
  budget: GridLatticeBudget,
  x: number,
  z: number,
  core: number,
): number {
  const dxA = x - layout.primaryX;
  const dzA = z - layout.primaryZ;
  const outer = latticeCellSize(table, Math.sqrt(dxA * dxA + dzA * dzA));
  for (let j = 0; j < layout.discCount; j++) {
    const dx = x - layout.discX[j];
    const dz = z - layout.discZ[j];
    const d = Math.sqrt(dx * dx + dz * dz);
    const R = layout.discRadius[j];
    const inner = discCellSize(d, layout.discCoreScale[j], layout.discU[j], budget.gridDiscRings, budget.gridDiscSpokes);
    const band = Math.max(core, LOD_CELLS_PER_CORE * Math.max(inner, outer));
    if (d >= R + band) continue;
    if (d <= R - band) return inner;
    // Across the seam: inner → max(inner, outer) at the edge → outer.
    const w = (d - (R - band)) / (2 * band);
    const peak = 1 - Math.abs(2 * w - 1);
    const linear = inner + (outer - inner) * w;
    return Math.max(inner, outer) * peak + linear * (1 - peak);
  }
  return outer;
}

/**
 * Widen every well that its lattice cannot resolve, keeping its strength.
 *
 *   s_eff = max(s, 2.5·h),   peak_eff = K / s_eff
 *
 * K is the far-field amplitude (depth → K/d), which is the physically
 * meaningful part of the well; it is preserved exactly. Only a tip narrower
 * than the lattice can draw is rounded, and it is rounded the same way every
 * frame, so it cannot shimmer as the body moves across the cells.
 */
export function applyLatticeLod(
  layout: AnchorLayout,
  table: RingTable,
  budget: GridLatticeBudget,
  wells: WellSet,
  outPeak: Float32Array,
  outCore: Float32Array,
): void {
  const n = Math.min(wells.count, GRID_MAX_BODIES);
  for (let i = 0; i < n; i++) {
    const s = wells.core[i];
    const h = cellSizeAt(layout, table, budget, wells.x[i], wells.z[i], s);
    const sEff = Math.max(s, LOD_CELLS_PER_CORE * h);
    outCore[i] = sEff;
    outPeak[i] = sEff > 0 ? wells.strength[i] / sEff : 0;
  }
}
