import { captureSimulationSnapshot } from '../utils/simulationSnapshot';
import { getPhysicsBodiesSnapshot } from '../utils/physicsBridge';
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../utils/store';
import { isE2EMode } from '../utils/e2eConfig';
import { getRenderSnapshot } from '../utils/renderBridge';
import {
  markTestBridgeCanvasReady,
  recordTestFrame,
  registerTestMetricsCollector,
  unregisterTestMetricsCollector,
} from '../utils/testBridge';

/**
 * Dev/E2E-only frame sampler — feeds the Playwright perf harness via window.__AETHER_TEST__.
 */
export default function TestMetricsCollector(): null {
  const enabled = isE2EMode();
  const { scene, gl, camera, controls } = useThree();
  const renderStats = useRef({ calls: 0, triangles: 0 });
  useEffect(() => {
    if (!enabled) return;
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => { gl.info.autoReset = previous; };
  }, [enabled, gl]);
  useFrame(() => {
    if (!enabled) return;
    renderStats.current.calls = gl.info.render.calls;
    renderStats.current.triangles = gl.info.render.triangles;
    gl.info.reset();
  }, -1000);

  useEffect(() => {
    if (!enabled) return;
    // Read-only, E2E-only inspection. No production telemetry or network activity.
    const inspect = () => {
      const paths: { name: string; count: number; first: number[]; center: number[]; radius: number }[] = [];
      const effects = { gas: 0, dust: 0, radiation: 0, orbit: 0 };
      const gas: { shell: number; opacity: number; size: number }[] = [];
      const selectionMarkers: string[] = [];
      scene.traverseVisible(object => {
        const drawable = object as THREE.Mesh;
        if (!drawable.geometry) return;
        if (object.name.startsWith('orbit-estimate:')) {
          const attr = drawable.geometry.getAttribute('position');
          paths.push({ name: object.name, count: attr.count,
            first: [attr.getX(0), attr.getY(0), attr.getZ(0)], center: object.position.toArray(),
            radius: drawable.geometry.boundingSphere?.radius ?? 0 });
          effects.orbit++;
        }
        if (object.parent?.name === 'environment-gas') {
          effects.gas++;
          const mat = drawable.material as THREE.ShaderMaterial;
          gas.push({ shell: mat.uniforms.uShell.value, opacity: mat.uniforms.uOpacity.value, size: object.scale.x });
        }
        if (object.name === 'decorative-dust') effects.dust++;
        if (object.name.startsWith('selection-marker:')) selectionMarkers.push(object.name);
        if (object.parent?.name.startsWith('radiation:') || object.parent?.parent?.name.startsWith('radiation:')) effects.radiation++;
      });
      const radiation: { name: string; time: number; strength: number }[] = [];
      scene.traverseVisible(object => {
        if (object.parent?.name.startsWith('radiation:') || object.parent?.parent?.name.startsWith('radiation:')) {
          const mat = (object as THREE.Mesh).material as THREE.ShaderMaterial;
          if (mat?.uniforms) radiation.push({ name: object.name || object.parent!.name,
            time: mat.uniforms.uTime.value, strength: mat.uniforms.uStrength.value });
        }
      });
      return { paths, effects, radiation, gas, selectionMarkers, rendererCalls: renderStats.current.calls, triangles: renderStats.current.triangles,
        geometries: gl.info.memory.geometries, textures: gl.info.memory.textures };
    };
    (window as Window & { __AETHER_VISUALS__?: typeof inspect }).__AETHER_VISUALS__ = inspect;
    // Test fixture controls use the actual mounted store (dynamic imports can
    // otherwise create a second store after Vite HMR). Never installed outside E2E.
    const fixtureControls = {
      getStore: useStore.getState,
      getLiveBodies: getPhysicsBodiesSnapshot,
      captureSimulation: () => captureSimulationSnapshot(useStore.getState().bodies),
      shiftCamera: () => {
        useStore.getState().setCameraLock(null);
        camera.position.x += 60000;
        const orbit = controls as unknown as { target?: THREE.Vector3 } | null;
        if (orbit?.target) orbit.target.x += 60000;
      },
      /** Lets a gesture test assert the camera actually rotated. */
      getCameraPosition: () => ({
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      }),
      /**
       * Client coordinates of a body's centre, so a test can drive real pointer
       * events at the 3D hitbox instead of going through the outliner. Body
       * groups are direct children of the scene, so their render-space position
       * is their world position.
       */
      projectBodyToScreen: (bodyId: string) => {
        const rendered = getRenderSnapshot().bodies.find((b) => b.id === bodyId);
        if (!rendered) return null;
        const ndc = new THREE.Vector3(
          rendered.position.x,
          rendered.position.y,
          rendered.position.z,
        ).project(camera);
        if (!Number.isFinite(ndc.x) || !Number.isFinite(ndc.y) || ndc.z > 1) return null;
        const rect = gl.domElement.getBoundingClientRect();
        return {
          x: rect.left + (ndc.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-ndc.y * 0.5 + 0.5) * rect.height,
        };
      },
    };
    (window as any).__AETHER_VISUAL_TEST__ = fixtureControls;
    return () => {
      delete (window as Window & { __AETHER_VISUALS__?: typeof inspect }).__AETHER_VISUALS__;
      delete (window as any).__AETHER_VISUAL_TEST__;
    };
  }, [enabled, scene, gl, camera, controls]);

  useEffect(() => {
    if (!enabled) return;
    registerTestMetricsCollector({ pushFrame: recordTestFrame });
    return () => unregisterTestMetricsCollector();
  }, [enabled]);

  useFrame((_state, delta) => {
    if (!enabled) return;
    markTestBridgeCanvasReady();
    recordTestFrame(delta * 1000);
  });

  return null;
}
