import * as THREE from 'three';
import { createRng, rngRange } from '../core/rng';
import { box, column, disposeTree, hullMaterial, jitter, paint, part } from './mesh';
import type { Terrain } from './terrain';
import { seg, ico } from './detail';
import { buildDish } from './dish';

export interface AvoidZone { x: number; z: number; r: number }

/** Faktor penyusutan lingkaran tabrakan dan puncak batu terhadap skala (geometri ikosahedron di-jitter 0,18). */
const ROCK_RADIUS_FACTOR = 0.85;
const ROCK_TOP_FACTOR = 0.9;

/** Lingkaran tabrakan tiap batu (dari matriks instance): radius horizontal terbesar dan tinggi puncak dunia. */
export function rockColliders(mesh: THREE.InstancedMesh): { x: number; z: number; r: number; top: number }[] {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const out: { x: number; z: number; r: number; top: number }[] = [];
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    m.decompose(pos, quat, scale);
    out.push({
      x: pos.x, z: pos.z, r: Math.max(scale.x, scale.z) * ROCK_RADIUS_FACTOR, top: pos.y + scale.y * ROCK_TOP_FACTOR,
    });
  }
  return out;
}

const ROCK_MIN = 0.3;
const ROCK_MAX = 1.8;
const BOULDER_CHANCE = 0.06;
const BOULDER_SCALE = 3.2;

/** Batu-batu sebaran (satu InstancedMesh = satu draw call): skala, rotasi, dan warna berseed. */
export function scatterRocks(terrain: Terrain, seed: number, baseColor: string, count: number, avoid: AvoidZone[]): THREE.InstancedMesh {
  const rng = createRng(seed ^ 0x7f4a7c15);
  const geo = paint(jitter(new THREE.IcosahedronGeometry(1, ico(0)), seed, 0.18), 0xffffff);
  const mesh = new THREE.InstancedMesh(geo, hullMaterial, count);
  mesh.name = 'rocks';
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const color = new THREE.Color();
  const base = new THREE.Color(baseColor);
  const half = terrain.size / 2 - 6;
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 20) {
    const x = rngRange(rng, -half, half);
    const z = rngRange(rng, -half, half);
    if (Math.hypot(x, z) > half) continue;
    if (avoid.some((a) => Math.hypot(x - a.x, z - a.z) < a.r)) continue;
    const big = rng() < BOULDER_CHANCE;
    const s = big ? rngRange(rng, ROCK_MAX, BOULDER_SCALE) : rngRange(rng, ROCK_MIN, ROCK_MAX);
    e.set(rngRange(rng, 0, Math.PI), rngRange(rng, 0, Math.PI * 2), rngRange(rng, 0, Math.PI));
    q.setFromEuler(e);
    m.compose(
      new THREE.Vector3(x, terrain.heightAt(x, z) + s * 0.25, z), q,
      new THREE.Vector3(s * rngRange(rng, 0.8, 1.3), s * rngRange(rng, 0.5, 0.9), s * rngRange(rng, 0.8, 1.3)),
    );
    mesh.setMatrixAt(placed, m);
    mesh.setColorAt(placed, color.copy(base).multiplyScalar(rngRange(rng, 0.35, 0.8)));
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

const markerMaterial = (color: number, opacity: number): THREE.MeshBasicMaterial =>
  new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });

export interface Marker {
  group: THREE.Group;
  setColor(hex: number): void;
  update(t: number): void;
  dispose(): void;
}

/** Penanda titik minat: sorot cahaya vertikal tipis, cincin di tanah, dan kristal berputar. */
export function createMarker(color: number): Marker {
  const group = new THREE.Group();
  const beamMat = markerMaterial(color, 0.22);
  const ringMat = markerMaterial(color, 0.7);
  const gemMat = markerMaterial(color, 0.95);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 60, seg(6), 1, true).translate(0, 30, 0), beamMat);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.1, seg(4), seg(18)), ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.15;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), gemMat);
  gem.position.y = 2.4;
  group.add(beam, ring, gem);
  return {
    group,
    setColor: (hex) => { for (const m of [beamMat, ringMat, gemMat]) m.color.set(hex); },
    update: (t) => {
      gem.rotation.y = t * 1.6;
      gem.position.y = 2.4 + Math.sin(t * 2) * 0.25;
      ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    },
    dispose: () => {
      for (const o of group.children) (o as THREE.Mesh).geometry.dispose();
      for (const m of [beamMat, ringMat, gemMat]) m.dispose();
    },
  };
}

/** Cincin datar bercahaya (batas aman hub / gelombang pemindai). */
export function createGroundRing(radius: number, thickness: number, color: number, opacity: number): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - thickness, radius, 48), markerMaterial(color, opacity));
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

export function disposeMesh(m: THREE.Mesh): void {
  m.geometry.dispose();
  (m.material as THREE.Material).dispose();
}

export interface BeaconProbe {
  group: THREE.Group;
  update(t: number): void;
  dispose(): void;
}

const PROBE = {
  foil: 0xc4a02a, foilDark: 0x8a7020, steel: 0x9aa3b0, dark: 0x2c2f38, orange: 0xd0742a, cell: 0x1f2f6e, white: 0xe6e9ee,
};
const PROBE_BLINK_SEC = 1.2;
/** Tinggi lampu penanda di puncak antena (m) dan kaki tripod. */
const PROBE_LIGHT_Y = 5.6;
/** Posisi antena tegak (jauh dari parabola agar tidak bersilangan). */
const MAST_X = 0.38, MAST_Z = 0.18;

function probeStrut(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = part(new THREE.CylinderGeometry(radius, radius, len, seg(6)), color);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

const PROBE_DUST = new THREE.Color(0x8d8777);
const PROBE_DUST_HEIGHT_M = 3.4;
const PROBE_DUST_STRENGTH = 0.75;

/**
 * Debu regolit menempel di bagian bawah objek: warna vertex diarahkan ke warna debu makin dekat tanah, sehingga model
 * tampak lapuk dan selaras dengan daratan. Mengubah geometri yang dimiliki mesh-mesh pada grup (bukan geometri bersama).
 */
export function dustToHeight(root: THREE.Object3D, height: number, dust: THREE.Color, strength: number): void {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    const color = mesh.geometry?.getAttribute('color');
    const pos = mesh.geometry?.getAttribute('position');
    if (!mesh.isMesh || !color || !pos) return;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const k = Math.min(1, Math.max(0, 1 - v.y / height)) * strength;
      if (k <= 0) continue;
      c.setRGB(color.getX(i), color.getY(i), color.getZ(i)).lerp(dust, k);
      color.setXYZ(i, c.r, c.g, c.b);
    }
    color.needsUpdate = true;
  });
}

/**
 * Probe Beacon (kapsul waktu probe generasi lama): badan segi delapan berbalut foil emas di atas tripod simetris,
 * dua sayap surya, parabola di tiang miring, dan antena dengan lampu merah berkedip. Tinggi sekitar 5,6 m.
 */
/** Sayap surya probe: panjang (dari engsel) dan lebar. */
const WING_LEN = 1.3;
const WING_WIDTH = 0.9;

export function buildBeaconProbe(): BeaconProbe {
  const group = new THREE.Group();
  group.name = 'beacon-probe';
  const bodyBottom = 1.25, bodyH = 1.7, bodyTop = bodyBottom + bodyH;
  // Tripod: tiga kaki lurus dari bawah badan ke tapak bundar, tersebar rata
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 6;
    const hub = new THREE.Vector3(Math.cos(a) * 0.55, bodyBottom + 0.1, Math.sin(a) * 0.55);
    const foot = new THREE.Vector3(Math.cos(a) * 1.7, 0.12, Math.sin(a) * 1.7);
    group.add(probeStrut(hub, foot, 0.06, PROBE.steel));
    group.add(probeStrut(new THREE.Vector3(Math.cos(a) * 0.35, bodyBottom + 0.9, Math.sin(a) * 0.35), foot.clone().lerp(hub, 0.45), 0.035, PROBE.steel));
    group.add(column(0.32, 0.36, 0, 0.1, PROBE.dark, 10, foot.x, foot.z));
  }
  // Badan: pelat dasar, silinder berfoil, pita aksen, kubah, dan pelat nama
  group.add(column(0.78, 0.78, bodyBottom - 0.12, 0.12, PROBE.dark, 8));
  group.add(part(jitter(new THREE.CylinderGeometry(0.72, 0.72, bodyH, seg(8)), 17, 0.012), PROBE.foil, [0, bodyBottom + bodyH / 2, 0]));
  group.add(column(0.745, 0.745, bodyBottom + bodyH * 0.55, 0.14, PROBE.orange, 8));
  group.add(column(0.745, 0.745, bodyBottom + 0.12, 0.08, PROBE.foilDark, 8));
  group.add(column(0.745, 0.745, bodyTop - 0.2, 0.08, PROBE.foilDark, 8));
  group.add(part(new THREE.SphereGeometry(0.72, seg(8), seg(4), 0, Math.PI * 2, 0, Math.PI / 2), PROBE.foil, [0, bodyTop, 0]));
  group.add(box(0.5, 0.26, 0.05, PROBE.white, [0, bodyBottom + bodyH * 0.35, 0.74]));
  group.add(box(0.4, 0.04, 0.06, PROBE.dark, [0, bodyBottom + bodyH * 0.35, 0.76]));
  // Dua sayap surya simetris pada lengan pendek. Sayap berputar pada engsel di ujung lengan (tepi dalamnya),
  // sehingga tepi dalam selalu menempel pada lengan walau sayap dimiringkan.
  for (const side of [-1, 1]) {
    const hingeY = bodyBottom + bodyH * 0.6;
    const hinge = new THREE.Vector3(side * 1.25, hingeY, 0);
    group.add(probeStrut(new THREE.Vector3(side * 0.7, bodyBottom + bodyH * 0.55, 0), hinge, 0.04, PROBE.steel));
    group.add(part(new THREE.SphereGeometry(0.08, seg(8), seg(6)), PROBE.dark, [hinge.x, hinge.y, hinge.z]));
    const wing = new THREE.Group();
    wing.position.copy(hinge);
    wing.rotation.z = side * -0.25;
    const half = WING_LEN / 2;
    wing.add(box(WING_LEN, 0.05, WING_WIDTH, PROBE.steel, [side * half, 0, 0]));
    for (let i = 0; i < 3; i++) wing.add(box(0.38, 0.06, WING_WIDTH - 0.12, PROBE.cell, [side * (0.2 + i * 0.42), 0.01, 0]));
    group.add(wing);
  }
  // Parabola sungguhan pada tiang dan sendi elevasi (lihat gen/dish.ts)
  const DISH_R = 0.68, DISH_DEPTH = 0.3, DISH_ELEV = 0.95;
  const yokeY = bodyTop + 1.25;
  const dishPos = new THREE.Vector3(-0.42, yokeY, -0.32);
  group.add(probeStrut(new THREE.Vector3(dishPos.x, bodyTop - 0.1, dishPos.z), dishPos, 0.05, PROBE.steel));
  group.add(part(new THREE.SphereGeometry(0.11, seg(8), seg(6)), PROBE.dark, [dishPos.x, dishPos.y, dishPos.z]));
  const dishGroup = buildDish(DISH_R, DISH_DEPTH, { dish: PROBE.white, strut: PROBE.steel, hub: PROBE.dark, feed: PROBE.orange });
  dishGroup.position.copy(dishPos);
  dishGroup.rotation.set(Math.PI / 2 - DISH_ELEV, 0, 0);
  group.add(dishGroup);
  // Antena tegak dengan cincin dan lampu penanda di puncak (di sisi lain parabola, tidak berpotongan)
  group.add(column(0.04, 0.05, bodyTop + 0.55, PROBE_LIGHT_Y - bodyTop - 0.55, PROBE.steel, 6, MAST_X, MAST_Z));
  group.add(column(0.16, 0.16, bodyTop + 1.9, 0.06, PROBE.orange, 8, MAST_X, MAST_Z));
  dustToHeight(group, PROBE_DUST_HEIGHT_M, PROBE_DUST, PROBE_DUST_STRENGTH);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xff4b4b, fog: false });
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.16, seg(6), seg(4)), lightMat);
  light.position.set(MAST_X, PROBE_LIGHT_Y + 0.12, MAST_Z);
  const ringMat = markerMaterial(0xff4b4b, 0.5);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.03, seg(4), seg(14)), ringMat);
  ring.position.set(MAST_X, PROBE_LIGHT_Y + 0.12, MAST_Z);
  ring.rotation.x = Math.PI / 2;
  group.add(light, ring);
  return {
    group,
    update: (t) => {
      const on = Math.floor(t / (PROBE_BLINK_SEC / 2)) % 2 === 0;
      light.visible = on;
      ring.visible = on;
      ring.scale.setScalar(1 + ((t % PROBE_BLINK_SEC) / PROBE_BLINK_SEC) * 1.6);
      ringMat.opacity = on ? 0.5 * (1 - (t % PROBE_BLINK_SEC) / PROBE_BLINK_SEC) : 0;
    },
    dispose: () => {
      group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
      lightMat.dispose();
      ringMat.dispose();
    },
  };
}

export interface HubFloodlights {
  group: THREE.Group;
  /** Posisi dunia dasar tiap tiang (untuk penghalang tabrakan). */
  posts: readonly { x: number; y: number; z: number }[];
  /** Tingkat nyala 0-1: bohlam menyala hangat dan terang; 0 = padam. */
  setLevel(level01: number): void;
  dispose(): void;
}

const BULB_OFF = new THREE.Color(0x3a3a3f);
const BULB_ON = new THREE.Color(0xfff0c8);

/** Tiang lampu sorot di sekeliling wahana (badan tiang + kepala + bohlam bercahaya); cahaya aslinya dari satu PointLight di scene. */
export function createHubFloodlights(radius: number, posts: number, height: number, heightAt: (x: number, z: number) => number): HubFloodlights {
  const group = new THREE.Group();
  group.name = 'hub-floodlights';
  const bulbMat = new THREE.MeshBasicMaterial({ color: BULB_OFF, fog: false });
  const bulbGeo = new THREE.SphereGeometry(0.22, seg(8), seg(6));
  const posts_: { x: number; y: number; z: number }[] = [];
  for (let k = 0; k < posts; k++) {
    const a = (k / posts) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    const y = heightAt(x, z);
    const post = new THREE.Group();
    post.position.set(x, y, z);
    post.add(column(0.07, 0.1, 0, height, 0x6d7480, 8));
    post.add(column(0.22, 0.22, 0, 0.14, 0x3b3f48, 8));
    post.add(box(0.5, 0.18, 0.3, 0x2e3139, [0, height + 0.05, 0]));
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, height + 0.05, 0.1);
    post.add(bulb);
    post.rotation.y = -a + Math.PI / 2;
    group.add(post);
    posts_.push({ x, y, z });
  }
  return {
    group,
    posts: posts_,
    setLevel: (level) => bulbMat.color.copy(BULB_OFF).lerp(BULB_ON, Math.min(1, Math.max(0, level))),
    dispose: () => { disposeTree(group); bulbGeo.dispose(); bulbMat.dispose(); },
  };
}
