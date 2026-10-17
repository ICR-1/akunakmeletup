import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { setDetail } from '../../src/gen/detail';
import { createTerrain, TERRAIN_TILE_M } from '../../src/gen/terrain';
import { rockColliders, scatterRocks } from '../../src/gen/props';
import { AstronautRig } from '../../src/gen/astronaut';
import { createNoise2D, fbm } from '../../src/gen/noise';

const palette = ['#c9ccd4', '#1b2340', '#ffffff'];
const make = (seed = 1) => createTerrain({ seed, palette, cells: 64, craterCount: 12 });

describe('terrain prosedural', () => {
  it('dipecah menjadi chunk dengan bounding sphere untuk frustum culling', () => {
    const c = make().chunks;
    expect(c.length).toBe(16);
    expect(c.every((m) => m.geometry.boundingSphere && m.geometry.boundingSphere.radius > 0)).toBe(true);
    expect(c.every((m) => m.frustumCulled)).toBe(true);
  });
  const t = make();
  it('deterministik dari seed; seed lain menghasilkan medan lain', () => {
    expect(make(1).heightAt(120, -80)).toBe(t.heightAt(120, -80));
    expect(make(2).heightAt(120, -80)).not.toBe(t.heightAt(120, -80));
    expect(make(1).craters).toEqual(t.craters);
  });
  it('area hub datar (ketinggian nol di sekitar wahana)', () => {
    for (const [x, z] of [[0, 0], [5, 7], [-10, 8], [12, -12]]) expect(Math.abs(t.heightAt(x, z))).toBeLessThan(0.05);
  });
  it('kawah tidak menimpa area hub', () => {
    for (const c of t.craters) expect(Math.hypot(c.x, c.z) - c.r).toBeGreaterThanOrEqual(70);
  });
  it('heightAt sama dengan permukaan mesh pada simpul grid', () => {
    for (const chunk of t.chunks) {
      const pos = chunk.geometry.getAttribute('position');
      for (let i = 0; i < pos.count; i += 331) {
        expect(t.heightAt(pos.getX(i), pos.getZ(i))).toBeCloseTo(pos.getY(i), 3);
      }
    }
  });
  it('titik di luar batas dijepit (tidak NaN)', () => {
    expect(Number.isFinite(t.heightAt(9999, -9999))).toBe(true);
  });
  it('kemiringan: dasar kawah/tepi lebih curam daripada dataran hub', () => {
    const c = t.craters[0];
    const rim = Math.max(...[0.7, 0.85, 1, 1.1].map((k) => t.slopeAt(c.x + c.r * k, c.z)));
    expect(rim).toBeGreaterThan(t.slopeAt(0, 0));
  });
  it('anggaran segitiga detail rendah: grid 160x160 di bawah 150 ribu segitiga', () => {
    setDetail('low');
    const big = createTerrain({ seed: 1, palette });
    const tris = big.chunks.reduce((sum, c) => sum + c.geometry.getAttribute('position').count / 3, 0);
    // Cakram bulat: sekitar pi/4 dari grid persegi penuh
    expect(tris).toBeGreaterThan(160 * 160 * 2 * 0.74);
    expect(tris).toBeLessThan(160 * 160 * 2 * 0.85);
    expect(big.chunks.length).toBeLessThanOrEqual(16);
    setDetail('high');
  });
  it('anggaran segitiga detail tinggi: grid lebih rapat tetapi masih di bawah 150 ribu', () => {
    setDetail('high');
    const big = createTerrain({ seed: 1, palette });
    const tris = big.chunks.reduce((sum, c) => sum + c.geometry.getAttribute('position').count / 3, 0);
    expect(tris).toBeGreaterThan(200 * 200 * 2 * 0.74);
    expect(tris).toBeLessThan(200 * 200 * 2 * 0.85);
    expect(tris).toBeLessThan(150_000);
  });
  it('siluet bulat: semua titik di dalam cakram, tepi menyentuh lingkar, dan tepi lebih rendah (lengkung benda langit)', () => {
    for (const level of ['low', 'high'] as const) {
      setDetail(level);
      const t = createTerrain({ seed: 2, palette, edgeDropM: 30 });
      const half = t.size / 2;
      let maxR = 0;
      for (const c of t.chunks) {
        const p = c.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) maxR = Math.max(maxR, Math.hypot(p.getX(i), p.getZ(i)));
      }
      expect(maxR, level).toBeLessThanOrEqual(half + 1e-3);
      expect(maxR, level).toBeGreaterThan(half * 0.995);
      // tidak ada titik di pojok persegi (di luar lingkar)
      for (const c of t.chunks) {
        const p = c.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i += 7) expect(Math.hypot(p.getX(i), p.getZ(i)), level).toBeLessThanOrEqual(half + 1e-3);
      }
      let edge = 0;
      for (let a = 0; a < 8; a++) edge += t.heightAt(Math.cos(a) * (half - 4), Math.sin(a) * (half - 4)) / 8;
      expect(edge, level).toBeLessThan(-20);
      expect(Math.abs(t.heightAt(0, 0)), level).toBeLessThan(0.05);
    }
    setDetail('high');
  });
  it('tepi cakram menggelap (kabut tepi) dibanding dekat pusat', () => {
    const t = createTerrain({ seed: 3, palette });
    const half = t.size / 2;
    const lum = (inner: boolean): number => {
      let sum = 0, n = 0;
      for (const c of t.chunks) {
        const p = c.geometry.getAttribute('position'), col = c.geometry.getAttribute('color');
        for (let i = 0; i < p.count; i++) {
          const r = Math.hypot(p.getX(i), p.getZ(i));
          if (inner ? r < half * 0.4 && r > half * 0.2 : r > half * 0.95) { sum += col.getX(i); n++; }
        }
      }
      return sum / Math.max(1, n);
    };
    expect(lum(false)).toBeLessThan(lum(true) * 0.6);
  });
  it('tiap titik punya UV = posisi dunia / ukuran ubin tekstur (untuk tekstur permukaan)', () => {
    const geo = make().chunks[0].geometry;
    const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv');
    expect(uv.count).toBe(pos.count);
    for (let i = 0; i < pos.count; i += 97) {
      expect(uv.getX(i)).toBeCloseTo(pos.getX(i) / TERRAIN_TILE_M, 4);
      expect(uv.getY(i)).toBeCloseTo(pos.getZ(i) / TERRAIN_TILE_M, 4);
    }
  });
  it('detail rendah: tiap segitiga satu warna (faceted)', () => {
    setDetail('low');
    const col = make().chunks[0].geometry.getAttribute('color');
    expect(col.getX(0)).toBe(col.getX(1));
    expect(col.getX(1)).toBe(col.getX(2));
    setDetail('high');
  });
  it('detail tinggi: normal per titik halus (miring searah gradien, panjang 1) dan warna per titik', () => {
    setDetail('high');
    const geo = make().chunks[0].geometry;
    const nrm = geo.getAttribute('normal');
    for (let i = 0; i < 300; i += 7) {
      expect(Math.hypot(nrm.getX(i), nrm.getY(i), nrm.getZ(i))).toBeCloseTo(1, 5);
      expect(nrm.getY(i)).toBeGreaterThan(0.2);
    }
  });
  afterAll(() => setDetail('high'));
});

describe('tabrakan batu', () => {
  it('tiap batu punya lingkaran tabrakan dari matriks instance: radius positif, puncak di atas tanah, deterministik', () => {
    const t = make();
    const rocks = scatterRocks(t, 1, '#c9ccd4', 80, [{ x: 0, z: 0, r: 14 }]);
    const colliders = rockColliders(rocks);
    expect(colliders.length).toBe(rocks.count);
    for (const c of colliders) {
      expect(c.r).toBeGreaterThan(0.2);
      expect(c.top).toBeGreaterThan(t.heightAt(c.x, c.z));
      expect(Math.hypot(c.x, c.z)).toBeGreaterThan(14);
    }
    expect(rockColliders(scatterRocks(t, 1, '#c9ccd4', 80, [{ x: 0, z: 0, r: 14 }]))).toEqual(colliders);
  });
});

describe('props dan astronot', () => {
  it('batu sebaran: satu InstancedMesh, menghindari zona hub, deterministik', () => {
    const t = make();
    const a = scatterRocks(t, 1, '#c9ccd4', 80, [{ x: 0, z: 0, r: 14 }]);
    const b = scatterRocks(t, 1, '#c9ccd4', 80, [{ x: 0, z: 0, r: 14 }]);
    expect(a.count).toBeGreaterThan(40);
    expect(Array.from(a.instanceMatrix.array)).toEqual(Array.from(b.instanceMatrix.array));
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < a.count; i++) {
      a.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(14);
    }
  });
  it('astronot: ayunan kaki mengikuti kecepatan, diam tidak mengayun, melompat membuka kaki', () => {
    const a = new AstronautRig();
    const legs = (): number => ((a as unknown as { legL: THREE.Group }).legL.rotation.x);
    for (let i = 0; i < 120; i++) a.update(1 / 60, { speed01: 0, run: false, airborne: false, oxygen01: 1 });
    expect(Math.abs(legs())).toBeLessThan(0.02);
    let max = 0;
    for (let i = 0; i < 120; i++) { a.update(1 / 60, { speed01: 1, run: true, airborne: false, oxygen01: 1 }); max = Math.max(max, Math.abs(legs())); }
    expect(max).toBeGreaterThan(0.3);
    for (let i = 0; i < 60; i++) a.update(1 / 60, { speed01: 0, run: false, airborne: true, oxygen01: 1 });
    expect(Math.abs(legs())).toBeGreaterThan(0.2);
    a.dispose();
  });
  it('astronot tingginya wajar (sekitar 2 m) dan lampu PLSS mengikuti oksigen', () => {
    const a = new AstronautRig();
    const h = new THREE.Box3().setFromObject(a.root);
    expect(h.max.y - h.min.y).toBeGreaterThan(1.8);
    expect(h.max.y - h.min.y).toBeLessThan(2.4);
    a.update(1 / 60, { speed01: 0, run: false, airborne: false, oxygen01: 0.1 });
    const ind = (a as unknown as { indicatorMat: THREE.MeshBasicMaterial }).indicatorMat;
    expect(ind.color.getHex()).toBe(0xff6b6b);
    a.update(1 / 60, { speed01: 0, run: false, airborne: false, oxygen01: 1 });
    expect(ind.color.getHex()).toBe(0x5dff9b);
  });
});

describe('noise', () => {
  it('berseed dan terbatas', () => {
    const n = createNoise2D(3);
    expect(n(1.3, 2.7)).toBe(createNoise2D(3)(1.3, 2.7));
    for (let i = 0; i < 500; i++) expect(Math.abs(fbm(n, i * 0.37, i * 0.11))).toBeLessThanOrEqual(1.2);
  });
});
