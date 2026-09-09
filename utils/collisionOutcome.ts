/**
 * What actually happens when two bodies touch.
 *
 * The pre-existing engine had exactly one outcome — a perfectly inelastic merge
 * — for every contact, regardless of who hit whom or how fast. That is wrong in
 * four separate ways, so this module classifies a contact into one of four
 * physically distinct pathways and, for the destructive one, plans the debris.
 *
 * ## Why the escape speed here is computed at the *visual* radius
 *
 * Contact is declared at the VISUAL radius (see the note in
 * `physicsUtils.scanCollisionsInPlace`): the drawn scale is compressed ~1000×
 * relative to physical radii, and a physical-radius contact test would make
 * collisions unreachable by hand and would consume every moon on the first step.
 * That choice is load-bearing, so the classification has to live in the same
 * frame of reference:
 *
 *     R_contact = CONTACT_FRACTION · (a.radius + b.radius)        [L*]
 *     v_esc     = sqrt(2 · G* · (m_a + m_b) / R_contact)          [L*·yr⁻¹]
 *
 * which reads as "is the pair still bound at the radius where the simulation
 * declares contact." Using `units.escapeVelocityKms(mass, radiusKm)` instead
 * would compare a speed sampled ~1000× further out against a surface escape
 * speed, giving v_rel/v_esc ≪ 1 for every collision that can occur — i.e. it
 * would classify *everything* as a clean merge and the destructive branch would
 * be dead code. The physical escape velocity is still used, but for the event
 * payload and the tidal-radius test, not for the branch condition.
 *
 * ## References
 *
 * Leinhardt & Stewart (2012), ApJ 745, 79 — the collision outcome map and the
 * `Q*_D` catastrophic-disruption criterion, whose gravity-regime boundary sits
 * near the mutual escape speed. Asphaug (2010), Chemie der Erde 70, 199 — the
 * accretion / erosion / hit-and-run regimes. Dohnanyi (1969), JGR 74, 2531 —
 * the collisional-cascade size distribution used for the fragment masses.
 *
 * Everything here is allocation-free on the hot path: `classifyImpact` fills and
 * returns a module-scope singleton, and `planFragmentation` writes into a reused
 * buffer. Neither result may be retained across calls.
 */

import * as THREE from 'three';
import type { CelestialBody, BodyType } from '../types';
import { COLLISION_PHYSICS, EVOLUTION_THRESHOLDS, G_CONSTANT } from '../constants';
import { bulkDensityGcm3, rocheLimitRadii } from './units';
import { blackHoleRadiusKm, classifyBody, classifyByMass } from './bodyDerivation';
import { PHYSICS_LIMITS, clampMass } from './physicsBounds';

/** Contact is declared inside this fraction of the summed visual radii. */
export const CONTACT_FRACTION = 0.8;

export type ImpactOutcome = 'merge' | 'shatter' | 'accrete' | 'collapse';

export interface ImpactClassification {
  outcome: ImpactOutcome;
  /** The body that survives. For `accrete` this is always the black hole. */
  primary: CelestialBody;
  /** The body that is removed. */
  secondary: CelestialBody;
  /** Relative speed at contact, L*·yr⁻¹. */
  relSpeed: number;
  /** Mutual escape speed at the contact radius, L*·yr⁻¹. */
  escapeSpeed: number;
  /** relSpeed / escapeSpeed. The single number the outcome map turns on. */
  speedRatio: number;
  /** L*. */
  contactRadius: number;
  /** Victim is disrupted outside the horizon — a TDE rather than a clean swallow. */
  tidalDisruption: boolean;
  totalMass: number;
  /** Mass retained by the remnant(s) after radiative losses. */
  productMass: number;
}

/** Degeneracy-supported matter is not fragmented by an ordinary hypervelocity impact. */
const DEGENERATE_TYPES: readonly BodyType[] = [
  'Black Hole', 'Neutron Star', 'Pulsar', 'White Dwarf',
];

const isDegenerate = (t: BodyType): boolean => DEGENERATE_TYPES.includes(t);

/**
 * Below this the "shattered" body is sub-comet dust: every fragment would land
 * under `classifyByMass`'s Comet floor and the debris would be a cloud of
 * identical specks. Merge instead.
 */
const MIN_SHATTERABLE_MASS = 1e-6;

/** A tidal disruption is only meaningful when the victim is much lighter. */
const TIDAL_MASS_RATIO = 0.05;

const _classification: ImpactClassification = {
  outcome: 'merge',
  primary: null as unknown as CelestialBody,
  secondary: null as unknown as CelestialBody,
  relSpeed: 0,
  escapeSpeed: 0,
  speedRatio: 0,
  contactRadius: 0,
  tidalDisruption: false,
  totalMass: 0,
  productMass: 0,
};

const densityOf = (b: CelestialBody): number => {
  const stored = b.properties?.bulkDensity;
  if (typeof stored === 'number' && Number.isFinite(stored) && stored > 0) return stored;
  const derived = bulkDensityGcm3(b.mass, b.radiusKm);
  return Number.isFinite(derived) && derived > 0 ? derived : 1;
};

/**
 * Mutual escape speed at the contact radius, in L*·yr⁻¹. See the module header for
 * why this is evaluated at the visual radius rather than the physical one.
 */
export const contactEscapeSpeed = (totalMass: number, contactRadius: number): number => {
  if (!(contactRadius > 0) || !(totalMass > 0)) return 0;
  return Math.sqrt((2 * G_CONSTANT * totalMass) / contactRadius);
};

/**
 * Classify a contact. `relSpeed` is |v_a − v_b| at contact and `contactRadius`
 * is what the caller's contact test used, so the two stay consistent.
 *
 * Returns a module-scope singleton — read it before the next call.
 */
export const classifyImpact = (
  a: CelestialBody,
  b: CelestialBody,
  relSpeed: number,
  contactRadius: number,
): ImpactClassification => {
  const c = _classification;
  const totalMass = a.mass + b.mass;

  // Default ordering: the heavier body survives.
  let primary = a.mass >= b.mass ? a : b;
  let secondary = a.mass >= b.mass ? b : a;

  const escapeSpeed = contactEscapeSpeed(totalMass, contactRadius);
  const productMass = clampMass(totalMass * COLLISION_PHYSICS.MERGER_EFFICIENCY);

  c.relSpeed = Number.isFinite(relSpeed) ? relSpeed : 0;
  c.escapeSpeed = escapeSpeed;
  c.speedRatio = escapeSpeed > 0 ? c.relSpeed / escapeSpeed : 0;
  c.contactRadius = contactRadius;
  c.totalMass = totalMass;
  c.productMass = productMass;
  c.tidalDisruption = false;

  // ---- 1. Accretion. A horizon has no surface to shatter and nothing that
  // crosses it comes back, so this is speed-independent and the hole always
  // survives — even a 10 M☉ hole meeting a 20 M☉ star leaves a hole.
  const aIsHole = a.type === 'Black Hole';
  const bIsHole = b.type === 'Black Hole';
  if (aIsHole || bIsHole) {
    if (aIsHole && bIsHole) {
      // Two holes: the heavier one is the remnant. Default ordering is right.
    } else {
      primary = aIsHole ? a : b;
      secondary = aIsHole ? b : a;
    }
    c.primary = primary;
    c.secondary = secondary;
    c.outcome = 'accrete';

    // Tidal disruption radius r_t = R_victim·(M_hole/M_victim)^(1/3). The victim
    // is shredded into a stream outside the horizon when r_t exceeds it — which
    // is the normal case for a stellar-mass hole meeting anything non-degenerate
    // (10 M☉ + Earth gives r_t ≈ 9.5e5 km against a 29.5 km horizon), and is not
    // the case for a neutron-star victim (r_t ≈ 17 km, inside the horizon), which
    // is swallowed whole.
    if (!isDegenerate(secondary.type) && secondary.mass > 0) {
      const horizonKm = blackHoleRadiusKm(primary.mass, primary.properties?.spinParameter ?? 0);
      const tidalKm = secondary.radiusKm * Math.cbrt(primary.mass / secondary.mass);
      c.tidalDisruption = Number.isFinite(tidalKm) && tidalKm > horizonKm;
    }
    return c;
  }

  c.primary = primary;
  c.secondary = secondary;

  // ---- 2. Collapse. The merger product crosses a stability threshold.
  //
  // This is a LABEL ONLY. `checkEvolutionInPlace` runs later in the same frame
  // and owns the actual state transition (supernova event, remnant mass, retype);
  // performing it here as well would double-fire the supernova and apply the
  // remnant factor twice. The label exists so the impact frame can render a hot
  // flash instead of a plain merge flash.
  const productType = classifyBody(primary.type, productMass);
  const stellarCollapse =
    (productType === 'Star' || productType === 'Red Giant') &&
    productMass > EVOLUTION_THRESHOLDS.CORE_COLLAPSE;
  const degenerateCollapse =
    isDegenerate(primary.type) && productMass > EVOLUTION_THRESHOLDS.TOV;
  // A white dwarf pushed past Chandrasekhar detonates (Type Ia) or collapses
  // (AIC) well before it could reach TOV.
  const chandrasekharCollapse =
    primary.type === 'White Dwarf' && productMass > EVOLUTION_THRESHOLDS.CHANDRASEKHAR;

  if (stellarCollapse || degenerateCollapse || chandrasekharCollapse) {
    c.outcome = 'collapse';
    return c;
  }

  // ---- 3. Shatter.
  const eitherDegenerate = isDegenerate(primary.type) || isDegenerate(secondary.type);
  if (!eitherDegenerate && secondary.mass >= MIN_SHATTERABLE_MASS) {
    // (a) Energetic disruption. Leinhardt & Stewart 2012 / Asphaug 2010 put the
    // accretion↔erosion boundary at the mutual escape speed and catastrophic
    // disruption at ~1.3-2 v_esc in the gravity regime. FRAGMENTATION_RATIO is
    // 1.5, sitting in that band; it has existed unused in constants.ts since 2.0.
    if (c.speedRatio > COLLISION_PHYSICS.FRAGMENTATION_RATIO) {
      c.outcome = 'shatter';
      return c;
    }

    // (b) Tidal disruption. The rigid-satellite Roche condition is scale-free in
    // density — d/R_primary depends only on the density ratio — so it evaluates
    // honestly against visual radii even though those are compressed. Only
    // meaningful for a much lighter intruder; a comparable-mass pair inside each
    // other's Roche zone is a merger, not a disruption.
    if (secondary.mass < TIDAL_MASS_RATIO * primary.mass && primary.radius > 0) {
      const limit = rocheLimitRadii(densityOf(primary), densityOf(secondary));
      if (Number.isFinite(limit) && contactRadius < limit * primary.radius) {
        c.outcome = 'shatter';
        c.tidalDisruption = true;
        return c;
      }
    }
  }

  // ---- 4. Everything else: the clean, momentum-conserving merge.
  c.outcome = 'merge';
  return c;
};

// ---------------------------------------------------------------------------
// Fragmentation
// ---------------------------------------------------------------------------

export interface FragmentPlan {
  /** Mass of the surviving remnant, M⊕. */
  largestRemnantMass: number;
  /** Ranked fragment masses; only the first `fragmentCount` entries are valid. */
  fragmentMasses: Float64Array;
  fragmentCount: number;
  /** Ejection speed of the largest fragment, L*·yr⁻¹. */
  ejectionSpeed: number;
  /** Distance from the barycentre at which fragments are placed, L*. */
  spawnRadius: number;
}

/** Hard ceiling on fragments from any one impact, independent of device tier. */
export const ABSOLUTE_MAX_FRAGMENTS = 12;

const _fragmentMasses = new Float64Array(ABSOLUTE_MAX_FRAGMENTS);
const _plan: FragmentPlan = {
  largestRemnantMass: 0,
  fragmentMasses: _fragmentMasses,
  fragmentCount: 0,
  ejectionSpeed: 0,
  spawnRadius: 0,
};

/**
 * Dohnanyi collisional cascade: a differential size distribution N(m) ∝ m^-α
 * with α ≈ 1.8 gives ranked masses m_k ∝ k^(-1/(α-1)) = k^-1.25.
 *
 * Deterministic on purpose. A random draw here would make the conservation tests
 * statistical rather than exact, and would make a replayed simulation diverge.
 */
const CASCADE_EXPONENT = 1.25;

/**
 * Decide the mass budget and fragment count for a shatter.
 *
 * Returns null when there is no room for a meaningful debris field — fewer than
 * two fragments — in which case the caller must fall back to a clean merge
 * rather than half-shattering the body.
 *
 * `headroom` is how many NEW bodies the caller can afford. `PHYSICS_LIMITS.MAX_BODIES`
 * is a hard cap, not a soft one: the gravity-grid shader uploads fixed 50-element
 * uniform arrays, and `sanitizeCelestialBodies` silently truncates anything past
 * 50 on the next store resync — and the truncated tail would be exactly these
 * fragments. So the budget has to be spent here, not discovered later.
 */
export const planFragmentation = (
  cls: ImpactClassification,
  headroom: number,
  maxFragments: number,
): FragmentPlan | null => {
  const budget = Math.min(
    Math.floor(maxFragments),
    Math.floor(headroom),
    ABSOLUTE_MAX_FRAGMENTS,
  );
  if (!(budget >= 2)) return null;

  // Q_R/Q*_D reduces to a pure speed-squared ratio: both specific energies carry
  // the same μ/M factor, so it cancels and there is no need to form the energies.
  // FRAGMENTATION_RATIO is the v_D anchor, which is what its name means.
  const vD = COLLISION_PHYSICS.FRAGMENTATION_RATIO * cls.escapeSpeed;
  const x = vD > 0 ? (cls.relSpeed / vD) ** 2 : 1;

  // The LS12 universal law, M_lr/M_total = 1 - 0.5·(Q_R/Q*_D). At the branch
  // boundary (x = 1, i.e. v_rel = 1.5 v_esc) this gives exactly 0.5 — the
  // textbook definition of Q*_D — so the classification threshold and the mass
  // law agree by construction rather than by tuning.
  const lrFraction = Math.max(0.05, Math.min(0.95, 1 - 0.5 * x));

  const largestRemnantMass = clampMass(cls.productMass * lrFraction);
  const ejectaMass = cls.productMass - largestRemnantMass;
  if (!(ejectaMass > 0) || !Number.isFinite(ejectaMass)) return null;

  // 4 fragments at the disruption threshold, up to 12 when pulverised.
  const desired = Math.round(4 + 8 * (1 - lrFraction));
  const count = Math.min(desired, budget);
  if (count < 2) return null;

  let norm = 0;
  for (let k = 1; k <= count; k++) norm += Math.pow(k, -CASCADE_EXPONENT);

  let assigned = 0;
  for (let k = 1; k <= count; k++) {
    const m = Math.max(
      PHYSICS_LIMITS.MIN_MASS,
      (ejectaMass * Math.pow(k, -CASCADE_EXPONENT)) / norm,
    );
    _fragmentMasses[k - 1] = m;
    assigned += m;
  }

  // Fold the rounding residual (and any MIN_MASS floor top-up) back into the
  // remnant so remnant + fragments sums to productMass exactly.
  _plan.largestRemnantMass = Math.max(PHYSICS_LIMITS.MIN_MASS, cls.productMass - assigned);
  _plan.fragmentCount = count;

  // Ejecta must actually leave. Below the mutual escape speed the debris would
  // fall straight back and re-merge on the next step, which reads as a merge with
  // extra steps; above MAX_VELOCITY/10 it would be flung outside the world bounds.
  const excess = 0.3 * (cls.relSpeed - cls.escapeSpeed);
  _plan.ejectionSpeed = Math.max(
    1.05 * cls.escapeSpeed,
    Math.min(excess, PHYSICS_LIMITS.MAX_VELOCITY_MAGNITUDE / 10),
  );

  _plan.spawnRadius = 1.05 * cls.contactRadius;
  return _plan;
};

// ---------------------------------------------------------------------------
// Fragment construction
// ---------------------------------------------------------------------------

/**
 * Monotonic id source. Every pre-existing id scheme in the codebase is
 * `${prefix}-${Date.now()}`, which collides for anything created inside the same
 * millisecond — and a shatter creates its whole debris field in one tick. Ids
 * are Map keys in `accelById`, `bodyByIdRef`, `bodyObjectsRef` and
 * `_collisionRemove`, so a collision there corrupts all four.
 */
let _fragmentSeq = 0;
export const nextFragmentId = (): string =>
  `frag-${Date.now().toString(36)}-${(_fragmentSeq++).toString(36)}`;

/** Test hook; not used by the simulation. */
export const resetFragmentSequence = (): void => { _fragmentSeq = 0; };

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const _dir = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _residual = new THREE.Vector3();
const _up = new THREE.Vector3(0, 0, 1);

/**
 * Deterministic Fibonacci-sphere direction k of n, with the polar axis rotated
 * onto `axis` so the debris cone opens along the impact direction rather than
 * along an arbitrary world axis.
 */
const fibonacciDirection = (out: THREE.Vector3, k: number, n: number, quat: THREE.Quaternion) => {
  const z = n === 1 ? 0 : 1 - (2 * k) / (n - 1);
  const r = Math.sqrt(Math.max(0, 1 - z * z));
  const theta = GOLDEN_ANGLE * k;
  out.set(r * Math.cos(theta), r * Math.sin(theta), z).applyQuaternion(quat);
  if (out.lengthSq() < 1e-12) out.set(1, 0, 0);
  return out;
};

/**
 * Build the debris bodies for a planned shatter and append them to `out`.
 *
 * Momentum is conserved EXACTLY, not approximately. Fibonacci points do not sum
 * to zero for an arbitrary n, so the residual momentum is computed and divided
 * out of every resulting body including the remnant; afterwards
 * Σ m_i·v_i = M_total·V_cm to floating-point precision. The caller is responsible
 * for applying `plan.largestRemnantMass` and `comVelocity` to the survivor and
 * for adding the same `residualCorrection` to it — which this function returns.
 */
export const spawnFragments = (
  cls: ImpactClassification,
  plan: FragmentPlan,
  comPosition: THREE.Vector3,
  comVelocity: THREE.Vector3,
  out: CelestialBody[],
): THREE.Vector3 => {
  const n = plan.fragmentCount;
  const source = cls.secondary;

  // Impact axis: from the survivor towards the body that hit it.
  _axis.subVectors(cls.secondary.position, cls.primary.position);
  if (_axis.lengthSq() < 1e-12) _axis.set(0, 0, 1);
  _axis.normalize();
  _quat.setFromUnitVectors(_up, _axis);

  const firstIndex = out.length;
  const m1 = plan.fragmentMasses[0];
  _residual.set(0, 0, 0);

  for (let k = 0; k < n; k++) {
    const m = plan.fragmentMasses[k];
    fibonacciDirection(_dir, k, n, _quat);

    // Standard ejecta scaling: smaller fragments carry away more speed per unit
    // mass, so they leave faster. The -1/6 exponent is the usual gravity-regime
    // value; the mass ratio is bounded by the cascade so this stays modest.
    const speed = plan.ejectionSpeed * Math.pow(m / m1, -1 / 6);

    const velocity = new THREE.Vector3(
      comVelocity.x + _dir.x * speed,
      comVelocity.y + _dir.y * speed,
      comVelocity.z + _dir.z * speed,
    );
    _residual.addScaledVector(_dir, m * speed);

    const type = classifyByMass(m);
    const fragment: CelestialBody = {
      id: nextFragmentId(),
      type,
      name: `${source.name} Fragment ${k + 1}`,
      mass: m,
      // Placeholders; reconciled by the caller via reconcileBodyDerivedState.
      radius: 0.05,
      radiusKm: 1,
      position: new THREE.Vector3(
        comPosition.x + _dir.x * plan.spawnRadius,
        comPosition.y + _dir.y * plan.spawnRadius,
        comPosition.z + _dir.z * plan.spawnRadius,
      ),
      velocity,
      color: source.color,
      texture: 'rock',
      trailColor: source.trailColor,
      temperature: source.temperature,
      habitability: 'N/A',
      population: 0,
      // Deliberately NO parentId and NO orbit: `isSatellite` needs both, and a
      // satellite is excluded from the integrator AND from collision scanning,
      // and is teleported every frame by propagateSatellites. Debris must be a
      // free N-body body or it is inert scenery.
    };
    out.push(fragment);
  }

  // Divide the residual out over the whole product (remnant + fragments) so the
  // system's total momentum is unchanged by the shatter.
  const correction = _residual.multiplyScalar(-1 / cls.productMass);
  for (let i = firstIndex; i < out.length; i++) {
    out[i].velocity.add(correction);
  }
  return correction;
};
