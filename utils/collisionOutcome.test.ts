import { describe, expect, it, beforeEach } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody, PhysicsEvent, WaveEvent } from '../types';
import { scanCollisionsInPlace } from './physicsUtils';
import {
  CONTACT_FRACTION,
  classifyImpact,
  contactEscapeSpeed,
  nextFragmentId,
  resetFragmentSequence,
} from './collisionOutcome';
import { deriveBodyState } from './bodyDerivation';
import { isSatellite } from './moonSystem';
import { PHYSICS_LIMITS } from './physicsBounds';
import { resetVerletCache, verletStepInPlace, FIXED_DT } from './physicsSoA';
import { M_SUN_IN_EARTH } from './units';
import type { BodyType } from '../types';

/**
 * Build a body with its derived state (radius, radiusKm, temperature) resolved
 * the same way the app does, so the visual radii the contact test uses are real
 * rather than hand-picked.
 */
const body = (
  id: string,
  type: BodyType,
  mass: number,
  pos: [number, number, number] = [0, 0, 0],
  vel: [number, number, number] = [0, 0, 0],
  properties?: CelestialBody['properties'],
): CelestialBody => {
  const d = deriveBodyState(type, mass, properties);
  return {
    id, type, name: id, mass,
    radius: d.radius,
    radiusKm: d.radiusKm,
    position: new THREE.Vector3(...pos),
    velocity: new THREE.Vector3(...vel),
    color: '#fff', texture: 'rock', trailColor: '#fff',
    temperature: d.temperature, habitability: 'N/A', population: 0,
    properties: { ...(properties ?? {}), bulkDensity: d.bulkDensity },
  };
};

const solar = (m: number) => m * M_SUN_IN_EARTH;

const contactOf = (a: CelestialBody, b: CelestialBody) =>
  CONTACT_FRACTION * (a.radius + b.radius);

/** Total linear momentum of a body list. */
const momentum = (bodies: CelestialBody[]) => {
  const p = new THREE.Vector3();
  for (const b of bodies) p.addScaledVector(b.velocity, b.mass);
  return p;
};

const totalMass = (bodies: CelestialBody[]) =>
  bodies.reduce((s, b) => s + b.mass, 0);

const run = (bodies: CelestialBody[], dt: number, maxFragments = 6) => {
  const events: PhysicsEvent[] = [];
  const waves: WaveEvent[] = [];
  const changed = scanCollisionsInPlace(bodies, events, waves, dt, maxFragments);
  return { changed, events, waves };
};

beforeEach(() => {
  resetFragmentSequence();
  resetVerletCache();
});

// ---------------------------------------------------------------------------
// 1-2. Swept detection: the actual bug
// ---------------------------------------------------------------------------

describe('swept close-approach detection', () => {
  /**
   * Two neutron stars whose ENDPOINT separation is well outside contact but
   * whose step segment passes through it. This is the reported bug: the pair
   * tunnels between samples, no event fires, and the softened force at the
   * unsampled closest approach flings one of them into the velocity clamp.
   */
  const tunnelingPair = () => {
    // 1.4 M☉ neutron stars: R ≈ 12.4 km, drawn at ~0.186 L*, so contact is at
    // ~0.30 L*. One crosses the other at 1024 L*·yr⁻¹, i.e. 1.0 L* per step.
    const a = body('ns-a', 'Neutron Star', solar(1.4), [0, 0, 0], [0, 0, 0]);
    // Endpoint is 0.61 L* past the target; the segment came from +0.4 L* and its
    // minimum separation over the step is 0.1 L*, well inside contact.
    const b = body('ns-b', 'Neutron Star', solar(1.4), [-0.6, 0.1, 0], [-1024, 0, 0]);
    return [a, b];
  };

  it('endpoint-only sampling misses a pass-through (the original bug)', () => {
    const bodies = tunnelingPair();
    const endpointSep = bodies[0].position.distanceTo(bodies[1].position);
    expect(endpointSep).toBeGreaterThan(contactOf(bodies[0], bodies[1]));

    // dt = 0 degenerates to the pre-fix endpoint test.
    expect(run(bodies, 0).changed).toBe(false);
    expect(bodies).toHaveLength(2);
  });

  it('sweeping the step catches the same pass-through', () => {
    const bodies = tunnelingPair();
    const { changed, events } = run(bodies, FIXED_DT);
    expect(changed).toBe(true);
    expect(bodies).toHaveLength(1);
    expect(events.some((e) => e.type === 'collision' || e.type === 'fragmentation')).toBe(true);
  });

  it('does not fire on a fast pass that stays outside contact', () => {
    const a = body('ns-a', 'Neutron Star', solar(1.4));
    const b = body('ns-b', 'Neutron Star', solar(1.4), [-0.6, 5, 0], [-1024, 0, 0]);
    expect(run([a, b], FIXED_DT).changed).toBe(false);
    expect(run([a, b], 0).changed).toBe(false);
  });

  it('sweeps correctly under reverse playback (negative dt)', () => {
    // Same geometry mirrored: running time backwards, the pair separates from a
    // crossing that happened during the step.
    const a = body('ns-a', 'Neutron Star', solar(1.4));
    const b = body('ns-b', 'Neutron Star', solar(1.4), [0.6, 0.1, 0], [-1024, 0, 0]);
    expect(run([a, b], -FIXED_DT).changed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3-5. Conservation
// ---------------------------------------------------------------------------

describe('conservation', () => {
  it('conserves momentum exactly across a clean merge', () => {
    const a = body('p1', 'Planet', 1, [0, 0, 0], [0.4, -0.1, 0.2]);
    const b = body('p2', 'Planet', 0.7, [1.5, 0, 0]);
    // Well under the disruption speed, so this is a genuine accretionary merge.
    const vEsc = contactEscapeSpeed(a.mass + b.mass, contactOf(a, b));
    b.velocity.set(0.4 - 0.5 * vEsc, -0.1, 0.2);
    const bodies = [a, b];
    const before = momentum(bodies);
    const initialMass = totalMass(bodies);

    const { events } = run(bodies, FIXED_DT);
    expect(bodies).toHaveLength(1);
    expect(events.find((e) => e.type === 'collision')?.outcome).toBe('merge');

    // Ordinary collisions preserve the complete input mass and momentum.
    const after = momentum(bodies);
    expect(totalMass(bodies)).toBeCloseTo(initialMass, 12);
    expect(after.distanceTo(before)).toBeLessThan(1e-9);
  });

  /** A hypervelocity impact between two Earth-mass planets: 3× the mutual escape speed. */
  const shatterPair = () => {
    const a = body('p1', 'Planet', 1);
    const b = body('p2', 'Planet', 1, [3.0, 0.2, 0]);
    const vEsc = contactEscapeSpeed(a.mass + b.mass, contactOf(a, b));
    b.velocity.set(-3 * vEsc, 0, 0);
    return { bodies: [a, b], vEsc };
  };

  it('conserves momentum exactly across a shatter, fragments included', () => {
    const { bodies } = shatterPair();
    const initialMass = totalMass(bodies);
    const before = momentum(bodies);

    const { events } = run(bodies, FIXED_DT);
    const frag = events.find((e) => e.type === 'fragmentation');
    expect(frag).toBeDefined();
    expect(frag?.outcome).toBe('shatter');
    expect(bodies.length).toBeGreaterThan(1);

    // Fibonacci-sphere ejection directions do not sum to zero on their own; the
    // residual is divided out of every product body, so this must be exact.
    const after = momentum(bodies);
    expect(totalMass(bodies)).toBeCloseTo(initialMass, 12);
    expect(after.distanceTo(before)).toBeLessThan(1e-9);
  });

  it('conserves mass across an ordinary shatter without fictional radiative loss', () => {
    const { bodies } = shatterPair();
    const initialMass = totalMass(bodies);

    const { events } = run(bodies, FIXED_DT);

    const waveEvents = events.filter((e) => e.type === 'gravitational_wave');
    expect(waveEvents).toHaveLength(0);

    const deficit = 0;
    expect(totalMass(bodies) + deficit).toBeCloseTo(initialMass, 10);
  });

  it('debris actually leaves — every fragment is unbound at the contact radius', () => {
    const { bodies } = shatterPair();
    const remnantId = bodies[0].id;
    run(bodies, FIXED_DT);

    const remnant = bodies.find((b) => b.id === remnantId)!;
    const fragments = bodies.filter((b) => b.id.startsWith('frag-'));
    expect(fragments.length).toBeGreaterThanOrEqual(2);
    for (const f of fragments) {
      const rel = f.velocity.clone().sub(remnant.velocity).length();
      const esc = contactEscapeSpeed(remnant.mass + f.mass, f.position.distanceTo(remnant.position));
      expect(rel).toBeGreaterThan(esc);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Body-count budget
// ---------------------------------------------------------------------------

describe('fragment budget', () => {
  /** Inert filler far from the action, to eat the body budget. */
  const filler = (n: number): CelestialBody[] =>
    Array.from({ length: n }, (_, i) => body(`f${i}`, 'Planet', 0.1, [500 + i * 50, 0, 0]));

  const shatterInto = (fillerCount: number, maxFragments = 6) => {
    const a = body('p1', 'Planet', 1);
    const b = body('p2', 'Planet', 1, [3.0, 0.2, 0]);
    const vEsc = contactEscapeSpeed(2, contactOf(a, b));
    b.velocity.set(-3 * vEsc, 0, 0);
    const bodies = [a, b, ...filler(fillerCount)];
    const res = run(bodies, FIXED_DT, maxFragments);
    return { bodies, ...res };
  };

  it('never exceeds MAX_BODIES', () => {
    for (const n of [0, 20, 40, 46, 47, 48]) {
      const { bodies } = shatterInto(n);
      expect(bodies.length).toBeLessThanOrEqual(PHYSICS_LIMITS.MAX_BODIES);
    }
  });

  it('respects the device-tier fragment cap', () => {
    const high = shatterInto(0, 6);
    expect(high.events.find((e) => e.type === 'fragmentation')?.count).toBe(6);
    const low = shatterInto(0, 3);
    expect(low.events.find((e) => e.type === 'fragmentation')?.count).toBe(3);
  });

  it('trims the debris field to the remaining headroom', () => {
    // 47 filler + the colliding pair = 49 bodies; the consumed body frees one
    // slot, so there is room for exactly 2 fragments.
    const { bodies, events } = shatterInto(47);
    expect(events.find((e) => e.type === 'fragmentation')?.count).toBe(2);
    expect(bodies).toHaveLength(50);
  });

  it('downgrades to a clean merge when there is no room for a debris field', () => {
    // 48 filler + the pair = 50 bodies; only one slot frees up, which is not
    // enough for a debris field, so the impact must resolve as a merge rather
    // than half-destroying the target.
    const { bodies, events } = shatterInto(48);
    expect(events.some((e) => e.type === 'fragmentation')).toBe(false);
    expect(events.find((e) => e.type === 'collision')?.outcome).toBe('merge');
    expect(bodies).toHaveLength(49);
  });
});

// ---------------------------------------------------------------------------
// 7. The outcome map
// ---------------------------------------------------------------------------

describe('impact classification', () => {
  const classify = (a: CelestialBody, b: CelestialBody, ratio: number) => {
    const contact = contactOf(a, b);
    const vEsc = contactEscapeSpeed(a.mass + b.mass, contact);
    return classifyImpact(a, b, ratio * vEsc, contact);
  };

  it('a black hole meeting a planet accretes it, disrupting it outside the horizon', () => {
    const hole = body('bh', 'Black Hole', solar(10));
    const planet = body('p', 'Planet', 1);
    const c = classify(hole, planet, 1);
    expect(c.outcome).toBe('accrete');
    expect(c.primary.id).toBe('bh');
    expect(c.tidalDisruption).toBe(true);
  });

  it('the hole survives even when the victim is heavier', () => {
    const hole = body('bh', 'Black Hole', solar(4));
    const star = body('s', 'Star', solar(20));
    const c = classify(hole, star, 1);
    expect(c.outcome).toBe('accrete');
    expect(c.primary.id).toBe('bh');
  });

  it('a neutron star is swallowed whole — its tidal radius is inside the horizon', () => {
    const hole = body('bh', 'Black Hole', solar(10));
    const ns = body('ns', 'Neutron Star', solar(1.4));
    const c = classify(hole, ns, 1);
    expect(c.outcome).toBe('accrete');
    expect(c.tidalDisruption).toBe(false);
  });

  it('two massive stars merging past the core-collapse threshold collapse', () => {
    const a = body('s1', 'Star', solar(5));
    const b = body('s2', 'Star', solar(5));
    expect(classify(a, b, 0.5).outcome).toBe('collapse');
  });

  it('white dwarfs merging past Chandrasekhar collapse', () => {
    const a = body('wd1', 'White Dwarf', solar(1.0));
    const b = body('wd2', 'White Dwarf', solar(0.6));
    expect(classify(a, b, 0.5).outcome).toBe('collapse');
  });

  it('rocky planets shatter above the disruption speed and merge below it', () => {
    const a = body('p1', 'Planet', 1);
    const b = body('p2', 'Planet', 1);
    expect(classify(a, b, 3).outcome).toBe('shatter');
    expect(classify(a, b, 0.5).outcome).toBe('merge');
    // The threshold itself is FRAGMENTATION_RATIO = 1.5.
    expect(classify(a, b, 1.4).outcome).toBe('merge');
    expect(classify(a, b, 1.6).outcome).toBe('shatter');
  });

  it('a comet inside a dense planet’s Roche limit is tidally shattered', () => {
    const planet = body('p', 'Planet', 1);
    const comet = body('c', 'Comet', 1e-5, [0, 0, 0], [0, 0, 0], { volatileFraction: 0.8 });
    // Slow, so this exercises the tidal branch and not the energetic one.
    const c = classify(planet, comet, 0.2);
    expect(c.outcome).toBe('shatter');
    expect(c.tidalDisruption).toBe(true);
  });

  it('degenerate matter is not fragmented by a hypervelocity impact', () => {
    // 1.0 M☉ each, so the product stays below TOV and this tests the degeneracy
    // gate rather than the collapse branch above it.
    const a = body('ns1', 'Neutron Star', solar(1.0));
    const b = body('ns2', 'Neutron Star', solar(1.0));
    expect(classify(a, b, 3).outcome).toBe('merge');
  });

  it('a black hole eating something spins it up towards the Thorne limit', () => {
    const hole = body('bh', 'Black Hole', solar(10));
    const star = body('s', 'Star', solar(2), [3, 0, 0]);
    const bodies = [hole, star];
    run(bodies, FIXED_DT);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].type).toBe('Black Hole');
    const spin = bodies[0].properties?.spinParameter ?? 0;
    expect(spin).toBeGreaterThan(0);
    expect(spin).toBeLessThanOrEqual(0.998);
  });
});

// ---------------------------------------------------------------------------
// 8. Numerical stability
// ---------------------------------------------------------------------------

describe('close approach to a black hole', () => {
  it('resolves without NaN and without hitting the velocity clamp', () => {
    // An asteroid on a near-radial plunge into a 10 M☉ hole. Before the swept
    // test it would tunnel past the horizon, take an unsampled impulse of ~10⁶
    // L*·yr⁻¹, saturate MAX_VELOCITY_MAGNITUDE and be pinned to the position
    // envelope — reaching the clamp IS the bug, so that is the assertion.
    const hole = body('bh', 'Black Hole', solar(10));
    const rock = body('a', 'Asteroid', 1e-5, [400, 0, 0], [0, 0, 4]);
    const bodies: CelestialBody[] = [hole, rock];
    const events: PhysicsEvent[] = [];
    const waves: WaveEvent[] = [];

    for (let i = 0; i < 4000; i++) {
      verletStepInPlace(bodies, FIXED_DT);
      events.length = 0;
      waves.length = 0;
      scanCollisionsInPlace(bodies, events, waves, FIXED_DT);
      for (const b of bodies) {
        expect(Number.isFinite(b.position.x + b.position.y + b.position.z)).toBe(true);
        expect(Number.isFinite(b.velocity.x + b.velocity.y + b.velocity.z)).toBe(true);
        expect(Number.isFinite(b.mass)).toBe(true);
        expect(b.velocity.length()).toBeLessThan(PHYSICS_LIMITS.MAX_VELOCITY_MAGNITUDE);
        expect(Math.abs(b.position.x)).toBeLessThan(PHYSICS_LIMITS.MAX_POSITION_ABS);
      }
      if (bodies.length === 1) break;
    }

    expect(bodies).toHaveLength(1);
    expect(bodies[0].type).toBe('Black Hole');
  });

  it('survives a body with a corrupt radiusKm without poisoning the system', () => {
    // radiusKm is the sole input to pairSofteningSq; one bad value used to turn
    // every acceleration into NaN, which the bounds clamp then "repaired" by
    // collapsing every body onto the origin.
    const sun = body('sun', 'Star', M_SUN_IN_EARTH);
    const earth = body('earth', 'Planet', 1, [40, 0, 0], [0, 0, 251]);
    const broken = body('broken', 'Planet', 1, [80, 0, 0], [0, 0, 177]);
    (broken as { radiusKm: number }).radiusKm = NaN;

    const bodies = [sun, earth, broken];
    for (let i = 0; i < 200; i++) verletStepInPlace(bodies, FIXED_DT);

    expect(Number.isFinite(earth.position.length())).toBe(true);
    expect(Number.isFinite(sun.position.length())).toBe(true);
    expect(earth.position.length()).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// 9-11. Fragment hygiene
// ---------------------------------------------------------------------------

describe('fragment hygiene', () => {
  it('generates unique ids within a single millisecond', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) ids.add(nextFragmentId());
    expect(ids.size).toBe(1000);
  });

  it('creates free N-body bodies, never satellites', () => {
    const a = body('p1', 'Planet', 1);
    const b = body('p2', 'Planet', 1, [3.0, 0.2, 0]);
    b.velocity.set(-3 * contactEscapeSpeed(2, contactOf(a, b)), 0, 0);
    const bodies = [a, b];
    run(bodies, FIXED_DT);

    const fragments = bodies.filter((x) => x.id.startsWith('frag-'));
    expect(fragments.length).toBeGreaterThan(0);
    for (const f of fragments) {
      // A satellite is excluded from the integrator AND from collision scanning
      // and is teleported every frame — debris must not be one.
      expect(f.parentId).toBeUndefined();
      expect(f.orbit).toBeUndefined();
      expect(isSatellite(f)).toBe(false);
      expect(f.mass).toBeGreaterThan(0);
      expect(Number.isFinite(f.radius)).toBe(true);
      expect(Number.isFinite(f.radiusKm)).toBe(true);
    }
  });

  it('does not cascade: debris is not re-collided within the same scan', () => {
    const a = body('p1', 'Planet', 1);
    const b = body('p2', 'Planet', 1, [3.0, 0.2, 0]);
    b.velocity.set(-3 * contactEscapeSpeed(2, contactOf(a, b)), 0, 0);
    const bodies = [a, b];
    const { events } = run(bodies, FIXED_DT);

    // Exactly one contact resolved, and exactly one debris field created.
    expect(events.filter((e) => e.type === 'fragmentation')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'gravitational_wave')).toHaveLength(0);
    const count = events.find((e) => e.type === 'fragmentation')!.count!;
    expect(bodies).toHaveLength(1 + count);
  });

  it('every removed body is reported — nothing vanishes silently', () => {
    const a = body('p1', 'Planet', 1, [0, 0, 0], [1, 0, 0]);
    const b = body('p2', 'Planet', 0.5, [1.5, 0, 0], [-1, 0, 0]);
    const c = body('p3', 'Planet', 0.3, [-1.5, 0, 0], [1, 0, 0]);
    const bodies = [a, b, c];
    const removed = bodies.length;

    const { events } = run(bodies, FIXED_DT);
    const contactEvents = events.filter(
      (e) => e.type === 'collision' || e.type === 'fragmentation' || e.type === 'tde',
    );
    expect(contactEvents.length).toBe(removed - bodies.length);
  });
});
