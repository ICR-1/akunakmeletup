import * as THREE from 'three';
import { createRng, rngRange, type Rng } from '../core/rng';
import { registerDetailMaterial } from './detail';
import { terrainMaterial } from './terrain';

export { TERRAIN_TILE_M } from './terrain';

/**
 * Tekstur permukaan Bulan/Mars yang digambar kode (tanpa berkas gambar): butiran regolit halus, bercak, kawah kecil
 * dan kerikil untuk Bulan, serta riak pasir dan bebatuan untuk Mars. Dibuat dapat disambung (periodik) agar ubin tidak
 * terlihat sambungannya. Dipakai sebagai peta warna (abu-abu pengali warna vertex) dan peta tonjolan (bump).
 */
export type SurfaceKind = 'moon' | 'mars';

export interface SurfaceMaps {
  size: number;
  /** RGBA abu-abu 0-255 (pengali warna terrain). */
  albedo: Uint8ClampedArray;
  /** RGBA abu-abu 0-255 (tinggi, untuk bump). */
  height: Uint8ClampedArray;
}

export const TERRAIN_TEXTURE_SIZE = 512;

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (t: number): number => t * t * (3 - 2 * t);

function hash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Noise nilai periodik (periode `per` sel pada kedua sumbu): nilai 0-1, tanpa sambungan di tepi ubin. */
export function periodicNoise(x: number, y: number, per: number, seed: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = smooth(x - x0), fy = smooth(y - y0);
  const w = (v: number): number => ((v % per) + per) % per;
  const a = hash(w(x0), w(y0), seed), b = hash(w(x0 + 1), w(y0), seed);
  const c = hash(w(x0), w(y0 + 1), seed), d = hash(w(x0 + 1), w(y0 + 1), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

export function periodicFbm(u: number, v: number, basePer: number, octaves: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0, per = basePer;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicNoise(u * per, v * per, per, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    per *= 2;
  }
  return sum / norm;
}

/** Tambahkan satu kawah (bentuk mangkuk + pematang) ke medan tinggi dengan pembungkusan di tepi ubin. */
function stampCrater(h: Float32Array, size: number, cx: number, cy: number, r: number, depth: number): void {
  const reach = Math.ceil(r * 1.5);
  for (let dy = -reach; dy <= reach; dy++) {
    for (let dx = -reach; dx <= reach; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d > 1.5) continue;
      const bowl = d < 1 ? -depth * (1 - d * d) : 0;
      const rim = depth * 0.35 * Math.exp(-(((d - 1.05) / 0.22) ** 2));
      const x = ((cx + dx) % size + size) % size, y = ((cy + dy) % size + size) % size;
      h[y * size + x] += bowl + rim;
    }
  }
}

/** Peta tekstur permukaan deterministik dari seed; murni (tanpa DOM) sehingga bisa diuji. */
export function generateSurfaceMaps(kind: SurfaceKind, seed = 1, size: number = TERRAIN_TEXTURE_SIZE): SurfaceMaps {
  const rng: Rng = createRng((seed ^ (kind === 'mars' ? 0x6d617273 : 0x6d6f6f6e)) >>> 0);
  const h = new Float32Array(size * size);
  const mars = kind === 'mars';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let val = 0.5 * periodicFbm(u, v, 8, 5, seed) + 0.35 * periodicFbm(u, v, 32, 3, seed + 91) + 0.15 * periodicNoise(u * 128, v * 128, 128, seed + 7);
      if (mars) {
        // Riak pasir: gelombang yang dibengkokkan noise, periodik (frekuensi bulat per ubin)
        const warp = periodicFbm(u, v, 4, 3, seed + 33);
        val = val * 0.7 + 0.3 * (0.5 + 0.5 * Math.sin((v * 14 + warp * 3) * Math.PI * 2));
      }
      h[y * size + x] = val;
    }
  }
  const craters = mars ? 12 : 26;
  for (let i = 0; i < craters; i++) {
    const r = rngRange(rng, 4, mars ? 18 : 30) * (rng() < 0.25 ? 1.8 : 1);
    stampCrater(h, size, Math.floor(rng() * size), Math.floor(rng() * size), r, r * (mars ? 0.012 : 0.015));
  }
  // Kerikil: tonjolan kecil acak
  for (let i = 0; i < (mars ? 260 : 180); i++) stampCrater(h, size, Math.floor(rng() * size), Math.floor(rng() * size), rngRange(rng, 1.2, 3), -rngRange(rng, 0.012, 0.03));
  let lo = Infinity, hi = -Infinity;
  for (const v of h) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  const span = hi - lo || 1;
  const albedo = new Uint8ClampedArray(size * size * 4);
  const height = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const n = clamp01((h[i] - lo) / span);
      // Pencahayaan palsu dari kemiringan (arah barat laut) memberi kedalaman pada kawah dan riak
      const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x - 1 + size) % size)];
      const dy = h[((y + 1) % size) * size + x] - h[((y - 1 + size) % size) * size + x];
      const shade = clamp01(0.5 - (dx + dy) * (mars ? 9 : 7) / span * 0.5);
      const a = clamp01(0.62 + 0.28 * n + 0.22 * (shade - 0.5) + (hash(x, y, seed + 5) - 0.5) * 0.07);
      const o = i * 4;
      albedo[o] = albedo[o + 1] = albedo[o + 2] = a * 255;
      albedo[o + 3] = 255;
      height[o] = height[o + 1] = height[o + 2] = n * 255;
      height[o + 3] = 255;
    }
  }
  return { size, albedo, height };
}

const cache = new Map<SurfaceKind, { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }>();

function toTexture(data: Uint8ClampedArray, size: number, srgb: boolean): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D tidak tersedia');
  g.putImageData(new ImageData(new Uint8ClampedArray(data), size, size), 0, 0);
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 1; // anisotropi tinggi sangat mahal pada rasterizer software; ubin kecil tetap tajam berkat mipmap
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Tekstur permukaan (albedo dan bump) satu destinasi; dibuat sekali lalu di-cache. Dipakai juga oleh pemuatan awal. Butuh DOM. */
export function surfaceTextures(kind: SurfaceKind): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  let entry = cache.get(kind);
  if (!entry) {
    const maps = generateSurfaceMaps(kind);
    entry = { map: toTexture(maps.albedo, maps.size, true), bump: toTexture(maps.height, maps.size, false) };
    cache.set(kind, entry);
  }
  return entry;
}

/** Pasang tekstur permukaan destinasi pada material terrain bersama (di-cache per jenis). Butuh DOM. */
export function applyTerrainTextures(kind: SurfaceKind, bump = true): void {
  const entry = surfaceTextures(kind);
  const hadBump = terrainMaterial.bumpMap !== null;
  const hadMap = terrainMaterial.map !== null;
  terrainMaterial.map = entry.map;
  terrainMaterial.bumpMap = bump ? entry.bump : null;
  terrainMaterial.bumpScale = kind === 'mars' ? 1.6 : 1.2;
  if (!hadMap || hadBump !== bump) terrainMaterial.needsUpdate = true;
}

const rockMaterials = new Map<SurfaceKind, { mat: THREE.MeshStandardMaterial; bump: THREE.Texture }>();

/**
 * Batu sebaran memakai tekstur permukaan yang sama dengan daratan (diulang lebih rapat) beserta bump agar warna dan
 * butirannya selaras, bukan warna polos. Material di-cache per jenis; flat shading mengikuti tingkat detail. Butuh DOM.
 */
export function applyRockTexture(rocks: THREE.InstancedMesh, kind: SurfaceKind, bump = true): void {
  let entry = rockMaterials.get(kind);
  if (!entry) {
    applyTerrainTextures(kind, true);
    const tex = cache.get(kind)!;
    const map = tex.map.clone();
    map.repeat.set(ROCK_TEXTURE_REPEAT, ROCK_TEXTURE_REPEAT);
    map.needsUpdate = true;
    const bumpMap = tex.bump.clone();
    bumpMap.repeat.set(ROCK_TEXTURE_REPEAT, ROCK_TEXTURE_REPEAT);
    bumpMap.needsUpdate = true;
    const mat = registerDetailMaterial(new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0.05, map, bumpMap, bumpScale: 2.2,
    }));
    entry = { mat, bump: bumpMap };
    rockMaterials.set(kind, entry);
  }
  const had = entry.mat.bumpMap !== null;
  entry.mat.bumpMap = bump ? entry.bump : null;
  if (had !== bump) entry.mat.needsUpdate = true;
  rocks.material = entry.mat;
}

/** Berapa kali tekstur diulang pada satu batu (UV bola 0-1): lebih rapat dari daratan agar butirannya halus. */
const ROCK_TEXTURE_REPEAT = 2;
