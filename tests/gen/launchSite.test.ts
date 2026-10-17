import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LAUNCH_SITE } from '../../src/core/constants';
import { armAngles, createLaunchPad, islandHeight, planForest } from '../../src/gen/launchSite';

const L = LAUNCH_SITE;

describe('tinggi pulau', () => {
  it('datar di sekitar landasan, tidak ada bukit di area bebas', () => {
    for (const r of [0, 20, 60, L.padClearM]) expect(islandHeight(r, 1)).toBeCloseTo(islandHeight(r, -1), 10);
    expect(islandHeight(10, 1)).toBeLessThan(0.1);
  });
  it('landai ke pantai: tepat di garis air sama dengan tinggi air, lalu menurun ke dasar laut', () => {
    expect(islandHeight(L.waterlineM, 0)).toBeCloseTo(L.waterY, 1);
    expect(islandHeight(L.grassEndM - 1, 0)).toBeGreaterThan(L.waterY);
    expect(islandHeight(L.islandRadiusM, 0)).toBeCloseTo(L.seaFloorY, 5);
    let prev = islandHeight(L.grassEndM, 0);
    for (let r = L.grassEndM; r <= L.islandRadiusM; r += 4) {
      const h = islandHeight(r, 0);
      expect(h).toBeLessThanOrEqual(prev + 1e-9);
      prev = h;
    }
  });
  it('tinggi bukit dibatasi amplitudo', () => {
    for (let r = L.padClearM; r < L.grassEndM; r += 7) expect(Math.abs(islandHeight(r, 1) - islandHeight(r, 0))).toBeLessThanOrEqual(L.hillAmplitudeM + 1e-9);
  });
});

describe('tata pohon alami', () => {
  const plans = planForest(2061);
  it('deterministik dari seed dan jumlah sesuai konfigurasi (hampir penuh)', () => {
    expect(planForest(2061)).toEqual(plans);
    expect(planForest(7)).not.toEqual(plans);
    for (const kind of ['broadleaf', 'pine', 'palm', 'bush'] as const) {
      const n = plans.filter((p) => p.kind === kind).length;
      expect(n, kind).toBeGreaterThan(L.counts[kind] * 0.6);
      expect(n, kind).toBeLessThanOrEqual(L.counts[kind]);
    }
  });
  it('tidak ada pohon di area landasan dan semuanya di darat (di atas garis air)', () => {
    for (const p of plans) {
      const r = Math.hypot(p.x, p.z);
      expect(r, p.kind).toBeGreaterThanOrEqual(L.padClearM - 0.001);
      expect(r, p.kind).toBeLessThan(L.waterlineM);
    }
  });
  it('kelapa tumbuh di tepi pantai (zona pasir), pohon lebar dan pinus di padang rumput', () => {
    for (const p of plans) {
      const r = Math.hypot(p.x, p.z);
      if (p.kind === 'palm') expect(r).toBeGreaterThanOrEqual(L.grassEndM);
      if (p.kind === 'broadleaf' || p.kind === 'pine') expect(r).toBeLessThan(L.grassEndM);
    }
    expect(plans.filter((p) => p.kind === 'palm').every((p) => p.tilt > 0)).toBe(true);
  });
  it('pohon tidak saling menumpuk (jarak minimal)', () => {
    for (let i = 0; i < plans.length; i++) for (let j = i + 1; j < plans.length; j++) {
      expect(Math.hypot(plans[i].x - plans[j].x, plans[i].z - plans[j].z)).toBeGreaterThan(L.minTreeSpacingM * 0.4);
    }
  });
  it('skala dan rotasi wajar', () => {
    for (const p of plans) {
      expect(p.scale).toBeGreaterThanOrEqual(0.8);
      expect(p.scale).toBeLessThanOrEqual(1.4);
    }
  });
});

describe('lengan umbilikal', () => {
  it('terpasang sebelum dilepas, lalu berayun menjauh dan terkulai sampai batas', () => {
    expect(armAngles(-1)).toEqual({ swing: 0, droop: 0 });
    expect(armAngles(0)).toEqual({ swing: 0, droop: 0 });
    const mid = armAngles(L.armSwingSec * 0.5);
    expect(mid.swing).toBeGreaterThan(0);
    expect(mid.swing).toBeLessThan(L.armSwingMaxRad);
    const end = armAngles(L.armSwingSec * 3);
    expect(end.swing).toBeCloseTo(L.armSwingMaxRad, 10);
    expect(end.droop).toBeCloseTo(L.armDroopRad, 1);
  });
  it('ayunan monoton naik dan tidak melewati batas', () => {
    let prev = 0;
    for (let t = 0; t <= L.armSwingSec * 2; t += 0.02) {
      const { swing } = armAngles(t);
      expect(swing).toBeGreaterThanOrEqual(prev - 1e-12);
      expect(swing).toBeLessThanOrEqual(L.armSwingMaxRad + 1e-9);
      prev = swing;
    }
  });
  it('landasan punya beberapa lengan yang menjangkau badan roket dan baru bergerak setelah release()', () => {
    const pad = createLaunchPad(1.2, 20);
    const hinges = pad.group.children.filter((c) => c.type === 'Group' && !c.name.startsWith('facility-'));
    expect(hinges).toHaveLength(L.armCount);
    const tip = (g: THREE.Object3D): number => new THREE.Box3().setFromObject(g).max.x;
    // Ujung lengan mencapai badan roket (x sekitar -radius) sebelum dilepas
    expect(tip(hinges[0])).toBeGreaterThan(-1.2 * 1.05);
    pad.update(1);
    expect(hinges[0].rotation.y).toBe(0);
    expect(pad.released).toBe(false);
    pad.release();
    expect(pad.released).toBe(true);
    for (let i = 0; i < 120; i++) pad.update(1 / 60);
    expect(Math.abs(hinges[0].rotation.y)).toBeGreaterThan(1);
    expect(Math.sign(hinges[0].rotation.y)).toBe(-Math.sign(hinges[1].rotation.y));
    // Setelah berayun, ujung lengan tidak lagi menyentuh area badan roket
    expect(tip(hinges[0])).toBeLessThan(-1.2 * 1.05 - 0.2);
  });
  it('lengan swing bergantian ke dua sisi dan berurutan (stagger)', () => {
    const pad = createLaunchPad(1.2, 20);
    const hinges = pad.group.children.filter((c) => c.type === 'Group' && !c.name.startsWith('facility-'));
    pad.release();
    pad.update(L.armSwingSec * 0.6);
    expect(Math.abs(hinges[0].rotation.y)).toBeGreaterThan(Math.abs(hinges[hinges.length - 1].rotation.y));
  });
});
