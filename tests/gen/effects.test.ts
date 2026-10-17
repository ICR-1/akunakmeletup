import { describe, expect, it } from 'vitest';
import { footprintAge01, nextFootprintSlot, puffFade, stepPuff } from '../../src/gen/effects';

describe('debu langkah kaki (balistik)', () => {
  it('terangkat lalu jatuh pelan di gravitasi Bulan dan menempel di tanah', () => {
    const p = { x: 0, y: 0.1, z: 0 }, v = { x: 0.4, y: 0.8, z: 0 };
    let maxY = 0, steps = 0;
    while (steps < 600) {
      stepPuff(p, v, 1.62, 0.9, 0.05, 1 / 60);
      maxY = Math.max(maxY, p.y);
      steps++;
    }
    expect(maxY).toBeGreaterThan(0.2);
    expect(p.y).toBeCloseTo(0.05, 6);
    expect(v.y).toBe(0);
  });
  it('gravitasi lebih kecil melayang lebih lama dan lebih tinggi daripada Mars', () => {
    const peak = (g: number): number => {
      const p = { x: 0, y: 0.1, z: 0 }, v = { x: 0, y: 1, z: 0 };
      let m = 0;
      for (let i = 0; i < 600; i++) { stepPuff(p, v, g, 0.9, 0.05, 1 / 60); m = Math.max(m, p.y); }
      return m;
    };
    expect(peak(1.62)).toBeGreaterThan(peak(3.71));
  });
  it('hambatan memperlambat gerak mendatar dan menyentuh tanah meredamnya', () => {
    const p = { x: 0, y: 0.05, z: 0 }, v = { x: 3, y: 0, z: 0 };
    for (let i = 0; i < 120; i++) stepPuff(p, v, 1.62, 0.9, 0.05, 1 / 60);
    expect(Math.abs(v.x)).toBeLessThan(0.5);
  });
  it('puffFade turun monoton dari 1 ke 0 dan dijaga di [0,1]', () => {
    expect(puffFade(0, 2)).toBe(1);
    expect(puffFade(2, 2)).toBe(0);
    expect(puffFade(5, 2)).toBe(0);
    expect(puffFade(-1, 2)).toBe(1);
    let prev = 1;
    for (let a = 0; a <= 2; a += 0.1) { const f = puffFade(a, 2); expect(f).toBeLessThanOrEqual(prev + 1e-12); prev = f; }
  });
});

describe('jejak sepatu (cincin tetap)', () => {
  it('slot berikutnya berputar sehingga yang terlama ditimpa; umur dinormalisasi 0-1', () => {
    let c = 0;
    const seen: number[] = [];
    for (let i = 0; i < 7; i++) { seen.push(c); c = nextFootprintSlot(c, 3); }
    expect(seen).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(footprintAge01(0, 45)).toBe(0);
    expect(footprintAge01(22.5, 45)).toBeCloseTo(0.5, 10);
    expect(footprintAge01(99, 45)).toBe(1);
    expect(footprintAge01(-3, 45)).toBe(0);
  });
});
