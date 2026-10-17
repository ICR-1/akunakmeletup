import * as THREE from 'three';
import { LAUNCH_SITE } from '../core/constants';
import { createRng, rngRange } from '../core/rng';
import { box, column, hullMaterial, jitter, paint, part } from './mesh';
import { createNoise2D, fbm } from './noise';
import { GROUND_TILE_M, MAP_BOOST, WATER_TILE_M, natureTextures } from './natureTexture';
import { ico, isHigh, seg } from './detail';

const L = LAUNCH_SITE;
const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ pulau */

/** Tinggi daratan pada jarak r dari landasan: datar di sekitar landasan, berbukit, lalu landai ke pantai dan dasar laut. */
export function islandHeight(r: number, hill: number): number {
  const flat = -0.08;
  if (r <= L.padClearM) return flat;
  const hills = hill * L.hillAmplitudeM * smoothstep(L.padClearM, L.padClearM + 50, r) * (1 - smoothstep(L.grassEndM - 10, L.grassEndM + 25, r));
  if (r <= L.grassEndM) return flat + hills;
  const shore = L.waterY - flat;
  if (r <= L.waterlineM) return flat + hills + shore * smoothstep(L.grassEndM, L.waterlineM, r);
  return Math.max(L.seaFloorY, L.waterY + (L.seaFloorY - L.waterY) * smoothstep(L.waterlineM, L.islandRadiusM, r));
}

export type TreeKind = 'broadleaf' | 'pine' | 'palm' | 'bush';
export interface TreePlan { x: number; z: number; kind: TreeKind; scale: number; rot: number; tilt: number }

/**
 * Rencana tata pohon (murni, deterministik): pohon lebar dan pinus berkelompok di padang rumput, kelapa di tepi
 * pasir, semak tersebar. Tidak ada pohon di area landasan dan tidak ada yang saling menumpuk.
 */
export function planForest(seed: number): TreePlan[] {
  const rng = createRng(seed ^ 0x7ee5);
  const noise = createNoise2D(seed ^ 0xf07e57);
  const plans: TreePlan[] = [];
  const cell = L.minTreeSpacingM;
  const taken = new Set<string>();
  const free = (x: number, z: number): boolean => {
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (taken.has(`${cx + dx},${cz + dz}`)) {
        const [px, pz] = [(cx + dx + 0.5) * cell, (cz + dz + 0.5) * cell];
        if (Math.hypot(px - x, pz - z) < cell) return false;
      }
    }
    return true;
  };
  const place = (kind: TreeKind, count: number, rMin: number, rMax: number, needCluster: boolean): void => {
    let made = 0, guard = 0;
    while (made < count && guard++ < count * 60) {
      const r = Math.sqrt(rngRange(rng, rMin * rMin, rMax * rMax));
      const a = rngRange(rng, 0, Math.PI * 2);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (needCluster && fbm(noise, x * 0.018, z * 0.018, 3) < -0.02) continue;
      if (!free(x, z)) continue;
      taken.add(`${Math.floor(x / cell)},${Math.floor(z / cell)}`);
      plans.push({ x, z, kind, scale: rngRange(rng, 0.8, 1.4), rot: rngRange(rng, 0, Math.PI * 2), tilt: kind === 'palm' ? rngRange(rng, 0.1, 0.32) : 0 });
      made++;
    }
  };
  place('broadleaf', L.counts.broadleaf, L.padClearM, L.grassEndM - 8, true);
  place('pine', L.counts.pine, L.padClearM + 10, L.grassEndM - 20, true);
  place('palm', L.counts.palm, L.grassEndM + 4, L.waterlineM - 14, false);
  place('bush', L.counts.bush, L.padClearM, L.waterlineM - 20, false);
  return plans;
}

export interface LaunchIsland {
  group: THREE.Group;
  heightAt(x: number, z: number): number;
  /** Animasi ringan (busa ombak). */
  update(dtSec: number): void;
  dispose(): void;
}

const COLORS = {
  concrete: new THREE.Color(0x6f747e), gravel: new THREE.Color(0x8d8a7f),
  grassA: new THREE.Color(0x4f8a3e), grassB: new THREE.Color(0x6f9a47), dry: new THREE.Color(0x9aa457),
  sand: new THREE.Color(0xe3cf98), wetSand: new THREE.Color(0xb9a676), seabed: new THREE.Color(0x4aa6a4),
  shallow: new THREE.Color(0x35b7c4), deep: new THREE.Color(0x0f4a8a),
};

/** Bangun grid polar (cincin radius x segmen sudut) menjadi segitiga non-indexed berwarna per segitiga. */
function polarMesh(
  radiiIn: number[], segmentsIn: number, y: (r: number, x: number, z: number) => number,
  color: (rMid: number, yMid: number, x: number, z: number) => THREE.Color,
  uvTileM: number,
): THREE.BufferGeometry {
  if (isHigh()) return polarMeshSmooth(radiiIn, segmentsIn, y, color, uvTileM);
  const radii = radiiIn, segments = segmentsIn;
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  const v = (i: number, j: number): [number, number, number] => {
    const a = (j / segments) * Math.PI * 2;
    const x = Math.cos(a) * radii[i], z = Math.sin(a) * radii[i];
    return [x, y(radii[i], x, z), z];
  };
  const tri = (p: [number, number, number][]): void => {
    const mx = (p[0][0] + p[1][0] + p[2][0]) / 3, mz = (p[0][2] + p[1][2] + p[2][2]) / 3, my = (p[0][1] + p[1][1] + p[2][1]) / 3;
    const c = color(Math.hypot(mx, mz), my, mx, mz);
    for (const q of p) { pos.push(q[0], q[1], q[2]); col.push(c.r, c.g, c.b); uv.push(q[0] / uvTileM, q[2] / uvTileM); }
  };
  for (let i = 0; i < radii.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const A = v(i, j), B = v(i, j + 1), C = v(i + 1, j), D = v(i + 1, j + 1);
      tri([A, B, C]);
      tri([B, D, C]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

/** Detail tinggi: cincin disisipi titik tengah, segmen sudut x1,5, indeks bersama + warna dan normal per titik (mulus). */
function polarMeshSmooth(
  radiiIn: number[], segmentsIn: number, y: (r: number, x: number, z: number) => number,
  color: (rMid: number, yMid: number, x: number, z: number) => THREE.Color,
  uvTileM: number,
): THREE.BufferGeometry {
  const radii: number[] = [];
  radiiIn.forEach((r, i) => {
    radii.push(r);
    if (i + 1 < radiiIn.length) radii.push((r + radiiIn[i + 1]) / 2);
  });
  const segments = Math.round(segmentsIn * SMOOTH_ANGLE_MUL);
  const pos: number[] = [];
  const col: number[] = [];
  const uv: number[] = [];
  for (const r of radii) {
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const h = y(r, x, z);
      const c = color(r, h, x, z);
      pos.push(x, h, z);
      col.push(c.r, c.g, c.b);
      uv.push(x / uvTileM, z / uvTileM);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < radii.length - 1; i++) {
    for (let j = 0; j < segments; j++) {
      const a = i * segments + j, b = i * segments + ((j + 1) % segments);
      const c = (i + 1) * segments + j, d = (i + 1) * segments + ((j + 1) % segments);
      index.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

const SMOOTH_ANGLE_MUL = 1.5;
const ISLAND_RADII = [0, 22, 45, 70, 95, 120, 145, 170, 190, 205, 216, 224, 234, 246, L.islandRadiusM];
const OCEAN_RADII = [0, 240, 280, 330, 400, 520, 720, 1000, 1500, 2200, 3200, L.oceanRadiusM];
// Material Lambert (tanpa speculer PBR): permukaan luas ini memenuhi layar sehingga biaya per piksel menentukan FPS.
const terrainMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const seaMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0a3a55, emissiveIntensity: 0.35 });

/** Pasang (detail tinggi) atau lepas (detail rendah) tekstur alam pada material pulau dan laut. */
function applyNatureTextures(): void {
  const tex = isHigh() ? natureTextures() : null;
  for (const [mat, map] of [[terrainMaterial, tex?.ground ?? null], [seaMaterial, tex?.water ?? null]] as const) {
    if ((mat.map === null) !== (map === null)) mat.needsUpdate = true;
    mat.map = map;
    mat.color.setScalar(map ? MAP_BOOST : 1);
  }
}

function addInstances(
  group: THREE.Group, geo: THREE.BufferGeometry, colors: number[], matrices: THREE.Matrix4[], rng: () => number, name: string,
): THREE.InstancedMesh | null {
  if (matrices.length === 0) return null;
  const mesh = new THREE.InstancedMesh(paint(geo, 0xffffff), hullMaterial, matrices.length);
  mesh.name = name;
  const c = new THREE.Color();
  matrices.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setHex(colors[Math.floor(rng() * colors.length)]).multiplyScalar(0.85 + rng() * 0.3));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
  return mesh;
}

/** Gugusan daun kelapa: enam daun runcing menjuntai keluar dari puncak batang. */
function frondGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const g = new THREE.ConeGeometry(0.45, 3.4, seg(4)).toNonIndexed();
    g.translate(0, 1.7, 0);
    g.rotateZ(-1.15);
    g.rotateY((k / 7) * Math.PI * 2);
    g.deleteAttribute('uv');
    parts.push(g);
  }
  const merged = mergeGeos(parts);
  parts.forEach((g) => g.dispose());
  return merged;
}

function mergeGeos(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const g of geos) {
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) pos.push(p.getX(i), p.getY(i), p.getZ(i));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}

/** Pulau peluncuran: padang rumput berbukit, pantai berpasir, laut dengan busa ombak, dan hutan alami. */
export function createLaunchIsland(seed: number): LaunchIsland {
  const group = new THREE.Group();
  group.name = 'launch-island';
  const noise = createNoise2D(seed ^ 0x15e1a);
  const hill = (x: number, z: number): number => fbm(noise, x * 0.012, z * 0.012, 3);
  const heightAt = (x: number, z: number): number => islandHeight(Math.hypot(x, z), hill(x, z));
  const colorRng = createRng(seed ^ 0xc0102);

  const islandGeo = polarMesh(ISLAND_RADII, 84, (r, x, z) => islandHeight(r, hill(x, z)), (r, y, x, z) => {
    const c = new THREE.Color();
    const patch = (fbm(noise, x * 0.06 + 4, z * 0.06 - 7, 3) + 1) / 2;
    if (r < 26) c.copy(COLORS.concrete).lerp(COLORS.gravel, Math.min(1, Math.max(0, smoothstep(12, 26, r) * 0.6 + (patch - 0.5) * 0.5)));
    else if (r < 62) c.copy(COLORS.gravel).lerp(COLORS.grassA, smoothstep(34, 62, r) * (0.7 + patch * 0.5));
    else if (r < L.grassEndM - 8) c.copy(COLORS.grassA).lerp(COLORS.grassB, (fbm(noise, x * 0.03 + 9, z * 0.03, 2) + 1) / 2).lerp(COLORS.dry, smoothstep(L.grassEndM - 40, L.grassEndM - 8, r) * 0.6);
    else if (y > L.waterY + 0.35) c.copy(COLORS.sand).lerp(COLORS.dry, smoothstep(L.grassEndM + 6, L.grassEndM - 6, r) * 0.5);
    else if (y > L.waterY - 0.6) c.copy(COLORS.wetSand);
    else c.copy(COLORS.seabed);
    return c.multiplyScalar(1 + (colorRng() - 0.5) * 0.08);
  }, GROUND_TILE_M);
  applyNatureTextures();
  const island = new THREE.Mesh(islandGeo, terrainMaterial);
  island.name = 'island';
  group.add(island);

  const seaGeo = polarMesh(OCEAN_RADII, 72, () => L.waterY, (r) => {
    const c = new THREE.Color().copy(COLORS.shallow).lerp(COLORS.deep, smoothstep(L.waterlineM, 1500, r));
    return c.multiplyScalar(1 + (colorRng() - 0.5) * 0.06);
  }, WATER_TILE_M);
  const sea = new THREE.Mesh(seaGeo, seaMaterial);
  sea.name = 'sea';
  group.add(sea);

  // Busa ombak di garis pantai
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: true });
  const foam = new THREE.Mesh(new THREE.RingGeometry(L.waterlineM - 2.5, L.waterlineM + 1.5, 96, 1), foamMat);
  foam.rotation.x = -Math.PI / 2;
  foam.position.y = L.waterY + 0.06;
  group.add(foam);

  // Hutan: batang, tajuk, tingkat pinus, kelapa, dan semak sebagai InstancedMesh
  const plans = planForest(seed);
  const rng = createRng(seed ^ 0x77ee);
  const m = (x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, rz = 0, rx = 0): THREE.Matrix4 =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  const trunks: THREE.Matrix4[] = [], crowns: THREE.Matrix4[] = [], tiers: THREE.Matrix4[] = [];
  const palmTrunks: THREE.Matrix4[] = [], fronds: THREE.Matrix4[] = [], bushes: THREE.Matrix4[] = [];
  for (const t of plans) {
    const y = heightAt(t.x, t.z);
    const s = t.scale;
    if (t.kind === 'broadleaf') {
      const h = 3.4 * s;
      trunks.push(m(t.x, y, t.z, 0.5 * s, h, 0.5 * s, t.rot));
      crowns.push(m(t.x, y + h + 1.2 * s, t.z, 2.6 * s, 2.2 * s, 2.6 * s, t.rot));
    } else if (t.kind === 'pine') {
      const h = 2.6 * s;
      trunks.push(m(t.x, y, t.z, 0.42 * s, h, 0.42 * s, t.rot));
      tiers.push(m(t.x, y + h + 1.4 * s, t.z, 2.3 * s, 4.2 * s, 2.3 * s, t.rot));
      tiers.push(m(t.x, y + h + 3.6 * s, t.z, 1.6 * s, 3.4 * s, 1.6 * s, t.rot));
    } else if (t.kind === 'palm') {
      const h = 7 * s;
      palmTrunks.push(m(t.x, y, t.z, 0.45 * s, h, 0.45 * s, t.rot, t.tilt));
      const topX = t.x + Math.sin(-t.tilt) * Math.cos(t.rot) * h, topZ = t.z - Math.sin(-t.tilt) * Math.sin(t.rot) * h;
      fronds.push(m(topX, y + Math.cos(t.tilt) * h, topZ, s, s, s, t.rot + 0.7));
    } else {
      bushes.push(m(t.x, y + 0.5 * s, t.z, 1.4 * s, 0.9 * s, 1.4 * s, t.rot));
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, seg(6));
  trunkGeo.translate(0, 0.5, 0);
  const crownGeo = jitter(new THREE.IcosahedronGeometry(1, ico(0)), seed, 0.2);
  const tierGeo = new THREE.ConeGeometry(1, 1, seg(7));
  tierGeo.translate(0, 0, 0);
  const bushGeo = jitter(new THREE.IcosahedronGeometry(1, ico(0)), seed + 3, 0.22);
  addInstances(group, trunkGeo, [0x6b4a2e, 0x5c3f27, 0x7a5636], trunks, rng, 'trunks');
  addInstances(group, crownGeo, [0x3f7a3a, 0x4d8f3f, 0x2f6a35, 0x5a9a3c, 0x7aa43a], crowns, rng, 'crowns');
  addInstances(group, tierGeo, [0x1f5a3a, 0x24663f, 0x1a4d33], tiers, rng, 'pines');
  const palmGeo = new THREE.CylinderGeometry(0.55, 1, 1, seg(6));
  palmGeo.translate(0, 0.5, 0);
  addInstances(group, palmGeo, [0x9a7a52, 0x8a6c46], palmTrunks, rng, 'palm-trunks');
  addInstances(group, frondGeometry(), [0x4fa045, 0x5eb04c, 0x45903d], fronds, rng, 'fronds');
  addInstances(group, bushGeo, [0x3e7a3c, 0x4a8a3e, 0x6a8f3a], bushes, rng, 'bushes');

  let clock = 0;
  return {
    group, heightAt,
    update: (dt) => {
      clock += dt;
      foamMat.opacity = 0.42 + 0.18 * Math.sin(clock * 1.4);
      foam.scale.setScalar(1 + 0.004 * Math.sin(clock * 0.9));
      if (seaMaterial.map) seaMaterial.map.offset.set((clock * 0.004) % 1, (clock * 0.0025) % 1);
    },
    dispose: () => {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      foamMat.dispose();
    },
  };
}

/* ------------------------------------------------------------ landasan dan lengan umbilikal */

const EASE = (t: number): number => t * t * (3 - 2 * t);

/**
 * Sudut lengan umbilikal `t` detik setelah dilepas: berayun menjauh dari roket (sumbu vertikal) lalu terkulai
 * (sumbu horizontal) dengan sedikit pantulan. t <= 0 berarti masih terpasang.
 */
export function armAngles(t: number): { swing: number; droop: number } {
  if (t <= 0) return { swing: 0, droop: 0 };
  const k = Math.min(1, t / L.armSwingSec);
  const droopT = Math.min(1, Math.max(0, (t - L.armSwingSec * 0.35) / (L.armSwingSec * 0.9)));
  const bounce = droopT > 0 && droopT < 1 ? Math.sin(droopT * Math.PI * 2.5) * 0.06 * (1 - droopT) : 0;
  return { swing: EASE(k) * L.armSwingMaxRad, droop: EASE(droopT) * L.armDroopRad + bounce };
}

interface Arm { hinge: THREE.Group; inner: THREE.Group; sign: 1 | -1; delay: number }

export interface LaunchPad {
  group: THREE.Group;
  /** Lepaskan lengan umbilikal (sekali). */
  release(): void;
  readonly released: boolean;
  update(dtSec: number): void;
  dispose(): void;
}

const PAD = { concrete: 0x7a7f8a, trench: 0x2a2d36, steel: 0x6b7280, orange: 0xf08a24, building: 0x9aa3b0, dark: 0x23262e, hose: 0x2b2f3a };

let slabMat: THREE.MeshLambertMaterial | null = null;
function padSlabMaterial(): THREE.MeshLambertMaterial {
  slabMat ??= new THREE.MeshLambertMaterial({
    map: natureTextures().concrete, color: new THREE.Color(PAD.concrete).multiplyScalar(MAP_BOOST), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  return slabMat;
}

function buildArm(length: number): { hinge: THREE.Group; inner: THREE.Group } {
  const hinge = new THREE.Group();
  const inner = new THREE.Group();
  hinge.add(inner);
  inner.add(box(length, 0.32, 0.5, PAD.orange, [length / 2, 0, 0]));
  inner.add(box(length, 0.08, 0.08, PAD.steel, [length / 2, 0.34, 0.2]));
  inner.add(box(length, 0.08, 0.08, PAD.steel, [length / 2, 0.34, -0.2]));
  inner.add(box(length * 0.9, 0.07, 0.07, PAD.steel, [length / 2, 0.17, 0], [0, 0, 0.14]));
  inner.add(part(new THREE.CylinderGeometry(0.26, 0.26, 0.5, seg(8)), PAD.dark, [length + 0.1, 0, 0], [0, 0, Math.PI / 2]));
  inner.add(part(new THREE.CylinderGeometry(0.34, 0.34, 0.12, seg(8)), PAD.steel, [length - 0.12, 0, 0], [0, 0, Math.PI / 2]));
  for (const z of [-0.14, 0.14]) inner.add(part(new THREE.CylinderGeometry(0.05, 0.05, 1.3, seg(5)), PAD.hose, [length - 0.5, -0.65, z]));
  return { hinge, inner };
}

/** Landasan beton, parit api, dan menara servis dengan lengan umbilikal ke badan roket. Bangunan pendukung: `buildFacilityComplex`. */
export function createLaunchPad(rocketRadius: number, rocketHeight: number): LaunchPad {
  const group = new THREE.Group();
  group.name = 'launch-pad';
  const r = Math.max(7, rocketRadius * 4);
  group.add(column(r, r * 1.04, -0.5, 0.5, PAD.concrete, 16));
  if (isHigh()) {
    // Pelat beton bertekstur (sambungan, noda, retakan) di atas permukaan landasan
    const slab = new THREE.Mesh(new THREE.CircleGeometry(r * 0.995, 48), padSlabMaterial());
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = 0.012;
    group.add(slab);
  }
  group.add(column(rocketRadius * 2.2, rocketRadius * 2.2, 0, 0.05, PAD.trench, 12));
  const tx = -(rocketRadius + 3.4);
  const top = rocketHeight * 0.88;
  for (const z of [-1.2, 1.2]) group.add(box(0.5, top, 0.5, PAD.steel, [tx, top / 2, z]));
  for (let y = 2; y < top; y += 4) {
    group.add(box(0.28, 0.28, 2.6, PAD.steel, [tx, y, 0]));
    group.add(box(0.2, 0.2, 2.9, PAD.steel, [tx, y + 2, 0], [0.75, 0, 0]));
  }
  group.add(box(1.2, 0.6, 3, PAD.orange, [tx, top + 0.3, 0]));

  const armLen = -tx - rocketRadius * 0.97 - 0.3;
  const arms: Arm[] = [];
  for (let i = 0; i < L.armCount; i++) {
    const y = top * (0.2 + (i / (L.armCount - 1)) * 0.68);
    const { hinge, inner } = buildArm(armLen);
    hinge.position.set(tx + 0.3, y, 0);
    group.add(hinge);
    arms.push({ hinge, inner, sign: i % 2 === 0 ? 1 : -1, delay: i * L.armStaggerSec });
  }

  let t = 0;
  let released = false;
  const apply = (): void => {
    for (const a of arms) {
      const { swing, droop } = armAngles(t - a.delay);
      a.hinge.rotation.y = swing * a.sign;
      a.inner.rotation.z = -droop;
    }
  };
  return {
    group,
    release: () => { released = true; },
    get released() { return released; },
    update: (dt) => {
      if (!released) return;
      t += dt;
      apply();
    },
    dispose: () => group.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); }),
  };
}
