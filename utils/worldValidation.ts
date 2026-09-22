import { PHYSICS_LIMITS } from './physicsBounds';

export const MAX_STORAGE_CHARS = 2 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 10_000;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export const validId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\x00-\x1f\x7f]/.test(value);

/** No coercion of objects: hostile saved values must never execute toString. */
export function savedNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

/** Structural rejection precedes migrations and repair of individual scalar fields. */
export function validWorldShape(raw: unknown, currentVersion: number): boolean {
  if (!isRecord(raw) || !validId(raw.id) || !Array.isArray(raw.bodies)) return false;
  if (raw.version !== undefined && (!Number.isInteger(raw.version) || (raw.version as number) < 1 || (raw.version as number) > currentVersion)) return false;
  if (raw.settings !== undefined && !isRecord(raw.settings)) return false;
  if (raw.bodies.length > PHYSICS_LIMITS.MAX_BODIES) return false;
  const parents = new Map<string, string>();
  const ids = new Set<string>();
  for (const body of raw.bodies) {
    if (!isRecord(body) || !validId(body.id) || ids.has(body.id)) return false;
    ids.add(body.id);
    if (!isRecord(body.position) || !isRecord(body.velocity)) return false;
    if (body.properties !== undefined && !isRecord(body.properties)) return false;
    if (body.parentId !== undefined) {
      if (!validId(body.parentId)) return false;
      parents.set(body.id, body.parentId);
    }
    if (body.orbit !== undefined) {
      if (!isRecord(body.orbit)) return false;
      const o = body.orbit;
      if (!['a', 'e', 'i', 'lan', 'argp', 'm0', 'epoch'].every(k => typeof o[k] === 'number' && Number.isFinite(o[k]))) return false;
      if (!(Number(o.a) > 0) || Number(o.a) > PHYSICS_LIMITS.MAX_POSITION_ABS || Number(o.e) < 0 || Number(o.e) >= 1) return false;
      if (Math.abs(Number(o.epoch)) > 1e9 || ['i', 'lan', 'argp', 'm0'].some(k => Math.abs(Number(o[k])) > 1e9)) return false;
    }
  }
  for (const id of ids) {
    const seen = new Set<string>([id]);
    let parent = parents.get(id);
    while (parent !== undefined) {
      if (!ids.has(parent) || seen.has(parent)) return false;
      seen.add(parent);
      parent = parents.get(parent);
    }
  }
  return true;
}
