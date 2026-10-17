import { describe, expect, it } from 'vitest';
import { createNoise3D, fbm3 } from '../../src/gen/noise';
import { PLANET_KEYS, paintSphere, planetTexture, ringTextureData, type TextureData } from '../../src/gen/planetTextures';

const px = (t: TextureData, i: number): [number, number, number, number] => [t.data[i * 4], t.data[i * 4 + 1], t.data[i * 4 + 2], t.data[i * 4 + 3]];
const mean = (t: TextureData): [number, number, number] => {
  let r = 0, g = 0, b = 0;
  const n = t.width * t.height;
  for (let i = 0; i < n; i++) { r += t.data[i * 4]; g += t.data[i * 4 + 1]; b += t.data[i * 4 + 2]; }
  return [r / n, g / n, b / n];
};

describe('noise 3D', () => {
  it('deterministik dari seed dan terbatas', () => {
    const a = createNoise3D(5), b = createNoise3D(5), c = createNoise3D(6);
    expect(a(1.3, 2.7, 0.4)).toBe(b(1.3, 2.7, 0.4));
    expect(a(1.3, 2.7, 0.4)).not.toBe(c(1.3, 2.7, 0.4));
    for (let i = 0; i < 500; i++) expect(Math.abs(fbm3(a, i * 0.37, i * 0.11, i * 0.07))).toBeLessThanOrEqual(1.2);
  });
});

describe('tekstur planet prosedural (tanpa berkas gambar)', () => {
  it.each(PLANET_KEYS)('%s: ukuran benar, tak ada piksel kosong, deterministik', (key) => {
    const t = planetTexture(key);
    expect(t.data.length).toBe(t.width * t.height * 4);
    expect(t.width).toBe(t.height * 2);
    expect(planetTexture(key)).toBe(t);
    if (key !== 'earthClouds') for (let i = 0; i < t.width * t.height; i += 997) expect(px(t, i)[3]).toBe(255);
  });
  it('setiap planet berwarna khas dan berbeda satu sama lain', () => {
    const means = Object.fromEntries(PLANET_KEYS.filter((k) => k !== 'earthClouds').map((k) => [k, mean(planetTexture(k))]));
    expect(means.mars[0]).toBeGreaterThan(means.mars[2] * 1.5);
    expect(means.neptune[2]).toBeGreaterThan(means.neptune[0] * 1.6);
    expect(Math.abs(means.moon[0] - means.moon[2])).toBeLessThan(25);
    expect(means.venus[0]).toBeGreaterThan(means.venus[2]);
    const keys = Object.keys(means);
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
      const d = Math.hypot(means[keys[i]][0] - means[keys[j]][0], means[keys[i]][1] - means[keys[j]][1], means[keys[i]][2] - means[keys[j]][2]);
      expect(d, `${keys[i]} vs ${keys[j]}`).toBeGreaterThan(3);
    }
  });
  it('Bumi punya laut dan daratan; awan semi-transparan; kutub berlapis es', () => {
    const e = planetTexture('earth');
    let water = 0, land = 0;
    for (let i = 0; i < e.width * e.height; i += 7) { const [r, g, b] = px(e, i); if (b > r && b > g) water++; else land++; }
    expect(water / (water + land)).toBeGreaterThan(0.3);
    expect(land / (water + land)).toBeGreaterThan(0.1);
    const pole = px(e, 3);
    expect(pole[0]).toBeGreaterThan(200);
    const clouds = planetTexture('earthClouds');
    let clear = 0, dense = 0;
    for (let i = 0; i < clouds.width * clouds.height; i += 5) { const a = px(clouds, i)[3]; if (a < 20) clear++; else if (a > 200) dense++; }
    expect(clear).toBeGreaterThan(0);
    expect(dense).toBeGreaterThan(0);
  });
  it('tidak ada sambungan pada bujur 0/360: kolom pertama dan terakhir mirip', () => {
    const t = planetTexture('earth');
    let diff = 0;
    for (let y = 0; y < t.height; y += 4) {
      const a = px(t, y * t.width), b = px(t, y * t.width + t.width - 1);
      diff += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
    }
    expect(diff / (t.height / 4) / 3).toBeLessThan(35);
  });
  it('Jupiter berpita: variasi antar lintang lebih besar daripada antar bujur', () => {
    const t = planetTexture('jupiter');
    const row = (y: number): number => { let s = 0; for (let x = 0; x < t.width; x += 8) s += px(t, y * t.width + x)[0]; return s / (t.width / 8); };
    const rows = Array.from({ length: 32 }, (_, i) => row(Math.floor((i + 0.5) * (t.height / 32))));
    expect(Math.max(...rows) - Math.min(...rows)).toBeGreaterThan(30);
  });
  it('paintSphere: kontrol alpha dan peta bola', () => {
    const t = paintSphere(8, 4, (x, y, z, _la, _lo, o) => { o[0] = (x + 1) * 127; o[1] = (y + 1) * 127; o[2] = (z + 1) * 127; o[3] = 10; }, true);
    expect(px(t, 0)[3]).toBe(10);
    const opaque = paintSphere(8, 4, (_x, _y, _z, _la, _lo, o) => { o[0] = o[1] = o[2] = 1; o[3] = 10; });
    expect(px(opaque, 0)[3]).toBe(255);
  });
  it('cincin: celah Cassini hampir transparan, cincin B terang', () => {
    const r = ringTextureData(512);
    const alphaAt = (t: number): number => r.data[Math.floor(t * 511) * 4 + 3];
    expect(alphaAt(0.53)).toBeLessThan(30);
    expect(alphaAt(0.3)).toBeGreaterThan(150);
  });
});
