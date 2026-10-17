import * as THREE from 'three';
import { createRng, rngRange, type Rng } from '../core/rng';

/**
 * Pecah model menjadi serpihan lepas: segitiga dikelompokkan menurut sel Voronoi di sekitar titik acak sehingga tiap
 * serpihan berupa potongan lambung bergerigi (bukan komponen utuh) dengan warna dan material aslinya.
 */

/**
 * Kelompokkan titik (x, y, z berurutan) menjadi `k` klaster dengan k-means ringan berseed. Murni (tanpa Three.js).
 * Mengembalikan label klaster per titik; klaster kosong tidak dihasilkan (label dipadatkan).
 */
export function voronoiClusters(points: Float32Array, k: number, seed: number, iterations = 3): Int32Array {
  const n = points.length / 3;
  const labels = new Int32Array(n);
  if (n === 0) return labels;
  const kk = Math.max(1, Math.min(k, n));
  const rng: Rng = createRng((seed ^ 0x5ba77e2) >>> 0);
  const centers = new Float64Array(kk * 3);
  // k-means++ sederhana: titik pertama acak, berikutnya cenderung jauh dari yang sudah dipilih
  const first = Math.floor(rng() * n);
  centers.set([points[first * 3], points[first * 3 + 1], points[first * 3 + 2]], 0);
  const nearest = new Float64Array(n).fill(Infinity);
  for (let c = 1; c < kk; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) {
      const dx = points[i * 3] - centers[(c - 1) * 3], dy = points[i * 3 + 1] - centers[(c - 1) * 3 + 1], dz = points[i * 3 + 2] - centers[(c - 1) * 3 + 2];
      nearest[i] = Math.min(nearest[i], dx * dx + dy * dy + dz * dz);
      total += nearest[i];
    }
    let pick = rng() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      pick -= nearest[i];
      if (pick <= 0) { chosen = i; break; }
    }
    centers.set([points[chosen * 3], points[chosen * 3 + 1], points[chosen * 3 + 2]], c * 3);
  }
  const assign = (): void => {
    for (let i = 0; i < n; i++) {
      let best = 0, bestD = Infinity;
      for (let c = 0; c < kk; c++) {
        const dx = points[i * 3] - centers[c * 3], dy = points[i * 3 + 1] - centers[c * 3 + 1], dz = points[i * 3 + 2] - centers[c * 3 + 2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) { bestD = d; best = c; }
      }
      labels[i] = best;
    }
  };
  for (let it = 0; it < iterations; it++) {
    assign();
    const sum = new Float64Array(kk * 3), count = new Int32Array(kk);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      sum[c * 3] += points[i * 3]; sum[c * 3 + 1] += points[i * 3 + 1]; sum[c * 3 + 2] += points[i * 3 + 2];
      count[c]++;
    }
    for (let c = 0; c < kk; c++) {
      if (count[c] === 0) continue;
      centers[c * 3] = sum[c * 3] / count[c]; centers[c * 3 + 1] = sum[c * 3 + 1] / count[c]; centers[c * 3 + 2] = sum[c * 3 + 2] / count[c];
    }
  }
  assign();
  // Padatkan label (buang klaster kosong)
  const remap = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    let m = remap.get(labels[i]);
    if (m === undefined) { m = remap.size; remap.set(labels[i], m); }
    labels[i] = m;
  }
  return labels;
}

export interface Shard {
  /** Grup berisi satu mesh serpihan; posisi grup = pusat serpihan di dunia. */
  group: THREE.Group;
  triangles: number;
}

interface Source { mesh: THREE.Mesh; geo: THREE.BufferGeometry; tris: number }

function collectSources(root: THREE.Object3D): Source[] {
  root.updateWorldMatrix(true, true);
  const list: Source[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh || !mesh.geometry) return;
    let visible = true;
    for (let p: THREE.Object3D | null = mesh; p; p = p.parent) if (!p.visible) visible = false;
    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!visible || !mat || mat.transparent) return;
    const pos = mesh.geometry.getAttribute('position');
    if (!pos) return;
    const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    list.push({ mesh, geo, tris: geo.getAttribute('position').count / 3 });
  });
  return list;
}

/**
 * Pecah semua mesh padat di bawah `root` menjadi sekitar `budget` serpihan (tersebar menurut jumlah segitiga).
 * Geometri baru dibuat dalam koordinat dunia relatif ke pusat serpihan; material dipakai bersama. `root` tidak diubah.
 */
export function shatterObject(root: THREE.Object3D, budget: number, seed: number, iterations = 3): Shard[] {
  const sources = collectSources(root);
  const totalTris = sources.reduce((t, s) => t + s.tris, 0);
  const shards: Shard[] = [];
  if (totalTris === 0 || budget <= 0) return shards;
  const rng = createRng(seed ^ 0x77aa);
  sources.forEach((src, si) => {
    const k = Math.max(1, Math.min(src.tris, Math.round((budget * src.tris) / totalTris)));
    const pos = src.geo.getAttribute('position');
    const nor = src.geo.getAttribute('normal');
    const col = src.geo.getAttribute('color');
    const m = src.mesh.matrixWorld;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(m);
    const tmp = new THREE.Vector3();
    const worldPos = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i).applyMatrix4(m);
      worldPos.set([tmp.x, tmp.y, tmp.z], i * 3);
    }
    const centroids = new Float32Array(src.tris * 3);
    for (let t = 0; t < src.tris; t++) {
      for (let a = 0; a < 3; a++) {
        centroids[t * 3 + a] = (worldPos[t * 9 + a] + worldPos[t * 9 + 3 + a] + worldPos[t * 9 + 6 + a]) / 3;
      }
    }
    const labels = voronoiClusters(centroids, k, seed + si * 131, iterations);
    let clusters = 0;
    for (const l of labels) clusters = Math.max(clusters, l + 1);
    for (let c = 0; c < clusters; c++) {
      const tris: number[] = [];
      for (let t = 0; t < src.tris; t++) if (labels[t] === c) tris.push(t);
      if (tris.length === 0) continue;
      const center = new THREE.Vector3();
      for (const t of tris) center.add(tmp.set(centroids[t * 3], centroids[t * 3 + 1], centroids[t * 3 + 2]));
      center.divideScalar(tris.length);
      const p = new Float32Array(tris.length * 9);
      const n = nor ? new Float32Array(tris.length * 9) : null;
      const cl = col ? new Float32Array(tris.length * 9) : null;
      tris.forEach((t, ti) => {
        for (let v = 0; v < 3; v++) {
          const vi = t * 3 + v;
          p[ti * 9 + v * 3] = worldPos[vi * 3] - center.x;
          p[ti * 9 + v * 3 + 1] = worldPos[vi * 3 + 1] - center.y;
          p[ti * 9 + v * 3 + 2] = worldPos[vi * 3 + 2] - center.z;
          if (n && nor) {
            tmp.fromBufferAttribute(nor, vi).applyMatrix3(normalMatrix).normalize();
            n.set([tmp.x, tmp.y, tmp.z], ti * 9 + v * 3);
          }
          if (cl && col) cl.set([col.getX(vi), col.getY(vi), col.getZ(vi)], ti * 9 + v * 3);
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      if (n) geo.setAttribute('normal', new THREE.BufferAttribute(n, 3)); else geo.computeVertexNormals();
      if (cl) geo.setAttribute('color', new THREE.BufferAttribute(cl, 3));
      const mesh = new THREE.Mesh(geo, src.mesh.material);
      const group = new THREE.Group();
      group.position.copy(center);
      group.add(mesh);
      // Sedikit acak urutan agar serpihan dari mesh berbeda tidak berkelompok berurutan
      shards.splice(Math.floor(rng() * (shards.length + 1)), 0, { group, triangles: tris.length });
    }
    if (src.geo !== src.mesh.geometry) src.geo.dispose();
  });
  return shards;
}

/** Kecepatan lontar serpihan dari pusat ledakan: menjauh dari pusat, condong ke atas, lebih cepat bila lebih kecil. Murni. */
export function shardVelocity(
  center: { x: number; y: number; z: number }, shard: { x: number; y: number; z: number }, rng: Rng,
  speedMin: number, speedMax: number, upBias: number,
): { x: number; y: number; z: number } {
  let dx = shard.x - center.x, dy = shard.y - center.y, dz = shard.z - center.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) { dx = rngRange(rng, -1, 1); dy = 0.2; dz = rngRange(rng, -1, 1); } else { dx /= len; dy /= len; dz /= len; }
  const speed = rngRange(rng, speedMin, speedMax);
  const jitter = 0.35;
  const vx = dx + rngRange(rng, -jitter, jitter), vz = dz + rngRange(rng, -jitter, jitter);
  const vy = Math.max(dy, 0) + upBias + rngRange(rng, 0, 0.5);
  const norm = Math.hypot(vx, vy, vz) || 1;
  return { x: (vx / norm) * speed, y: (vy / norm) * speed, z: (vz / norm) * speed };
}
