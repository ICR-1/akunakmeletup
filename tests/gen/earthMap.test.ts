import { describe, expect, it } from 'vitest';
import { blurMask, EARTH_TEXTURE, isLandAt, paintEarth, rasterizeRings } from '../../src/gen/earthMap';

const W = 1024, H = 512;
const land = (lat: number, lon: number): boolean => isLandAt(lat, lon, W, H);

describe('Bumi dari geografi nyata', () => {
  it('benua utama berada di daratan', () => {
    const places: [string, number, number][] = [
      ['Kongo (Afrika)', 0, 22], ['Sahara', 23, 10], ['Amazon', -5, -62], ['Siberia', 62, 100], ['India', 22, 79],
      ['Amerika Utara tengah', 40, -100], ['Australia tengah', -25, 134], ['Eropa (Prancis)', 47, 2], ['Arab', 24, 45],
      ['Tiongkok', 35, 105], ['Antarktika', -80, 0], ['Greenland', 72, -40],
    ];
    for (const [name, lat, lon] of places) expect(land(lat, lon), name).toBe(true);
  });
  it('pulau besar berada di daratan', () => {
    const islands: [string, number, number][] = [
      ['Kalimantan', 0.5, 114], ['Sumatra', -0.5, 102], ['Jawa', -7.5, 110.5], ['Sulawesi', -2, 121], ['Papua', -5, 141],
      ['Madagaskar', -19, 46.5], ['Islandia', 64.9, -18.5], ['Britania Raya', 52.5, -1.5], ['Irlandia', 53.2, -8],
      ['Honshu', 36, 138], ['Selandia Baru (Selatan)', -44, 170], ['Sri Lanka', 7.5, 80.7], ['Kuba', 21.8, -79.5],
      ['Tasmania', -42, 146.5], ['Taiwan', 23.7, 121], ['Luzon', 16, 121],
    ];
    for (const [name, lat, lon] of islands) expect(land(lat, lon), name).toBe(true);
  });
  it('laut, selat, dan danau besar adalah air', () => {
    const waters: [string, number, number][] = [
      ['Atlantik', 0, -30], ['Pasifik', 0, -150], ['Hindia', -20, 80], ['Mediterania', 35, 18], ['Laut Hitam', 43, 34],
      ['Laut Merah', 20, 38], ['Teluk Persia', 27, 51], ['Teluk Hudson', 60, -85], ['Laut Kaspia', 41, 50],
      ['Danau Victoria', -1, 33], ['Danau Superior', 47.5, -87.5], ['Arktik', 85, 0], ['Laut Jawa', -5, 110], ['Laut Utara', 56, 3],
    ];
    for (const [name, lat, lon] of places(waters)) expect(land(lat, lon), name).toBe(false);
  });
  it('proporsi daratan mendekati Bumi nyata (~29% permukaan, berbobot luas)', () => {
    const m = { w: 1024, h: 512 };
    let landArea = 0, total = 0;
    for (let y = 0; y < m.h; y++) {
      const wgt = Math.cos((((y + 0.5) / m.h) - 0.5) * Math.PI);
      for (let x = 0; x < m.w; x++) {
        total += wgt;
        const lat = 90 - ((y + 0.5) / m.h) * 180, lon = ((x + 0.5) / m.w) * 360 - 180;
        if (isLandAt(lat, lon, m.w, m.h)) landArea += wgt;
      }
    }
    expect(landArea / total).toBeGreaterThan(0.27);
    expect(landArea / total).toBeLessThan(0.32);
  });
  it('rasterisasi: persegi sederhana terisi tepat dan lubang dikosongkan (genap-ganjil)', () => {
    // 20x20 derajat di (0,0) dengan lubang 6x6 di tengah, pada grid 360x180 (1 piksel = 1 derajat)
    const ring = (x0: number, y0: number, x1: number, y1: number): number[] => {
      const pts = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const flat: number[] = [];
      let px = 0, py = 0;
      for (const [x, y] of pts) { flat.push(x * 100 - px, y * 100 - py); px = x * 100; py = y * 100; }
      return flat;
    };
    const mask = rasterizeRings([ring(-10, -10, 10, 10), ring(-3, -3, 3, 3)], 360, 180);
    const at = (lat: number, lon: number): number => mask[Math.floor(90 - lat) * 360 + Math.floor(lon + 180)];
    expect(at(8, 8)).toBe(1);
    expect(at(-8, -8)).toBe(1);
    expect(at(0, 0)).toBe(0);
    expect(at(15, 0)).toBe(0);
    expect(mask.reduce((s, v) => s + v, 0)).toBe(20 * 20 - 6 * 6);
  });
  it('blurMask: pecahan daratan antara 0 dan 1 dan menurun menjauhi pantai', () => {
    const mask = new Uint8Array(64 * 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) mask[y * 64 + x] = 1;
    const b = blurMask(mask, 64, 32, 3);
    expect(b[16 * 64 + 8]).toBeCloseTo(1, 5);
    expect(b[16 * 64 + 40]).toBeCloseTo(0, 5);
    expect(b[16 * 64 + 31]).toBeGreaterThan(b[16 * 64 + 34]);
  });
  it('tekstur: ukuran benar, tanpa piksel transparan; kutub putih, Sahara berpasir, Amazon hijau tua, samudra biru', () => {
    const t = paintEarth(W, H);
    expect(t.width).toBe(W);
    expect(t.data.length).toBe(W * H * 4);
    const px = (lat: number, lon: number): number[] => {
      const x = Math.floor(((lon + 180) / 360) * W), y = Math.floor(((90 - lat) / 180) * H), i = (y * W + x) * 4;
      return [t.data[i], t.data[i + 1], t.data[i + 2], t.data[i + 3]];
    };
    for (let i = 3; i < t.data.length; i += 4 * 997) expect(t.data[i]).toBe(255);
    const [pr, pg, pb] = px(-85, 20);
    expect(Math.min(pr, pg, pb)).toBeGreaterThan(200);
    const [ar, ag, ab] = px(86, 30);
    expect(Math.min(ar, ag, ab)).toBeGreaterThan(190);
    const sahara = px(23, 12);
    expect(sahara[0]).toBeGreaterThan(sahara[2] + 40);
    const amazon = px(-4, -62);
    expect(amazon[1]).toBeGreaterThan(amazon[0]);
    expect(amazon[1]).toBeGreaterThan(amazon[2]);
    const pacific = px(0, -150);
    expect(pacific[2]).toBeGreaterThan(pacific[0] + 30);
    expect(pacific[2]).toBeGreaterThan(pacific[1]);
  });
  it('resolusi default 1536x768', () => {
    expect(EARTH_TEXTURE.width).toBe(1536);
    expect(EARTH_TEXTURE.height).toBe(768);
  });
});

function places<T>(x: T[]): T[] { return x; }
