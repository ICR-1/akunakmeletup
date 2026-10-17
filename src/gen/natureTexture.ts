import * as THREE from 'three';
import { createRng, rngRange } from '../core/rng';
import { periodicFbm, periodicNoise } from './terrainTexture';

/**
 * Tekstur alam prosedural untuk pulau peluncuran (Penerbangan): rumput/tanah/pasir, air laut, dan beton landasan.
 * Semua digambar dari noise periodik berseed (tanpa berkas gambar). Peta berupa abu-abu dengan rata-rata cahaya linear
 * `MAP_MEAN_LINEAR`; material mengalikan warna vertex dengan `MAP_BOOST` agar kecerahan keseluruhan tetap sama dan peta
 * hanya menambah detail.
 */
export const NATURE_TEXTURE_SIZE = 512;
export const MAP_MEAN_LINEAR = 0.5;
export const MAP_BOOST = 1 / MAP_MEAN_LINEAR;
/** Panjang sisi satu ubin di dunia (m). */
export const GROUND_TILE_M = 9;
export const WATER_TILE_M = 40;
/** Anisotropi tanah: tanah luas dilihat miring dari kamera rendah, jadi tanpa ini tampak buram (GPU nyata murah). */
export const GROUND_ANISOTROPY = 4;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const toSrgb = (linear: number): number => Math.round(255 * Math.pow(clamp01(linear), 1 / 2.2));

function hash2(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Ubah kanal cahaya linear (sekitar MAP_MEAN_LINEAR) menjadi RGBA abu-abu sRGB. */
function toRgba(light: Float32Array, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < light.length; i++) {
    const g = toSrgb(light[i]);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = g;
    out[i * 4 + 3] = 255;
  }
  return out;
}

function stroke(light: Float32Array, size: number, x: number, y: number, angle: number, len: number, delta: number): void {
  const dx = Math.sin(angle), dy = -Math.cos(angle);
  for (let s = 0; s < len; s++) {
    const px = (((Math.round(x + dx * s)) % size) + size) % size;
    const py = (((Math.round(y + dy * s)) % size) + size) % size;
    const taper = 1 - s / len;
    light[py * size + px] += delta * (0.4 + 0.6 * taper);
  }
}

/** Rumput, tanah, dan butiran: bercak halus, helai rumput pendek, kerikil, dan butir halus. */
export function generateGroundMap(seed = 1, size = NATURE_TEXTURE_SIZE): Uint8ClampedArray {
  const rng = createRng((seed ^ 0x67726173) >>> 0);
  const light = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const patches = periodicFbm(u, v, 4, 4, seed) - 0.5;
      const mid = periodicNoise(u * 48, v * 48, 48, seed + 3) - 0.5;
      const grain = hash2(x, y, seed + 9) - 0.5;
      light[y * size + x] = MAP_MEAN_LINEAR + patches * 0.5 + mid * 0.2 + grain * 0.16;
    }
  }
  for (let i = 0; i < size * 5; i++) {
    stroke(light, size, rng() * size, rng() * size, rngRange(rng, -0.6, 0.6), rngRange(rng, 6, 16), rngRange(rng, -0.26, 0.3));
  }
  for (let i = 0; i < 70; i++) {
    const cx = rng() * size, cy = rng() * size, r = rngRange(rng, 1.2, 3.2);
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.hypot(dx, dy) / r;
        if (d > 1.3) continue;
        const px = (((Math.round(cx + dx)) % size) + size) % size, py = (((Math.round(cy + dy)) % size) + size) % size;
        light[py * size + px] += d < 1 ? -0.14 * (1 - d * d) + (dx + dy < 0 ? 0.05 : 0) : 0.05;
      }
    }
  }
  return toRgba(light, size);
}

/** Air: riak berupa garis terang tipis (seperti pantulan cahaya) di atas gelombang lebar; periodik. */
export function generateWaterMap(seed = 1, size = NATURE_TEXTURE_SIZE): Uint8ClampedArray {
  const light = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const warp = periodicFbm(u, v, 3, 3, seed + 21) - 0.5;
      const ripple = Math.abs(periodicFbm(u + warp * 0.18, v + warp * 0.12, 6, 3, seed) - 0.5) * 2;
      const line = 1 - smoothstep(0.0, 0.14, ripple);
      const swell = periodicFbm(u, v, 2, 3, seed + 55) - 0.5;
      light[y * size + x] = MAP_MEAN_LINEAR - 0.07 + line * 0.22 + swell * 0.18 + (hash2(x, y, seed + 4) - 0.5) * 0.03;
    }
  }
  return toRgba(light, size);
}

/** Beton landasan: butiran, noda, dan sambungan pelat membentuk kisi 4 x 4 di seluruh ubin; plus beberapa retakan. */
export function generateConcreteMap(seed = 1, size = NATURE_TEXTURE_SIZE): Uint8ClampedArray {
  const rng = createRng((seed ^ 0x636f6e63) >>> 0);
  const light = new Float32Array(size * size);
  const cell = size / 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const stain = periodicFbm(u, v, 3, 4, seed) - 0.5;
      const grain = hash2(x, y, seed + 2) - 0.5;
      const speck = periodicNoise(u * 64, v * 64, 64, seed + 8) - 0.5;
      let l = MAP_MEAN_LINEAR + stain * 0.22 + grain * 0.07 + speck * 0.06;
      const ex = Math.min(x % cell, cell - (x % cell)), ey = Math.min(y % cell, cell - (y % cell));
      if (Math.min(ex, ey) < 1.6) l -= 0.2;
      else if (Math.min(ex, ey) < 3.2) l -= 0.04;
      light[y * size + x] = l;
    }
  }
  for (let i = 0; i < 14; i++) {
    let x = rng() * size, y = rng() * size, a = rng() * Math.PI * 2;
    for (let s = 0; s < rngRange(rng, 20, 60); s++) {
      a += rngRange(rng, -0.4, 0.4);
      x += Math.cos(a); y += Math.sin(a);
      const px = ((Math.round(x) % size) + size) % size, py = ((Math.round(y) % size) + size) % size;
      light[py * size + px] -= 0.16;
    }
  }
  return toRgba(light, size);
}

function dataTexture(data: Uint8ClampedArray, size: number, repeat: boolean, anisotropy = 1): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(data.buffer.slice(0)), size, size, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.needsUpdate = true;
  return t;
}

export interface NatureTextures { ground: THREE.DataTexture; water: THREE.DataTexture; concrete: THREE.DataTexture }

let cached: NatureTextures | null = null;

/** Tekstur alam (dibuat sekali lalu dibagi). Tidak butuh DOM. */
export function natureTextures(seed = 1): NatureTextures {
  cached ??= {
    ground: dataTexture(generateGroundMap(seed), NATURE_TEXTURE_SIZE, true, GROUND_ANISOTROPY),
    water: dataTexture(generateWaterMap(seed), NATURE_TEXTURE_SIZE, true),
    concrete: dataTexture(generateConcreteMap(seed), NATURE_TEXTURE_SIZE, false),
  };
  return cached;
}
