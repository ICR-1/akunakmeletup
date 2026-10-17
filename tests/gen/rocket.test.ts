import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLander } from '../../src/gen/lander';
import { buildRocket, mountLander } from '../../src/gen/rocket';
import { resolveAssembly } from '../../src/rules/catalog';
import { defaultMission } from '../../src/core/missionBuilder';
import { catalog } from '../rules/helpers';

describe('generator roket modular', () => {
  it.each(catalog.rockets)('$id: satu THREE.Group per tahap', (rocket) => {
    const m = buildRocket(rocket);
    expect(m.stageGroups).toHaveLength(rocket.stages.length);
    m.stageGroups.forEach((g, i) => {
      expect(g.parent).toBe(m.root);
      expect(g.name).toBe(`stage-${i}`);
    });
    expect(m.fairingLeft.parent).toBe(m.root);
    expect(m.fairingRight.parent).toBe(m.root);
    expect(m.landerSlot.parent).toBe(m.root);
    expect(m.totalHeight).toBeGreaterThan(0);
  });
  it('lebih banyak tahap memberi roket lebih tinggi (Garuda lebih besar dari Pandu)', () => {
    const [pandu, , garuda] = catalog.rockets.map(buildRocket);
    expect(garuda.radius).toBeGreaterThan(pandu.radius);
    expect(garuda.stageGroups.length).toBeGreaterThan(pandu.stageGroups.length);
  });
  it('cincin batas ikut terlepas bersama tahapnya (tidak tertinggal melayang di root)', () => {
    for (const rocket of catalog.rockets) {
      const m = buildRocket(rocket);
      for (const ring of m.boundaryRings) expect(m.stageGroups).toContain(ring.parent);
      // Lepas semua tahap kecuali yang terakhir: tidak boleh tersisa cincin milik tahap yang sudah lepas.
      m.stageGroups.slice(0, -1).forEach((g) => m.root.remove(g));
      const left: string[] = [];
      m.root.traverse((o) => { if (o.name.startsWith('boundary-')) left.push(o.name); });
      expect(left.every((name) => name === `boundary-${m.stageGroups.length - 1}`)).toBe(true);
    }
  });
  it('modul transfer (tahap terakhir) tinggi dan kokoh, tidak terlihat sisa setelah tahap bawah lepas', () => {
    for (const rocket of catalog.rockets) {
      const m = buildRocket(rocket);
      const last = m.stageGroups.length - 1;
      const height = m.stageTopY[last] - (last > 0 ? m.stageTopY[last - 1] : 0);
      expect(height).toBeGreaterThanOrEqual(5);
      const box = new THREE.Box3().setFromObject(m.stageGroups[last]);
      // Lebih lebar daripada badan polos (pod RCS dan rangka) dan memiliki banyak bagian berstruktur.
      expect(box.max.x - box.min.x).toBeGreaterThan(m.radius * 2);
      let meshes = 0;
      m.stageGroups[last].traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
      expect(meshes).toBeGreaterThan(20);
    }
  });
  it('melepas grup tahap memendekkan tumpukan yang tersisa', () => {
    const m = buildRocket(catalog.rockets[1]);
    const before = m.root.children.length;
    m.root.remove(m.stageGroups[0]);
    expect(m.root.children.length).toBe(before - 1);
  });
});

describe('generator lander', () => {
  it('instrumen dan modul terpasang sebagai objek yang terlihat', () => {
    const a = resolveAssembly(defaultMission('moon'), catalog);
    const l = buildLander(a.modules, a.instruments);
    const ids: string[] = [];
    l.traverse((o) => { if (o.userData.instrumentId) ids.push(o.userData.instrumentId as string); });
    expect(ids.sort()).toEqual(['cam_pano', 'sample_drill']);
    expect(l.userData.footRadius).toBeGreaterThan(0);
  });
  it('lebih banyak modul menghasilkan lebih banyak geometri', () => {
    const base = resolveAssembly(defaultMission('moon'), catalog);
    const more = resolveAssembly({ ...defaultMission('moon'), moduleIds: [...defaultMission('moon').moduleIds, 'solar_s', 'rtg'] }, catalog);
    const count = (g: ReturnType<typeof buildLander>) => { let n = 0; g.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) n += m.geometry.getAttribute('position').count; }); return n; };
    expect(count(buildLander(more.modules, more.instruments))).toBeGreaterThan(count(buildLander(base.modules, base.instruments)));
  });
  it('badan lander digabung: sedikit draw call walau modul dan instrumen penuh', () => {
    const full = resolveAssembly({ ...defaultMission('mars'), moduleIds: ['lander_m', 'tank_s', 'tank_l', 'eng_eff', 'solar_m', 'solar_m', 'solar_m', 'battery_m', 'battery_m', 'rtg', 'ant_hga', 'relay_link'], instrumentIds: ['cam_pano', 'weather_station', 'seismometer', 'spectrometer', 'sample_drill', 'ice_radar'] }, catalog);
    const l = buildLander(full.modules, full.instruments);
    let meshes = 0;
    l.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
    expect(meshes).toBeLessThan(45);
  });
  it('lander dapat dipasang pada slot roket dan diskalakan muat di fairing', () => {
    const rocket = buildRocket(catalog.rockets[0]);
    const a = resolveAssembly(defaultMission('moon'), catalog);
    const lander = buildLander(a.modules, a.instruments);
    mountLander(rocket, lander);
    expect(lander.parent).toBe(rocket.landerSlot);
    expect(lander.scale.x).toBeLessThanOrEqual(0.6);
  });
});
