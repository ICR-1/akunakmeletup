import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildBeaconProbe, dustToHeight } from '../../src/gen/props';
import { buildLander } from '../../src/gen/lander';
import { resolveAssembly } from '../../src/rules/catalog';
import { defaultMission } from '../../src/core/missionBuilder';
import { catalog } from '../rules/helpers';

describe('Probe Beacon', () => {
  const probe = buildBeaconProbe();
  probe.group.updateMatrixWorld(true);

  it('tinggi sekitar 5,6 m dan simetris di sumbu tengah (bukan kaki acak)', () => {
    const box = new THREE.Box3().setFromObject(probe.group);
    expect(box.max.y).toBeGreaterThan(5.4);
    expect(box.max.y).toBeLessThan(6.3);
    expect(box.min.y).toBeGreaterThan(-0.05);
    // Tiga kaki tripod: tapak (silinder pendek) tersebar rata pada jarak sama dari sumbu
    const pads: THREE.Mesh[] = [];
    probe.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry.type === 'CylinderGeometry' && m.position.y < 0.2 && Math.hypot(m.position.x, m.position.z) > 1) pads.push(m);
    });
    expect(pads.length).toBe(3);
    const radii = pads.map((p) => Math.hypot(p.position.x, p.position.z));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-6);
  });
  it('parabola adalah bentuk lathe cekung dengan feed horn di fokus dan tidak bersilangan dengan antena tegak', () => {
    let dish: THREE.Mesh | null = null;
    probe.group.traverse((o) => { if ((o as THREE.Mesh).geometry?.type === 'LatheGeometry') dish = o as THREE.Mesh; });
    expect(dish).not.toBeNull();
    const d = dish as unknown as THREE.Mesh;
    const dishBox = new THREE.Box3().setFromObject(d);
    expect(dishBox.max.x - dishBox.min.x).toBeGreaterThan(1.1);
    // Lampu penanda berada di puncak antena tegak: harus di luar cakupan bidang-xz parabola
    const light = probe.group.children.find((c) => (c as THREE.Mesh).geometry?.type === 'SphereGeometry' && c.position.y > 5.5);
    expect(light).toBeDefined();
    const lx = light!.position.x, lz = light!.position.z;
    const inside = lx > dishBox.min.x && lx < dishBox.max.x && lz > dishBox.min.z && lz < dishBox.max.z;
    expect(inside).toBe(false);
  });
  it('berdebu di bagian bawah: warna vertex dekat tanah bergeser ke warna debu dibanding bagian atas', () => {
    const g = new THREE.BoxGeometry(1, 4, 1);
    const colors = new Float32Array(g.getAttribute('position').count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(g);
    const group = new THREE.Group();
    group.add(mesh);
    mesh.position.y = 2;
    dustToHeight(group, 4, new THREE.Color(0, 0, 0), 1);
    const pos = g.getAttribute('position'), col = g.getAttribute('color');
    for (let i = 0; i < pos.count; i++) {
      const worldY = pos.getY(i) + 2;
      expect(col.getX(i)).toBeCloseTo(Math.max(0, worldY / 4), 5);
    }
  });
});

describe('ruang masuk lander (airlock)', () => {
  it('tabung ruang masuk menonjol keluar dinding badan di tinggi pintu sehingga dinding tidak menutup pintu', () => {
    const a = resolveAssembly(defaultMission('moon'), catalog);
    const lander = buildLander(a.modules, a.instruments, false);
    const body = lander.getObjectByName('lander-body') as THREE.Mesh;
    const pos = body.geometry.getAttribute('position');
    const hatchY = 0.9 + 0.55;
    let maxZ = -Infinity;
    const wallR = 1.0 * (1 - 0.1 * (0.55 / 1.1));
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getX(i)) < 0.15 && Math.abs(pos.getY(i) - hatchY) < 0.15) maxZ = Math.max(maxZ, pos.getZ(i));
    }
    expect(maxZ).toBeGreaterThan(wallR + 0.25);
  });
});

describe('panel surya menempel (tidak melayang)', () => {
  const downHit = (root: THREE.Object3D, x: number, z: number, fromY: number): number | null => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
    const h = ray.intersectObject(root, true)[0];
    return h ? h.point.y : null;
  };

  it('sayap probe menyambung pada ujung lengan: tidak ada celah tinggi di antara lengan dan tepi dalam sayap', () => {
    const probe = buildBeaconProbe();
    probe.group.updateMatrixWorld(true);
    const hingeY = 1.25 + 1.7 * 0.6;
    for (const side of [-1, 1]) {
      for (const x of [1.2, 1.28, 1.35, 1.6]) {
        const y = downHit(probe.group, side * x, 0, 6);
        expect(y, `x=${side * x}`).not.toBeNull();
        expect(Math.abs((y as number) - hingeY), `x=${side * x}`).toBeLessThan(0.14);
      }
    }
  });

  it('panel surya lander tersambung ke dek lewat tulang punggung sepanjang jalur tanpa celah (juga panel kedua dan ketiga)', () => {
    const base = defaultMission('moon');
    const a = resolveAssembly({ ...base, moduleIds: [...base.moduleIds.filter((m) => !m.startsWith('solar')), 'solar_s', 'solar_s', 'solar_s'] }, catalog);
    const lander = buildLander(a.modules, a.instruments, false);
    lander.updateMatrixWorld(true);
    const deckY = lander.userData.deckHeight as number;
    // sisi +z memuat panel pertama dan ketiga: dari tepi dek sampai ujung luar tanpa lompatan tinggi
    let prev: number | null = null;
    for (let z = 1.0; z < 3.4; z += 0.04) {
      const y = downHit(lander, 0, z, deckY + 1.0);
      expect(y, `z=${z.toFixed(2)}`).not.toBeNull();
      expect((y as number) - deckY, `z=${z.toFixed(2)}`).toBeGreaterThan(0.04);
      expect((y as number) - deckY, `z=${z.toFixed(2)}`).toBeLessThan(0.3);
      if (prev !== null) expect(Math.abs((y as number) - prev)).toBeLessThan(0.12);
      prev = y;
    }
  });
});
