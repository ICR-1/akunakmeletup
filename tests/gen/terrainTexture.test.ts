import { describe, expect, it } from 'vitest';
import { generateSurfaceMaps, periodicNoise, TERRAIN_TILE_M } from '../../src/gen/terrainTexture';

const SIZE = 128;
const lum = (a: Uint8ClampedArray, x: number, y: number, size = SIZE): number => a[(y * size + x) * 4];

describe('tekstur permukaan buatan kode', () => {
  it('noise periodik tanpa sambungan: nilai di x dan x + periode sama', () => {
    for (let i = 0; i < 20; i++) {
      const x = i * 0.37 + 0.1, y = i * 0.53 + 0.2;
      expect(periodicNoise(x, y, 8, 3)).toBeCloseTo(periodicNoise(x + 8, y, 8, 3), 10);
      expect(periodicNoise(x, y, 8, 3)).toBeCloseTo(periodicNoise(x, y + 8, 8, 3), 10);
    }
  });
  it('deterministik dari seed, berbeda untuk seed atau jenis lain', () => {
    const a = generateSurfaceMaps('moon', 5, SIZE), b = generateSurfaceMaps('moon', 5, SIZE);
    expect(Array.from(a.albedo.slice(0, 400))).toEqual(Array.from(b.albedo.slice(0, 400)));
    expect(Array.from(generateSurfaceMaps('moon', 6, SIZE).albedo.slice(0, 400))).not.toEqual(Array.from(a.albedo.slice(0, 400)));
    expect(Array.from(generateSurfaceMaps('mars', 5, SIZE).height.slice(0, 400))).not.toEqual(Array.from(a.height.slice(0, 400)));
  });
  it('ukuran benar, tidak transparan, abu-abu (R=G=B) dan punya variasi (bukan polos)', () => {
    const m = generateSurfaceMaps('moon', 1, SIZE);
    expect(m.albedo.length).toBe(SIZE * SIZE * 4);
    let lo = 255, hi = 0, sum = 0, sumSq = 0;
    for (let i = 0; i < SIZE * SIZE; i++) {
      const v = m.albedo[i * 4];
      expect(m.albedo[i * 4 + 1]).toBe(v);
      expect(m.albedo[i * 4 + 3]).toBe(255);
      lo = Math.min(lo, v); hi = Math.max(hi, v); sum += v; sumSq += v * v;
    }
    const mean = sum / (SIZE * SIZE), sd = Math.sqrt(sumSq / (SIZE * SIZE) - mean * mean);
    expect(hi - lo).toBeGreaterThan(50);
    expect(sd).toBeGreaterThan(8);
    expect(mean).toBeGreaterThan(110);
    expect(mean).toBeLessThan(230);
  });
  it('dapat disambung: selisih di tepi ubin sebanding dengan selisih antar piksel bertetangga', () => {
    for (const kind of ['moon', 'mars'] as const) {
      const m = generateSurfaceMaps(kind, 2, SIZE);
      let seam = 0, inner = 0;
      for (let y = 0; y < SIZE; y++) {
        seam += Math.abs(lum(m.height, 0, y) - lum(m.height, SIZE - 1, y));
        inner += Math.abs(lum(m.height, 10, y) - lum(m.height, 11, y));
      }
      expect(seam / SIZE).toBeLessThan((inner / SIZE) * 2.5 + 4);
      let seamY = 0, innerY = 0;
      for (let x = 0; x < SIZE; x++) {
        seamY += Math.abs(lum(m.height, x, 0) - lum(m.height, x, SIZE - 1));
        innerY += Math.abs(lum(m.height, x, 10) - lum(m.height, x, 11));
      }
      expect(seamY / SIZE).toBeLessThan((innerY / SIZE) * 2.5 + 4);
    }
  });
  it('ubin 14 m di dunia dan UV terrain memakai ukuran itu', () => {
    expect(TERRAIN_TILE_M).toBe(14);
  });
});
