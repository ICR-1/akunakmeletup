import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { VISUAL } from '../../src/core/constants';
import { CRUISER, CruiserRig } from '../../src/gen/cruiser';
import { setDetail } from '../../src/gen/detail';
import { buildLander } from '../../src/gen/lander';
import { resolveAssembly } from '../../src/rules/catalog';
import { defaultMission } from '../../src/core/missionBuilder';
import { catalog } from '../rules/helpers';

const tris = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  return n;
};

describe('Lunar Cruiser (model 3D)', () => {
  afterAll(() => setDetail('high'));

  it('bounding box sesuai dimensi, depan +z, roda menapak tanah', () => {
    setDetail('high');
    const rig = new CruiserRig();
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.root);
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(box.min.y).toBeLessThan(0.05);
    expect(box.max.z - box.min.z).toBeGreaterThan(CRUISER.length * 0.9);
    expect(box.max.z - box.min.z).toBeLessThan(CRUISER.length * 1.3);
    expect(box.max.x - box.min.x).toBeLessThan(CRUISER.width * 1.3);
    rig.dispose();
  });
  it('draw call terkendali dan segitiga di bawah anggaran (kedua tingkat detail)', () => {
    for (const level of ['low', 'high'] as const) {
      setDetail(level);
      const rig = new CruiserRig();
      let meshes = 0;
      rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
      expect(meshes).toBeLessThanOrEqual(20);
      expect(tris(rig.root)).toBeLessThan(30_000);
      rig.dispose();
    }
  });
  it('detail tinggi memiliki jauh lebih banyak segitiga daripada rendah', () => {
    setDetail('low');
    const low = tris(new CruiserRig().root);
    setDetail('high');
    const high = tris(new CruiserRig().root);
    expect(high).toBeGreaterThan(low * 2);
  });
  it('roda berputar sesuai kecepatan dan roda depan membelok sesuai setir', () => {
    const rig = new CruiserRig();
    const wheels: THREE.Object3D[] = [];
    rig.root.children.forEach((c) => { if (c.children.length === 1 && c.children[0].type === 'Group') wheels.push(c.children[0]); });
    expect(wheels.length).toBe(6);
    const before = wheels.map((w) => w.rotation.x);
    rig.update(0.5, { speedMs: 10, steer: 1 });
    wheels.forEach((w, i) => expect(w.rotation.x - before[i]).toBeCloseTo((10 / CRUISER.wheelRadius) * 0.5, 5));
    const steered = rig.root.children.filter((c) => Math.abs(c.rotation.y) > 0.01);
    expect(steered.length).toBe(2);
    // Setir kanan: roda depan menoleh ke kanan pengemudi (rotasi y negatif, karena +x ada di kiri).
    expect(steered[0].rotation.y).toBeLessThan(0);
    rig.update(0.5, { speedMs: -10, steer: 0 });
    wheels.forEach((w, i) => expect(w.rotation.x).toBeLessThan(before[i] + (10 / CRUISER.wheelRadius) * 0.5));
  });
  it('lander membawa Cruiser hanya jika modulnya terpasang dan carryRover aktif', () => {
    const base = defaultMission('moon');
    const a = resolveAssembly({ ...base, moduleIds: [...base.moduleIds, 'rover_lc'] }, catalog);
    const plain = resolveAssembly(base, catalog);
    expect(buildLander(a.modules, a.instruments).userData.carriesRover).toBe(true);
    expect(buildLander(a.modules, a.instruments, false).userData.carriesRover).toBeUndefined();
    expect(buildLander(plain.modules, plain.instruments).userData.carriesRover).toBeUndefined();
  });
});

describe('pelat dek lander (anti z-fighting)', () => {
  it('pelat dek lebih lebar dan lebih tinggi daripada tutup badan agar tidak sebidang', () => {
    for (const level of ['low', 'high'] as const) {
      setDetail(level);
      const a = resolveAssembly(defaultMission('moon'), catalog);
      const lander = buildLander(a.modules, a.instruments, false);
      const body = lander.getObjectByName('lander-body') as THREE.Mesh;
      const pos = body.geometry.getAttribute('position');
      const bodyTop = 0.9 + 1.1; // LEG_HEIGHT + tinggi lander_s
      let plateR = 0;
      let capR = 0;
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i);
        const r = Math.hypot(pos.getX(i), pos.getZ(i));
        if (r > 1.1) continue;
        if (Math.abs(y - (bodyTop + 0.06)) < 1e-3) plateR = Math.max(plateR, r);
        if (Math.abs(y - bodyTop) < 0.03) capR = Math.max(capR, r < 0.97 ? r : 0);
      }
      expect(plateR).toBeGreaterThanOrEqual(0.9 + 0.055);
      expect(plateR).toBeGreaterThan(capR);
    }
  });
});

describe('skala lander terhadap astronot dan Lunar Cruiser', () => {
  const base = defaultMission('moon');
  const plain = resolveAssembly(base, catalog);
  const withCruiser = resolveAssembly({ ...base, moduleIds: [...base.moduleIds, 'rover_lc'] }, catalog);

  it('lander berukuran wajar terhadap astronot 2 m: tinggi dek ~5 m dan telapak ~9 m pada skala dunia', () => {
    const lander = buildLander(plain.modules, plain.instruments, false);
    const S = VISUAL.landerWorldScale;
    const deckHeightM = (lander.userData.deckHeight as number) * S;
    expect(deckHeightM).toBeGreaterThan(4);
    expect(deckHeightM).toBeLessThan(8);
    expect((lander.userData.footRadius as number) * S * 2).toBeGreaterThan(7);
    // astronot (2 m) jelas lebih pendek dari dek tetapi cukup besar untuk masuk lewat pintu bulat
    const astroHeight = 2;
    expect(deckHeightM).toBeGreaterThan(astroHeight * 2);
  });
  it('Cruiser yang dibawa tetap 5,2 m pada skala dunia (skala bawaan = 1 / skala dunia lander)', () => {
    expect(CRUISER.carriedScale * VISUAL.landerWorldScale).toBeCloseTo(1, 10);
    expect(CRUISER.length * CRUISER.carriedScale * VISUAL.landerWorldScale).toBeCloseTo(CRUISER.length, 10);
  });
  it('jangkauan lander mencakup tangga kru dan Cruiser sehingga muat di fairing; Cruiser menambah jangkauan', () => {
    const noRover = buildLander(plain.modules, plain.instruments);
    const rover = buildLander(withCruiser.modules, withCruiser.instruments);
    expect(noRover.userData.reach).toBeGreaterThanOrEqual(noRover.userData.footRadius as number);
    expect(rover.userData.reach).toBeGreaterThan(noRover.userData.reach as number);
  });
  it('lander punya pintu, serambi, dan tangga di sisi +z yang menjangkau tanah', () => {
    const lander = buildLander(plain.modules, plain.instruments, false);
    const body = lander.getObjectByName('lander-body') as THREE.Mesh;
    const pos = body.geometry.getAttribute('position');
    // Tangga: rel di tengah sisi +z (|x| < 0,45) yang turun dari serambi (y > 1) sampai hampir menyentuh tanah
    let minY = Infinity, maxYNear = -Infinity, maxZLadder = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i)) > 0.45 || pos.getZ(i) < 1.3) continue;
      minY = Math.min(minY, pos.getY(i));
      maxYNear = Math.max(maxYNear, pos.getY(i));
      maxZLadder = Math.max(maxZLadder, pos.getZ(i));
    }
    expect(minY).toBeLessThan(0.3);
    expect(maxYNear).toBeGreaterThan(1);
    expect(maxZLadder).toBeGreaterThan(2);
    const minYAtMaxZ = minY;
    expect(minYAtMaxZ).toBeLessThan(0.3);
  });
});

describe('antena Cruiser dan tangga lander', () => {
  it('tiang antena berdiri di atas atap: ada tiang di tinggi 2,9 m dan atap tepat di bawahnya', () => {
    setDetail('high');
    const rig = new CruiserRig();
    rig.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const hitX = (fromX: number, dir: number, y: number, z: number): number | null => {
      ray.set(new THREE.Vector3(fromX, y, z), new THREE.Vector3(dir, 0, 0));
      const h = ray.intersectObject(rig.root, true)[0];
      return h ? h.point.x : null;
    };
    // tiang kamera/antena kiri di x = -0,85 dan piringan di x = 0,7 (keduanya z = -0,45)
    const left = hitX(-3, 1, 2.9, -0.45);
    expect(left).not.toBeNull();
    expect(left!).toBeGreaterThan(-0.95);
    expect(left!).toBeLessThan(-0.75);
    const right = hitX(3, -1, 2.9, -0.45);
    expect(right).not.toBeNull();
    expect(right!).toBeGreaterThan(0.6);
    expect(right!).toBeLessThan(0.85);
    // atap tepat di bawah dasar tiang
    for (const x of [-0.85, 0.7]) {
      ray.set(new THREE.Vector3(x + 0.12, 2.8, -0.45), new THREE.Vector3(0, -1, 0));
      const roof = ray.intersectObject(rig.root, true)[0];
      expect(roof).toBeDefined();
      expect(roof.point.y).toBeGreaterThan(2.45);
      expect(roof.point.y).toBeLessThan(2.6);
    }
  });

  it('lander membuka spesifikasi tangga untuk penghalang tabrakan', () => {
    const asm = resolveAssembly(defaultMission('moon'), catalog);
    const lander = buildLander(asm.modules, asm.instruments, false);
    const ladder = lander.userData.ladder as { zTop: number; zBottom: number; yTop: number; yBottom: number; halfWidth: number };
    expect(ladder.zBottom).toBeGreaterThan(ladder.zTop);
    expect(ladder.yTop).toBeGreaterThan(ladder.yBottom);
    expect(ladder.halfWidth).toBeGreaterThan(0.3);
  });
});

describe('kap mesin Lunar Cruiser', () => {
  it('melandai turun ke depan, duduk di atas bak tanpa celah, dan menyatu dengan dinding kabin', () => {
    for (const level of ['high', 'low'] as const) {
      setDetail(level);
      const rig = new CruiserRig();
      rig.root.updateMatrixWorld(true);
      const down = (x: number, z: number): number => {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 4, z), new THREE.Vector3(0, -1, 0));
        return ray.intersectObject(rig.root, true)[0].point.y;
      };
      const ys = [2.05, 2.2, 2.35, 2.45].map((z) => down(0, z));
      for (let i = 1; i < ys.length; i++) expect(ys[i], level).toBeLessThan(ys[i - 1]);
      // permukaan atas kap berada di atas puncak bak (1,43) dan tidak lebih tinggi dari dinding kabin
      for (const y of ys) {
        expect(y, level).toBeGreaterThan(1.5);
        expect(y, level).toBeLessThan(1.85);
      }
      // sisi kap: dari samping tidak ada celah antara bak dan kap (sinar horizontal menembus dari kiri mengenai badan pada y 1,5)
      const side = new THREE.Raycaster(new THREE.Vector3(-3, 1.5, 2.2), new THREE.Vector3(1, 0, 0));
      const hit = side.intersectObject(rig.root, true)[0];
      expect(hit, level).toBeDefined();
      expect(Math.abs(hit.point.x), level).toBeLessThan(1.5);
      // ujung depan kap tidak melewati bumper depan
      const front = new THREE.Raycaster(new THREE.Vector3(0, 1.5, 6), new THREE.Vector3(0, 0, -1));
      const f = front.intersectObject(rig.root, true)[0];
      expect(f.point.z, level).toBeLessThan(2.65);
      expect(f.point.z, level).toBeGreaterThan(2.4);
    }
    setDetail('high');
  });
});
