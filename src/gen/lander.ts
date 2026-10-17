import * as THREE from 'three';
import type { Instrument, Module } from '../rules/types';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, column, hullMaterial, jitter, part } from './mesh';
import { CRUISER, CruiserRig } from './cruiser';
import { buildDish } from './dish';
import { seg } from './detail';
import type { LadderSpec } from '../rules/collision';

const C = {
  foil: 0xc9a227, foilDark: 0x8d7418, steel: 0xaab2bd, dark: 0x2c2f38, white: 0xe9edf3,
  orange: 0xf08a24, cellA: 0x1b2a6b, cellB: 0x26398a, battery: 0xd6a21e, nozzle: 0x1a1b20,
  nozzleRim: 0x6b7280, lens: 0x0b1020, rtg: 0x4a4f5c,
};

/** Dimensi tampilan per jenis lander (satuan scene, bukan data game). */
const LANDER_DIMS: Record<string, { r: number; h: number; foot: number }> = {
  lander_s: { r: 1.0, h: 1.1, foot: 1.7 },
  lander_m: { r: 1.35, h: 1.3, foot: 2.1 },
};
const TANK_DIMS: Record<string, { r: number; h: number }> = {
  tank_s: { r: 0.32, h: 0.75 }, tank_m: { r: 0.4, h: 1.0 }, tank_l: { r: 0.5, h: 1.35 },
};
const SOLAR_DIMS: Record<string, { w: number; l: number }> = {
  solar_s: { w: 1.6, l: 1.0 }, solar_m: { w: 2.2, l: 1.4 },
};
const BATTERY_DIMS: Record<string, number> = { battery_s: 0.45, battery_m: 0.65 };
const NOZZLE_DIMS: Record<string, { h: number; r: number }> = {
  eng_basic: { h: 0.6, r: 0.45 }, eng_eff: { h: 0.85, r: 0.58 },
};
const LEG_HEIGHT = 0.9;
/** Tinggi tiang antena gain tinggi di atas dek; di atas instrumen tertinggi (pengebor ~1,4) agar tidak bertumpukan. */
const HGA_MAST_H = 1.75;
/** Tangga kru: jarak mendatar (satuan model) dan jumlah anak tangga. */
const LADDER_RUN = 0.55;
const LADDER_RUNGS = 5;
/** Setengah lebar tangga (rel di x = +/-0,3 plus tebal rel). */
const LADDER_HALF_WIDTH = 0.36;
/** Ruang masuk kru: jari-jari tabung dan seberapa jauh menonjol dari dinding badan. */
const AIRLOCK_R = 0.42;
const AIRLOCK_PROTRUDE = 0.32;
/** Kelebihan radius pelat dek di atas badan (> amplitudo jitter badan 0,025). */
const DECK_OVERHANG = 0.06;
const DEFAULT_DIMS = LANDER_DIMS.lander_s;
/** Tulang punggung panel surya: tinggi, pusat y di atas dek, masuk ke pelat dek, dan celah engsel antar panel. */
const SOLAR_BOOM_H = 0.16;
const SOLAR_BOOM_Y = 0.09;
const SOLAR_BOOM_INSET = 0.1;
const SOLAR_HINGE_GAP = 0.1;

function strut(a: THREE.Vector3, b: THREE.Vector3, r: number, color: number): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = part(new THREE.CylinderGeometry(r, r, len, seg(5)), color);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

function polar(radius: number, angleDeg: number): [number, number] {
  const a = THREE.MathUtils.degToRad(angleDeg);
  return [Math.cos(a) * radius, Math.sin(a) * radius];
}

function buildSolar(id: string, side: 1 | -1, offset: number, deckY: number, bodyR: number): { mesh: THREE.Group; length: number } {
  const dim = SOLAR_DIMS[id] ?? SOLAR_DIMS.solar_s;
  const g = new THREE.Group();
  const zc = side * (bodyR + 0.25 + offset + dim.l / 2);
  g.position.set(0, deckY + 0.15, zc);
  g.add(box(dim.w + 0.1, 0.05, dim.l + 0.1, C.steel));
  const cols = 3, rows = 2;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cw = dim.w / cols - 0.04, cl = dim.l / rows - 0.04;
      g.add(box(cw, 0.04, cl, (i + j) % 2 === 0 ? C.cellA : C.cellB, [
        (i - (cols - 1) / 2) * (dim.w / cols), 0.03, (j - (rows - 1) / 2) * (dim.l / rows),
      ]));
    }
  }
  // Tulang punggung dari pelat dek (atau dari panel sebelumnya) sampai ujung luar panel: tanpa celah, tidak melayang.
  // Tingginya menumpang pada pelat dek (puncak deckY + 0,06) dan kerangka panel (dasar deckY + 0,115).
  const gap = offset === 0 ? (bodyR + 0.25) - (bodyR * 0.9 - SOLAR_BOOM_INSET) : SOLAR_HINGE_GAP + 0.05;
  const boom = box(0.12, SOLAR_BOOM_H, dim.l + gap, C.steel, [0, deckY + SOLAR_BOOM_Y - g.position.y, -side * gap / 2]);
  g.add(boom);
  if (offset > 0) g.add(box(0.2, SOLAR_BOOM_H + 0.04, 0.16, C.dark, [0, deckY + SOLAR_BOOM_Y - g.position.y, -side * (dim.l / 2 + 0.07)]));
  return { mesh: g, length: dim.l };
}

function buildInstrument(inst: Instrument, x: number, z: number, deckY: number, angleDeg: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, deckY, z);
  g.rotation.y = -THREE.MathUtils.degToRad(angleDeg);
  g.userData.instrumentId = inst.id;
  switch (inst.id) {
    case 'cam_pano':
      g.add(column(0.04, 0.04, 0, 0.55, C.steel, 5));
      g.add(box(0.34, 0.22, 0.26, C.dark, [0, 0.62, 0]));
      g.add(part(new THREE.CylinderGeometry(0.07, 0.07, 0.14, seg(6)), C.lens, [0.2, 0.62, 0], [0, 0, Math.PI / 2]));
      break;
    case 'weather_station':
      g.add(column(0.03, 0.03, 0, 0.85, C.steel, 5));
      for (let k = 0; k < 3; k++) {
        const [cx, cz] = polar(0.16, k * 120);
        g.add(part(new THREE.ConeGeometry(0.07, 0.12, seg(5)), C.white, [cx, 0.85, cz], [Math.PI, 0, 0]));
      }
      g.add(box(0.3, 0.02, 0.05, C.orange, [0, 0.6, 0]));
      break;
    case 'seismometer':
      g.add(column(0.3, 0.34, 0, 0.08, C.dark, 8));
      g.add(part(new THREE.SphereGeometry(0.26, seg(6), seg(4)), C.foilDark, [0, 0.1, 0]));
      break;
    case 'spectrometer':
      g.add(box(0.42, 0.3, 0.5, C.dark, [0, 0.2, 0]));
      g.add(part(new THREE.CylinderGeometry(0.07, 0.1, 0.45, seg(6)), C.steel, [0, 0.2, 0.45], [Math.PI / 2, 0, 0]));
      break;
    case 'sample_drill':
      g.add(column(0.07, 0.09, 0, 0.7, C.steel, 6));
      g.add(box(0.9, 0.08, 0.1, C.orange, [0.4, 0.7, 0]));
      g.add(column(0.05, 0.05, -0.05, 1.4, C.dark, 6, 0.82, 0));
      g.add(part(new THREE.ConeGeometry(0.07, 0.2, seg(5)), C.nozzleRim, [0.82, -0.15, 0], [Math.PI, 0, 0]));
      break;
    case 'ice_radar':
      g.add(column(0.04, 0.04, 0, 0.5, C.steel, 5));
      g.add(box(0.8, 0.05, 0.55, C.white, [0, 0.55, 0], [0.35, 0, 0]));
      g.add(box(0.7, 0.03, 0.45, C.cellA, [0, 0.58, 0], [0.35, 0, 0]));
      break;
    default:
      g.add(box(0.3, 0.3, 0.3, C.dark, [0, 0.15, 0]));
  }
  return g;
}

function insideInstrument(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.instrumentId) return true;
  return false;
}

/**
 * Gabungkan semua mesh badan (material hull) menjadi satu mesh agar hemat draw call. Instrumen sengaja
 * tidak digabung supaya tetap dapat dikenali per objek.
 */
function mergeHull(root: THREE.Group): void {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === hullMaterial && !insideInstrument(m, root)) meshes.push(m);
  });
  const geos = meshes.map((m) => {
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(m.matrixWorld);
    return g;
  });
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  for (const m of meshes) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  if (merged) {
    const body = new THREE.Mesh(merged, hullMaterial);
    body.name = 'lander-body';
    root.add(body);
  }
}

/**
 * Lander prosedural dari modul dan instrumen terpilih. Titik asal berada di telapak kaki (y = 0).
 * `userData.footRadius` dan `userData.height` dipakai untuk penempatan di roket/permukaan.
 */
export function buildLander(modules: Module[], instruments: Instrument[], carryRover = true): THREE.Group {
  const root = new THREE.Group();
  root.name = 'lander';
  const landerMod = modules.find((m) => m.kind === 'lander');
  const dims = (landerMod && LANDER_DIMS[landerMod.id]) || DEFAULT_DIMS;
  const bodyTop = LEG_HEIGHT + dims.h;

  // Badan + kaki dengan penyangga diagonal
  root.add(part(jitter(new THREE.CylinderGeometry(dims.r * 0.9, dims.r, dims.h, seg(8)), 21, 0.025), C.foil, [0, LEG_HEIGHT + dims.h / 2, 0]));
  // Pelat dek: sedikit lebih lebar dan lebih tinggi daripada tutup badan agar permukaannya tidak sebidang
  // (sebidang menyebabkan z-fighting: kuning menembus abu-abu karena badan di-jitter).
  root.add(column(dims.r * 0.9 + DECK_OVERHANG, dims.r * 0.9 + DECK_OVERHANG, bodyTop - 0.06, 0.12, C.dark, 8));
  for (let k = 0; k < 4; k++) {
    const [fx, fz] = polar(dims.foot, 45 + k * 90);
    const [hx, hz] = polar(dims.r * 0.95, 45 + k * 90);
    const [sx, sz] = polar(dims.r * 0.5, 45 + k * 90);
    root.add(strut(new THREE.Vector3(hx, LEG_HEIGHT + 0.1, hz), new THREE.Vector3(fx, 0.12, fz), 0.06, C.steel));
    root.add(strut(new THREE.Vector3(sx, LEG_HEIGHT + dims.h * 0.7, sz), new THREE.Vector3(fx * 0.75 + hx * 0.25, 0.5, fz * 0.75 + hz * 0.25), 0.04, C.steel));
    root.add(column(0.3, 0.34, 0, 0.1, C.nozzleRim, 6, fx, fz));
  }

  // Mesin
  const engine = modules.find((m) => m.kind === 'engine');
  if (engine) {
    const nz = NOZZLE_DIMS[engine.id] ?? NOZZLE_DIMS.eng_basic;
    root.add(column(nz.r * 0.35, nz.r, LEG_HEIGHT + 0.05 - nz.h, nz.h, C.nozzleRim, 8));
    root.add(column(nz.r * 0.28, nz.r * 0.85, LEG_HEIGHT + 0.07 - nz.h, nz.h * 0.9, C.nozzle, 8));
  }

  // Tangki di sisi +x / -x
  modules.filter((m) => m.kind === 'tank').forEach((m, i) => {
    const t = TANK_DIMS[m.id] ?? TANK_DIMS.tank_s;
    const x = (i === 0 ? 1 : -1) * (dims.r + t.r + 0.08);
    const cy = LEG_HEIGHT + dims.h / 2;
    root.add(column(t.r, t.r, cy - t.h / 2, t.h, C.white, 8, x, 0));
    root.add(column(t.r * 1.03, t.r * 1.03, cy - 0.1, 0.2, C.orange, 8, x, 0));
    root.add(part(new THREE.ConeGeometry(t.r, 0.22, seg(8)), C.white, [x, cy + t.h / 2 + 0.11, 0]));
    root.add(part(new THREE.ConeGeometry(t.r, 0.22, seg(8)), C.white, [x, cy - t.h / 2 - 0.11, 0], [Math.PI, 0, 0]));
    root.add(box(0.12, 0.12, dims.r * 0.4, C.steel, [x * 0.82, cy, 0]));
  });

  // Panel surya (bergantian +z / -z, panel ketiga menyambung keluar)
  const offsets = { 1: 0, [-1]: 0 } as Record<number, number>;
  modules.filter((m) => m.kind === 'solar').forEach((m, i) => {
    const side: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const { mesh, length } = buildSolar(m.id, side, offsets[side], bodyTop, dims.r);
    root.add(mesh);
    offsets[side] += length + SOLAR_HINGE_GAP;
  });

  // Baterai di sudut 45 derajat / 225 derajat bawah
  modules.filter((m) => m.kind === 'battery').forEach((m, i) => {
    const s = BATTERY_DIMS[m.id] ?? 0.45;
    const [bx, bz] = polar(dims.r + s * 0.5 + 0.02, i === 0 ? 135 : 225);
    root.add(box(s, s * 0.9, s, C.battery, [bx, LEG_HEIGHT + s * 0.55, bz]));
    root.add(box(s * 0.5, 0.06, s * 0.5, C.dark, [bx, LEG_HEIGHT + s, bz]));
  });

  // RTG di belakang (sudut 315 derajat)
  if (modules.some((m) => m.kind === 'rtg')) {
    const [rx, rz] = polar(dims.r + 0.4, 315);
    root.add(column(0.2, 0.2, LEG_HEIGHT + 0.2, 1.0, C.rtg, 8, rx, rz));
    for (let k = 0; k < 4; k++) {
      const [fx, fz] = polar(0.3, k * 90);
      root.add(box(0.28, 0.9, 0.04, C.orange, [rx + fx * 0.6, LEG_HEIGHT + 0.7, rz + fz * 0.6], [0, -THREE.MathUtils.degToRad(k * 90), 0]));
    }
  }

  // Antena (tengah dek) dan relay
  let topExtra = 1.2;
  for (const m of modules.filter((x) => x.kind === 'antenna')) {
    if (m.id === 'ant_hga') {
      // Tiang tinggi: parabola berada di atas semua instrumen (tinggi <= 1,4) sehingga tidak menimpa stasiun cuaca dan kawan-kawan
      root.add(column(0.045, 0.045, bodyTop, HGA_MAST_H, C.steel, 6));
      const dish = buildDish(0.6, 0.22, { dish: C.white, strut: C.steel, hub: C.dark, feed: C.orange });
      dish.position.set(0, bodyTop + HGA_MAST_H, 0);
      dish.rotation.set(0.5, 0, 0);
      root.add(dish);
      topExtra = Math.max(topExtra, HGA_MAST_H + 0.9);
    } else if (m.id === 'ant_lga') {
      root.add(column(0.025, 0.025, bodyTop, 0.9, C.steel, 5));
      root.add(part(new THREE.SphereGeometry(0.07, seg(5), seg(4)), C.orange, [0, bodyTop + 0.92, 0]));
    } else {
      const [ax, az] = polar(0.3, 200);
      root.add(column(0.03, 0.03, bodyTop, 0.5, C.steel, 5, ax, az));
      root.add(part(new THREE.TorusGeometry(0.14, 0.03, seg(4), seg(8)), C.orange, [ax, bodyTop + 0.55, az], [Math.PI / 2, 0, 0]));
    }
  }

  // Akses kru: pintu bulat, jendela, serambi, dan tangga turun ke permukaan di sisi +z (di antara dua kaki depan)
  const hatchY = LEG_HEIGHT + 0.55;
  // Ruang masuk (airlock): tabung yang menonjol keluar dinding sehingga tidak ada dinding kuning yang menutup pintunya,
  // dengan pintu gelap di ujung luar dan bingkai cincin. Jari-jari dinding dibaca dari bentuk badan sebenarnya.
  const wallR = (y: number): number => dims.r * (1 - 0.1 * ((y - LEG_HEIGHT) / dims.h));
  const lockStart = wallR(hatchY) * 0.8, lockEnd = wallR(hatchY) + AIRLOCK_PROTRUDE;
  root.add(part(new THREE.CylinderGeometry(AIRLOCK_R, AIRLOCK_R, lockEnd - lockStart, seg(14)), C.white, [0, hatchY, (lockStart + lockEnd) / 2], [Math.PI / 2, 0, 0]));
  root.add(part(new THREE.CylinderGeometry(AIRLOCK_R * 0.8, AIRLOCK_R * 0.8, 0.05, seg(14)), C.dark, [0, hatchY, lockEnd + 0.01], [Math.PI / 2, 0, 0]));
  root.add(part(new THREE.TorusGeometry(AIRLOCK_R * 0.92, 0.04, seg(6), seg(18)), C.steel, [0, hatchY, lockEnd - 0.01]));
  for (const side of [-1, 1]) {
    const a = 90 - side * 38;
    const [wx, wz] = polar(wallR(LEG_HEIGHT + dims.h * 0.62) + 0.02, a);
    root.add(box(0.34, 0.24, 0.12, C.lens, [wx, LEG_HEIGHT + dims.h * 0.62, wz], [0, Math.PI / 2 - THREE.MathUtils.degToRad(a), 0]));
  }
  const porchZ = dims.r + 0.5;
  root.add(box(0.95, 0.06, 0.62, C.steel, [0, LEG_HEIGHT + 0.18, porchZ]));
  // Pagar samping serambi (bukan pagar depan, agar pintu tidak tertutup dari depan)
  for (const x of [-0.46, 0.46]) root.add(box(0.04, 0.26, 0.5, C.steel, [x, LEG_HEIGHT + 0.34, porchZ]));
  const ladderTop = new THREE.Vector3(0, LEG_HEIGHT + 0.18, porchZ + 0.28);
  const ladderBottom = new THREE.Vector3(0, 0.05, porchZ + 0.28 + LADDER_RUN);
  for (const x of [-0.3, 0.3]) {
    root.add(strut(ladderTop.clone().add(new THREE.Vector3(x, 0, 0)), ladderBottom.clone().add(new THREE.Vector3(x, 0, 0)), 0.03, C.steel));
  }
  for (let k = 1; k <= LADDER_RUNGS; k++) {
    const t = k / (LADDER_RUNGS + 1);
    const p = ladderTop.clone().lerp(ladderBottom, t);
    root.add(box(0.62, 0.025, 0.05, C.steel, [0, p.y, p.z]));
  }
  const crewReach = porchZ + 0.28 + LADDER_RUN;

  // Instrumen pada slot dek (6 slot, 60 derajat), berjarak dari panel di +/-z
  const slotAngles = [30, 150, 210, 330, 90, 270];
  instruments.slice(0, slotAngles.length).forEach((inst, i) => {
    const [ix, iz] = polar(dims.r * 0.6, slotAngles[i]);
    root.add(buildInstrument(inst, ix, iz, bodyTop, slotAngles[i]));
  });

  // Lunar Cruiser dibawa menempel di sisi badan (di bawah panel surya) selama penerbangan.
  let roverReach = 0;
  if (carryRover && modules.some((m) => m.kind === 'rover')) {
    const rig = new CruiserRig();
    const z = -(dims.r + CRUISER.width * CRUISER.carriedScale * 0.5 + 0.12);
    rig.root.scale.setScalar(CRUISER.carriedScale);
    rig.root.rotation.y = Math.PI / 2;
    rig.root.position.set(0, LEG_HEIGHT + 0.08, z);
    root.add(rig.root);
    const reach = Math.abs(z) - dims.r;
    for (const x of [-0.3, 0.3]) root.add(box(0.06, 0.06, reach, C.steel, [x, LEG_HEIGHT + 0.12, -(dims.r + reach / 2)]));
    root.userData.carriesRover = true;
    roverReach = Math.abs(z) + CRUISER.length * CRUISER.carriedScale * 0.5;
  }

  mergeHull(root);
  root.userData.footRadius = dims.foot;
  /** Jangkauan terjauh dari sumbu (kaki, tangga, Cruiser): dipakai agar muat di dalam fairing roket. */
  root.userData.reach = Math.max(dims.foot, crewReach, roverReach);
  root.userData.height = bodyTop + topExtra;
  root.userData.deckHeight = bodyTop;
  const ladder: LadderSpec = { zTop: ladderTop.z, zBottom: ladderBottom.z, yTop: ladderTop.y, yBottom: ladderBottom.y, halfWidth: LADDER_HALF_WIDTH };
  root.userData.ladder = ladder;
  return root;
}
