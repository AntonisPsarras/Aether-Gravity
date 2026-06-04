import React, { createContext, useContext, useEffect, useMemo, useRef } from 'react';

import { useFrame, useThree } from '@react-three/fiber';

import { useFBO } from '@react-three/drei';

import * as THREE from 'three';



const LensTextureContext = createContext<THREE.Texture | null>(null);



export function useBlackHoleLensTexture(): THREE.Texture | null {

  return useContext(LensTextureContext);

}



// Module-scope registry of black hole root groups. BlackHoleRig calls

// registerBlackHoleVisual on mount/unmount so BlackHoleLensCapture never

// needs to walk the entire scene graph — O(N_blackholes) instead of O(N_scene).

const _bhRegistry = new Set<THREE.Object3D>();

/** Reused each capture frame to avoid per-tick array allocation. */
const _hiddenScratch: THREE.Object3D[] = [];



export function registerBlackHoleVisual(obj: THREE.Object3D, active: boolean): void {

  if (active) _bhRegistry.add(obj);

  else _bhRegistry.delete(obj);

}



type BlackHoleLensCaptureProps = {

  children: React.ReactNode;

  enabled?: boolean;

  /** Reduce capture rate on weak GPUs. */

  lowQuality?: boolean;

};



/** Low-res scene capture for black-hole gravitational lensing (shared across all BHs). */

export function BlackHoleLensCapture({

  children,

  enabled = true,

  lowQuality = false,

}: BlackHoleLensCaptureProps): React.ReactElement {

  const fbo = useFBO(256, 256, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });

  const { gl, scene, camera } = useThree();

  const frameRef = useRef(0);

  const captureInterval = lowQuality ? 6 : 3;



  useEffect(() => () => {

    fbo.dispose();

  }, [fbo]);



  useFrame(() => {

    if (!enabled) return;

    const ctx = gl.getContext();
    if (ctx && 'isContextLost' in ctx && (ctx as WebGLRenderingContext).isContextLost()) return;

    frameRef.current += 1;

    if (frameRef.current % captureInterval !== 0) return;



    const hidden = _hiddenScratch;

    hidden.length = 0;

    for (const obj of _bhRegistry) {

      if (obj.visible) {

        obj.visible = false;

        hidden.push(obj);

      }

    }



    const prevTarget = gl.getRenderTarget();

    const prevAutoClear = gl.autoClear;

    gl.autoClear = true;

    gl.setRenderTarget(fbo);

    gl.clear();

    gl.render(scene, camera);

    gl.setRenderTarget(prevTarget);

    gl.autoClear = prevAutoClear;



    for (let i = 0; i < hidden.length; i++) hidden[i].visible = true;

  });



  const value = useMemo(() => fbo.texture, [fbo]);



  return <LensTextureContext.Provider value={value}>{children}</LensTextureContext.Provider>;

}

