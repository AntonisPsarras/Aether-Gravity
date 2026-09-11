/**
 * One spacetime-grid frame, shared by every surface that follows the grid.
 *
 * PhysicsEngine (components/SpaceCanvas.tsx) builds it once per frame and
 * publishes it. The grid lattices and the habitable-zone disc
 * (components/HabitableZoneVisual.tsx) upload the same arrays, so the disc can
 * never detach from the surface it lies on.
 *
 * Three rules live here:
 *  - Wells are centred on each body's DRAWN position (`bodyRenderPosition`), so
 *    a moon's dip sits under the moon mesh, not under its unexaggerated physics
 *    position inside the parent's sphere.
 *  - Strength and core come from the active mode's `WellParams`
 *    (utils/curvatureDisplay.ts); the shaders only evaluate the 1/r profile.
 *  - Anchors and resolution-aware cores come from utils/gridLattice.ts and
 *    depend on body state only — never on the camera.
 */
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { bodyRenderPosition } from './renderPosition';
import { bodyVisualRadius, wellParamsFor, type UiMode } from './displayMode';
import { wellCore, wellPeak } from './curvatureDisplay';
import {
  GRID_MAX_BODIES,
  GRID_MAX_DISCS,
  LatticeAnchors,
  applyLatticeLod,
  buildRingTable,
  createWellSet,
  type AnchorLayout,
  type GridLatticeBudget,
  type RingTable,
  type WellSet,
} from './gridLattice';

export { GRID_MAX_BODIES, GRID_MAX_DISCS };

export interface GridWellFrame {
  count: number;
  /** Body id per slot (owned by the builder), for the anchor layout and test bridge. */
  ids: string[];
  /** Render-space well centres, xyz per body. */
  positions: Float32Array;
  masses: Float32Array;
  /** Peak depth after lattice LOD, L*. */
  peaks: Float32Array;
  /** Core after lattice LOD, L*. */
  cores: Float32Array;
  /** `displayDepth` knee of the active mode, L*. */
  displayKnee: number;
  mode: UiMode;
  /** Anchor layout (owned by the builder; rewritten every frame). */
  layout: AnchorLayout;
  /** Disc centres as xz pairs, packed for a `vec2[GRID_MAX_DISCS]` uniform. */
  discCenters: Float32Array;
  /** Detail-disc visible radius per disc, L*. */
  discRadii: Float32Array;
  /** Shared primary/secondary seam guard per disc, L*. */
  discGuards: Float32Array;
}

const createGridWellFrame = (layout: AnchorLayout, ids: string[]): GridWellFrame => ({
  count: 0,
  ids,
  positions: new Float32Array(GRID_MAX_BODIES * 3),
  masses: new Float32Array(GRID_MAX_BODIES),
  peaks: new Float32Array(GRID_MAX_BODIES),
  cores: new Float32Array(GRID_MAX_BODIES),
  displayKnee: 1,
  mode: 'advanced',
  layout,
  discCenters: new Float32Array(GRID_MAX_DISCS * 2),
  discRadii: new Float32Array(GRID_MAX_DISCS),
  discGuards: new Float32Array(GRID_MAX_DISCS),
});

/** Builds the per-frame grid state. Allocation-free after construction. */
export class GridFrameBuilder {
  private readonly anchors = new LatticeAnchors();
  private readonly wells: WellSet = createWellSet();
  readonly frame: GridWellFrame = createGridWellFrame(this.anchors.layout, this.wells.ids);
  private readonly byId = new Map<string, CelestialBody>();
  private readonly pos = new THREE.Vector3();
  private table: RingTable | null = null;
  private budget: GridLatticeBudget | null = null;

  /** Adopts a tier budget, rebuilding the ring table only when it changes. */
  setBudget(budget: GridLatticeBudget): RingTable {
    const prev = this.budget;
    if (!this.table || !prev || prev.gridRings !== budget.gridRings
      || prev.gridTailRings !== budget.gridTailRings || prev.gridSpokes !== budget.gridSpokes) {
      this.table = buildRingTable(budget.gridRings, budget.gridTailRings, budget.gridSpokes);
    }
    this.budget = budget;
    return this.table;
  }

  get ringTable(): RingTable | null {
    return this.table;
  }

  update(
    bodies: readonly CelestialBody[],
    floatingOffset: THREE.Vector3,
    mode: UiMode,
    nowSeconds: number,
  ): GridWellFrame {
    const f = this.frame;
    const w = this.wells;
    const table = this.table;
    const budget = this.budget;
    const p = wellParamsFor(mode);
    f.mode = mode;
    f.displayKnee = p.displayKnee;

    this.byId.clear();
    for (const b of bodies) this.byId.set(b.id, b);
    const n = Math.min(GRID_MAX_BODIES, bodies.length);
    for (let i = 0; i < n; i++) {
      const b = bodies[i];
      const parent = b.parentId ? this.byId.get(b.parentId) : undefined;
      bodyRenderPosition(this.pos, b, parent, floatingOffset, mode);
      const finite = Number.isFinite(this.pos.x) && Number.isFinite(this.pos.y) && Number.isFinite(this.pos.z);
      if (!finite) this.pos.set(0, 0, 0);
      f.positions[i * 3] = this.pos.x;
      f.positions[i * 3 + 1] = this.pos.y;
      f.positions[i * 3 + 2] = this.pos.z;
      f.masses[i] = finite ? b.mass : 0;
      const core = wellCore(bodyVisualRadius(b, mode), p);
      w.ids[i] = b.id;
      w.x[i] = this.pos.x;
      w.z[i] = this.pos.z;
      w.core[i] = core;
      w.strength[i] = finite ? wellPeak(b.mass, core, p) * core : 0;
    }
    this.byId.clear();
    w.count = n;
    f.count = n;

    if (!table || !budget) {
      // No lattice yet (budget not set): draw the unwidened wells.
      for (let i = 0; i < n; i++) {
        f.cores[i] = w.core[i];
        f.peaks[i] = w.core[i] > 0 ? w.strength[i] / w.core[i] : 0;
      }
      f.layout.discCount = 0;
    } else {
      const layout = this.anchors.update(w, table, budget, nowSeconds);
      applyLatticeLod(layout, table, budget, w, f.peaks, f.cores);
    }

    const L = f.layout;
    for (let j = 0; j < GRID_MAX_DISCS; j++) {
      const on = j < L.discCount;
      f.discCenters[j * 2] = on ? L.discX[j] : 0;
      f.discCenters[j * 2 + 1] = on ? L.discZ[j] : 0;
      f.discRadii[j] = on ? L.discRadius[j] : 0;
      f.discGuards[j] = on ? L.discGuard[j] : 0;
    }
    return f;
  }
}

// ---- Frame bridge ----------------------------------------------------------
//
// Mirrors utils/renderBridge.ts: PhysicsEngine publishes, consumers read, and
// nothing here mutates the frame.

let published: GridWellFrame | null = null;

/** Called by PhysicsEngine once per frame (null when neither grid nor habitable zone is shown). */
export const publishGridFrame = (frame: GridWellFrame | null): void => {
  published = frame;
};

/** This frame's grid state, or null before the first publish. */
export const getGridFrame = (): GridWellFrame | null => published;
