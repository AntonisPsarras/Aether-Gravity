import React, { useMemo, useRef, useState, useLayoutEffect } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import './PlanetShaders';
import { CelestialBody } from '../../types';

interface PlanetMeshProps {
    data: CelestialBody;
    floatingOffset: React.MutableRefObject<THREE.Vector3>;
    visualScale?: number;
}

const MAX_DEPTH = 3;

interface PlanetChunkProps {
    origin: THREE.Vector3;
    right: THREE.Vector3;
    up: THREE.Vector3;
    level: number;
    radius: number;
    center: THREE.Vector2;
    size: number;
    floatingOffset: React.MutableRefObject<THREE.Vector3>;
    planetPos: THREE.Vector3;
    data: CelestialBody;
}

const PlanetChunk: React.FC<PlanetChunkProps> = ({
    origin,
    right,
    up,
    level,
    radius,
    center,
    size,
    floatingOffset,
    planetPos,
    data
}) => {
    const meshRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<any>(null);
    const { camera } = useThree();

    useLayoutEffect(() => {
        if (meshRef.current) {
            meshRef.current.geometry.computeBoundingSphere();
            if (meshRef.current.geometry.boundingSphere) {
                meshRef.current.geometry.boundingSphere.radius = radius * 1.5;
            }
        }
    }, [radius]);

    const localCenter = origin.clone()
        .add(right.clone().multiplyScalar(center.x * 2 - 1))
        .add(up.clone().multiplyScalar(center.y * 2 - 1));
    const sphereCenter = localCenter.clone().normalize().multiplyScalar(radius);
    const worldPos = planetPos.clone().add(sphereCenter).sub(floatingOffset.current);

    const [shouldSplit, setShouldSplit] = useState(false);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uTime = state.clock.getElapsedTime();
        }
        if (!meshRef.current) return;

        const dist = camera.position.distanceTo(worldPos);
        const threshold = radius * (4.0 / Math.pow(2, level));

        if (dist < threshold && level < MAX_DEPTH) {
            if (!shouldSplit) setShouldSplit(true);
        } else if (dist > threshold * 1.3) {
            if (shouldSplit) setShouldSplit(false);
        }
    });

    if (shouldSplit) {
        const nextSize = size / 2;
        const nextLevel = level + 1;
        return (
            <group>
                <PlanetChunk
                    origin={origin} right={right} up={up} level={nextLevel} radius={radius} size={nextSize} floatingOffset={floatingOffset} planetPos={planetPos} data={data}
                    center={new THREE.Vector2(center.x - nextSize / 2, center.y - nextSize / 2)}
                />
                <PlanetChunk
                    origin={origin} right={right} up={up} level={nextLevel} radius={radius} size={nextSize} floatingOffset={floatingOffset} planetPos={planetPos} data={data}
                    center={new THREE.Vector2(center.x + nextSize / 2, center.y - nextSize / 2)}
                />
                <PlanetChunk
                    origin={origin} right={right} up={up} level={nextLevel} radius={radius} size={nextSize} floatingOffset={floatingOffset} planetPos={planetPos} data={data}
                    center={new THREE.Vector2(center.x - nextSize / 2, center.y + nextSize / 2)}
                />
                <PlanetChunk
                    origin={origin} right={right} up={up} level={nextLevel} radius={radius} size={nextSize} floatingOffset={floatingOffset} planetPos={planetPos} data={data}
                    center={new THREE.Vector2(center.x + nextSize / 2, center.y + nextSize / 2)}
                />
            </group>
        );
    }

    return (
        <mesh ref={meshRef}>
            <planeGeometry args={[1, 1, 64, 64]} />
            <planetTerrainMaterial
                ref={materialRef}
                logarithmicDepthBuffer={true}
                side={THREE.DoubleSide}
                uRadius={radius}
                uDetail={level + 2}
                uColor1={new THREE.Color(data.color)}
                uColor2={new THREE.Color(data.color).multiplyScalar(0.4)}
                uTime={0}
                uOrigin={origin}
                uRight={right}
                uUp={up}
                uOffset={new THREE.Vector2(center.x - 0.5, center.y - 0.5)}
                uScale={size}
            />
        </mesh>
    );
};

const PlanetMesh = ({ data, floatingOffset, visualScale = 1.0 }: PlanetMeshProps) => {
    // Parent group in SpaceCanvas already positions this at data.position.clone().sub(floatingOffset.current)
    // So we render chunks at the origin (0,0,0) and let the parent handle world positioning

    const faces = useMemo(() => [
        { origin: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
        { origin: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(-1, 0, 0), up: new THREE.Vector3(0, 1, 0) },
        { origin: new THREE.Vector3(1, 0, 0), right: new THREE.Vector3(0, 0, -1), up: new THREE.Vector3(0, 1, 0) },
        { origin: new THREE.Vector3(-1, 0, 0), right: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0) },
        { origin: new THREE.Vector3(0, 1, 0), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, -1) },
        { origin: new THREE.Vector3(0, -1, 0), right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 0, 1) },
    ], []);

    // Use origin as planetPos since parent group handles world positioning
    const originPos = useMemo(() => new THREE.Vector3(0, 0, 0), []);

    return (
        <group userData={{ bodyId: data.id }}>
            {faces.map((face, i) => (
                <PlanetChunk
                    key={i}
                    origin={face.origin}
                    right={face.right}
                    up={face.up}
                    level={0}
                    radius={data.radius * visualScale}
                    center={new THREE.Vector2(0.5, 0.5)}
                    size={1.0}
                    floatingOffset={floatingOffset}
                    planetPos={originPos}
                    data={data}
                />
            ))}
        </group>
    );
};


export default PlanetMesh;