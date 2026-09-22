/**
 * Analytic two-body (Keplerian) orbit propagation.
 *
 * Used for satellites that orbit a parent far faster than the global physics
 * timestep can resolve. Rather than shrinking the N-body timestep by two orders
 * of magnitude to keep a moon stable — which would slow the whole simulation
 * for every user — a moon is advanced along an exact Kepler ellipse relative to
 * its parent's live N-body position.
 *
 * The trade-off is explicit: moons do not perturb other bodies and cannot be
 * chaotically ejected. In exchange they cost O(1) each instead of O(N), their
 * orbital elements and periods are exactly right, and they are numerically
 * stable at any timestep. `utils/moonSystem.ts` promotes a moon to a full
 * N-body body when that approximation stops being appropriate.
 *
 * Conventions match `physicsUtils.calculateOrbitalState`: the reference plane
 * is XZ with +Y as the orbit normal, and angles are in radians here (the
 * Inspector works in degrees and converts at the boundary).
 */

import * as THREE from 'three';
import type { OrbitalElements } from '../types';
import { G_AETHER } from './units';

/** Standard gravitational parameter μ = G(M + m) in Aether units. */
export const gravitationalParameter = (parentMass: number, childMass = 0): number =>
  G_AETHER * (parentMass + childMass);

/** Orbital period in years for elements about a body of total mass `mu/G`. */
export const periodFromElements = (a: number, mu: number): number =>
  a > 0 && mu > 0 ? 2 * Math.PI * Math.sqrt((a * a * a) / mu) : Infinity;

/** Mean motion n = √(μ/a³), radians per year. */
export const meanMotion = (a: number, mu: number): number =>
  a > 0 && mu > 0 ? Math.sqrt(mu / (a * a * a)) : 0;

/**
 * Solve Kepler's equation M = E − e·sin E for the eccentric anomaly.
 *
 * Newton-Raphson from a starting guess that is accurate enough for the solver
 * to converge in a handful of iterations across the whole 0 ≤ e < 1 range
 * (Danby's starter, E₀ = M + 0.85e·sign(sin M) for high eccentricity).
 * Allocation-free.
 */
export const solveKepler = (meanAnomaly: number, e: number, tolerance = 1e-10): number => {
  const M = normalizeAngle(meanAnomaly);
  const ecc = Math.max(0, Math.min(0.999999, e));
  if (ecc < 1e-9) return M;

  let E = ecc < 0.8 ? M : M + 0.85 * ecc * Math.sign(Math.sin(M) || 1);

  for (let i = 0; i < 30; i++) {
    const sinE = Math.sin(E);
    const f = E - ecc * sinE - M;
    if (Math.abs(f) < tolerance) break;
    const fPrime = 1 - ecc * Math.cos(E);
    // Guard against the vanishing derivative at E ≈ 0 for e → 1.
    E -= f / (Math.abs(fPrime) > 1e-12 ? fPrime : 1e-12);
  }
  return E;
};

/** True anomaly from eccentric anomaly. */
export const trueAnomalyFromEccentric = (E: number, e: number): number =>
  2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));

/** Eccentric anomaly from true anomaly. */
const eccentricFromTrueAnomaly = (nu: number, e: number): number =>
  2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));

/** Mean anomaly from true anomaly (the inverse of the propagation chain). */
export const meanAnomalyFromTrueAnomaly = (nu: number, e: number): number => {
  const E = eccentricFromTrueAnomaly(nu, e);
  return normalizeAngle(E - e * Math.sin(E));
};

export const normalizeAngle = (a: number): number => {
  const twoPi = Math.PI * 2;
  const r = a % twoPi;
  return r < 0 ? r + twoPi : r;
};

/**
 * Position and velocity relative to the parent, at simulation time `t` (years).
 *
 * Writes into the supplied vectors and allocates nothing, so this is safe to
 * call every frame for every satellite.
 */
export const propagateOrbit = (
  orbit: OrbitalElements,
  mu: number,
  t: number,
  outPosition: THREE.Vector3,
  outVelocity?: THREE.Vector3,
): void => {
  const { a, e, i, lan, argp, m0, epoch } = orbit;
  if (!(a > 0) || !(mu > 0)) {
    outPosition.set(0, 0, 0);
    outVelocity?.set(0, 0, 0);
    return;
  }

  const ecc = Math.max(0, Math.min(0.999, e));
  const M = m0 + meanMotion(a, mu) * (t - epoch);
  const E = solveKepler(M, ecc);
  const nu = trueAnomalyFromEccentric(E, ecc);

  // Perifocal frame.
  const p = a * (1 - ecc * ecc);
  const r = p / (1 + ecc * Math.cos(nu));
  const xP = r * Math.cos(nu);
  const yP = r * Math.sin(nu);

  const vScale = Math.sqrt(mu / p);
  const vxP = -vScale * Math.sin(nu);
  const vyP = vScale * (ecc + Math.cos(nu));

  perifocalToWorld(xP, yP, i, lan, argp, outPosition);
  if (outVelocity) perifocalToWorld(vxP, vyP, i, lan, argp, outVelocity);
};

/**
 * 3-1-3 rotation from the perifocal frame to world space, then the Y-up remap.
 * Identical to the convention in `physicsUtils.calculateOrbitalState`, so
 * elements produced by one are readable by the other.
 */
const perifocalToWorld = (
  x: number,
  y: number,
  i: number,
  lan: number,
  argp: number,
  out: THREE.Vector3,
): void => {
  const cosW = Math.cos(argp), sinW = Math.sin(argp);
  const cosI = Math.cos(i), sinI = Math.sin(i);
  const cosO = Math.cos(lan), sinO = Math.sin(lan);

  // Rotate by argument of periapsis about the orbit normal.
  const xw = x * cosW - y * sinW;
  const yw = x * sinW + y * cosW;

  // Incline about the line of nodes.
  const yi = yw * cosI;
  const zi = yw * sinI;

  // Rotate by the longitude of the ascending node.
  const xf = xw * cosO - yi * sinO;
  const yf = xw * sinO + yi * cosO;

  // Ecliptic is the XZ plane with +Y as the normal.
  out.set(xf, zi, -yf);
};

/**
 * Derive elements from a relative state vector, so a body can be converted from
 * free N-body motion onto rails (or back) without a discontinuity.
 */
export const elementsFromState = (
  relPosition: THREE.Vector3,
  relVelocity: THREE.Vector3,
  mu: number,
  epoch: number,
  scratch: { h: THREE.Vector3; e: THREE.Vector3; n: THREE.Vector3 },
): OrbitalElements | null => {
  const r = relPosition.length();
  const v = relVelocity.length();
  if (!(r > 1e-9) || !(mu > 0)) return null;

  const h = scratch.h.crossVectors(relPosition, relVelocity);
  const hLen = h.length();
  if (!(hLen > 1e-12)) return null;

  // Eccentricity vector e = ((v² − μ/r)r − (r·v)v) / μ
  const eVec = scratch.e
    .copy(relPosition)
    .multiplyScalar(v * v - mu / r)
    .addScaledVector(relVelocity, -relPosition.dot(relVelocity))
    .divideScalar(mu);
  const ecc = eVec.length();

  const energy = (v * v) / 2 - mu / r;
  if (energy >= 0) return null;          // unbound: not a closed orbit
  const a = -mu / (2 * energy);

  const inc = Math.acos(Math.max(-1, Math.min(1, h.y / hLen)));

  // Node vector n = ŷ × h, in the Y-up convention.
  const n = scratch.n.set(h.z, 0, -h.x);
  const nLen = n.length();

  let lan = 0;
  if (nLen > 1e-9) {
    lan = Math.acos(Math.max(-1, Math.min(1, n.x / nLen)));
    if (n.z > 0) lan = 2 * Math.PI - lan;
  }

  let argp = 0;
  if (nLen > 1e-9 && ecc > 1e-9) {
    argp = Math.acos(Math.max(-1, Math.min(1, n.dot(eVec) / (nLen * ecc))));
    if (eVec.y < 0) argp = 2 * Math.PI - argp;
  }

  if (nLen <= 1e-9 && ecc > 1e-9) {
    argp = normalizeAngle(Math.atan2(-eVec.z * Math.sign(h.y), eVec.x));
  }

  let nu: number;
  if (ecc > 1e-9) {
    nu = Math.acos(Math.max(-1, Math.min(1, eVec.dot(relPosition) / (ecc * r))));
    if (relPosition.dot(relVelocity) < 0) nu = 2 * Math.PI - nu;
  } else if (nLen > 1e-9) {
    nu = Math.acos(Math.max(-1, Math.min(1, n.dot(relPosition) / (nLen * r))));
    if (relPosition.y < 0) nu = 2 * Math.PI - nu;
  } else {
    nu = normalizeAngle(Math.atan2(-relPosition.z * Math.sign(h.y), relPosition.x));
  }

  return {
    a,
    e: ecc,
    i: inc,
    lan,
    argp,
    m0: meanAnomalyFromTrueAnomaly(nu, ecc),
    epoch,
  };
};

/** Build elements directly from human-readable orbital parameters (degrees). */
export const elementsFromDegrees = (
  a: number,
  e: number,
  iDeg: number,
  lanDeg: number,
  argpDeg: number,
  meanAnomalyDeg: number,
  epoch = 0,
): OrbitalElements => ({
  a,
  e: Math.max(0, Math.min(0.999, e)),
  i: (iDeg * Math.PI) / 180,
  lan: (lanDeg * Math.PI) / 180,
  argp: (argpDeg * Math.PI) / 180,
  m0: normalizeAngle((meanAnomalyDeg * Math.PI) / 180),
  epoch,
});
