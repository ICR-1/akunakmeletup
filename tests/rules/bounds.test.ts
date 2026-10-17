import { describe, expect, it } from 'vitest';
import { clampToDisc, distanceToBoundary } from '../../src/rules/bounds';

describe('batas area jelajah berbentuk cakram', () => {
  it('titik di dalam lingkaran tidak berubah', () => {
    expect(clampToDisc(100, -50, 380)).toEqual({ x: 100, z: -50 });
    expect(clampToDisc(0, 0, 380)).toEqual({ x: 0, z: 0 });
  });
  it('titik di luar dijepit ke lingkar searah posisi (bukan ke sudut persegi)', () => {
    const p = clampToDisc(500, 500, 380);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(380, 6);
    expect(p.x).toBeCloseTo(p.z, 6);
    expect(Math.abs(p.x)).toBeLessThan(380);
    const q = clampToDisc(-1000, 0, 380);
    expect(q.x).toBeCloseTo(-380, 6);
    expect(q.z).toBeCloseTo(0, 6);
  });
  it('pojok persegi (380, 380) tidak lagi bisa dicapai', () => {
    const p = clampToDisc(380, 380, 380);
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(380, 6);
  });
  it('jarak ke batas: positif di dalam, nol di lingkar, negatif di luar', () => {
    expect(distanceToBoundary(0, 0, 380)).toBe(380);
    expect(distanceToBoundary(380, 0, 380)).toBe(0);
    expect(distanceToBoundary(400, 0, 380)).toBe(-20);
  });
});
