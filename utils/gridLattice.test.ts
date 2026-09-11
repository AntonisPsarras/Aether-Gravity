import { describe, it, expect } from 'vitest';
import {
  LATTICE_FINE_RADIUS,
  LATTICE_OUTER_RADIUS,
  LatticeAnchors,
  applyLatticeLod,
  buildDiscLatticeGeometry,
  buildPrimaryLatticeGeometry,
  buildRingTable,
  cellSizeAt,
  createAnchorLayout,
  createWellSet,
  discCoreScale,
  discOuterRing,
  latticeCellSize,
  polarVertexCount,
  type GridLatticeBudget,
  type RingTable,
  type WellSet,
} from './gridLattice';
import { environmentQualityForDevice } from '../components/CanvasSetup';
import { wellDepthAt } from './curvatureDisplay';

const HIGH: GridLatticeBudget = environmentQualityForDevice('high');
const LOW: GridLatticeBudget = environmentQualityForDevice('low');
const BUDGETS: Array<[string, GridLatticeBudget]> = [['high', HIGH], ['low', LOW]];
const tableFor = (b: GridLatticeBudget) => buildRingTable(b.gridRings, b.gridTailRings, b.gridSpokes);

/** Deterministic LCG so the sampling tests are reproducible. */
const rng = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

interface Spec { id: string; x: number; z: number; K: number; s: number }
const wellsOf = (list: Spec[]): WellSet => {
  const w = createWellSet();
  list.forEach((b, i) => {
    w.ids[i] = b.id;
    w.x[i] = b.x;
    w.z[i] = b.z;
    w.strength[i] = b.K;
    w.core[i] = b.s;
  });
  w.count = list.length;
  return w;
};

/** Beginner-like Solar System: strength K = peak·core and cores as the frame computes them. */
const beginnerSolar = (): Spec[] => [
  { id: 'sun', x: 0, z: 0, K: 136 * 22.5, s: 22.5 },
  { id: 'earth', x: 40, z: 0, K: 7.9 * 18, s: 18 },
  { id: 'jupiter', x: 0, z: 208, K: 31.7 * 36.9, s: 36.9 },
  { id: 'saturn', x: -381, z: 0, K: 25 * 34, s: 34 },
  { id: 'uranus', x: 0, z: -767, K: 15.6 * 22, s: 22 },
  { id: 'neptune', x: 850, z: 850, K: 15.8 * 21.8, s: 21.8 },
];

// ---------------------------------------------------------------------------
// CPU replica of what the GPU draws: the linearly interpolated lattice surface.
// ---------------------------------------------------------------------------

type P2 = [number, number];

const barycentric = (a: P2, b: P2, c: P2, x: number, z: number): [number, number, number] | null => {
  const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  if (Math.abs(det) < 1e-12) return null;
  const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / det;
  const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / det;
  return [l1, l2, 1 - l1 - l2];
};

/**
 * Depth the lattice with ring radii `table` centred at (ax, az) draws at
 * (x, z), given the analytic depth `depthAt` at its vertices. Triangulation
 * matches `polarIndex`: (a, c, b) and (b, c, d) per cell.
 */
function drawnDepth(table: RingTable, ax: number, az: number, x: number, z: number, depthAt: (px: number, pz: number) => number): number {
  const S = table.spokes;
  const step = (2 * Math.PI) / S;
  const r = Math.hypot(x - ax, z - az);
  let theta = Math.atan2(z - az, x - ax);
  if (theta < 0) theta += 2 * Math.PI;
  const j = Math.min(S - 1, Math.floor(theta / step));
  const jn = (j + 1) % S;
  let k = 0;
  while (k < table.radii.length - 2 && table.radii[k + 1] <= r) k++;
  const vert = (ring: number, spoke: number): P2 => [
    ax + table.radii[ring] * Math.cos(spoke * step),
    az + table.radii[ring] * Math.sin(spoke * step),
  ];
  // Cell edges between rings are chords, so the containing cell can be the
  // ring below or above the one r falls in.
  for (const kk of [k, k - 1, k + 1]) {
    if (kk < 0 || kk >= table.radii.length - 1) continue;
    const a = vert(kk, j), b = vert(kk, jn), c = vert(kk + 1, j), d = vert(kk + 1, jn);
    for (const tri of [[a, c, b], [b, c, d]] as P2[][]) {
      const w = barycentric(tri[0], tri[1], tri[2], x, z);
      if (!w || w.some((v) => v < -1e-9)) continue;
      return w[0] * depthAt(...tri[0]) + w[1] * depthAt(...tri[1]) + w[2] * depthAt(...tri[2]);
    }
  }
  throw new Error(`(${x}, ${z}) is not inside any lattice cell`);
}

/** Ring radii of a disc lattice of radius R, as the vertex shader computes them. */
const discTable = (R: number, b: GridLatticeBudget): RingTable => {
  const outer = discOuterRing(R, b.gridDiscSpokes);
  const c = discCoreScale(outer);
  const U = Math.asinh(outer / c);
  const radii = new Float64Array(b.gridDiscRings + 1);
  for (let k = 0; k <= b.gridDiscRings; k++) radii[k] = c * Math.sinh((k / b.gridDiscRings) * U);
  return { radii, spokes: b.gridDiscSpokes };
};

// ---------------------------------------------------------------------------

describe('primary ring table', () => {
  for (const [name, b] of BUDGETS) {
    it(`starts at the centre, increases strictly and reaches the horizon (${name})`, () => {
      const t = tableFor(b);
      expect(t.radii[0]).toBe(0);
      for (let k = 1; k < t.radii.length; k++) expect(t.radii[k]).toBeGreaterThan(t.radii[k - 1]);
      expect(t.radii[b.gridRings]).toBeCloseTo(LATTICE_FINE_RADIUS, 6);
      expect(t.radii[t.radii.length - 1] / LATTICE_OUTER_RADIUS).toBeCloseTo(1, 9);
    });

    it(`has cells proportional to radius in the fine zone and coarsens smoothly (${name})`, () => {
      const t = tableFor(b);
      const rel = [50, 200, 800, 3000].map((r) => latticeCellSize(t, r) / r);
      expect(Math.max(...rel) / Math.min(...rel)).toBeLessThan(1.3);
      // Spacing never shrinks outward, and the tail starts without a jump.
      for (let k = 2; k < t.radii.length; k++) {
        const prev = t.radii[k - 1] - t.radii[k - 2];
        const next = t.radii[k] - t.radii[k - 1];
        expect(next).toBeGreaterThanOrEqual(prev * 0.999);
        if (k === b.gridRings + 1) expect(next / prev).toBeLessThan(1.4);
      }
    });
  }

  it('resolves the inner Solar System that a 12.5 L* plane could not', () => {
    const t = tableFor(HIGH);
    expect(latticeCellSize(t, 15.5)).toBeLessThan(0.6); // Mercury
    expect(latticeCellSize(t, 40)).toBeLessThan(1.2);   // Earth
    expect(latticeCellSize(t, 208)).toBeLessThan(6);    // Jupiter
  });
});

describe('lattice geometry and budgets', () => {
  const worst = (b: GridLatticeBudget) =>
    polarVertexCount(b.gridRings + b.gridTailRings, b.gridSpokes)
    + (b.gridMaxAnchors - 1) * polarVertexCount(b.gridDiscRings, b.gridDiscSpokes);

  it('keeps the worst case inside the old camera-following plane budget', () => {
    expect(worst(HIGH)).toBeLessThanOrEqual(401 * 401);
    expect(worst(LOW)).toBeLessThanOrEqual(151 * 151);
    // A single-star scene draws the primary lattice alone.
    expect(polarVertexCount(HIGH.gridRings + HIGH.gridTailRings, HIGH.gridSpokes)).toBeLessThan(0.62 * 401 * 401);
  });

  it('builds indexed geometry of the advertised size', () => {
    const t = tableFor(LOW);
    const g = buildPrimaryLatticeGeometry(t);
    const rings = t.radii.length - 1;
    const pos = g.getAttribute('position');
    expect(pos.count).toBe(polarVertexCount(rings, t.spokes));
    const index = g.getIndex()!;
    expect(index.count).toBe(rings * t.spokes * 6);
    let maxIndex = 0;
    for (let i = 0; i < index.count; i++) maxIndex = Math.max(maxIndex, index.getX(i));
    expect(maxIndex).toBe(pos.count - 1);
    for (let i = 0; i < pos.count; i++) expect(pos.getY(i)).toBe(0);

    const d = buildDiscLatticeGeometry(LOW.gridDiscRings, LOW.gridDiscSpokes);
    const dp = d.getAttribute('position');
    expect(dp.count).toBe(polarVertexCount(LOW.gridDiscRings, LOW.gridDiscSpokes));
    for (let i = 0; i < dp.count; i++) {
      expect(dp.getY(i)).toBeGreaterThanOrEqual(0);
      expect(dp.getY(i)).toBeLessThanOrEqual(1);
    }
    g.dispose();
    d.dispose();
  });
});

describe('anchor selection', () => {
  it('sits at the render origin with no bodies', () => {
    const a = new LatticeAnchors();
    const L = a.update(wellsOf([]), tableFor(HIGH), HIGH, 0);
    expect(L.primary).toBe(-1);
    expect([L.primaryX, L.primaryZ, L.discCount]).toEqual([0, 0, 0]);
  });

  it('centres the primary lattice on the strongest well', () => {
    const L = new LatticeAnchors().update(wellsOf(beginnerSolar()), tableFor(HIGH), HIGH, 0);
    expect(L.primary).toBe(0);
    expect([L.primaryX, L.primaryZ]).toEqual([0, 0]);
  });

  it('is deterministic: identical body state gives an identical layout', () => {
    const a = new LatticeAnchors().update(wellsOf(beginnerSolar()), tableFor(HIGH), HIGH, 3);
    const b = new LatticeAnchors().update(wellsOf(beginnerSolar()), tableFor(HIGH), HIGH, 3);
    expect(b).toEqual(a);
  });

  it('gives far, under-resolved wells their own disjoint discs', () => {
    const w = wellsOf(beginnerSolar());
    const L = new LatticeAnchors().update(w, tableFor(HIGH), HIGH, 0);
    const ids = Array.from(L.discIndex.subarray(0, L.discCount)).map((i) => w.ids[i]).sort();
    expect(ids).toEqual(['neptune', 'uranus']);
    for (let j = 0; j < L.discCount; j++) {
      const toPrimary = Math.hypot(L.discX[j] - L.primaryX, L.discZ[j] - L.primaryZ);
      expect(L.discRadius[j]).toBeLessThanOrEqual(0.5 * toPrimary + 1e-9);
      expect(L.carveRadius[j]).toBeLessThan(L.discRadius[j]);
      expect(L.carveRadius[j]).toBeGreaterThan(0);
    }
    const gap = Math.hypot(L.discX[0] - L.discX[1], L.discZ[0] - L.discZ[1]);
    expect(L.discRadius[0] + L.discRadius[1]).toBeLessThanOrEqual(gap + 1e-9);

    // The low tier has one disc; it goes to the neediest well.
    const low = new LatticeAnchors().update(w, tableFor(LOW), LOW, 0);
    expect(low.discCount).toBe(1);
    expect(w.ids[low.discIndex[0]]).toBe('neptune');
  });

  it('keeps the primary unless a rival is clearly stronger', () => {
    const a = new LatticeAnchors();
    const t = tableFor(HIGH);
    const pair = (ka: number, kb: number) => wellsOf([
      { id: 'a', x: 0, z: 0, K: ka, s: 20 },
      { id: 'b', x: 5000, z: 0, K: kb, s: 20 },
    ]);
    expect(a.update(pair(1000, 1100), t, HIGH, 0).primary).toBe(1);
    expect(a.update(pair(1200, 1100), t, HIGH, 0.1).primary).toBe(1); // 1.09× — stays
    expect(a.update(pair(1400, 1100), t, HIGH, 0.2).primary).toBe(0); // 1.27× — moves
  });

  it('keeps incumbent discs against marginally needier challengers', () => {
    const t = tableFor(HIGH);
    const a = new LatticeAnchors();
    const base = beginnerSolar();
    a.update(wellsOf(base), t, HIGH, 0);
    const lossOf = (x: number, z: number, K: number, s: number) => {
      const sEff = Math.max(s, 2.5 * latticeCellSize(t, Math.hypot(x, z)));
      return K * (1 / s - 1 / sEff);
    };
    const uranus = base.find((b) => b.id === 'uranus')!;
    const uranusLoss = lossOf(uranus.x, uranus.z, uranus.K, uranus.s);
    const challenger = (factor: number): Spec => {
      const x = -1500, z = 1500, s = 20;
      return { id: 'x', x, z, K: (factor * uranusLoss) / lossOf(x, z, 1, s), s };
    };
    const ids = (L: ReturnType<LatticeAnchors['update']>, w: WellSet) =>
      Array.from(L.discIndex.subarray(0, L.discCount)).map((i) => w.ids[i]).sort();

    const mild = wellsOf([...base, challenger(1.2)]);
    expect(ids(a.update(mild, t, HIGH, 1), mild)).toEqual(['neptune', 'uranus']);
    const strong = wellsOf([...base, challenger(2)]);
    expect(ids(a.update(strong, t, HIGH, 2), strong)).toEqual(['neptune', 'x']);
  });
});

describe('resolution-aware cores', () => {
  it('preserves every far-field strength and leaves resolved wells alone', () => {
    const w = wellsOf(beginnerSolar());
    const t = tableFor(HIGH);
    const L = new LatticeAnchors().update(w, t, HIGH, 0);
    const peak = new Float32Array(w.count);
    const core = new Float32Array(w.count);
    applyLatticeLod(L, t, HIGH, w, peak, core);
    for (let i = 0; i < w.count; i++) {
      expect((peak[i] * core[i]) / w.strength[i]).toBeCloseTo(1, 5);
      expect(core[i]).toBeGreaterThanOrEqual(w.core[i] * (1 - 1e-6));
    }
    // Earth (resolved by the primary) and the disc owners keep their cores.
    for (const id of ['sun', 'earth', 'jupiter', 'uranus', 'neptune']) {
      const i = w.ids.indexOf(id);
      expect(core[i]).toBeCloseTo(w.core[i], 4);
    }
  });

  it('widens a well the lattice cannot resolve', () => {
    const w = wellsOf(beginnerSolar());
    const t = tableFor(LOW);
    const L = new LatticeAnchors().update(w, t, LOW, 0);
    const peak = new Float32Array(w.count);
    const core = new Float32Array(w.count);
    applyLatticeLod(L, t, LOW, w, peak, core);
    const uranus = w.ids.indexOf('uranus'); // no disc on the low tier
    expect(core[uranus]).toBeGreaterThan(2 * w.core[uranus]);
  });

  it('changes continuously across a disc seam', () => {
    const t = tableFor(HIGH);
    const L = createAnchorLayout();
    L.discCount = 1;
    L.discX[0] = 1000;
    L.discZ[0] = 0;
    L.discRadius[0] = 400;
    L.discOuterRing[0] = discOuterRing(400, HIGH.gridDiscSpokes);
    L.discCoreScale[0] = discCoreScale(L.discOuterRing[0]);
    L.discU[0] = Math.asinh(L.discOuterRing[0] / L.discCoreScale[0]);
    let prev = cellSizeAt(L, t, HIGH, 1000, 0, 5);
    let worstJump = 0;
    for (let x = 1000; x <= 2000; x += 0.5) {
      const h = cellSizeAt(L, t, HIGH, x, 0, 5);
      worstJump = Math.max(worstJump, Math.abs(h - prev) / Math.max(h, prev));
      prev = h;
    }
    expect(worstJump).toBeLessThan(0.05);
  });
});

describe('the drawn surface (anti-shimmer)', () => {
  const primaryOnly = createAnchorLayout(); // centred on the origin, no discs

  const worstError = (b: GridLatticeBudget, layoutFor: (x: number, z: number) => { table: RingTable; ax: number; az: number; layout: typeof primaryOnly }, distances: number[], widen: boolean) => {
    const t = tableFor(b);
    const rand = rng(12345);
    let worst = 0;
    for (let n = 0; n < 50; n++) {
      const D = distances[n % distances.length] * (0.9 + 0.2 * rand());
      const angle = rand() * 2 * Math.PI;
      const x = D * Math.cos(angle);
      const z = D * Math.sin(angle);
      const { table, ax, az, layout } = layoutFor(x, z);
      const w = wellsOf([{ id: 'w', x, z, K: 100 * 5, s: 5 }]);
      const peak = new Float32Array(1);
      const core = new Float32Array(1);
      if (widen) applyLatticeLod(layout, t, b, w, peak, core);
      else { core[0] = 5; peak[0] = 100; }
      const drawn = drawnDepth(table, ax, az, x, z, (px, pz) => wellDepthAt(Math.hypot(px - x, pz - z), peak[0], core[0]));
      worst = Math.max(worst, Math.abs(drawn - peak[0]) / peak[0]);
    }
    return worst;
  };

  for (const [name, b] of BUDGETS) {
    it(`draws a well within 5% of its peak wherever it sits on the primary lattice (${name})`, () => {
      const t = tableFor(b);
      const e = worstError(b, () => ({ table: t, ax: 0, az: 0, layout: primaryOnly }), [0.7, 12, 40, 208, 767, 1203, 3000], true);
      expect(e).toBeLessThan(0.05);
    });

    it(`draws a well within 5% of its peak inside a disc lattice (${name})`, () => {
      const R = 600;
      const disc = createAnchorLayout();
      disc.primaryX = 5000; // the primary lattice is elsewhere
      disc.discCount = 1;
      disc.discRadius[0] = R;
      disc.discOuterRing[0] = discOuterRing(R, b.gridDiscSpokes);
      disc.discCoreScale[0] = discCoreScale(disc.discOuterRing[0]);
      disc.discU[0] = Math.asinh(disc.discOuterRing[0] / disc.discCoreScale[0]);
      const e = worstError(b, () => ({ table: discTable(R, b), ax: 0, az: 0, layout: disc }), [0.5, 20, 120, 400], true);
      expect(e).toBeLessThan(0.05);
    });
  }

  it('would shimmer without the resolution-aware core (guards the LOD factor)', () => {
    const t = tableFor(HIGH);
    const e = worstError(HIGH, () => ({ table: t, ax: 0, az: 0, layout: primaryOnly }), [1203], false);
    expect(e).toBeGreaterThan(0.2);
  });
});
