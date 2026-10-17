import { describe, expect, it } from 'vitest';
import { insideAny, ladderColliders, resolveCircles, STEP_HEIGHT_M, type Circle, type LadderSpec } from '../../src/rules/collision';

const rock = (x: number, z: number, r: number, top = 3): Circle => ({ x, z, r, top });

describe('tabrakan lingkaran bidang x-z', () => {
  it('di luar jangkauan: posisi tidak berubah dan tidak ada hit', () => {
    const r = resolveCircles(5, 0, 0.5, 0, [rock(0, 0, 1)]);
    expect(r).toEqual({ x: 5, z: 0, hit: false });
  });
  it('menembus objek didorong keluar tepat sampai radius gabungan, searah pusat', () => {
    const r = resolveCircles(0.4, 0, 0.5, 0, [rock(0, 0, 1)]);
    expect(r.hit).toBe(true);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1.5, 6);
    expect(r.z).toBeCloseTo(0, 6);
    expect(r.x).toBeGreaterThan(0);
  });
  it('tepat di pusat: tetap terdorong keluar (tidak NaN)', () => {
    const r = resolveCircles(2, 3, 0.5, 0, [rock(2, 3, 1)]);
    expect(Number.isFinite(r.x) && Number.isFinite(r.z)).toBe(true);
    expect(Math.hypot(r.x - 2, r.z - 3)).toBeCloseTo(1.5, 6);
  });
  it('objek rendah (puncak <= kaki + tinggi langkah) dilewati; objek tinggi menghalang', () => {
    expect(resolveCircles(0.2, 0, 0.5, 0, [rock(0, 0, 1, STEP_HEIGHT_M)]).hit).toBe(false);
    expect(resolveCircles(0.2, 0, 0.5, 0, [rock(0, 0, 1, STEP_HEIGHT_M + 0.1)]).hit).toBe(true);
  });
  it('melompat tinggi melewati batu: kaki di atas puncak tidak terhalang', () => {
    expect(resolveCircles(0.2, 0, 0.5, 2.8, [rock(0, 0, 1, 3)]).hit).toBe(false);
    expect(resolveCircles(0.2, 0, 0.5, 1.0, [rock(0, 0, 1, 3)]).hit).toBe(true);
  });
  it('terhimpit dua objek: hasil akhir tidak menembus keduanya', () => {
    const circles = [rock(-1.2, 0, 1), rock(1.2, 0, 1)];
    const r = resolveCircles(0, 0.1, 0.5, 0, circles);
    for (const c of circles) expect(Math.hypot(r.x - c.x, r.z - c.z)).toBeGreaterThanOrEqual(c.r + 0.5 - 0.05);
  });
  it('bergerak lurus ke objek berhenti di tepinya (simulasi langkah per frame)', () => {
    let x = -5, z = 0.2;
    const c = rock(0, 0, 1.5);
    for (let i = 0; i < 400; i++) {
      x += 3 / 60;
      const r = resolveCircles(x, z, 0.45, 0, [c]);
      x = r.x; z = r.z;
    }
    expect(Math.hypot(x - c.x, z - c.z)).toBeGreaterThanOrEqual(c.r + 0.45 - 1e-6);
  });
  it('insideAny: mendeteksi titik di dalam penghalang yang menghalangi kaki', () => {
    expect(insideAny(0.5, 0, 0, [rock(0, 0, 1)])).toBe(true);
    expect(insideAny(2, 0, 0, [rock(0, 0, 1)])).toBe(false);
    expect(insideAny(0.5, 0, 5, [rock(0, 0, 1, 3)])).toBe(false);
  });
});

describe('penghalang tangga miring', () => {
  const ladder: LadderSpec = { zTop: 2, zBottom: 2.5, yTop: 1, yBottom: 0.05, halfWidth: 0.4 };

  it('lingkaran tersebar dari serambi ke tanah, diskalakan, dan puncaknya turun ke bawah', () => {
    const c = ladderColliders(ladder, 10, 3, -4, 2, 0, 4);
    expect(c).toHaveLength(4);
    expect(c[0]).toMatchObject({ x: 10, z: -4 + 2 * 2, r: 0.8 });
    expect(c[3].z).toBeCloseTo(-4 + 2.5 * 2, 6);
    expect(c[0].top).toBeCloseTo(3 + 2, 6);
    expect(c[3].top).toBeCloseTo(3 + 0.05 * 2, 6);
    for (let i = 1; i < c.length; i++) expect(c[i].top).toBeLessThan(c[i - 1].top);
  });

  it('mengikuti putaran model (rotY 90 derajat: +z lokal menjadi +x dunia)', () => {
    const c = ladderColliders(ladder, 0, 0, 0, 1, Math.PI / 2, 2);
    expect(c[0].x).toBeCloseTo(2, 6);
    expect(c[0].z).toBeCloseTo(0, 6);
  });

  it('pejalan kaki di dekat tangga terdorong keluar, tetapi bagian bawah yang rendah bisa dilangkahi', () => {
    const c = ladderColliders(ladder, 0, 0, 0, 2, 0, 4);
    const hit = resolveCircles(0, c[0].z + 0.1, 0.45, 0, c);
    expect(hit.hit).toBe(true);
    const low = resolveCircles(0, c[3].z, 0.45, 0, [c[3]]);
    expect(low.hit).toBe(false);
  });
});
