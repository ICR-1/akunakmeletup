import * as THREE from 'three';
import { createRng, rngRange, type Rng } from '../core/rng';
import { DETAIL, getDetail, isHigh } from './detail';
import { createNoise2D, fbm } from './noise';


export interface Crater { x: number; z: number; r: number }

export interface TerrainOptions {
  seed: number;
  /** Palet destinasi: [dasar, aksen/langit, gelap]. */
  palette: string[];
  size?: number;
  cells?: number;
  /** Amplitudo bukit (meter). */
  amplitude?: number;
  craterCount?: number;
  /** Radius area datar di sekitar hub (meter). */
  hubClearRadius?: number;
  /** Seberapa jauh tepi cakram turun dari tengah (meter): lengkung benda langit yang bulat. */
  edgeDropM?: number;
}

export interface Terrain {
  /** Grup berisi chunk terrain (frustum culling per chunk). */
  mesh: THREE.Group;
  chunks: THREE.Mesh[];
  size: number;
  craters: Crater[];
  heightAt(x: number, z: number): number;
  /** Kemiringan (0 = datar, 1 = 45 derajat) di titik x, z. */
  slopeAt(x: number, z: number): number;
  dispose(): void;
}

/**
 * Terrain memakai normal muka eksplisit (geometri non-indexed, jadi tiap segitiga rata) alih-alih
 * flatShading berbasis turunan layar: segitiga besar di dekat kamera menghasilkan artefak gelap di
 * beberapa rasterizer. Tampilan tetap faceted.
 */
export const terrainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: false, roughness: 0.9, metalness: 0.05 });

/** Ukuran satu ubin tekstur permukaan di dunia (meter); koordinat UV = posisi dunia / ukuran ini. */
export const TERRAIN_TILE_M = 14;

/** Terrain dipecah CHUNKS x CHUNKS mesh agar bagian di luar pandangan tidak digambar (mitigasi performa PRD 16). */
const CHUNKS = 4;

const DEFAULTS = { size: 800, cells: 160, amplitude: 7, craterCount: 26, hubClearRadius: 28, edgeDropM: 36 };
/** Tepi cakram menggelap mulai dari fraksi radius ini dan sebesar ini di ujungnya (kabut tepi planet). */
const EDGE_SHADE_START = 0.78;
const EDGE_SHADE_STRENGTH = 0.8;
const NOISE_SCALE = 0.012;
const CRATER_MIN_R = 14;
const CRATER_MAX_R = 55;
const CRATER_DEPTH_RATIO = 0.26;
const CRATER_RIM_RATIO = 0.3;
const CRATER_RIM_WIDTH = 0.16;
const CRATER_MIN_HUB_DIST = 70;
const BRIGHTNESS_JITTER = 0.07;
const SLOPE_ROCK_START = 0.18;
const SLOPE_ROCK_FULL = 0.55;
const SLOPE_SAMPLE = 2;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function placeCraters(rng: Rng, count: number, size: number): Crater[] {
  const craters: Crater[] = [];
  let guard = 0;
  while (craters.length < count && guard++ < count * 40) {
    const r = rngRange(rng, CRATER_MIN_R, CRATER_MAX_R);
    const x = rngRange(rng, -size / 2 + r, size / 2 - r);
    const z = rngRange(rng, -size / 2 + r, size / 2 - r);
    if (Math.hypot(x, z) + r > size / 2) continue;
    if (Math.hypot(x, z) - r < CRATER_MIN_HUB_DIST) continue;
    if (craters.some((c) => Math.hypot(c.x - x, c.z - z) < (c.r + r) * 0.9)) continue;
    craters.push({ x, z, r });
  }
  return craters;
}

/** Terrain low-poly: grid berseed dengan bukit noise, kawah, area datar di hub, warna per segitiga. */
export function createTerrain(opts: TerrainOptions): Terrain {
  const size = opts.size ?? DEFAULTS.size;
  const cells = opts.cells ?? Math.round(DEFAULTS.cells * DETAIL.terrainMul[getDetail()]);
  const smooth = isHigh();
  const amplitude = opts.amplitude ?? DEFAULTS.amplitude;
  const clear = opts.hubClearRadius ?? DEFAULTS.hubClearRadius;
  const rng = createRng(opts.seed);
  const noise = createNoise2D(opts.seed ^ 0x5bd1e995);
  const craters = placeCraters(rng, opts.craterCount ?? DEFAULTS.craterCount, size);
  const step = size / cells;
  const half = size / 2;
  const n = cells + 1;
  const curve = (opts.edgeDropM ?? DEFAULTS.edgeDropM) / (half * half);
  const edgeShade = (x: number, z: number): number => 1 - EDGE_SHADE_STRENGTH * smoothstep(half * EDGE_SHADE_START, half, Math.hypot(x, z));

  const rawHeight = (x: number, z: number): number => {
    let h = fbm(noise, x * NOISE_SCALE, z * NOISE_SCALE, 4) * amplitude;
    for (const c of craters) {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > c.r * 1.8) continue;
      const depth = c.r * CRATER_DEPTH_RATIO;
      if (d < c.r) h -= depth * (1 - (d / c.r) ** 2);
      const rim = (d - c.r) / (c.r * CRATER_RIM_WIDTH);
      h += depth * CRATER_RIM_RATIO * Math.exp(-rim * rim);
    }
    // Lengkung planet: permukaan turun halus ke tepi cakram
    const away = smoothstep(clear, clear * 2.4, Math.hypot(x, z));
    return h * away - curve * (x * x + z * z) * away;
  };

  const heights = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) heights[j * n + i] = rawHeight(i * step - half, j * step - half);

  const heightAt = (x: number, z: number): number => {
    const gx = Math.min(cells - 1e-6, Math.max(0, (x + half) / step));
    const gz = Math.min(cells - 1e-6, Math.max(0, (z + half) / step));
    const i = Math.floor(gx), j = Math.floor(gz);
    const fx = gx - i, fz = gz - j;
    const ha = heights[j * n + i], hb = heights[j * n + i + 1];
    const hc = heights[(j + 1) * n + i], hd = heights[(j + 1) * n + i + 1];
    return fx + fz <= 1 ? ha + (hb - ha) * fx + (hc - ha) * fz : hd + (hc - hd) * (1 - fx) + (hb - hd) * (1 - fz);
  };
  const slopeAt = (x: number, z: number): number => {
    const dx = heightAt(x + SLOPE_SAMPLE, z) - heightAt(x - SLOPE_SAMPLE, z);
    const dz = heightAt(x, z + SLOPE_SAMPLE) - heightAt(x, z - SLOPE_SAMPLE);
    return Math.hypot(dx, dz) / (2 * SLOPE_SAMPLE);
  };

  // Warna: dasar dari palet (digelapkan), dataran tinggi lebih terang, lereng curam lebih gelap.
  const base = new THREE.Color(opts.palette[0]).multiplyScalar(0.62);
  const bright = new THREE.Color(opts.palette[0]).multiplyScalar(0.95);
  const rock = new THREE.Color(opts.palette[2] ?? opts.palette[0]).multiplyScalar(0.55);
  const color = new THREE.Color();
  const colorRng = createRng(opts.seed ^ 0x27d4eb2f);
  // Detail tinggi: warna dan normal per titik grid (shading mulus tanpa facet), jitter warna per titik.
  const nodeJitter = new Float32Array(n * n);
  if (smooth) for (let k = 0; k < nodeJitter.length; k++) nodeJitter[k] = (colorRng() - 0.5) * 2 * BRIGHTNESS_JITTER;
  const hAt = (i: number, j: number): number => heights[Math.min(cells, Math.max(0, j)) * n + Math.min(cells, Math.max(0, i))];

  const chunkCells = Math.ceil(cells / CHUNKS);
  const group = new THREE.Group();
  group.name = 'terrain';
  const chunks: THREE.Mesh[] = [];

  for (let cj = 0; cj < CHUNKS; cj++) {
    for (let ci = 0; ci < CHUNKS; ci++) {
      const i0 = ci * chunkCells, i1 = Math.min(cells, i0 + chunkCells);
      const j0 = cj * chunkCells, j1 = Math.min(cells, j0 + chunkCells);
      if (i0 >= i1 || j0 >= j1) continue;
      const count = (i1 - i0) * (j1 - j0) * 6;
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const normals = new Float32Array(count * 3);
      const uvs = new Float32Array(count * 2);
      let vi = 0;
      /** Posisi titik grid; titik di luar cakram dijepit ke lingkar tepi sehingga siluet tanah benar-benar bulat. */
      const place = (gi: number, gj: number, h: number): [number, number, number] => {
        let x = gi * step - half, z = gj * step - half;
        const r = Math.hypot(x, z);
        if (r <= half) return [x, h, z];
        x *= half / r; z *= half / r;
        return [x, heightAt(x, z), z];
      };
      const outside = (gi: number, gj: number): boolean => Math.hypot(gi * step - half, gj * step - half) > half;
      const pushSmooth = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number): void => {
        if (outside(ax, az) && outside(bx, bz) && outside(cx, cz)) return;
        for (const [gi, gj] of [[ax, az], [bx, bz], [cx, cz]]) {
          const h = hAt(gi, gj);
          const [px, py, pz] = place(gi, gj, h);
          const dx = hAt(gi - 1, gj) - hAt(gi + 1, gj);
          const dz = hAt(gi, gj - 1) - hAt(gi, gj + 1);
          const len = Math.hypot(dx, 2 * step, dz);
          normals[vi * 3] = dx / len;
          normals[vi * 3 + 1] = (2 * step) / len;
          normals[vi * 3 + 2] = dz / len;
          const slope = Math.hypot(dx, dz) / (2 * step);
          color.copy(base).lerp(bright, Math.min(1, Math.max(0, (h / amplitude + 1) / 2)));
          color.lerp(rock, smoothstep(SLOPE_ROCK_START, SLOPE_ROCK_FULL, slope));
          color.multiplyScalar((1 + nodeJitter[gj * n + gi]) * edgeShade(px, pz));
          positions[vi * 3] = px;
          positions[vi * 3 + 1] = py;
          positions[vi * 3 + 2] = pz;
          uvs[vi * 2] = px / TERRAIN_TILE_M;
          uvs[vi * 2 + 1] = pz / TERRAIN_TILE_M;
          colors[vi * 3] = color.r;
          colors[vi * 3 + 1] = color.g;
          colors[vi * 3 + 2] = color.b;
          vi++;
        }
      };
      const pushTri = (ax: number, az: number, bx: number, bz: number, cx: number, cz: number): void => {
        if (smooth) { pushSmooth(ax, az, bx, bz, cx, cz); return; }
        if (outside(ax, az) && outside(bx, bz) && outside(cx, cz)) return;
        const pts: [number, number, number][] = [
          [ax, heights[az * n + ax], az], [bx, heights[bz * n + bx], bz], [cx, heights[cz * n + cx], cz],
        ];
        const mid = pts.reduce((sum, p) => sum + p[1], 0) / 3;
        const slope = Math.hypot(pts[1][1] - pts[0][1], pts[2][1] - pts[0][1]) / step;
        const heightT = Math.min(1, Math.max(0, (mid / amplitude + 1) / 2));
        color.copy(base).lerp(bright, heightT);
        color.lerp(rock, smoothstep(SLOPE_ROCK_START, SLOPE_ROCK_FULL, slope));
        color.multiplyScalar(1 + (colorRng() - 0.5) * 2 * BRIGHTNESS_JITTER);
        const mx = ((ax + bx + cx) / 3) * step - half, mz = ((az + bz + cz) / 3) * step - half;
        color.multiplyScalar(edgeShade(mx, mz));
        for (const [gi, h, gj] of pts) {
          const [px, py, pz] = place(gi, gj, h);
          positions[vi * 3] = px;
          positions[vi * 3 + 1] = py;
          positions[vi * 3 + 2] = pz;
          uvs[vi * 2] = px / TERRAIN_TILE_M;
          uvs[vi * 2 + 1] = pz / TERRAIN_TILE_M;
          colors[vi * 3] = color.r;
          colors[vi * 3 + 1] = color.g;
          colors[vi * 3 + 2] = color.b;
          vi++;
        }
      };
      for (let j = j0; j < j1; j++) {
        for (let i = i0; i < i1; i++) {
          pushTri(i, j, i, j + 1, i + 1, j);
          pushTri(i + 1, j, i, j + 1, i + 1, j + 1);
        }
      }
      if (vi === 0) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(0, vi * 3), 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors.slice(0, vi * 3), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uvs.slice(0, vi * 2), 2));
      if (smooth) geo.setAttribute('normal', new THREE.BufferAttribute(normals.slice(0, vi * 3), 3));
      else geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const chunk = new THREE.Mesh(geo, terrainMaterial);
      chunk.name = `terrain-chunk-${ci}-${cj}`;
      chunk.receiveShadow = true;
      chunks.push(chunk);
      group.add(chunk);
    }
  }
  return { mesh: group, chunks, size, craters, heightAt, slopeAt, dispose: () => chunks.forEach((c) => c.geometry.dispose()) };
}

/** Gaya terrain per destinasi (visual saja): amplitudo bukit dan jumlah kawah. */
export function terrainStyle(destinationId: string): { amplitude: number; craterCount: number } {
  return destinationId === 'mars' ? { amplitude: 9, craterCount: 16 } : { amplitude: 6, craterCount: 28 };
}
