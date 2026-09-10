import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { classifyBody, deriveBodyState } from './bodyDerivation';
import { createSandboxBody } from './bodyFactory';
import { gravitationalParameter, periodFromElements, propagateOrbit } from './keplerOrbit';
import {
  isSatellite,
  moonOrbitRenderScale,
  promoteEscapedMoons,
  propagateSatellites,
  satelliteRenderPosition,
} from './moonSystem';
import {
  LUNAR_MASS,
  MOON_MASS_MAX,
  MOON_MASS_MIN,
  buildMoonOnOrbit,
  describeMoonSize,
  hillStabilityFraction,
  inPlaneAngle,
  isOrbitAdmissible,
  makeMoonTemplate,
  moonHostStatus,
  moonInclinationRad,
  moonMassFor,
  moonMassRange,
  moonOrbitLimits,
  moonRadiusKm,
  oppositeApsis,
  orbitFromSpec,
  phaseForPlaneChange,
  resolveMoonDraft,
  speedFactorRange,
  type MoonDraftInput,
  type ResolvedMoonDraft,
} from './moonCreation';
import { fillParentMap, findDominantParent } from './physicsUtils';
import {
  M_SUN_IN_EARTH, auToDist, kmToDist, rigidRocheLimitRadii, rocheLimitRadii,
} from './units';
import { G_AETHER } from './units';

const SOLAR = M_SUN_IN_EARTH;

const makeBody = (over: Partial<CelestialBody> = {}): CelestialBody => {
  const type = over.type ?? 'Planet';
  const mass = over.mass ?? 1;
  const d = deriveBodyState(type, mass, over.properties);
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    type, mass,
    radius: d.radius,
    radiusKm: d.radiusKm,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    color: '#fff', texture: 'solid', trailColor: '#fff',
    temperature: 288, habitability: 'N/A', population: 0, name: over.name ?? 'test',
    ...over,
  };
};

/** Sun at the origin and a planet on a circular (or eccentric) orbit at `au`. */
const system = (au = 1, planetMass = 1, planetType: CelestialBody['type'] = 'Planet', ePlanet = 0) => {
  const sun = makeBody({ id: 'sun', type: 'Star', mass: SOLAR, name: 'Sun' });
  const r = auToDist(au);
  const mu = G_AETHER * (SOLAR + planetMass);
  // Start at periapsis; v = √(μ(1+e)/r) there.
  const v = Math.sqrt((mu * (1 + ePlanet)) / r);
  const planet = makeBody({
    id: 'planet', type: planetType, mass: planetMass, name: 'Planet',
    position: new THREE.Vector3(r, 0, 0),
    velocity: new THREE.Vector3(0, 0, -v),
  });
  return { sun, planet, bodies: [sun, planet] };
};

const draft = (over: Partial<MoonDraftInput> = {}): MoonDraftInput => ({
  parentId: 'planet', r: null, f: 1, phase: null, tiltDeg: 0, retrograde: false, mass: null, ...over,
});

const ready = (res: ReturnType<typeof resolveMoonDraft>): ResolvedMoonDraft => {
  if (res.status !== 'ready') throw new Error(`expected ready, got ${res.status}`);
  return res;
};

describe('Roche limits', () => {
  it('brackets Phobos between the rigid and fluid limits of Mars', () => {
    const mars = 3.93, phobos = 1.876;
    const rigid = rigidRocheLimitRadii(mars, phobos);
    const fluid = rocheLimitRadii(mars, phobos);
    expect(rigid).toBeCloseTo(1.61, 1);
    expect(fluid).toBeCloseTo(3.14, 1);
    expect(2.76).toBeGreaterThan(rigid);
    expect(2.76).toBeLessThan(fluid);
  });
});

describe('Hill-stability fit', () => {
  it('matches the published circular coefficients and favours retrograde moons', () => {
    expect(hillStabilityFraction(0, 0, false)).toBeCloseTo(0.4895, 4);
    expect(hillStabilityFraction(0, 0, true)).toBeCloseTo(0.9309, 4);
    expect(hillStabilityFraction(0.9, 0, false)).toBeLessThan(0.1);
  });
});

describe('moon orbit limits', () => {
  it('places the real Moon between Earth\'s Roche limit and its Hill-stability limit', () => {
    const { sun, planet: earth } = system(1, 1);
    const moon = createSandboxBody({
      id: 'm', type: 'Moon', name: 'Moon', mass: 0.0123,
      position: new THREE.Vector3(), velocity: new THREE.Vector3(),
    });
    const limits = moonOrbitLimits(earth, moon, sun, 'advanced', false);
    const moonA = kmToDist(384_399);

    // Earth's Hill radius is ~0.01 AU.
    expect(limits.hillRadius).toBeGreaterThan(auToDist(0.0095));
    expect(limits.hillRadius).toBeLessThan(auToDist(0.0105));
    expect(limits.rMin).toBeLessThan(moonA);
    expect(hillStabilityFraction(limits.ePlanet, 0.0549, false) * limits.hillRadius).toBeGreaterThan(moonA);
    // The display exaggerates moon orbits ~1500x, so around a sandbox Earth the
    // display cap — not physics — binds, and it stays below the physical limit.
    expect(limits.maxReason).toBe('display');
    expect(limits.rMax).toBeLessThan(hillStabilityFraction(0, 0, false) * limits.hillRadius);
    expect(limits.rMax).toBeGreaterThan(limits.rMin);
  });

  it('gives an isolated planet a finite, labelled range', () => {
    const planet = makeBody({ id: 'planet', mass: 1 });
    const res = ready(resolveMoonDraft(draft(), [planet], 'advanced'));
    expect(res.limits.maxReason).toBe('isolated');
    expect(Number.isFinite(res.limits.rMax)).toBe(true);
  });
});

describe('orbit construction from start distance and speed', () => {
  const setup = () => {
    const { bodies, planet } = system(5, 300, 'Gas Giant');
    const res = ready(resolveMoonDraft(draft(), bodies, 'advanced'));
    return { bodies, planet, res };
  };

  it('f = 1 is a circular orbit at r with the Kepler period', () => {
    const { res } = setup();
    const epoch = 3.25;
    const moon = buildMoonOnOrbit(res, 'moon', 'Moon 1', epoch);
    const r = res.spec.r;
    const mu = gravitationalParameter(res.parent.mass, moon.mass);
    expect(moon.orbit!.e).toBeLessThan(1e-12);
    expect(moon.orbit!.a).toBeCloseTo(r, 12);
    expect(moon.position.distanceTo(res.parent.position) / r).toBeCloseTo(1, 9);
    const relV = moon.velocity.clone().sub(res.parent.velocity).length();
    expect(relV / Math.sqrt(mu / r)).toBeCloseTo(1, 9);
    expect(res.periodYears).toBeCloseTo(2 * Math.PI * Math.sqrt((r ** 3) / mu), 12);
  });

  it.each([1.15, 0.8])('f = %s starts at an apsis with speed f·v_c and reaches the opposite apsis half a period later', (f) => {
    const { bodies, res: base } = setup();
    // Mid-range start distance, so the opposite apsis stays inside both limits.
    const r0 = Math.sqrt(base.limits.rMin * base.limits.rMax);
    const res = ready(resolveMoonDraft(draft({ f, r: r0 }), bodies, 'advanced'));
    expect(res.speedRange[0]).toBeLessThanOrEqual(f);
    expect(res.speedRange[1]).toBeGreaterThanOrEqual(f);
    expect(res.spec.f).toBeCloseTo(f, 12);
    const moon = buildMoonOnOrbit(res, 'moon', 'Moon', 0);
    const r = res.spec.r;
    const mu = gravitationalParameter(res.parent.mass, moon.mass);
    const rel = moon.position.clone().sub(res.parent.position);
    const relV = moon.velocity.clone().sub(res.parent.velocity);
    expect(rel.length() / r).toBeCloseTo(1, 9);
    expect(relV.length() / (f * Math.sqrt(mu / r))).toBeCloseTo(1, 9);
    expect(Math.abs(rel.dot(relV)) / (rel.length() * relV.length())).toBeLessThan(1e-9); // tangential

    const half = periodFromElements(moon.orbit!.a, mu) / 2;
    const p = new THREE.Vector3();
    propagateOrbit(moon.orbit!, mu, half, p);
    expect(p.length() / oppositeApsis(r, f)).toBeCloseTo(1, 6);
  });
});

describe('admissibility', () => {
  it('every admissible (r, f) is a closed orbit inside every limit, both directions', () => {
    const { bodies, planet } = system(5, 300, 'Gas Giant');
    for (const retrograde of [false, true]) {
      const moon = makeMoonTemplate(planet, moonMassFor(planet, null));
      const status = moonHostStatus(planet, moon, bodies, 'advanced', retrograde);
      if (!status.ok) throw new Error(status.reason);
      const { limits } = status;
      for (let i = 0; i <= 8; i++) {
        const r = limits.rMin * Math.pow(limits.rMax / limits.rMin, i / 8);
        const [lo, hi] = speedFactorRange(limits, r);
        expect(lo).toBeLessThanOrEqual(1);
        expect(hi).toBeGreaterThanOrEqual(1);
        expect(hi * hi).toBeLessThan(2);
        for (let k = 0; k <= 10; k++) {
          const f = lo + ((hi - lo) * k) / 10;
          expect(isOrbitAdmissible(limits, r, f)).toBe(true);
          const el = orbitFromSpec({ r, f, phase: 0, tiltDeg: 0, retrograde }, 0);
          expect(el.e).toBeLessThan(1);
          expect(el.a * (1 - el.e)).toBeGreaterThanOrEqual(limits.rMin * (1 - 1e-9));
          expect(el.a * (1 + el.e)).toBeLessThanOrEqual(limits.apoapsisCap * (1 + 1e-9));
        }
        expect(isOrbitAdmissible(limits, r, Math.SQRT2)).toBe(false);
      }
    }
  });

  it('clamps out-of-range drafts instead of producing an inadmissible orbit', () => {
    const { bodies } = system(5, 300, 'Gas Giant');
    const far = ready(resolveMoonDraft(draft({ r: 1e6, f: 1.37 }), bodies, 'advanced'));
    expect(far.spec.r).toBeCloseTo(far.limits.rMax, 12);
    expect(isOrbitAdmissible(far.limits, far.spec.r, far.spec.f)).toBe(true);
    const near = ready(resolveMoonDraft(draft({ r: 1e-9, f: 0.3 }), bodies, 'advanced'));
    expect(near.spec.r).toBeCloseTo(near.limits.rMin, 12);
    expect(isOrbitAdmissible(near.limits, near.spec.r, near.spec.f)).toBe(true);
  });
});

describe('created moons on rails', () => {
  it('is a satellite that promoteEscapedMoons never releases at creation, even at the outer limit', () => {
    for (const retrograde of [false, true]) {
      for (const au of [1, 5]) {
        const { bodies } = system(au, au === 1 ? 1 : 300, au === 1 ? 'Planet' : 'Gas Giant');
        const res0 = ready(resolveMoonDraft(draft({ retrograde, r: 1e9 }), bodies, 'advanced'));
        const res = ready(resolveMoonDraft(
          draft({ retrograde, r: 1e9, f: res0.speedRange[1] }), bodies, 'advanced',
        ));
        const moon = buildMoonOnOrbit(res, 'moon', 'Moon', 0);
        expect(isSatellite(moon)).toBe(true);
        expect(moon.parentId).toBe('planet');

        const all = [...bodies, moon];
        const byId = new Map(all.map((b) => [b.id, b]));
        const parents = new Map<string, CelestialBody | null>();
        fillParentMap(all, parents);
        expect(promoteEscapedMoons(all, byId, parents)).toEqual([]);
      }
    }
  });

  it('is born exactly where propagateSatellites places it on the next frame', () => {
    const { bodies } = system(5, 300, 'Gas Giant');
    const res = ready(resolveMoonDraft(draft({ f: 1.1, phase: 1.3 }), bodies, 'advanced'));
    const moon = buildMoonOnOrbit(res, 'moon', 'Moon', 2);
    const born = moon.position.clone();
    const bornV = moon.velocity.clone();
    propagateSatellites([...bodies, moon], new Map([...bodies, moon].map((b) => [b.id, b])), 2);
    expect(moon.position.distanceTo(born)).toBeLessThan(1e-12);
    expect(moon.velocity.distanceTo(bornV)).toBeLessThan(1e-9);
  });

  it.each([
    [0.7, 0, false], [2.4, 0, true], [4.0, 35, false], [5.5, 60, true],
  ])('round-trips phase %s rad (tilt %s°, retrograde %s) through elements and the render transform', (phase, tiltDeg, retrograde) => {
    const { bodies } = system(5, 300, 'Gas Giant');
    const res = ready(resolveMoonDraft(draft({ phase, tiltDeg, retrograde }), bodies, 'advanced'));
    const moon = buildMoonOnOrbit(res, 'moon', 'Moon', 0);
    const rel = moon.position.clone().sub(res.parent.position);
    const iRad = moonInclinationRad(tiltDeg, retrograde);
    expect(inPlaneAngle(rel, iRad)).toBeCloseTo(phase, 9);
    expect(rel.length() / res.spec.r).toBeCloseTo(1, 9);

    // The handle drag inverts the render transform: drawn offset / scale = r.
    const drawn = satelliteRenderPosition(moon, res.parent, new THREE.Vector3()).sub(res.parent.position);
    const scale = moonOrbitRenderScale(res.parent, 'advanced', moon);
    expect(drawn.length() / scale / res.spec.r).toBeCloseTo(1, 9);
    expect(inPlaneAngle(drawn, iRad)).toBeCloseTo(phase, 9);
  });

  it('keeps the start point in place when the direction flips in the reference plane', () => {
    const pro = moonInclinationRad(0, false);
    const retro = moonInclinationRad(0, true);
    const phase = 1.1;
    const flipped = phaseForPlaneChange(phase, pro, retro);
    const a = new THREE.Vector3(Math.cos(phase), 0, -Math.sin(phase));
    const b = new THREE.Vector3(Math.cos(flipped), 0, Math.sin(flipped));
    expect(a.distanceTo(b)).toBeLessThan(1e-12);
  });
});

describe('moon size', () => {
  it('uses exactly the range the classifier calls a moon', () => {
    expect(classifyBody('Moon', MOON_MASS_MIN)).toBe('Moon');
    expect(classifyBody('Moon', MOON_MASS_MAX)).toBe('Moon');
    expect(classifyBody('Moon', MOON_MASS_MIN * 0.99)).not.toBe('Moon');
    expect(classifyBody('Moon', MOON_MASS_MAX * 1.01)).not.toBe('Moon');
    // Every known moon fits, the largest (Ganymede, 0.0248 M⊕) with room to spare.
    expect(MOON_MASS_MAX).toBeGreaterThan(0.0248);
  });

  it('is capped at a tenth of a light parent and by the moon range for a heavy one', () => {
    const giant = makeBody({ id: 'giant', type: 'Gas Giant', mass: 300 });
    const dwarf = makeBody({ id: 'dwarf', type: 'Dwarf', mass: 2e-3 });
    expect(moonMassRange(giant)).toEqual({ min: MOON_MASS_MIN, max: MOON_MASS_MAX, maxReason: 'type' });
    expect(moonMassRange(dwarf)).toEqual({ min: MOON_MASS_MIN, max: 2e-4, maxReason: 'parent' });
    expect(moonMassFor(giant, 10)).toBe(MOON_MASS_MAX);
    expect(moonMassFor(giant, 1e-20)).toBe(MOON_MASS_MIN);
    expect(moonMassFor(dwarf, 1)).toBeCloseTo(2e-4, 15);
  });

  it('defaults to a lunar-mass moon, clearly visible next to its planet', () => {
    const { planet: earth } = system(1, 1);
    expect(moonMassFor(earth, null)).toBeCloseTo(LUNAR_MASS, 12);
    expect(LUNAR_MASS).toBeCloseTo(0.0123, 4);
    const moon = makeMoonTemplate(earth, moonMassFor(earth, null));
    // The derivation's validation point: the Moon comes out at 1686 km (actual 1737).
    expect(moon.radiusKm).toBeGreaterThan(1600);
    expect(moon.radiusKm).toBeLessThan(1800);
    expect(moon.radius / earth.radius).toBeGreaterThan(0.45);   // drawn size vs. Earth
    expect(describeMoonSize(LUNAR_MASS)).toBe('≈ the Moon');
    // A light parent gets the largest moon it can hold instead.
    const dwarf = makeBody({ id: 'dwarf', type: 'Dwarf', mass: 2e-3 });
    expect(moonMassFor(dwarf, null)).toBeCloseTo(2e-4, 15);
  });

  it('spans kilometre moonlets to beyond Ganymede', () => {
    expect(moonRadiusKm(MOON_MASS_MIN)).toBeLessThan(10);
    expect(moonRadiusKm(MOON_MASS_MAX)).toBeGreaterThan(2400);
    expect(describeMoonSize(MOON_MASS_MIN)).toMatch(/Deimos/);
    expect(describeMoonSize(MOON_MASS_MAX)).toMatch(/Ganymede/);
  });

  it('resolves a requested size, clamped, and the largest still keeps the explicit parent', () => {
    const { bodies } = system(5, 300, 'Gas Giant');
    const small = ready(resolveMoonDraft(draft({ mass: 1e-6 }), bodies, 'advanced'));
    expect(small.moon.mass).toBeCloseTo(1e-6, 15);
    const huge = ready(resolveMoonDraft(draft({ mass: 5 }), bodies, 'advanced'));
    expect(huge.moon.mass).toBe(MOON_MASS_MAX);
    const moon = buildMoonOnOrbit(huge, 'moon', 'Moon', 0);
    const unbound = { ...moon, parentId: undefined };
    expect(findDominantParent(unbound, [...bodies, unbound])?.id).toBe('planet');
  });
});

describe('host eligibility', () => {
  it('rejects stars, satellites, Hill-starved and wildly eccentric planets, with reasons', () => {
    const { sun, planet, bodies } = system(1, 1);
    const moon = makeMoonTemplate(planet, moonMassFor(planet, null));

    const star = moonHostStatus(sun, moon, bodies, 'advanced');
    expect(star.ok).toBe(false);
    if (!star.ok) expect(star.reason).toMatch(/Stars/);

    const satellite = { ...planet, id: 'sat', parentId: 'sun' };
    const sat = moonHostStatus(satellite, moon, bodies, 'advanced');
    expect(sat.ok).toBe(false);

    const close = system(0.01, 1);
    const starved = moonHostStatus(close.planet, makeMoonTemplate(close.planet, moonMassFor(close.planet, null)), close.bodies, 'advanced');
    expect(starved.ok).toBe(false);
    if (!starved.ok) expect(starved.reason).toMatch(/Hill/);

    const wild = system(1, 1, 'Planet', 0.98);
    const eccentric = moonHostStatus(wild.planet, makeMoonTemplate(wild.planet, moonMassFor(wild.planet, null)), wild.bodies, 'advanced');
    expect(eccentric.ok).toBe(false);
    if (!eccentric.ok) expect(eccentric.reason).toMatch(/eccentric/);

    expect(moonHostStatus(planet, moon, bodies, 'advanced').ok).toBe(true);
  });
});
