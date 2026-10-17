import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { LANDER_IN_FAIRING_SCALE, LAUNCH_SITE, LAUNCH_WORLD_SCALE, VISUAL } from '../../src/core/constants';
import { buildFacility, buildFacilityComplex, FACILITY_LAYOUT, FACILITY_SCALE, planFacilities, type FacilityKind } from '../../src/gen/facilities';
import { createLaunchPad } from '../../src/gen/launchSite';

const tris = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  return n;
};
const meshes = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; });
  return n;
};

describe('tata letak bangunan peluncuran', () => {
  it('deterministik, lima bangunan dengan jenis berbeda, dan berubah menurut seed', () => {
    const a = planFacilities(11), b = planFacilities(11);
    expect(a).toEqual(b);
    expect(a).toHaveLength(FACILITY_LAYOUT.count);
    expect(new Set(a.map((p) => p.kind))).toEqual(new Set<FacilityKind>(['hangar', 'control', 'tanks', 'service']));
    expect(planFacilities(12)).not.toEqual(a);
  });

  it('berada dalam jangkauan, saling berjarak, dan di dalam zona bebas pohon', () => {
    for (const seed of [1, 11, 42]) {
      const plans = planFacilities(seed);
      for (const p of plans) {
        const d = Math.hypot(p.x, p.z);
        expect(d).toBeGreaterThanOrEqual(FACILITY_LAYOUT.minRadiusM - 1e-9);
        expect(d).toBeLessThanOrEqual(FACILITY_LAYOUT.maxRadiusM + 1e-9);
        expect(d).toBeLessThan(LAUNCH_SITE.padClearM);
      }
      for (let i = 0; i < plans.length; i++) {
        for (let j = i + 1; j < plans.length; j++) expect(Math.hypot(plans[i].x - plans[j].x, plans[i].z - plans[j].z)).toBeGreaterThanOrEqual(FACILITY_LAYOUT.minSpacingM);
      }
    }
  });

  it('sisi depan (+z lokal) menghadap pusat landasan', () => {
    for (const p of planFacilities(11)) {
      const front = new THREE.Vector3(Math.sin(p.rot), 0, Math.cos(p.rot));
      const toPad = new THREE.Vector3(-p.x, 0, -p.z).normalize();
      expect(front.dot(toPad)).toBeGreaterThan(0.9);
    }
  });
});

describe('model bangunan', () => {
  const kinds: FacilityKind[] = ['hangar', 'control', 'tanks', 'service'];

  for (const kind of kinds) {
    it(`${kind}: tersusun dari banyak bagian (pintu, jendela, atap) tetapi hanya sedikit mesh dan segitiga wajar`, () => {
      const g = buildFacility(kind, 3);
      expect(g.name).toBe(`facility-${kind}`);
      expect(meshes(g)).toBeLessThanOrEqual(4);
      expect(tris(g)).toBeGreaterThan(400);
      expect(tris(g)).toBeLessThan(25_000);
      const box = new THREE.Box3().setFromObject(g);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
      expect(box.max.y).toBeGreaterThan(4);
      expect(box.max.y).toBeLessThan(20);
      expect(box.max.x - box.min.x).toBeLessThan(40);
      expect(box.max.z - box.min.z).toBeLessThan(40);
    });
  }

  it('hanggar punya pintu besar di sisi depan (+z): sinar dari depan mengenai permukaan paling depan pintu', () => {
    const g = buildFacility('hangar', 1);
    g.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(g);
    const front = new THREE.Raycaster(new THREE.Vector3(0, 3, 40), new THREE.Vector3(0, 0, -1));
    const back = new THREE.Raycaster(new THREE.Vector3(0, 3, -40), new THREE.Vector3(0, 0, 1));
    const f = front.intersectObject(g, true)[0], b = back.intersectObject(g, true)[0];
    expect(f).toBeDefined();
    expect(b).toBeDefined();
    // pintu/rusuk menonjol dari dinding depan: titik depan lebih menjorok keluar daripada dinding belakang
    expect(f.point.z + b.point.z).toBeGreaterThan(0.2);
    expect(box.max.z).toBeGreaterThan(8);
  });

  it('kompleks memuat lima bangunan berskala nyata (FACILITY_SCALE); landasan sendiri tidak memuat bangunan', () => {
    const complex = buildFacilityComplex(11);
    expect(complex.children).toHaveLength(FACILITY_LAYOUT.count);
    for (const c of complex.children) {
      expect(c.name.startsWith('facility-')).toBe(true);
      expect(c.scale.x).toBeCloseTo(FACILITY_SCALE, 6);
    }
    const hangar = complex.children.find((c) => c.name === 'facility-hangar') as THREE.Group;
    const size = new THREE.Box3().setFromObject(hangar).getSize(new THREE.Vector3());
    expect(size.y).toBeGreaterThan(10);
    expect(size.y).toBeLessThan(24);
    const pad = createLaunchPad(1.2, 20);
    expect(pad.group.children.some((c) => c.name.startsWith('facility-'))).toBe(false);
    pad.dispose();
  });

  it('roket jauh lebih besar daripada bangunan: Pandu-1 (satuan roket) setara sekitar 80 m dan muat lander berskala dunia', () => {
    const realRocketHeightM = 19 / LAUNCH_WORLD_SCALE;
    expect(realRocketHeightM).toBeGreaterThan(70);
    expect(realRocketHeightM).toBeLessThan(95);
    // lander di fairing (satuan roket x skala fairing) sama dengan lander dunia setelah dikonversi ke meter
    expect(LANDER_IN_FAIRING_SCALE / LAUNCH_WORLD_SCALE).toBeCloseTo(VISUAL.landerWorldScale, 6);
    const hangarTop = new THREE.Box3().setFromObject(buildFacility('hangar', 1)).max.y * FACILITY_SCALE;
    expect(hangarTop).toBeLessThan(realRocketHeightM * 0.3);
  });
});
