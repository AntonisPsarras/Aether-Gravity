
import { GPUComputationRenderer } from 'three-stdlib';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import React, { useEffect, useRef, useState } from 'react';
import { CelestialBody } from '../../types';
import GPGPUBodyVisualizer from './GPGPUVisualizer';

const velocityShader = `
    uniform float delta;
    uniform float softening;
    uniform float gravityConstant;
    
    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 selfPosMass = texture2D(texturePosition, uv);
        vec4 selfVel = texture2D(textureVelocity, uv);
        
        vec3 pos = selfPosMass.rgb;
        vec3 vel = selfVel.rgb;
        vec3 acc = vec3(0.0);
        
        vec2 size = resolution.xy;
        
        for (float y = 0.0; y < size.y; y++) {
            for (float x = 0.0; x < size.x; x++) {
                vec2 otherUV = vec2(x + 0.5, y + 0.5) / size;
                vec4 otherPosMass = texture2D(texturePosition, otherUV);
                
                vec3 r = otherPosMass.rgb - pos;
                float distSq = dot(r, r) + softening;
                float f = (gravityConstant * otherPosMass.a) / (distSq * sqrt(distSq));
                acc += r * f;
            }
        }
        
        vel += acc * delta;
        gl_FragColor = vec4(vel, 1.0);
    }
`;

const positionShader = `
    uniform float delta;
    void main() {
        vec2 uv = gl_FragCoord.xy / resolution.xy;
        vec4 posMass = texture2D(texturePosition, uv);
        vec4 vel = texture2D(textureVelocity, uv);
        posMass.rgb += vel.rgb * delta;
        gl_FragColor = posMass;
    }
`;

interface GPGPUPhysicsProps {
    bodies: React.MutableRefObject<CelestialBody[]>;
    count: number;
    speed: number;
    paused: boolean;
    setBodies: (bodies: CelestialBody[]) => void;
    floatingOffset: React.MutableRefObject<THREE.Vector3>;
}

const GPGPUPhysics = ({ bodies, count, speed, paused, floatingOffset }: GPGPUPhysicsProps) => {
    const { gl } = useThree();
    const gpuCompute = useRef<any>(null);
    const variables = useRef<{ velocity: any, position: any } | null>(null);
    const [texturePos, setTexturePos] = useState<THREE.Texture | null>(null);

    useEffect(() => {
        const texSize = Math.ceil(Math.sqrt(count));
        // @ts-ignore
        const gpu = new GPUComputationRenderer(texSize, texSize, gl);

        // Manually create DataTextures to avoid type definition issues with gpu.createTexture()
        const dtPositionData = new Float32Array(texSize * texSize * 4);
        const dtPosition = new THREE.DataTexture(dtPositionData, texSize, texSize, THREE.RGBAFormat, THREE.FloatType);

        const dtVelocityData = new Float32Array(texSize * texSize * 4);
        const dtVelocity = new THREE.DataTexture(dtVelocityData, texSize, texSize, THREE.RGBAFormat, THREE.FloatType);

        const posArray = dtPosition.image.data as Float32Array;
        const velArray = dtVelocity.image.data as Float32Array;

        for (let k = 0; k < posArray.length; k += 4) {
            const i = k / 4;
            if (bodies.current && bodies.current.length > i && bodies.current[i]) {
                const b = bodies.current[i];
                posArray[k] = b.position.x;
                posArray[k + 1] = b.position.y;
                posArray[k + 2] = b.position.z;
                posArray[k + 3] = b.mass;
                velArray[k] = b.velocity.x;
                velArray[k + 1] = b.velocity.y;
                velArray[k + 2] = b.velocity.z;
                velArray[k + 3] = 0;
            } else {
                posArray[k + 3] = 0;
            }
        }

        const velVar = gpu.addVariable('textureVelocity', velocityShader, dtVelocity);
        const posVar = gpu.addVariable('texturePosition', positionShader, dtPosition);

        gpu.setVariableDependencies(velVar, [posVar, velVar]);
        gpu.setVariableDependencies(posVar, [posVar, velVar]);

        velVar.material.uniforms.delta = { value: 0.01 };
        velVar.material.uniforms.gravityConstant = { value: 0.8 };
        velVar.material.uniforms.softening = { value: 100.0 };
        posVar.material.uniforms.delta = { value: 0.01 };

        const error = (gpu as any).init();
        if (error !== null) {
            console.error(error);
        }

        gpuCompute.current = gpu;
        variables.current = { velocity: velVar, position: posVar };
        setTexturePos(gpu.getCurrentRenderTarget(posVar).texture);

    }, [count, gl, bodies.current.length]); // Re-init if body count changes substantially

    useFrame((state, delta) => {
        if (!gpuCompute.current || !variables.current || paused) return;

        const compute = gpuCompute.current;
        const dt = Math.min(delta, 0.1) * speed;

        variables.current.velocity.material.uniforms.delta.value = dt;
        variables.current.position.material.uniforms.delta.value = dt;

        compute.compute();
        const currentTexture = compute.getCurrentRenderTarget(variables.current.position).texture;
        if (currentTexture !== texturePos) setTexturePos(currentTexture);
    });

    return <GPGPUBodyVisualizer count={count} texturePos={texturePos} floatingOffset={floatingOffset} />;
}

export default GPGPUPhysics;
