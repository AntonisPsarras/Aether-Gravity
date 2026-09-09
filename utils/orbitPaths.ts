import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { gravitationalParameter, periodFromElements, propagateOrbit } from './keplerOrbit';
import { moonOrbitRenderScale } from './moonSystem';
import type { UiMode } from './displayMode';

/** Read-only display sampler. Coordinates are relative to the parent's true position. */
export function sampleOrbitPath(
  body: CelestialBody,
  parent: CelestialBody,
  segments: number,
  epoch: number,
  mode: UiMode = 'advanced',
): Float32Array {
  const empty = () => new Float32Array(0);
  const mu = gravitationalParameter(parent.mass, body.mass);
  if (!(mu > 0) || !Number.isFinite(mu) || segments < 8) return empty();
  const r = body.position.clone().sub(parent.position);
  const v = body.velocity.clone().sub(parent.velocity);
  if (![...r.toArray(), ...v.toArray()].every(Number.isFinite)) return empty();
  const scale = body.parentId === parent.id && body.orbit ? moonOrbitRenderScale(parent, mode, body) : 1;
  const points: number[] = [];
  const maxRadius = body.properties?.presetId ? 2000000 : 100000;
  const add = (p: THREE.Vector3) => {
    if (!p.toArray().every(Number.isFinite) || p.length() * scale > maxRadius) return false;
    points.push(p.x * scale, p.y * scale, p.z * scale);
    return true;
  };
  if (body.parentId === parent.id && body.orbit) {
    const o = body.orbit;
    if (!(o.a > 0) || !(o.e >= 0 && o.e < 1) || !Object.values(o).every(Number.isFinite)) return empty();
    const period = periodFromElements(o.a, mu);
    const p = new THREE.Vector3(), velocity = new THREE.Vector3();
    for (let j = 0; j <= segments; j++) {
      propagateOrbit(o, mu, epoch + period * j / segments, p, velocity);
      if (!add(p)) return empty();
    }
  } else {
    // Vector basis avoids singular Ω/ω at zero inclination or eccentricity.
    const radius = r.length();
    const h = r.clone().cross(v);
    if (!(radius > 1e-9) || !(h.lengthSq() > 1e-18)) return empty();
    const eVector = v.clone().cross(h).divideScalar(mu).sub(r.clone().divideScalar(radius));
    const e = eVector.length();
    const p = h.lengthSq() / mu;
    const x = e > 1e-7 ? eVector.normalize() : r.clone().normalize();
    const y = h.normalize().cross(x).normalize();
    const current = Math.atan2(r.dot(y), r.dot(x));
    const closed = e < 1 && p / Math.max(1 - e, 1e-12) * scale <= maxRadius;
    const start = closed ? 0 : current;
    let end = Math.PI * 2;
    if (!closed) {
      // Forward conic arc ending before the asymptote or the distance clip.
      const limit = e > 1e-7 ? Math.acos(THREE.MathUtils.clamp((p * scale / maxRadius - 1) / e, -1, 1)) : Math.PI;
      end = Math.min(start + Math.PI, limit - 1e-4);
      if (end <= start || radius * scale > maxRadius) return empty();
    }
    const point = new THREE.Vector3();
    for (let j = 0; j <= segments; j++) {
      const a = start + (end - start) * j / segments;
      const denominator = 1 + e * Math.cos(a);
      if (!(denominator > 1e-10)) break;
      point.copy(x).multiplyScalar(Math.cos(a)).addScaledVector(y, Math.sin(a)).multiplyScalar(p / denominator);
      if (!add(point)) break;
    }
  }
  return points.length >= 6 ? new Float32Array(points) : empty();
}
