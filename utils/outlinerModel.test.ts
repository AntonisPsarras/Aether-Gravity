import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { BodyType, CelestialBody } from '../types';
import { BODY_CONFIGS } from '../constants';
import { deriveBodyState } from './bodyDerivation';
import {
  hierarchySignature, buildHierarchy, flattenHierarchy, filterBodies, sortBodies,
  matchesQuery, categoryOf, forcesFlatMode, capRows, MAX_VISIBLE_ROWS,
} from './outlinerModel';

const makeBody = (over: Partial<CelestialBody> & { id: string }): CelestialBody => {
  const type = over.type ?? 'Planet';
  const mass = over.mass ?? 1;
  const d = deriveBodyState(type, mass, over.properties);
  return {
    type, mass,
    radius: d.radius,
    radiusKm: d.radiusKm,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    color: '#fff', texture: 'solid', trailColor: '#fff',
    temperature: d.temperature || 288,
    habitability: 'N/A', population: 0,
    name: over.name ?? over.id,
    ...over,
  };
};

/** A star with a planet and a moon, all explicitly parented. */
const system = () => [
  makeBody({ id: 'star', name: 'Sol', type: 'Star', mass: 332946 }),
  makeBody({ id: 'planet', name: 'Terra', type: 'Planet', mass: 1, parentId: 'star' }),
  makeBody({ id: 'moon', name: 'Luna', type: 'Moon', mass: 0.012, parentId: 'planet' }),
];

describe('hierarchySignature', () => {
  it('is stable under position and velocity mutation', () => {
    // This is the memo contract: an integrator step must not invalidate the
    // cached tree, or the outliner rebuilds 60 times a second.
    const bodies = system();
    const before = hierarchySignature(bodies);
    bodies.forEach((b) => {
      b.position.set(Math.random() * 100, Math.random() * 100, Math.random() * 100);
      b.velocity.set(Math.random(), Math.random(), Math.random());
    });
    expect(hierarchySignature(bodies)).toBe(before);
  });

  it('is stable under mass and temperature mutation', () => {
    const bodies = system();
    const before = hierarchySignature(bodies);
    bodies[1].mass *= 3;
    bodies[1].temperature += 50;
    expect(hierarchySignature(bodies)).toBe(before);
  });

  it('changes when a body is added or removed', () => {
    const bodies = system();
    const before = hierarchySignature(bodies);
    const added = [...bodies, makeBody({ id: 'comet', type: 'Comet', mass: 1e-10 })];
    expect(hierarchySignature(added)).not.toBe(before);
    expect(hierarchySignature(bodies.slice(0, 2))).not.toBe(before);
  });

  it('changes when a body is explicitly reparented', () => {
    const bodies = system();
    const before = hierarchySignature(bodies);
    bodies[2].parentId = 'star';
    expect(hierarchySignature(bodies)).not.toBe(before);
  });

  it('is empty for an empty universe', () => {
    expect(hierarchySignature([])).toBe('');
  });
});

describe('buildHierarchy', () => {
  it('nests explicit parent links', () => {
    const roots = buildHierarchy(system());
    expect(roots).toHaveLength(1);
    expect(roots[0].body.id).toBe('star');
    expect(roots[0].children[0].body.id).toBe('planet');
    expect(roots[0].children[0].children[0].body.id).toBe('moon');
  });

  it('promotes a body whose explicit parent is missing to a root', () => {
    const orphan = makeBody({ id: 'orphan', parentId: 'ghost' });
    const roots = buildHierarchy([orphan]);
    expect(roots.map((r) => r.body.id)).toContain('orphan');
  });

  it('does not recurse forever on a parent cycle', () => {
    // The pre-refactor implementation stack-overflowed here.
    const a = makeBody({ id: 'a', mass: 10, parentId: 'b' });
    const b = makeBody({ id: 'b', mass: 10, parentId: 'a' });
    const roots = buildHierarchy([a, b]);
    expect(flattenHierarchy(roots)).toHaveLength(2);
  });

  it('never drops or duplicates a body', () => {
    const bodies = system();
    const flat = flattenHierarchy(buildHierarchy(bodies));
    expect(flat).toHaveLength(bodies.length);
    expect(new Set(flat.map((r) => r.body.id)).size).toBe(bodies.length);
  });

  it('handles an empty universe', () => {
    expect(buildHierarchy([])).toEqual([]);
  });
});

describe('flattenHierarchy', () => {
  it('reports depth and child counts', () => {
    const rows = flattenHierarchy(buildHierarchy(system()));
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2]);
    expect(rows[0].childCount).toBe(1);
    expect(rows[2].childCount).toBe(0);
  });

  it('skips the subtree of a collapsed node', () => {
    const rows = flattenHierarchy(buildHierarchy(system()), new Set(['planet']));
    expect(rows.map((r) => r.body.id)).toEqual(['star', 'planet']);
  });
});

describe('search and filter', () => {
  it('matches on name case-insensitively', () => {
    const [star] = system();
    expect(matchesQuery(star, 'sol')).toBe(true);
    expect(matchesQuery(star, 'SOL')).toBe(true);
    expect(matchesQuery(star, 'jupiter')).toBe(false);
  });

  it('matches on type as a secondary key', () => {
    const [star] = system();
    expect(matchesQuery(star, 'star')).toBe(true);
  });

  it('treats an empty query as no filter', () => {
    const bodies = system();
    expect(filterBodies(bodies, { query: '   ' })).toHaveLength(3);
    expect(filterBodies(bodies, {})).toHaveLength(3);
  });

  it('filters by the shared BODY_CONFIGS category taxonomy', () => {
    const bodies = system();
    const stellarOnly = filterBodies(bodies, { categories: new Set(['stellar']) });
    expect(stellarOnly.map((b) => b.id)).toEqual(['star']);
    expect(categoryOf('Black Hole')).toBe('singularity');
  });

  it('treats an empty category set as all categories', () => {
    expect(filterBodies(system(), { categories: new Set() })).toHaveLength(3);
  });

  it('intersects query and category filters', () => {
    const bodies = system();
    const out = filterBodies(bodies, { query: 'Terra', categories: new Set(['solid']) });
    expect(out.map((b) => b.id)).toEqual(['planet']);
  });
});

describe('sorting', () => {
  it('leaves order untouched for hierarchy sort', () => {
    const bodies = system();
    expect(sortBodies(bodies, 'hierarchy').map((b) => b.id)).toEqual(bodies.map((b) => b.id));
  });

  it('sorts by descending mass', () => {
    expect(sortBodies(system(), 'mass').map((b) => b.id)).toEqual(['star', 'planet', 'moon']);
  });

  it('sorts by name', () => {
    expect(sortBodies(system(), 'name').map((b) => b.name)).toEqual(['Luna', 'Sol', 'Terra']);
  });

  it('sorts by distance from the primary', () => {
    const bodies = system();
    bodies[1].position.set(100, 0, 0);
    bodies[2].position.set(50, 0, 0);
    expect(sortBodies(bodies, 'distance', bodies[0]).map((b) => b.id))
      .toEqual(['star', 'moon', 'planet']);
  });

  it('leaves order untouched for a distance sort with no primary', () => {
    const bodies = system();
    expect(sortBodies(bodies, 'distance', null).map((b) => b.id)).toEqual(bodies.map((b) => b.id));
  });

  it('does not mutate its input', () => {
    const bodies = system();
    sortBodies(bodies, 'mass');
    expect(bodies.map((b) => b.id)).toEqual(['star', 'planet', 'moon']);
  });
});

describe('flat-mode and render cap', () => {
  it('forces flat mode for any query, category filter or non-tree sort', () => {
    expect(forcesFlatMode({}, 'hierarchy')).toBe(false);
    expect(forcesFlatMode({ query: 'a' }, 'hierarchy')).toBe(true);
    expect(forcesFlatMode({ categories: new Set(['solid']) }, 'hierarchy')).toBe(true);
    expect(forcesFlatMode({}, 'mass')).toBe(true);
  });

  it('passes short lists through untouched', () => {
    const rows = [1, 2, 3];
    expect(capRows(rows)).toEqual({ rows, hidden: 0 });
  });

  it('caps long lists and reports the remainder', () => {
    const rows = Array.from({ length: MAX_VISIBLE_ROWS + 43 }, (_, i) => i);
    const out = capRows(rows);
    expect(out.rows).toHaveLength(MAX_VISIBLE_ROWS);
    expect(out.hidden).toBe(43);
  });
});

describe('category taxonomy', () => {
  it('assigns a category to every body type', () => {
    for (const type of Object.keys(BODY_CONFIGS) as BodyType[]) {
      expect(categoryOf(type)).toBe(BODY_CONFIGS[type].category);
    }
  });
});
