import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createSandboxBody } from './bodyFactory';
import { captureSimulationSnapshot } from './simulationSnapshot';
import { useStore } from './store';

const planet = () => createSandboxBody({
  id: 'earth',
  name: 'Earth',
  type: 'Planet',
  mass: 1,
  position: new THREE.Vector3(40, 0, 0),
  velocity: new THREE.Vector3(0, 0, 1),
});

afterEach(() => {
  useStore.setState({
    worldReadOnly: false,
    paused: false,
    speed: 1,
    bodies: [],
    historyVersion: 0,
  });
});

describe('read-only world mutation guards', () => {
  it('keeps the viewer paused and ignores speed, body, and snapshot writes', () => {
    useStore.getState().installBodies([planet()]);
    const mass = useStore.getState().bodies[0].mass;
    const snapshot = captureSimulationSnapshot(useStore.getState().bodies);
    useStore.setState({ worldReadOnly: true, paused: true, speed: 1 });
    const historyVersion = useStore.getState().historyVersion;

    useStore.getState().setPaused(false);
    expect(useStore.getState().paused).toBe(true);

    useStore.getState().setSpeed(2);
    expect(useStore.getState().speed).toBe(1);

    useStore.getState().updateBody('earth', { mass: mass * 2 });
    expect(useStore.getState().bodies[0].mass).toBe(mass);

    useStore.getState().restoreSimulation(snapshot);
    expect(useStore.getState().bodies[0].mass).toBe(mass);
    expect(useStore.getState().historyVersion).toBe(historyVersion);
  });
});
