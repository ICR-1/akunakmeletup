import { EARTH_GLACIERS, EARTH_ICE_SHELVES, EARTH_LAKES, EARTH_LAND } from './earthData';
import { createNoise3D, fbm3 } from './noise';
import type { TextureData } from './planetTextures';

/**
 * Bumi dari geografi dunia nyata: benua, pulau, danau besar, gletser (Greenland, Himalaya, Alaska, dst.), lapisan es
 * Antarktika, dan topi es kutub. Garis pantai berasal dari data vektor Natural Earth (domain publik) yang tertanam
 * sebagai kode (`earthData.ts`) dan dirasterisasi saat runtime menjadi tekstur ekuirektangular. Murni (tanpa DOM).
 */
export const EARTH_TEXTURE = { width: 1536, height: 768 } as const;

export type Rgb = [number, number, number];
const hex = (h: number): Rgb => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (out: number[], a: ArrayLike<number>, b: ArrayLike<number>, t: number): void => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
};

/** Cincin terkode (selisih, seperseratus derajat) menjadi koordinat piksel bujur/lintang. */
function toPixelRing(flat: number[], w: number, h: number): Float64Array {
  const n = flat.length / 2;
  const out = new Float64Array(n * 2);
  let x = 0, y = 0;
  for (let i = 0; i < n; i++) {
    x += flat[i * 2];
    y += flat[i * 2 + 1];
    out[i * 2] = ((x / 100 + 180) / 360) * w;
    out[i * 2 + 1] = ((90 - y / 100) / 180) * h;
  }
  return out;
}

/** Isi poligon (aturan genap-ganjil, mencakup lubang) pada grid w x h; 1 = di dalam. Murni dan deterministik. */
export function rasterizeRings(rings: number[][], w: number, h: number): Uint8Array {
  const rows: number[][] = Array.from({ length: h }, () => []);
  for (const flat of rings) {
    const p = toPixelRing(flat, w, h);
    const n = p.length / 2;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const x1 = p[i * 2], y1 = p[i * 2 + 1], x2 = p[j * 2], y2 = p[j * 2 + 1];
      if (y1 === y2) continue;
      const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
      const r0 = Math.max(0, Math.ceil(lo - 0.5)), r1 = Math.min(h - 1, Math.ceil(hi - 0.5) - 1);
      for (let r = r0; r <= r1; r++) rows[r].push(x1 + ((r + 0.5 - y1) * (x2 - x1)) / (y2 - y1));
    }
  }
  const mask = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) {
    const xs = rows[r].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)), b = Math.min(w - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
      for (let x = a; x <= b; x++) mask[r * w + x] = 1;
    }
  }
  return mask;
}

/** Blur kotak terpisah (bujur menyambung, lintang dijepit): pecahan daratan lokal 0-1 untuk gradasi paparan benua. */
export function blurMask(mask: Uint8Array, w: number, h: number, radius: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const norm = 1 / (2 * radius + 1);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += mask[y * w + ((k + w) % w)];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum * norm;
      sum += mask[y * w + ((x + radius + 1) % w)] - mask[y * w + ((x - radius + w) % w)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[Math.min(h - 1, Math.max(0, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum * norm;
      sum += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x];
    }
  }
  return out;
}

export interface EarthMasks { width: number; height: number; land: Uint8Array; lakes: Uint8Array; glaciers: Uint8Array; shelves: Uint8Array }

const cache = new Map<string, EarthMasks>();

/** Topeng daratan/danau/gletser/lapisan es pada resolusi tertentu (di-cache per resolusi). */
export function earthMasks(width: number, height: number): EarthMasks {
  const key = `${width}x${height}`;
  let m = cache.get(key);
  if (!m) {
    m = {
      width, height,
      land: rasterizeRings(EARTH_LAND, width, height), lakes: rasterizeRings(EARTH_LAKES, width, height),
      glaciers: rasterizeRings(EARTH_GLACIERS, width, height), shelves: rasterizeRings(EARTH_ICE_SHELVES, width, height),
    };
    cache.set(key, m);
  }
  return m;
}

/** Apakah (lintang, bujur) derajat berada di daratan (bukan danau besar). */
export function isLandAt(latDeg: number, lonDeg: number, width: number = EARTH_TEXTURE.width, height: number = EARTH_TEXTURE.height): boolean {
  const m = earthMasks(width, height);
  const x = Math.min(width - 1, Math.max(0, Math.floor(((lonDeg + 180) / 360) * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(((90 - latDeg) / 180) * height)));
  return m.land[y * width + x] === 1 && m.lakes[y * width + x] === 0;
}

/** Wilayah iklim kasar (elips lintang/bujur) untuk gurun dan hutan hujan; hanya mewarnai daratan. */
interface Region { lat: number; lon: number; ry: number; rx: number }
const DESERTS: Region[] = [
  { lat: 23, lon: 10, ry: 8, rx: 28 }, { lat: 24, lon: 45, ry: 8, rx: 12 }, { lat: 41, lon: 100, ry: 5, rx: 16 },
  { lat: 27, lon: 71, ry: 4, rx: 4 }, { lat: -25, lon: 132, ry: 9, rx: 18 }, { lat: -24, lon: 20, ry: 6, rx: 8 },
  { lat: -23, lon: -69, ry: 8, rx: 2.5 }, { lat: -45, lon: -69, ry: 6, rx: 5 }, { lat: 37, lon: -115, ry: 5, rx: 6 },
  { lat: 30, lon: -107, ry: 4, rx: 6 }, { lat: 9, lon: 45, ry: 3, rx: 6 }, { lat: 33, lon: 55, ry: 5, rx: 8 },
];
const RAINFOREST: Region[] = [
  { lat: -5, lon: -62, ry: 10, rx: 14 }, { lat: 0, lon: 22, ry: 6, rx: 10 }, { lat: 1, lon: 110, ry: 7, rx: 20 },
  { lat: 20, lon: 100, ry: 8, rx: 6 }, { lat: -18, lon: 47, ry: 6, rx: 2 }, { lat: 7, lon: -77, ry: 4, rx: 3 },
];
function regionWeight(regions: Region[], lat: number, lon: number): number {
  let best = 0;
  for (const r of regions) {
    const d = Math.hypot((lat - r.lat) / r.ry, (lon - r.lon) / r.rx);
    if (d < 1.15) best = Math.max(best, 1 - smooth(0.55, 1.1, d));
  }
  return best;
}

const noise = createNoise3D(31415);
const f3 = (x: number, y: number, z: number, oct: number): number => fbm3(noise, x, y, z, oct);

const DEEP = hex(0x06265a), SHALLOW = hex(0x2377b4), LAKE = hex(0x3a86bd);
const GREEN = hex(0x3a8638), FOREST = hex(0x24632c), RAIN = hex(0x14501f), SAVANNA = hex(0x9b9a48);
const TAIGA = hex(0x2a5330), TUNDRA = hex(0x8c9068), SAND = hex(0xcdb26b), ROCK = hex(0x86745a), SNOW = hex(0xf3f7f9);
const SEA_ICE = hex(0xe3eef4);

/** Lukis tekstur Bumi ekuirektangular dari data geografi nyata (x = bujur -180..180, y = lintang 90..-90). */
export function paintEarth(width: number = EARTH_TEXTURE.width, height: number = EARTH_TEXTURE.height): TextureData {
  const m = earthMasks(width, height);
  const coast = blurMask(m.land, width, height, Math.max(2, Math.round(width / 256)));
  const data = new Uint8ClampedArray(width * height * 4);
  const c = [0, 0, 0];
  const tmp = [0, 0, 0];
  for (let y = 0; y < height; y++) {
    const latDeg = 90 - ((y + 0.5) / height) * 180;
    const lat = (latDeg * Math.PI) / 180;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    const al = Math.abs(latDeg);
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const lonDeg = ((x + 0.5) / width) * 360 - 180;
      const lon = (lonDeg * Math.PI) / 180;
      const px = cl * Math.cos(lon), pz = cl * Math.sin(lon);
      const isLand = m.land[i] === 1 && m.lakes[i] === 0;
      if (!isLand) {
        // Laut: gelap di tengah samudra, makin biru muda ke arah paparan benua; danau besar lebih terang
        if (m.lakes[i] === 1) mix(c, LAKE, SHALLOW, 0.3);
        else mix(c, DEEP, SHALLOW, smooth(0.02, 0.5, coast[i]) * 0.95 + 0.06 * noise(px * 3, sl * 3, pz * 3));
        // Es laut kutub (noise hanya dihitung di lintang tinggi): tutupan tidak beraturan di Arktik dan tepi Antarktika
        if (al > 62) {
          const edge = latDeg > 0 ? 76 + 4 * f3(px * 4 + 9, sl * 4, pz * 4, 3) : 67 + 3 * f3(px * 4 + 9, sl * 4, pz * 4, 3);
          mix(tmp, c, SEA_ICE, smooth(edge - 1.5, edge + 1.5, al) * 0.92);
        } else { tmp[0] = c[0]; tmp[1] = c[1]; tmp[2] = c[2]; }
        data[i * 4] = tmp[0]; data[i * 4 + 1] = tmp[1]; data[i * 4 + 2] = tmp[2];
        data[i * 4 + 3] = 255;
        continue;
      }
      const moist = f3(px * 3 + 20, sl * 3, pz * 3, 2);
      const relief = f3(px * 6 + 5, sl * 6, pz * 6, 2);
      // Batas iklim dibengkokkan noise agar tidak berbentuk elips atau pita lurus
      const wLat = latDeg + 7 * moist, wLon = lonDeg + 10 * relief, wAl = Math.abs(wLat);
      mix(c, GREEN, FOREST, smooth(-0.15, 0.2, moist));
      // Tropis kering (sabana) di sabuk lintang rendah-menengah
      mix(c, c.slice(), SAVANNA, smooth(5, 14, wAl) * (1 - smooth(22, 33, wAl)) * smooth(-0.1, 0.25, -moist));
      mix(c, c.slice(), RAIN, regionWeight(RAINFOREST, wLat, wLon) * 0.9);
      // Hutan boreal (taiga) lalu tundra ke arah kutub
      mix(c, c.slice(), TAIGA, smooth(48, 56, wAl) * (1 - smooth(64, 70, wAl)));
      mix(c, c.slice(), TUNDRA, smooth(62, 71, wAl));
      // Gurun besar
      const desert = regionWeight(DESERTS, wLat, wLon);
      mix(c, c.slice(), SAND, desert * (0.55 + 0.4 * smooth(-0.2, 0.3, relief)));
      mix(c, c.slice(), ROCK, desert * smooth(0.25, 0.55, relief) * 0.6);
      // Pegunungan dan batuan terbuka
      mix(c, c.slice(), ROCK, smooth(0.28, 0.5, relief) * 0.45);
      // Es: gletser nyata, lapisan es, dan seluruh Antarktika
      if (m.glaciers[i] === 1 || m.shelves[i] === 1 || latDeg < -62) mix(c, c.slice(), SNOW, 0.9 + 0.1 * noise(px * 8, sl * 8, pz * 8));
      if (al > 78) mix(c, c.slice(), SNOW, smooth(78, 83, al) * 0.7);
      data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2];
      data[i * 4 + 3] = 255;
    }
  }
  return { width, height, data };
}
