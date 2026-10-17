import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createRng } from '../../src/core/rng';
import { buildLander } from '../../src/gen/lander';
import { shardVelocity, shatterObject, voronoiClusters } from '../../src/gen/shatter';
import { resolveAssembly } from '../../src/rules/catalog';
import { defaultMission } from '../../src/core/missionBuilder';
import { catalog } from '../rules/helpers';

const trisOf = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  return n;
};

describe('pecahan: pengelompokan Voronoi', () => {
  const grid = (n: number): Float32Array => {
    const p: number[] = [];
    for (let i = 0; i < n; i++) p.push((i % 10) * 1, Math.floor(i / 10) * 1, (i * 7) % 5);
    return new Float32Array(p);
  };

  it('deterministik dan berubah menurut seed', () => {
    const a = voronoiClusters(grid(200), 12, 4), b = voronoiClusters(grid(200), 12, 4);
    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(voronoiClusters(grid(200), 12, 5))).not.toEqual(Array.from(a));
  });

  it('label padat 0..k-1, semua titik terlabel, dan jumlah klaster tidak melebihi k atau jumlah titik', () => {
    const labels = voronoiClusters(grid(200), 12, 1);
    const used = new Set(labels);
    expect(labels).toHaveLength(200);
    expect(used.size).toBeLessThanOrEqual(12);
    expect(used.size).toBeGreaterThan(6);
    expect(Math.max(...labels)).toBe(used.size - 1);
    expect(new Set(voronoiClusters(grid(3), 10, 1)).size).toBeLessThanOrEqual(3);
    expect(voronoiClusters(new Float32Array(0), 5, 1)).toHaveLength(0);
  });

  it('klaster bersifat lokal: titik berjauhan tidak sekelompok bila k cukup', () => {
    const p = new Float32Array([0, 0, 0, 0.1, 0, 0, 100, 0, 0, 100.1, 0, 0]);
    const l = voronoiClusters(p, 2, 3, 4);
    expect(l[0]).toBe(l[1]);
    expect(l[2]).toBe(l[3]);
    expect(l[0]).not.toBe(l[2]);
  });
});

describe('pecahan: shatterObject', () => {
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const make = (): THREE.Group => {
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(2, 4, 2, 2, 4, 2);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geo.getAttribute('position').count * 3).fill(0.7), 3));
    const m = new THREE.Mesh(geo, mat);
    m.position.set(5, 3, -2);
    m.rotation.y = 0.6;
    g.add(m);
    return g;
  };

  it('semua segitiga terbagi ke serpihan: jumlah segitiga tetap, serpihan banyak, material dibagi', () => {
    const src = make();
    const tris = trisOf(src);
    const shards = shatterObject(src, 20, 3);
    expect(shards.length).toBeGreaterThan(8);
    expect(shards.length).toBeLessThanOrEqual(20);
    expect(shards.reduce((t, s) => t + s.triangles, 0)).toBe(tris);
    const sum = shards.reduce((t, s) => t + trisOf(s.group), 0);
    expect(sum).toBe(tris);
    for (const s of shards) {
      const mesh = s.group.children[0] as THREE.Mesh;
      expect(mesh.material).toBe(mat);
      expect(mesh.geometry.getAttribute('color')).toBeDefined();
      // geometri relatif ke pusat: rata-rata posisi vertex mendekati nol
      const p = mesh.geometry.getAttribute('position');
      const c = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) c.add(new THREE.Vector3().fromBufferAttribute(p, i));
      c.divideScalar(p.count);
      expect(c.length()).toBeLessThan(1.2);
    }
  });

  it('pusat serpihan berada di dalam kotak batas objek asli (dunia) dan objek asli tidak berubah', () => {
    const src = make();
    const before = trisOf(src);
    const box = new THREE.Box3().setFromObject(src).expandByScalar(0.01);
    for (const s of shatterObject(src, 16, 9)) expect(box.containsPoint(s.group.position)).toBe(true);
    expect(trisOf(src)).toBe(before);
  });

  it('deterministik menurut seed', () => {
    const a = shatterObject(make(), 12, 5).map((s) => [s.group.position.x, s.group.position.y, s.group.position.z, s.triangles]);
    const b = shatterObject(make(), 12, 5).map((s) => [s.group.position.x, s.group.position.y, s.group.position.z, s.triangles]);
    expect(a).toEqual(b);
  });

  it('melewati mesh tak terlihat atau transparan dan membuang tanpa kesalahan bila kosong', () => {
    const g = make();
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ transparent: true }));
    const hidden = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    hidden.visible = false;
    g.add(ghost, hidden);
    const solid = trisOf(make());
    expect(shatterObject(g, 10, 1).reduce((t, s) => t + s.triangles, 0)).toBe(solid);
    expect(shatterObject(new THREE.Group(), 10, 1)).toEqual([]);
    expect(shatterObject(g, 0, 1)).toEqual([]);
  });

  it('memecah lander sungguhan menjadi puluhan serpihan lambung (bukan komponen utuh)', () => {
    const a = resolveAssembly(defaultMission('moon'), catalog);
    const lander = buildLander(a.modules, a.instruments, false);
    const shards = shatterObject(lander, 56, 2);
    expect(shards.length).toBeGreaterThan(30);
    expect(shards.length).toBeLessThanOrEqual(90);
    // tidak ada satu serpihan pun yang memuat mayoritas segitiga
    const total = shards.reduce((t, s) => t + s.triangles, 0);
    expect(Math.max(...shards.map((s) => s.triangles))).toBeLessThan(total * 0.25);
  });
});

describe('pecahan: kecepatan lontar', () => {
  it('menjauh dari pusat, condong ke atas, dan kecepatan dalam batas', () => {
    const rng = createRng(1);
    for (let i = 0; i < 50; i++) {
      const v = shardVelocity({ x: 0, y: 0, z: 0 }, { x: 3, y: 1, z: -2 }, rng, 5, 20, 0.5);
      expect(v.x).toBeGreaterThan(-1);
      expect(v.z).toBeLessThan(1);
      expect(v.y).toBeGreaterThan(0);
      const sp = Math.hypot(v.x, v.y, v.z);
      expect(sp).toBeGreaterThanOrEqual(5 - 1e-6);
      expect(sp).toBeLessThanOrEqual(20 + 1e-6);
    }
  });

  it('serpihan tepat di pusat tetap mendapat arah yang terdefinisi', () => {
    const v = shardVelocity({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }, createRng(2), 5, 20, 0.5);
    expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
    expect(v.y).toBeGreaterThan(0);
  });
});
