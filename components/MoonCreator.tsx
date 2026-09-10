/**
 * In-canvas half of the moon creator: the ghost orbit, the draggable ghost
 * moon, the limit rings, and the markers on eligible parents.
 *
 * Mounted only while `creationMode === 'Moon'`. Everything it draws is unlit
 * and `depthWrite: false`, roughly 4 + N_hosts draw calls.
 *
 * ── Low-tier cost hooks ─────────────────────────────────────────────────────
 * Orbit and limit rings take their segment count from `quality.orbitSegments`
 * (64 on low). Host markers and the grab ring use 24 segments on low (48 on
 * high) and do not pulse on low.
 *
 * ── Position sync ───────────────────────────────────────────────────────────
 * The parent is re-read from the *live* physics array every frame and placed
 * through `bodyRenderPosition`, and the ghost moon is placed through the same
 * satellite path the real moon will use. The preview therefore tracks the
 * planet exactly as its committed orbit path and mesh will.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import type { CelestialBody } from '../types';
import { useStore } from '../utils/store';
import { useMoonDraft } from '../utils/moonDraft';
import {
  MOON_HOST_TYPES,
  inPlaneAngle,
  makeMoonTemplate,
  moonHostStatus,
  moonInclinationRad,
  moonMassFor,
  orbitFromSpec,
  orbitPlaneNormal,
  resolveMoonDraft,
  type MoonDraftResolution,
} from '../utils/moonCreation';
import { attachSatellite } from '../utils/moonSystem';
import { sampleOrbitPath } from '../utils/orbitPaths';
import { bodyRenderPosition } from '../utils/renderPosition';
import { bodyVisualRadius } from '../utils/displayMode';
import { cancelAllBodyPointerGestures } from '../utils/bodyPointerGesture';
import { MIN_HIT_RADIUS_PX, clampHitRadiusToCone, screenSpaceHitScale } from '../utils/hitTarget';
import { setOrbitControlsEnabled } from '../utils/orbitControls';
import { useEnvironment } from './Environment/EnvironmentContext';
import { detectIsTouch, type DeviceTier } from './CanvasSetup';

const NO_RAYCAST: THREE.Object3D['raycast'] = () => null;
const MESH_RAYCAST: THREE.Object3D['raycast'] = THREE.Mesh.prototype.raycast;

/** Limits drift as the parent orbits; re-resolve at this cadence even when idle. */
const RESOLVE_INTERVAL_S = 0.25;
/** Grab target floor for a mouse, CSS px radius (touch uses the 22px WCAG floor). */
const MOUSE_HIT_RADIUS_PX = 12;
/** Below this |ray · normal| the orbit plane is too edge-on to intersect reliably. */
const GRAZING_COS = 0.15;

const RING_COLOR = '#F9D423';
const INNER_LIMIT_COLOR = '#B57335';
const OUTER_LIMIT_COLOR = '#7dd3fc';
const MARKER_COLOR = '#F9D423';

// Module-scope scratch: the per-frame and per-move paths allocate nothing.
const _anchor = new THREE.Vector3();
const _ghost = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _ndc = new THREE.Vector2();
const _plane = new THREE.Plane();
const _raycaster = new THREE.Raycaster();

const findLive = (bodies: readonly CelestialBody[], id: string | null) =>
  id ? bodies.find((b) => b.id === id) : undefined;

const focalPixels = (camera: THREE.Camera, viewportHeight: number) =>
  camera instanceof THREE.PerspectiveCamera
    ? viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5))
    : viewportHeight;

const makeLine = (color: string, opacity: number, loop = false) => {
  const material = new THREE.LineBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, toneMapped: false,
  });
  const line = loop
    ? new THREE.LineLoop(new THREE.BufferGeometry(), material)
    : new THREE.Line(new THREE.BufferGeometry(), material);
  line.raycast = () => {};
  line.frustumCulled = false;
  return line;
};

const unitCircle = (segments: number) => {
  const pts = new Float32Array(segments * 3);
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    // i = 0 orbit plane: in-plane angle u maps to (cos u, 0, −sin u).
    pts[i * 3] = Math.cos(t);
    pts[i * 3 + 2] = -Math.sin(t);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  return geo;
};

export default function MoonCreator({
  bodiesRef,
  floatingOffset,
  onDragActiveChange,
  deviceTier,
}: {
  bodiesRef: React.MutableRefObject<CelestialBody[]>;
  floatingOffset: React.MutableRefObject<THREE.Vector3>;
  onDragActiveChange: (active: boolean) => void;
  deviceTier: DeviceTier;
}) {
  const { quality } = useEnvironment();
  const { gl, camera, controls, size } = useThree();
  const uiMode = useStore((s) => s.uiMode);
  const parentId = useMoonDraft((s) => s.parentId);
  const low = deviceTier === 'low';
  const markerSegments = low ? 24 : 48;
  const isTouch = detectIsTouch();

  // ── Imperative line objects (same pattern as OrbitPaths) ───────────────────
  const ring = useMemo(() => makeLine(RING_COLOR, 0.85), []);
  const limits = useMemo(() => {
    const group = new THREE.Group();
    const inner = makeLine(INNER_LIMIT_COLOR, 0.45, true);
    const outer = makeLine(OUTER_LIMIT_COLOR, 0.3, true);
    group.add(inner, outer);
    return { group, inner, outer };
  }, []);
  const circle = useMemo(() => unitCircle(quality.orbitSegments), [quality.orbitSegments]);
  useEffect(() => {
    limits.inner.geometry = circle;
    limits.outer.geometry = circle;
  }, [circle, limits]);
  useEffect(() => () => { circle.dispose(); }, [circle]);
  useEffect(() => () => {
    ring.geometry.dispose();
    (ring.material as THREE.Material).dispose();
    (limits.inner.material as THREE.Material).dispose();
    (limits.outer.material as THREE.Material).dispose();
  }, [ring, limits]);

  const markerGeometry = useMemo(() => new THREE.RingGeometry(0.82, 1, markerSegments), [markerSegments]);
  const markerMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: MARKER_COLOR, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    depthWrite: false, depthTest: false, toneMapped: false,
  }), []);
  useEffect(() => () => { markerGeometry.dispose(); }, [markerGeometry]);
  useEffect(() => () => { markerMaterial.dispose(); }, [markerMaterial]);

  // ── Draft resolution ───────────────────────────────────────────────────────
  const resolvedRef = useRef<MoonDraftResolution>({ status: 'no-parent' });
  const dirty = useRef(true);
  const lastResolve = useRef(-Infinity);
  const ringKey = useRef('');
  const templateCache = useRef<{ key: string; body: CelestialBody } | null>(null);
  /** Scratch satellite placed on the drafted orbit each frame. */
  const preview = useRef<CelestialBody | null>(null);
  const [hostIds, setHostIds] = useState<string[]>([]);

  useEffect(() => useMoonDraft.subscribe(() => { dirty.current = true; }), []);
  useEffect(() => { dirty.current = true; }, [uiMode, quality.orbitSegments]);

  const resolve = () => {
    const bodies = bodiesRef.current;
    const draft = useMoonDraft.getState();
    const parent = findLive(bodies, draft.parentId);
    let template: CelestialBody | undefined;
    if (parent) {
      const mass = moonMassFor(parent, draft.mass);
      const key = `${parent.id}|${mass}|${parent.radiusKm}`;
      if (templateCache.current?.key !== key) {
        templateCache.current = { key, body: makeMoonTemplate(parent, mass) };
      }
      template = templateCache.current.body;
    }
    const res = resolveMoonDraft(draft, bodies, uiMode, template);
    resolvedRef.current = res;

    if (res.status === 'ready') {
      const { spec, limits: lim } = res;
      const key = `${res.parent.id}|${spec.r}|${spec.f}|${spec.phase}|${spec.tiltDeg}|${spec.retrograde}|${lim.renderScale}|${quality.orbitSegments}`;
      if (key !== ringKey.current) {
        ringKey.current = key;
        const body: CelestialBody = {
          ...res.moon,
          position: new THREE.Vector3(),
          velocity: new THREE.Vector3(),
        };
        attachSatellite(body, res.parent, orbitFromSpec(spec, 0), 0);
        preview.current = body;
        const points = sampleOrbitPath(body, res.parent, quality.orbitSegments, 0, uiMode);
        ring.geometry.dispose();
        ring.geometry = new THREE.BufferGeometry();
        ring.geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
      }
      if (hostIds.length) setHostIds([]);
    } else {
      preview.current = null;
      ringKey.current = '';
      // Pick step: mark every body that can actually take a moon.
      const next = bodies
        .filter((b) => MOON_HOST_TYPES.includes(b.type) && !b.parentId)
        .filter((b) => moonHostStatus(
          b, makeMoonTemplate(b, moonMassFor(b, draft.mass)), bodies, uiMode, draft.retrograde,
        ).ok)
        .map((b) => b.id);
      if (next.join('|') !== hostIds.join('|')) setHostIds(next);
    }
  };

  // ── Phone sheet framing ────────────────────────────────────────────────────
  // On phone the moon sheet covers the bottom of the canvas, and the camera
  // centres the parent in the *whole* canvas — half the preview ring ends up
  // under the sheet. Shift the projection so the frustum centre sits in the
  // visible part. Projection only: world and render positions are untouched,
  // and R3F picking and the handle raycast both go through the same matrix.
  const viewShiftKey = useRef('');
  const updateViewShift = () => {
    if (!(camera instanceof THREE.PerspectiveCamera)) return;
    const canvasRect = gl.domElement.getBoundingClientRect();
    const sheet = document.querySelector<HTMLElement>('.moon-creator-anchor')?.getBoundingClientRect();
    let shift = 0;
    if (sheet && sheet.width >= canvasRect.width * 0.9) {
      // The visible band runs from the phone control-bar stack (which overlays
      // the top of the canvas) down to the sheet.
      const bar = document.querySelector<HTMLElement>('.control-bar-anchor')?.getBoundingClientRect();
      const top = Math.min(sheet.top, Math.max(canvasRect.top, bar ? bar.bottom : canvasRect.top));
      const visibleCentre = (top + sheet.top) / 2;
      shift = Math.max(0, Math.round((canvasRect.top + canvasRect.bottom) / 2 - visibleCentre));
    }
    const key = `${shift}|${size.width}|${size.height}`;
    if (key === viewShiftKey.current) return;
    viewShiftKey.current = key;
    if (shift > 0) camera.setViewOffset(size.width, size.height, 0, shift, size.width, size.height);
    else camera.clearViewOffset();
  };
  useEffect(() => () => {
    if (camera instanceof THREE.PerspectiveCamera) camera.clearViewOffset();
  }, [camera]);

  // ── Handle drag ────────────────────────────────────────────────────────────
  const drag = useRef<{ pointerId: number; detach: () => void } | null>(null);

  const endDrag = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    d.detach();
    try {
      if (gl.domElement.hasPointerCapture(d.pointerId)) gl.domElement.releasePointerCapture(d.pointerId);
    } catch { /* capture already gone */ }
    setOrbitControlsEnabled(controls, true);
    onDragActiveChange(false);
    useMoonDraft.getState().setDragging(false);
  };

  const moveHandle = (clientX: number, clientY: number) => {
    const res = resolvedRef.current;
    if (res.status !== 'ready') return;
    const parent = findLive(bodiesRef.current, res.parent.id);
    if (!parent) return;
    bodyRenderPosition(_anchor, parent, undefined, floatingOffset.current, uiMode);

    const rect = gl.domElement.getBoundingClientRect();
    _ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    _raycaster.setFromCamera(_ndc, camera);
    const ray = _raycaster.ray;

    const iRad = moonInclinationRad(res.spec.tiltDeg, res.spec.retrograde);
    orbitPlaneNormal(iRad, _normal);
    // An edge-on orbit plane would send the hit to infinity: intersect the
    // camera-facing plane instead and project back into the orbit plane.
    if (Math.abs(ray.direction.dot(_normal)) >= GRAZING_COS) {
      _plane.setFromNormalAndCoplanarPoint(_normal, _anchor);
    } else {
      camera.getWorldDirection(_camDir);
      _plane.setFromNormalAndCoplanarPoint(_camDir, _anchor);
    }
    if (!ray.intersectPlane(_plane, _hit)) return;

    _rel.subVectors(_hit, _anchor);
    _rel.addScaledVector(_normal, -_rel.dot(_normal));
    const drawn = _rel.length();
    if (!(drawn > 1e-9)) return;
    const r = drawn / res.limits.renderScale;
    useMoonDraft.getState().patch({
      r: Math.min(res.limits.rMax, Math.max(res.limits.rMin, r)),
      phase: inPlaneAngle(_rel, iRad),
    });
  };

  const onHandleDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (drag.current || (e as { isPrimary?: boolean }).isPrimary === false) return;
    cancelAllBodyPointerGestures();
    const pointerId = e.pointerId;
    try { gl.domElement.setPointerCapture(pointerId); } catch { /* synthetic event */ }
    setOrbitControlsEnabled(controls, false);
    onDragActiveChange(true);
    useMoonDraft.getState().setDragging(true);

    const onMove = (ev: PointerEvent) => { if (ev.pointerId === pointerId) moveHandle(ev.clientX, ev.clientY); };
    const onUp = (ev: PointerEvent) => { if (ev.pointerId === pointerId) endDrag(); };
    // A second finger means a pinch is starting: hand the gesture back to the
    // camera, the same rule the body gesture controller applies.
    const onDown = (ev: PointerEvent) => { if (ev.pointerId !== pointerId) endDrag(); };
    const onLost = () => endDrag();
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('blur', onLost);
    drag.current = {
      pointerId,
      detach: () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        window.removeEventListener('pointerdown', onDown);
        window.removeEventListener('blur', onLost);
      },
    };
  };

  useEffect(() => () => endDrag(), []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-frame placement ───────────────────────────────────────────────────
  const ghostRef = useRef<THREE.Mesh>(null);
  const grabRef = useRef<THREE.Mesh>(null);
  const hitboxRef = useRef<THREE.Mesh>(null);
  const markerRefs = useRef(new Map<string, THREE.Mesh>());

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (dirty.current || t - lastResolve.current >= RESOLVE_INTERVAL_S) {
      dirty.current = false;
      lastResolve.current = t;
      resolve();
      updateViewShift();
    }

    const res = resolvedRef.current;
    const bodies = bodiesRef.current;
    const focal = focalPixels(camera, size.height);
    const pulse = low ? 0.5 : 0.4 + 0.2 * Math.sin(t * 3);

    const ghost = ghostRef.current;
    const grab = grabRef.current;
    const hitbox = hitboxRef.current;
    const parent = res.status === 'ready' ? findLive(bodies, res.parent.id) : undefined;
    const body = preview.current;
    const ready = !!(parent && body && res.status === 'ready');

    ring.visible = ready;
    limits.group.visible = ready;
    if (ghost) ghost.visible = ready;
    if (grab) grab.visible = ready;
    if (hitbox) hitbox.raycast = ready ? MESH_RAYCAST : NO_RAYCAST;

    if (ready && res.status === 'ready' && parent && body) {
      bodyRenderPosition(_anchor, parent, undefined, floatingOffset.current, uiMode);
      ring.position.copy(_anchor);

      const scale = res.limits.renderScale;
      limits.group.position.copy(_anchor);
      limits.group.rotation.set(moonInclinationRad(res.spec.tiltDeg, res.spec.retrograde), 0, 0);
      limits.inner.scale.setScalar(res.limits.rMin * scale);
      limits.outer.scale.setScalar(res.limits.rMax * scale);

      // Re-place the scratch satellite against the parent's live state, then
      // draw it through the exact path a real moon takes.
      attachSatellite(body, parent, body.orbit!, 0);
      bodyRenderPosition(_ghost, body, parent, floatingOffset.current, uiMode);

      const visual = bodyVisualRadius(body, uiMode);
      const distance = Math.max(camera.position.distanceTo(_ghost), 1e-3);
      const baseHit = visual * 1.5;
      const target = isTouch ? MIN_HIT_RADIUS_PX : MOUSE_HIT_RADIUS_PX;
      const hitRadius = clampHitRadiusToCone(
        baseHit * screenSpaceHitScale((baseHit / distance) * focal, target, 40),
        distance,
        baseHit,
      );

      if (ghost) {
        ghost.position.copy(_ghost);
        ghost.scale.setScalar(visual);
      }
      if (hitbox) {
        hitbox.position.copy(_ghost);
        hitbox.scale.setScalar(hitRadius);
      }
      if (grab) {
        grab.position.copy(_ghost);
        grab.quaternion.copy(camera.quaternion);
        grab.scale.setScalar(hitRadius);
        (grab.material as THREE.MeshBasicMaterial).opacity = useMoonDraft.getState().dragging ? 0.9 : pulse + 0.2;
      }
    }

    // Host markers (pick step only; `hostIds` is empty once a parent is set).
    markerMaterial.opacity = pulse;
    for (const [id, mesh] of markerRefs.current) {
      const host = findLive(bodies, id);
      mesh.visible = !!host;
      if (!host) continue;
      bodyRenderPosition(mesh.position, host, undefined, floatingOffset.current, uiMode);
      mesh.quaternion.copy(camera.quaternion);
      const visual = bodyVisualRadius(host, uiMode) * 1.9;
      const distance = Math.max(camera.position.distanceTo(mesh.position), 1e-3);
      mesh.scale.setScalar(visual * screenSpaceHitScale((visual / distance) * focal, 16, 30));
    }
  });

  return (
    <group>
      <primitive object={ring} dispose={null} />
      <primitive object={limits.group} dispose={null} />
      <mesh ref={ghostRef} visible={false} raycast={NO_RAYCAST} renderOrder={21}>
        <sphereGeometry args={[1, 20, 20]} />
        <meshBasicMaterial color="#c8c8c8" transparent opacity={0.75} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={grabRef} visible={false} raycast={NO_RAYCAST} renderOrder={22} geometry={markerGeometry}>
        <meshBasicMaterial
          color={RING_COLOR} transparent opacity={0.6} side={THREE.DoubleSide}
          depthWrite={false} depthTest={false} toneMapped={false}
        />
      </mesh>
      <mesh
        ref={hitboxRef}
        name="moon-creator-handle"
        raycast={NO_RAYCAST}
        onPointerDown={onHandleDown}
      >
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {parentId == null && hostIds.map((id) => (
        <mesh
          key={id}
          ref={(m) => { if (m) markerRefs.current.set(id, m); else markerRefs.current.delete(id); }}
          geometry={markerGeometry}
          material={markerMaterial}
          raycast={NO_RAYCAST}
          renderOrder={20}
        />
      ))}
    </group>
  );
}
