import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VISUAL } from '../../src/core/constants';
import { AstronautRig } from '../../src/gen/astronaut';
import { CruiserRig } from '../../src/gen/cruiser';
import { buildDish, dishFocus } from '../../src/gen/dish';
import { stepBallistic } from '../../src/gen/explosion';

const COLORS = { dish: 0xe8ecf2, strut: 0x8a93a3, hub: 0x5a6070, feed: 0xff8a3c };

const countLights = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    if ((o as THREE.Light).isLight) n++;
  });
  return n;
};

describe('parabola antena bersama', () => {
  it('fokus mengikuti r^2 / (4 d)', () => {
    expect(dishFocus(1, 0.25)).toBeCloseTo(1, 6);
    expect(dishFocus(0.6, 0.22)).toBeCloseTo(0.36 / 0.88, 6);
  });

  it('cekung: mangkuk, penyangga, dan feed horn tersusun dalam radius piringan', () => {
    const dish = buildDish(0.6, 0.22, COLORS);
    dish.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(dish);
    const w = box.max.x - box.min.x;
    expect(w).toBeGreaterThan(1.1);
    expect(w).toBeLessThan(1.4);
    let meshes = 0;
    dish.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
    expect(meshes).toBeGreaterThanOrEqual(5);
  });
});

describe('senter astronot dan lampu depan Cruiser', () => {
  it('tanpa lampu bila tidak diminta (hemat shader) dan model tetap sama besar', () => {
    const a = new AstronautRig();
    expect(a.flashlight).toBeNull();
    expect(countLights(a.root)).toBe(0);
    a.setFlashlight(1);
    a.dispose();
    const c = new CruiserRig();
    expect(countLights(c.root)).toBe(0);
    c.setHeadlights(1);
    c.dispose();
  });

  it('senter menyala mengikuti level dan mati saat siang', () => {
    const a = new AstronautRig(true);
    expect(a.flashlight).not.toBeNull();
    a.setFlashlight(0);
    expect(a.flashlight!.intensity).toBe(0);
    a.setFlashlight(1);
    expect(a.flashlight!.intensity).toBeCloseTo(VISUAL.flashlight.intensity, 6);
    a.setFlashlight(5);
    expect(a.flashlight!.intensity).toBeCloseTo(VISUAL.flashlight.intensity, 6);
    a.dispose();
  });

  it('lampu depan Cruiser: dua SpotLight yang naik-turun dengan level', () => {
    const c = new CruiserRig(true);
    const spots: THREE.SpotLight[] = [];
    c.root.traverse((o) => { if ((o as THREE.SpotLight).isSpotLight) spots.push(o as THREE.SpotLight); });
    expect(spots).toHaveLength(2);
    c.setHeadlights(0);
    expect(spots.every((s) => s.intensity === 0)).toBe(true);
    c.setHeadlights(1);
    expect(spots.every((s) => s.intensity > 0)).toBe(true);
    c.dispose();
  });
});

describe('ledakan roket', () => {
  it('serpihan jatuh lalu diam di tanah', () => {
    const pos = new THREE.Vector3(0, 5, 0);
    const vel = new THREE.Vector3(3, 6, 1);
    let landed = false;
    for (let i = 0; i < 60 * 30 && !landed; i++) landed = stepBallistic(pos, vel, 9.8, 0, 1 / 60).landed;
    expect(landed).toBe(true);
    expect(pos.y).toBeGreaterThanOrEqual(-1e-6);
    expect(vel.length()).toBe(0);

  });
});
