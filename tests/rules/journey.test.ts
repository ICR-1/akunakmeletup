import { describe, expect, it } from 'vitest';
import {
  DEST_REVEAL_FROM, DEST_REVEAL_TO, DEST_SCALE_CAPTURE, DEST_SCALE_END, DEST_SCALE_START, departureProgress, destScale, earthScale, EARTH_FAR_SCALE,
} from '../../src/rules/journey';

describe('perjalanan transfer (visual)', () => {
  it('planet tujuan sudah tumbuh bertahap sejak peluncuran, bukan muncul tiba-tiba saat transfer', () => {
    expect(destScale('launch', 0, 0, 0)).toBe(0);
    expect(destScale('launch', 0, 0, DEST_REVEAL_FROM)).toBe(0);
    const mid = destScale('launch', 0, 0, (DEST_REVEAL_FROM + DEST_REVEAL_TO) / 2);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(DEST_SCALE_START);
    expect(destScale('launch', 0, 0, DEST_REVEAL_TO)).toBeCloseTo(DEST_SCALE_START, 10);
    expect(destScale('orbit', 0, 0)).toBe(DEST_SCALE_START);
  });

  it('di orbit Bumi masih penuh dan planet tujuan sangat kecil; sesudah transfer Bumi hampir titik', () => {
    expect(departureProgress('orbit', 0)).toBe(0);
    expect(earthScale(0)).toBe(1);
    expect(destScale('orbit', 0, 0)).toBe(DEST_SCALE_START);
    expect(departureProgress('capture', 1)).toBe(1);
    expect(earthScale(1)).toBeCloseTo(EARTH_FAR_SCALE, 10);
  });
  it('Bumi mengecil dan planet tujuan tumbuh monoton, mulus (tanpa lompatan) sepanjang burn transfer', () => {
    let prevEarth = 2, prevDest = 0;
    for (let i = 0; i <= 100; i++) {
      const burned = i / 100;
      const dep = departureProgress('transfer', burned);
      const e = earthScale(dep), d = destScale('transfer', dep, burned);
      expect(e).toBeLessThanOrEqual(prevEarth + 1e-12);
      expect(d).toBeGreaterThanOrEqual(prevDest - 1e-12);
      if (i > 0) {
        expect(prevEarth - e).toBeLessThan(0.05);
        expect(d - prevDest).toBeLessThan(0.05);
      }
      prevEarth = e; prevDest = d;
    }
    expect(destScale('transfer', 1, 1)).toBeCloseTo(DEST_SCALE_END, 10);
  });
  it('penangkapan melanjutkan dari akhir transfer sampai skala penangkapan', () => {
    expect(destScale('capture', 1, 0)).toBe(DEST_SCALE_END);
    expect(destScale('capture', 1, 1)).toBe(DEST_SCALE_CAPTURE);
  });
});
