import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AstronautRig, type AstronautMotion } from '../../src/gen/astronaut';

const STILL: AstronautMotion = { speed01: 0, run: false, airborne: false, oxygen01: 1 };

function settle(rig: AstronautRig, m: AstronautMotion, steps = 120): void {
  for (let i = 0; i < steps; i++) rig.update(1 / 60, m);
}

/** Posisi dunia terendah seluruh mesh rig (telapak kaki). */
function lowestY(rig: AstronautRig): number {
  rig.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(rig.root);
  return box.min.y;
}

describe('animasi lompat astronot', () => {
  it('jongkok menurunkan badan tetapi telapak tetap menapak tanah', () => {
    const rig = new AstronautRig();
    settle(rig, STILL);
    const standTop = new THREE.Box3().setFromObject(rig.root).max.y;
    const standFoot = lowestY(rig);
    settle(rig, { ...STILL, crouch: 1 });
    const crouchTop = new THREE.Box3().setFromObject(rig.root).max.y;
    expect(crouchTop).toBeLessThan(standTop - 0.15);
    expect(Math.abs(lowestY(rig) - standFoot)).toBeLessThan(0.08);
  });

  it('saat naik lutut menekuk, saat turun anggota badan terentang', () => {
    const rig = new AstronautRig();
    settle(rig, { ...STILL, airborne: true, velY: 1.5 });
    const rising = new THREE.Box3().setFromObject(rig.root).min.y;
    settle(rig, { ...STILL, airborne: true, velY: -1.5 });
    const falling = new THREE.Box3().setFromObject(rig.root).min.y;
    expect(rising).toBeGreaterThan(falling);
  });

  it('kembali ke pose berdiri setelah mendarat', () => {
    const rig = new AstronautRig();
    settle(rig, STILL);
    const stand = lowestY(rig);
    settle(rig, { ...STILL, airborne: true, velY: 1 });
    settle(rig, { ...STILL, crouch: 0.8 });
    settle(rig, STILL, 240);
    expect(Math.abs(lowestY(rig) - stand)).toBeLessThan(0.02);
  });

  it('lengan terentang ke samping saat melayang, tidak masuk ke badan', () => {
    const rig = new AstronautRig();
    settle(rig, STILL);
    const standWidth = (() => { const b = new THREE.Box3().setFromObject(rig.root); return b.max.x - b.min.x; })();
    settle(rig, { ...STILL, airborne: true, velY: -1 });
    const b = new THREE.Box3().setFromObject(rig.root);
    expect(b.max.x - b.min.x).toBeGreaterThan(standWidth + 0.2);
  });

  it('antena di atas ransel (di belakang punggung), bukan menempel di helm', () => {
    const rig = new AstronautRig();
    settle(rig, STILL);
    const tip = rig.antennaTip();
    // Helm: pusat sekitar y = 0,8 + 0,97 dengan radius ~0,32; antena harus di belakang dan di luar bola helm.
    const helmet = new THREE.Vector3(0, 0.8 + 0.97, 0);
    expect(tip.z).toBeLessThan(-0.25);
    expect(tip.distanceTo(helmet)).toBeGreaterThan(0.34);
    // Dasar antena setinggi puncak ransel (bukan di kepala); ujungnya boleh menjulang sedikit di atas helm.
    expect(tip.y).toBeGreaterThan(0.8 + 0.6);
    expect(tip.y).toBeLessThan(0.8 + 0.97 + 0.45);
    // Berjalan menggoyangkan antena sedikit tanpa memindahkannya jauh.
    const still = tip.clone();
    for (let i = 0; i < 40; i++) rig.update(1 / 60, { speed01: 1, run: true, airborne: false, oxygen01: 1 });
    expect(rig.antennaTip().distanceTo(still)).toBeLessThan(0.5);
  });
});
