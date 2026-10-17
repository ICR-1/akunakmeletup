import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildLander } from '../../src/gen/lander';
import { buildRocket, launchLayout, mountLander, NOZZLE_LENGTH } from '../../src/gen/rocket';
import { createLaunchPad } from '../../src/gen/launchSite';
import { createClouds } from '../../src/gen/sky';
import { resolveAssembly } from '../../src/rules/catalog';
import { defaultMission } from '../../src/core/missionBuilder';
import { catalog } from '../rules/helpers';

describe('tata letak peluncuran: roket berdiri di atas tanah', () => {
  it.each(catalog.rockets)('$id: dasar roket tepat di tanah peluncuran, tidak tertanam', (rocket) => {
    const model = buildRocket(rocket);
    const a = resolveAssembly(defaultMission('moon'), catalog);
    mountLander(model, buildLander(a.modules, a.instruments));
    const { rootY, padY } = launchLayout(model);
    model.root.position.y = rootY;
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    // Dasar nosel menyentuh tanah (toleransi kecil), dan tidak ada bagian di bawahnya.
    expect(box.min.y).toBeGreaterThanOrEqual(padY - 0.05);
    expect(box.min.y).toBeLessThanOrEqual(padY + 0.2);
    // Pivot (puncak) berada di sekitar y = 0, jadi seluruh roket berada di bawahnya.
    expect(box.max.y).toBeGreaterThan(0);
  });
  it('tanah lama di y = 0 akan menanamkan seluruh roket (regresi yang diperbaiki)', () => {
    const model = buildRocket(catalog.rockets[0]);
    const { rootY } = launchLayout(model);
    model.root.position.y = rootY;
    model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model.root);
    expect(box.min.y).toBeLessThan(-10);
    expect(rootY).toBeLessThan(0);
  });
  it('padY berjarak tepat satu panjang nosel di bawah root', () => {
    const model = buildRocket(catalog.rockets[1]);
    const { rootY, padY } = launchLayout(model);
    expect(rootY - padY).toBeCloseTo(NOZZLE_LENGTH, 10);
  });
  it('landasan dan awan: landasan memuat menara di sisi -x; awan satu InstancedMesh di atas tanah', () => {
    const pad = createLaunchPad(1.5, 20);
    const box = new THREE.Box3().setFromObject(pad.group);
    expect(box.min.y).toBeLessThan(0);
    expect(box.max.y).toBeGreaterThan(15);
    const clouds = createClouds(3, 20);
    expect(clouds.count).toBe(20);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < clouds.count; i++) {
      clouds.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(p.y).toBeGreaterThanOrEqual(150);
      expect(p.y).toBeLessThanOrEqual(1800);
      expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(170);
    }
  });
});
