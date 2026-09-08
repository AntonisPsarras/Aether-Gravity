/**
 * Universe Outliner data model — pure, node-testable.
 *
 * Extracted from `components/UniverseOutliner.tsx` so the tree build, the
 * memo-key contract, and the search / filter / sort behaviour can be tested
 * without a DOM, and so the component can stop rebuilding the whole hierarchy
 * on every physics tick.
 */
import type { BodyType, CelestialBody } from '../types';
import { BODY_CONFIGS, type BodyCategory } from '../constants';
import { buildParentMap } from './physicsUtils';

export interface HierarchyNode {
  body: CelestialBody;
  children: HierarchyNode[];
}

/** Rendered-row ceiling; past this the list paginates rather than virtualizes. */
export const MAX_VISIBLE_ROWS = 200;

/** A node with more satellites than this starts collapsed. */
export const AUTO_COLLAPSE_CHILD_COUNT = 20;

/**
 * Cheap structural fingerprint of the body set.
 *
 * Deliberately covers only ids and *explicit* parent links, so it is stable
 * across the position and velocity churn of every integrator step. That is what
 * makes it usable as a memo key — but it is also why it is not sufficient on
 * its own: `buildParentMap` resolves the parent of a body without an explicit
 * `parentId` gravitationally, from live positions and masses. A hierarchy keyed
 * on this signature alone would freeze and stop reflecting captures, ejections
 * and mass edits, so the component pairs it with a low-frequency epoch counter.
 */
export function hierarchySignature(bodies: CelestialBody[]): string {
  let out = '';
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i];
    out += b.id + '>' + (b.parentId ?? '') + '|';
  }
  return out;
}

/**
 * Build the parent/child tree. Bodies whose resolved parent is not in the set
 * become roots, and a parent cycle is broken rather than recursed into — the
 * previous implementation would stack-overflow on one.
 */
export function buildHierarchy(bodies: CelestialBody[]): HierarchyNode[] {
  const parentMap = buildParentMap(bodies);
  const childMap = new Map<string | null, CelestialBody[]>();
  const allIds = new Set(bodies.map((b) => b.id));

  bodies.forEach((body) => {
    let parent = parentMap.get(body.id) || null;
    if (parent && !allIds.has(parent.id)) parent = null;
    const parentId = parent?.id || null;
    if (!childMap.has(parentId)) childMap.set(parentId, []);
    childMap.get(parentId)!.push(body);
  });

  // `visiting` breaks cycles; `placed` makes sure a body appears exactly once.
  const visiting = new Set<string>();
  const placed = new Set<string>();

  const buildNode = (body: CelestialBody): HierarchyNode => {
    visiting.add(body.id);
    placed.add(body.id);
    const children = (childMap.get(body.id) || [])
      .filter((c) => !visiting.has(c.id) && !placed.has(c.id))
      .map(buildNode);
    visiting.delete(body.id);
    return { body, children };
  };

  const roots = (childMap.get(null) || []).map(buildNode);

  // Anything left unplaced sat in a cycle; surface it as a root so bodies can
  // never silently vanish from the outliner.
  for (const body of bodies) {
    if (!placed.has(body.id)) roots.push(buildNode(body));
  }

  return roots;
}

export interface FlatRow {
  body: CelestialBody;
  depth: number;
  childCount: number;
}

/** Depth-first flatten, honouring a per-node collapsed set. */
export function flattenHierarchy(
  nodes: HierarchyNode[],
  collapsed?: ReadonlySet<string>,
): FlatRow[] {
  const out: FlatRow[] = [];
  const walk = (list: HierarchyNode[], depth: number) => {
    for (const node of list) {
      out.push({ body: node.body, depth, childCount: node.children.length });
      if (node.children.length > 0 && !collapsed?.has(node.body.id)) {
        walk(node.children, depth + 1);
      }
    }
  };
  walk(nodes, 0);
  return out;
}

/** Category of a body type, from the shared `BODY_CONFIGS` taxonomy. */
export function categoryOf(type: BodyType): BodyCategory {
  return BODY_CONFIGS[type]?.category ?? 'solid';
}

export const OUTLINER_CATEGORIES: BodyCategory[] = [
  'stellar', 'compact', 'singularity', 'giant', 'solid',
];

export type OutlinerSort = 'hierarchy' | 'name' | 'mass' | 'distance' | 'type';

export interface OutlinerFilter {
  /** Free-text query; matches name first, then type. Empty = no filtering. */
  query?: string;
  /** Selected categories; empty or undefined = all. */
  categories?: ReadonlySet<BodyCategory>;
}

/** Case-insensitive substring match on name, then on type. */
export function matchesQuery(body: CelestialBody, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return body.name.toLowerCase().includes(q) || body.type.toLowerCase().includes(q);
}

export function filterBodies(bodies: CelestialBody[], filter: OutlinerFilter): CelestialBody[] {
  const { query = '', categories } = filter;
  const useCategories = !!categories && categories.size > 0;
  if (!query.trim() && !useCategories) return bodies;
  return bodies.filter(
    (b) => matchesQuery(b, query) && (!useCategories || categories!.has(categoryOf(b.type))),
  );
}

/**
 * Sort for the flat presentations. `hierarchy` is a no-op here — tree order is
 * produced by `buildHierarchy` instead.
 */
export function sortBodies(
  bodies: CelestialBody[],
  sort: OutlinerSort,
  primary?: CelestialBody | null,
): CelestialBody[] {
  const out = bodies.slice();
  switch (sort) {
    case 'name':
      out.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'mass':
      out.sort((a, b) => b.mass - a.mass);
      break;
    case 'type':
      out.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
      break;
    case 'distance':
      if (primary) {
        out.sort(
          (a, b) =>
            a.position.distanceTo(primary.position) - b.position.distanceTo(primary.position),
        );
      }
      break;
    case 'hierarchy':
    default:
      break;
  }
  return out;
}

/** True when the requested view cannot be shown as a tree. */
export function forcesFlatMode(filter: OutlinerFilter, sort: OutlinerSort): boolean {
  const hasQuery = !!filter.query && filter.query.trim().length > 0;
  const hasCategories = !!filter.categories && filter.categories.size > 0;
  return hasQuery || hasCategories || sort !== 'hierarchy';
}

/** Trim a row list to the render cap, reporting how many were withheld. */
export function capRows<T>(rows: T[], limit: number = MAX_VISIBLE_ROWS): {
  rows: T[];
  hidden: number;
} {
  if (rows.length <= limit) return { rows, hidden: 0 };
  return { rows: rows.slice(0, limit), hidden: rows.length - limit };
}
