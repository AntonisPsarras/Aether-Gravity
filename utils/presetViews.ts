import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { bodyRenderPosition } from './renderPosition';
import { bodyVisualRadius, type UiMode } from './displayMode';
import { getOrbitalElements } from './physicsUtils';

export const presetViews: Record<string, readonly string[]> = {
  'solar-system': ['Inner planets', 'Full system'],
  'trappist-1': ['Overview'],
  'alpha-centauri': ['Binary stars', 'Proxima planets', 'Full system'],
};

/** Camera-only fitting. Bounds include the enlarged satellite display. */
export function presetViewFrame(bodies: CelestialBody[], view: string | null, mode: UiMode, aspect: number) {
  const id = bodies.find(b => b.properties?.presetId)?.properties?.presetId;
  if (!id || !presetViews[id]) return null;
  const choice = view && presetViews[id].includes(view) ? view : presetViews[id][0];
  const selected = bodies.filter(b => choice === 'Inner planets'
    ? ['Sun', 'Mercury', 'Venus', 'Earth', 'Mars'].includes(b.name)
    : choice === 'Binary stars' ? b.name.startsWith('Alpha Centauri')
    : choice === 'Proxima planets' ? b.name.startsWith('Proxima') : true);
  if (!selected.length) return null;
  const box = new THREE.Box3(), pos = new THREE.Vector3(), origin = new THREE.Vector3();
  for (const b of selected) {
    bodyRenderPosition(pos, b, bodies.find(p => p.id === b.parentId), origin, mode);
    const r = bodyVisualRadius(b, mode);
    box.expandByPoint(pos.clone().addScalar(r));
    box.expandByPoint(pos.clone().addScalar(-r));
  }
  const centre = box.getCenter(new THREE.Vector3());
  let radius = Math.max(0.2, box.getSize(new THREE.Vector3()).length() / 2);
  if (['Overview', 'Proxima planets', 'Inner planets'].includes(choice)) {
    const star = selected.find(b => b.type === 'Star');
    if (star) {
      // Fit complete orbits, not just this frame's body positions. Otherwise
      // an asymmetric planet configuration crops the far side of its paths.
      centre.copy(star.position);
      radius = bodyVisualRadius(star, mode);
      for (const body of selected) {
        if (body === star) continue;
        const orbit = body.parentId === star.id && body.orbit ? body.orbit : getOrbitalElements(body, star);
        const extent = orbit.a > 0 && orbit.e < 1 ? orbit.a * (1 + orbit.e) : body.position.distanceTo(star.position);
        radius = Math.max(radius, extent + bodyVisualRadius(body, mode));
      }
    }
  }
  const distance = radius * 1.3 / Math.sin(Math.atan(Math.tan(Math.PI / 8) * Math.min(1, aspect)));
  return { centre, distance, choice };
}
