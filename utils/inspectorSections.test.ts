import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { BodyType, CelestialBody } from '../types';
import { BODY_CONFIGS } from '../constants';
import { PHYSICS_LIMITS } from './physicsBounds';
import { deriveBodyState } from './bodyDerivation';
import {
  INSPECTOR_SECTIONS, visibleSections, visibleFields, visibleTabs, isFieldVisibleInMode,
  isRadiusEditable, hasEditableComposition, canHaveRings, hasSpinAxis,
  massSliderRange, rocheLimitRadiiFor, defaultRingEdges,
  RADIUS_FIXED_TYPES, COMPOSITION_TYPES, RING_TYPES, SPIN_AXIS_TYPES,
} from './inspectorSections';

const ALL_TYPES = Object.keys(BODY_CONFIGS) as BodyType[];

const makeBody = (over: Partial<CelestialBody> = {}): CelestialBody => {
  const type = over.type ?? 'Planet';
  const mass = over.mass ?? BODY_CONFIGS[type].massRange[0];
  const d = deriveBodyState(type, mass, over.properties);
  return {
    id: 'b',
    type, mass,
    radius: d.radius,
    radiusKm: d.radiusKm,
    position: new THREE.Vector3(),
    velocity: new THREE.Vector3(),
    color: '#fff', texture: 'solid', trailColor: '#fff',
    temperature: d.temperature || 288,
    habitability: 'N/A', population: 0, name: 'test',
    ...over,
  };
};

describe('type-gating predicates', () => {
  it('covers every body type in BODY_CONFIGS', () => {
    // Guards against a new BodyType being added without anyone deciding which
    // Inspector controls it should get.
    expect(ALL_TYPES.length).toBe(14);
    for (const type of ALL_TYPES) {
      const body = makeBody({ type });
      expect(isRadiusEditable(body)).toBe(!RADIUS_FIXED_TYPES.includes(type));
      expect(hasEditableComposition(body)).toBe(COMPOSITION_TYPES.includes(type));
      expect(canHaveRings(body)).toBe(RING_TYPES.includes(type));
      expect(hasSpinAxis(body)).toBe(SPIN_AXIS_TYPES.includes(type));
    }
  });

  it('treats a missing body as ungated', () => {
    for (const p of [isRadiusEditable, hasEditableComposition, canHaveRings, hasSpinAxis]) {
      expect(p(null)).toBe(false);
      expect(p(undefined)).toBe(false);
    }
  });

  it('never lets a compact remnant expose an editable radius', () => {
    // Radius follows from the equation of state for these; an editable field
    // would let the user contradict the physics.
    for (const type of ['Black Hole', 'Neutron Star', 'Pulsar', 'White Dwarf'] as BodyType[]) {
      expect(isRadiusEditable(makeBody({ type }))).toBe(false);
    }
  });
});

describe('massSliderRange', () => {
  it('stays inside the global physics limits for every type', () => {
    for (const type of ALL_TYPES) {
      const [lo, hi] = massSliderRange(makeBody({ type }));
      expect(lo).toBeGreaterThanOrEqual(PHYSICS_LIMITS.MIN_MASS);
      expect(hi).toBeLessThanOrEqual(PHYSICS_LIMITS.MAX_MASS);
      expect(lo).toBeLessThan(hi);
    }
  });

  it('brackets the type\'s own mass range by a decade either side', () => {
    const cfg = BODY_CONFIGS['Planet'];
    const [lo, hi] = massSliderRange(makeBody({ type: 'Planet' }));
    expect(lo).toBeLessThanOrEqual(cfg.massRange[0]);
    expect(hi).toBeGreaterThanOrEqual(cfg.massRange[1]);
  });

  it('falls back to the global limits with no body', () => {
    expect(massSliderRange(null)).toEqual([PHYSICS_LIMITS.MIN_MASS, PHYSICS_LIMITS.MAX_MASS]);
  });
});

describe('roche limit helpers', () => {
  it('falls back to 2.5 R when density is unknown', () => {
    const body = makeBody({ type: 'Planet', properties: { bulkDensity: undefined } });
    expect(rocheLimitRadiiFor(body)).toBe(2.5);
  });

  it('keeps default ring edges ordered and outside the surface', () => {
    for (const type of RING_TYPES) {
      const { inner, outer } = defaultRingEdges(makeBody({ type }));
      expect(inner).toBeGreaterThan(1);
      expect(outer).toBeGreaterThan(inner);
    }
  });
});

describe('section visibility', () => {
  it('gives every body type at least one visible section', () => {
    for (const type of ALL_TYPES) {
      expect(visibleSections(makeBody({ type })).length).toBeGreaterThan(0);
    }
  });

  it('never returns a section with no visible fields', () => {
    for (const type of ALL_TYPES) {
      const body = makeBody({ type });
      for (const section of visibleSections(body)) {
        expect(visibleFields(section, body).length).toBeGreaterThan(0);
      }
    }
  });

  it('shows the relativistic section only for black holes', () => {
    for (const type of ALL_TYPES) {
      const ids = visibleSections(makeBody({ type })).map((s) => s.id);
      expect(ids.includes('relativistic')).toBe(type === 'Black Hole');
    }
  });

  it('reveals ring edge controls only once the rings are visible', () => {
    const off = makeBody({ type: 'Planet', properties: { ringOpacity: 0 } });
    const on = makeBody({ type: 'Planet', properties: { ringOpacity: 0.5 } });
    const rings = INSPECTOR_SECTIONS.find((s) => s.id === 'rings')!;
    expect(visibleFields(rings, off).map((f) => f.id)).toEqual(['ringOpacity']);
    expect(visibleFields(rings, on).map((f) => f.id)).toContain('ringOuterRadius');
  });

  it('hides the rotation-period slider once a body is tidally locked', () => {
    const analysis = INSPECTOR_SECTIONS.find((s) => s.id === 'analysis')!;
    const free = makeBody({ type: 'Planet', properties: { isTidallyLocked: false } });
    const locked = makeBody({ type: 'Planet', properties: { isTidallyLocked: true } });
    expect(visibleFields(analysis, free).map((f) => f.id)).toContain('rotationPeriod');
    expect(visibleFields(analysis, locked).map((f) => f.id)).not.toContain('rotationPeriod');
  });

  it('offers the analysis tab only to types with a habitability model', () => {
    for (const type of ALL_TYPES) {
      const tabs = visibleTabs(makeBody({ type }));
      expect(tabs).toContain('props');
      expect(tabs.includes('analysis')).toBe(
        (['Planet', 'Dwarf', 'Ice Giant'] as BodyType[]).includes(type),
      );
    }
  });
});

describe('audience gating (Beginner vs Advanced)', () => {
  it('defaults to the full Advanced set when no mode is given', () => {
    for (const type of ALL_TYPES) {
      const body = makeBody({ type });
      expect(visibleSections(body)).toEqual(visibleSections(body, 'advanced'));
      expect(visibleTabs(body)).toEqual(visibleTabs(body, 'advanced'));
    }
  });

  it('never shows a beginner a field an advanced user would not see', () => {
    // Beginner is strictly a subset. A field that only exists in Beginner Mode
    // would be a second information architecture to maintain.
    for (const type of ALL_TYPES) {
      const body = makeBody({ type });
      for (const section of visibleSections(body, 'beginner')) {
        const advanced = visibleSections(body, 'advanced').find((s) => s.id === section.id);
        expect(advanced).toBeDefined();
        const beginnerIds = visibleFields(section, body, 'beginner').map((f) => f.id);
        const advancedIds = visibleFields(advanced!, body, 'advanced').map((f) => f.id);
        for (const id of beginnerIds) expect(advancedIds).toContain(id);
      }
    }
  });

  it('hides composition and dynamics wholesale in Beginner Mode', () => {
    const planet = makeBody({ type: 'Planet' });
    const beginner = visibleSections(planet, 'beginner').map((s) => s.id);
    const advanced = visibleSections(planet, 'advanced').map((s) => s.id);
    expect(advanced).toEqual(expect.arrayContaining(['composition', 'dynamics']));
    expect(beginner).not.toContain('composition');
    expect(beginner).not.toContain('dynamics');
  });

  it('keeps a usable Orbit tab for beginners: parent, distance, a and e', () => {
    const planet = makeBody({ type: 'Planet' });
    const orbital = INSPECTOR_SECTIONS.find((s) => s.id === 'orbital')!;
    const ids = visibleFields(orbital, planet, 'beginner').map((f) => f.id);
    expect(ids).toEqual(['parent', 'parentDistance', 'semiMajorAxis', 'eccentricity']);
    expect(visibleTabs(planet, 'beginner')).toContain('orbit');
  });

  it('keeps a black hole legible: spin, r_s and r₊ survive Beginner Mode', () => {
    const bh = makeBody({ type: 'Black Hole' });
    const rel = INSPECTOR_SECTIONS.find((s) => s.id === 'relativistic')!;
    const ids = visibleFields(rel, bh, 'beginner').map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['spinParameter', 'schwarzschildRadius', 'eventHorizon']));
    expect(ids).not.toContain('isco');
    expect(ids).not.toContain('diskEfficiency');
  });

  it('leaves every type at least one section and the props tab in Beginner Mode', () => {
    for (const type of ALL_TYPES) {
      const body = makeBody({ type });
      expect(visibleSections(body, 'beginner').length).toBeGreaterThan(0);
      expect(visibleTabs(body, 'beginner')).toContain('props');
    }
  });

  it('agrees with isFieldVisibleInMode, which the section JSX gates on', () => {
    // The two layers read the same metadata; this pins them together.
    for (const section of INSPECTOR_SECTIONS) {
      for (const field of section.fields) {
        const advancedOnly = field.audience === 'advanced' || section.audience === 'advanced';
        expect(isFieldVisibleInMode(field.id, 'beginner')).toBe(!advancedOnly);
        expect(isFieldVisibleInMode(field.id, 'advanced')).toBe(true);
      }
    }
  });
});

describe('descriptor hygiene', () => {
  it('has unique section ids', () => {
    const ids = INSPECTOR_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique field ids within each section', () => {
    for (const section of INSPECTOR_SECTIONS) {
      const ids = section.fields.map((f) => f.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('never flashes a value that tracks live position or velocity', () => {
    // Those change every integrator step; flashing them would strobe.
    const positional = new Set(['parentDistance', 'orbitalPeriod', 'trueAnomaly']);
    for (const section of INSPECTOR_SECTIONS) {
      for (const field of section.fields) {
        if (positional.has(field.id)) expect(field.flash).toBeFalsy();
      }
    }
  });

  it('only ever flashes derived fields', () => {
    for (const section of INSPECTOR_SECTIONS) {
      for (const field of section.fields) {
        if (field.flash) expect(field.tier).toBe('derived');
      }
    }
  });
});
