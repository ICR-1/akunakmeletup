import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boxBevel, DETAIL, registerDetailMaterial, seg } from './detail';

/** Material bersama: flat shading + warna vertex (PRD 13). */
export const hullMaterial = registerDetailMaterial(new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0.1,
}));
/** Untuk cangkang tipis (fairing) yang terlihat dari kedua sisi. */
export const shellMaterial = registerDetailMaterial(new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide,
}));

export type Vec3 = [number, number, number];

export function paint<T extends THREE.BufferGeometry>(geo: T, color: THREE.ColorRepresentation): T {
  const c = new THREE.Color(color);
  const count = geo.getAttribute('position').count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    data[i * 3] = c.r;
    data[i * 3 + 1] = c.g;
    data[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(data, 3));
  return geo;
}

/** Mesh berwarna dengan posisi/rotasi opsional. */
export function part(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  pos: Vec3 = [0, 0, 0],
  rot: Vec3 = [0, 0, 0],
  material: THREE.Material = hullMaterial,
): THREE.Mesh {
  const mesh = new THREE.Mesh(paint(geo, color), material);
  mesh.position.set(...pos);
  mesh.rotation.set(...rot);
  return mesh;
}

/** Silinder/kerucut terpancung berdiri dari y0 setinggi h. */
export function column(
  rTop: number, rBottom: number, y0: number, h: number,
  color: THREE.ColorRepresentation, segments = 8, x = 0, z = 0,
): THREE.Mesh {
  return part(new THREE.CylinderGeometry(rTop, rBottom, h, seg(segments)), color, [x, y0 + h / 2, z]);
}

/** Geometri kotak: tepi membulat pada detail tinggi, kotak tajam pada detail rendah. */
export function boxGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const bevel = boxBevel();
  if (bevel <= 0) return new THREE.BoxGeometry(w, h, d);
  // Radius dibatasi sisi terpendek agar kotak tipis (pelat, panel) tidak berubah bentuk.
  const radius = Math.min(w, h, d) * Math.min(bevel, 0.49);
  return new RoundedBoxGeometry(w, h, d, DETAIL.boxBevelSegments, radius);
}

export function box(w: number, h: number, d: number, color: THREE.ColorRepresentation, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0]): THREE.Mesh {
  return part(boxGeometry(w, h, d), color, pos, rot);
}

function hash(ix: number, iy: number, iz: number, seed: number): number {
  let h = (seed ^ Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Jitter posisi vertex (berbasis hash posisi + seed, jadi deterministik dan tidak
 * merobek jahitan geometri) agar facet flat-shading memantulkan cahaya bervariasi.
 */
export function jitter<T extends THREE.BufferGeometry>(geo: T, seed: number, amount: number): T {
  const pos = geo.getAttribute('position');
  const q = 1000;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ix = Math.round(x * q), iy = Math.round(y * q), iz = Math.round(z * q);
    pos.setXYZ(
      i,
      x + (hash(ix, iy, iz, seed) - 0.5) * 2 * amount,
      y + (hash(ix, iy, iz, seed + 1) - 0.5) * 2 * amount,
      z + (hash(ix, iy, iz, seed + 2) - 0.5) * 2 * amount,
    );
  }
  pos.needsUpdate = true;
  return geo;
}

/** Bebaskan geometri (material bersama tidak dibebaskan). */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}

export function removeAndDispose(parent: THREE.Object3D, child: THREE.Object3D): void {
  parent.remove(child);
  disposeTree(child);
}

/** Aktifkan pengiriman/penerimaan bayangan pada semua mesh di bawah `root`. */
export function enableShadows(root: THREE.Object3D, cast: boolean, receive: boolean): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

/** Material bersama harus dikompilasi ulang saat bayangan dinyalakan/dimatikan. */
export function markSharedMaterialsDirty(): void {
  hullMaterial.needsUpdate = true;
  shellMaterial.needsUpdate = true;
}

/** Satukan semua mesh ber-hullMaterial di bawah `root` menjadi satu mesh (mengurangi draw call); mesh bermaterial lain dibiarkan. */
export function mergeHullMeshes(root: THREE.Object3D, name = 'merged'): THREE.Mesh | null {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === hullMaterial) meshes.push(m);
  });
  if (meshes.length === 0) return null;
  const geos = meshes.map((m) => {
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(inverse.clone().multiply(m.matrixWorld));
    return g;
  });
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  for (const m of meshes) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, hullMaterial);
  mesh.name = name;
  root.add(mesh);
  return mesh;
}
