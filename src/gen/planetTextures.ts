import { paintEarth } from './earthMap';
import { createNoise3D, fbm3 } from './noise';

export type Rgb = [number, number, number];

export interface TextureData {
  width: number;
  height: number;
  /** RGBA, 4 byte per piksel (ekuirektangular: x = bujur, y = lintang). */
  data: Uint8ClampedArray;
}

type Painter = (x: number, y: number, z: number, lat: number, lon: number, out: number[]) => void;

const noise = createNoise3D(20260);
const f3 = (x: number, y: number, z: number, oct = 4): number => fbm3(noise, x, y, z, oct);

const hex = (h: number): Rgb => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mixInto = (out: number[], a: ArrayLike<number>, b: ArrayLike<number>, t: number): void => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
};
const ramp = (stops: Rgb[], t: number, out: number[]): void => {
  const n = stops.length - 1;
  const x = clamp01(t) * n;
  const i = Math.min(n - 1, Math.floor(x));
  mixInto(out, stops[i], stops[i + 1], x - i);
};
const wrapPi = (d: number): number => {
  let v = d;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
};

/**
 * Lukis tekstur bola ekuirektangular. Noise dipetakan di permukaan bola 3D sehingga tidak ada sambungan atau
 * kerut kutub. Murni (tanpa DOM): hasilnya dapat diuji, lalu dibungkus menjadi CanvasTexture di planets.ts.
 */
export function paintSphere(width: number, height: number, fn: Painter, alpha = false): TextureData {
  const data = new Uint8ClampedArray(width * height * 4);
  const out = [0, 0, 0, 255];
  for (let y = 0; y < height; y++) {
    const lat = (0.5 - (y + 0.5) / height) * Math.PI;
    const cl = Math.cos(lat), sl = Math.sin(lat);
    for (let x = 0; x < width; x++) {
      const lon = ((x + 0.5) / width) * Math.PI * 2;
      out[3] = 255;
      fn(cl * Math.cos(lon), sl, cl * Math.sin(lon), lat, lon, out);
      const i = (y * width + x) * 4;
      data[i] = out[0];
      data[i + 1] = out[1];
      data[i + 2] = out[2];
      data[i + 3] = alpha ? out[3] : 255;
    }
  }
  return { width, height, data };
}


/** Resep tekstur per benda langit (warna dan pola hanya visual; tidak memuat fakta sains di dalam game). */
const RECIPES: Record<string, () => TextureData> = {
  mercury: () => {
    const dark = hex(0x4d4843), base = hex(0x8f8982);
    return paintSphere(512, 256, (x, y, z, _la, _lo, o) => {
      mixInto(o, dark, base, clamp01(0.55 + f3(x * 3.2, y * 3.2, z * 3.2, 5) * 1.1 + f3(x * 12 + 5, y * 12, z * 12, 3) * 0.35));
      const c = f3(x * 16 + 3, y * 16 + 3, z * 16, 2);
      if (c > 0.28) mixInto(o, o.slice(), [210, 205, 198], smooth(0.28, 0.5, c) * 0.35);
    });
  },
  venus: () => {
    const stops = [hex(0xc8964e), hex(0xe2bb78), hex(0xf0d9a0), hex(0xd9a965)];
    return paintSphere(512, 256, (x, y, z, _la, _lo, o) => {
      const q = f3(x * 1.6, y * 3.5, z * 1.6, 3);
      ramp(stops, 0.5 + f3(x * 2.2 + q * 1.6, y * 6 + q * 2.4, z * 2.2 + q * 1.6, 4) * 1.1, o);
    });
  },
  // Bumi memakai geografi dunia nyata (benua, pulau, danau, gletser, kutub): lihat earthMap.ts.
  earth: () => paintEarth(),
  earthClouds: () =>
    paintSphere(768, 384, (x, y, z, _la, _lo, o) => {
      const n = f3(x * 2.6 + 40, y * 3.6, z * 2.6, 5) + 0.12 * f3(x * 8, y * 8, z * 8, 2);
      o[0] = o[1] = o[2] = 255;
      o[3] = 255 * smooth(0.02, 0.38, n) * 0.92;
    }, true),
  moon: () => {
    const dark = hex(0x5d5f66), base = hex(0xb6b8bf), mare = hex(0x70727a);
    return paintSphere(512, 256, (x, y, z, _la, _lo, o) => {
      const n = f3(x * 3, y * 3, z * 3, 5);
      mixInto(o, dark, base, clamp01(0.55 + n * 1.0 + f3(x * 11 + 2, y * 11, z * 11, 3) * 0.3));
      mixInto(o, o.slice(), mare, smooth(0.15, 0.4, f3(x * 1.3 + 9, y * 1.3, z * 1.3, 3)) * 0.65);
      const c = f3(x * 18 + 3, y * 18 + 3, z * 18, 2);
      if (c > 0.3) mixInto(o, o.slice(), [226, 228, 232], smooth(0.3, 0.5, c) * 0.4);
    });
  },
  mars: () => {
    const dark = hex(0x6b3825), base = hex(0xb9582f), light = hex(0xd88a58);
    return paintSphere(512, 256, (x, y, z, lat, _lo, o) => {
      const n = f3(x * 2.1, y * 2.1, z * 2.1, 5);
      mixInto(o, dark, base, smooth(-0.15, 0.22, n));
      mixInto(o, o.slice(), light, smooth(0.25, 0.5, f3(x * 5 + 9, y * 5, z * 5, 3)) * 0.6);
      const f = f3(x * 14, y * 14, z * 14, 2) * 0.12;
      o[0] *= 1 + f;
      o[1] *= 1 + f;
      o[2] *= 1 + f;
      mixInto(o, o.slice(), hex(0xf1ece6), smooth(1.38 + 0.05 * n, 1.46 + 0.05 * n, Math.abs(lat)));
    });
  },
  jupiter: () => {
    const stops = [hex(0xf0e4cb), hex(0xd8b88a), hex(0xb77f52), hex(0xe9d3a9), hex(0xa06f46), hex(0xdcc196)];
    const red = hex(0xb23d28);
    return paintSphere(512, 256, (x, y, z, lat, lon, o) => {
      const warp = f3(x * 3, y * 1.2, z * 3, 4) * 1.3;
      ramp(stops, Math.sin(lat * 10.5 + warp) * 0.5 + 0.5 + f3(x * 6, y * 42, z * 6, 3) * 0.16, o);
      const d = Math.hypot((wrapPi(lon - 3.7) * Math.cos(lat)) / 0.3, (lat + 0.42) / 0.15);
      if (d < 1.15) mixInto(o, o.slice(), red, clamp01(1.1 - d) ** 0.55 * (0.8 + f3(x * 9, y * 14, z * 9, 3) * 0.5));
    });
  },
  saturn: () => {
    const stops = [hex(0xe8d7a6), hex(0xcdb27c), hex(0xdfc995), hex(0xb89c66), hex(0xe3cf9f)];
    return paintSphere(512, 256, (x, y, z, lat, _lo, o) => {
      ramp(stops, Math.sin(lat * 15 + f3(x * 2.2, y * 0.8, z * 2.2, 3) * 0.7) * 0.5 + 0.5 + f3(x * 5, y * 30, z * 5, 3) * 0.1, o);
    });
  },
  uranus: () => {
    const a = hex(0x8fd0d6), b = hex(0xb4e6ea);
    return paintSphere(512, 256, (x, y, z, lat, _lo, o) => {
      mixInto(o, a, b, (Math.sin(lat * 7 + f3(x * 2, y, z * 2, 3)) * 0.5 + 0.5) * 0.8 + f3(x * 4, y * 8, z * 4, 3) * 0.12);
    });
  },
  neptune: () => {
    const a = hex(0x2a49c4), b = hex(0x4a78ee), spot = hex(0x15268a);
    return paintSphere(512, 256, (x, y, z, lat, lon, o) => {
      mixInto(o, a, b, (Math.sin(lat * 9 + f3(x * 2.5, y * 1.2, z * 2.5, 4) * 1.4) * 0.5 + 0.5) * 0.85);
      const d = Math.hypot((wrapPi(lon - 1.3) * Math.cos(lat)) / 0.28, (lat + 0.4) / 0.14);
      if (d < 1) mixInto(o, o.slice(), spot, (1 - d) ** 0.6 * 0.85);
      mixInto(o, o.slice(), [225, 235, 255], smooth(0.42, 0.62, f3(x * 3 + 9, y * 12, z * 3, 3)) * 0.55);
    });
  },
};

export type PlanetKey = 'mercury' | 'venus' | 'earth' | 'earthClouds' | 'moon' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
export const PLANET_KEYS = Object.keys(RECIPES) as PlanetKey[];

const cache = new Map<PlanetKey, TextureData>();

/** Tekstur planet (dibuat sekali lalu disimpan; deterministik). */
export function planetTexture(key: PlanetKey): TextureData {
  let t = cache.get(key);
  if (!t) {
    t = RECIPES[key]();
    cache.set(key, t);
  }
  return t;
}

/** Cincin planet: profil 1 dimensi (jari-jari) menjadi warna dan alpha, dengan celah seperti cincin Saturnus. */
export function ringTextureData(width = 512): TextureData {
  const data = new Uint8ClampedArray(width * 4 * 4);
  for (let x = 0; x < width; x++) {
    const t = x / (width - 1);
    let a: number;
    if (t < 0.16) a = 0.12 + (0.1 * t) / 0.16;
    else if (t < 0.5) a = 0.78 + 0.16 * Math.sin(t * 90);
    else if (t < 0.57) a = 0.04;
    else if (t < 0.93) a = 0.6 + 0.12 * Math.sin(t * 130);
    else a = 0.08;
    a *= 0.82 + 0.18 * noise(t * 70, 1.3, 0.7);
    const shade = 170 + 70 * (0.5 + 0.5 * noise(t * 40, 3.1, 2.2));
    for (let y = 0; y < 4; y++) {
      const i = (y * width + x) * 4;
      data[i] = shade;
      data[i + 1] = shade * 0.92;
      data[i + 2] = shade * 0.78;
      data[i + 3] = clamp01(a) * 255;
    }
  }
  return { width, height: 4, data };
}
