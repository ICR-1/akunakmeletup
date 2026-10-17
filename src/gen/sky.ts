import * as THREE from 'three';
import { createRng, rngRange } from '../core/rng';
import { disposeTree, jitter, paint } from './mesh';
import { ico, registerDetailMaterial } from './detail';

const STAR_COLORS = [0xffffff, 0xcfe0ff, 0xfff1cf];

/** Kubah bintang prosedural (THREE.Points berseed, ukuran dan kecerahan bervariasi). */
export function createStars(seed: number, count = 1800, radius = 1800): THREE.Points {
  const rng = createRng(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = rngRange(rng, -1, 1);
    const a = rngRange(rng, 0, Math.PI * 2);
    const s = Math.sqrt(1 - u * u);
    positions.set([Math.cos(a) * s * radius, u * radius, Math.sin(a) * s * radius], i * 3);
    c.set(STAR_COLORS[Math.floor(rng() * STAR_COLORS.length)]).multiplyScalar(0.35 + rng() * 0.65);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({
    size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, fog: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

/** Warna latar/kabut mengikuti ketinggian: biru langit di permukaan, hitam di luar atmosfer. */
export function atmosphereColor(t01: number, target = new THREE.Color()): THREE.Color {
  const low = new THREE.Color(0x7fb2e0);
  const high = new THREE.Color(0x000000);
  return target.copy(low).lerp(high, Math.min(1, Math.max(0, t01)));
}

export { paint };

/** Awan: material Lambert dengan emisi lembut agar sisi bawahnya tidak hitam. */
const cloudMaterial = registerDetailMaterial(new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x7a90aa, flatShading: true, vertexColors: true }));

/** Gumpalan awan low-poly (satu InstancedMesh) pada ketinggian lokal 150-1800 m di atas tanah. */
export function createClouds(seed: number, count = 40): THREE.InstancedMesh {
  const rng = createRng(seed ^ 0xc10d);
  const geo = paint(jitter(new THREE.IcosahedronGeometry(1, ico(0)), seed, 0.2), 0xffffff);
  const mesh = new THREE.InstancedMesh(geo, cloudMaterial, count);
  mesh.name = 'clouds';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = rngRange(rng, 0, Math.PI * 2);
    const d = rngRange(rng, 170, 800);
    e.set(0, rngRange(rng, 0, Math.PI * 2), 0);
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(Math.cos(a) * d, rngRange(rng, 150, 1800), Math.sin(a) * d), q,
      new THREE.Vector3(rngRange(rng, 25, 60), rngRange(rng, 6, 12), rngRange(rng, 25, 60)),
    );
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setScalar(rngRange(rng, 0.85, 1)));
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

/** Bebaskan grup dunia peluncuran (geometri dan InstancedMesh). */
export function disposeWorld(root: THREE.Object3D): void {
  disposeTree(root);
  root.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose(); });
}
