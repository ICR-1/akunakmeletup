import * as THREE from 'three';
import { LANDER_IN_FAIRING_SCALE, ROCKET_RADIUS_REF_PAYLOAD_KG } from '../core/constants';
import type { Rocket } from '../rules/types';
import { box, column, part, shellMaterial } from './mesh';
import { seg } from './detail';

const C = {
  hull: 0xe9edf3, stripe: 0xf08a24, dark: 0x30333c, steel: 0x9aa3b0, nozzle: 0x1a1b20,
  rim: 0x6b7280, cyan: 0x4fd1ff,
};
/** Aksen warna tiap tahap agar mudah dibedakan di preview. */
export const STAGE_ACCENTS = [0xf08a24, 0xd94f4f, 0xe0b73a, 0x4f8fe0];

/** Dimensi tampilan (satuan scene). */
const LOWER_STAGE_HEIGHT = 7;
const STAGE_HEIGHT_STEP = 0.9;
const MIN_STAGE_HEIGHT = 4;
/** Modul transfer: tahap yang tersisa menuju Bulan/Mars, dibuat tinggi dan kokoh agar tidak terlihat sisa. */
const TRANSFER_HEIGHT = 5.2;
const FAIRING_CYLINDER_HEIGHT = 3.2;
const FAIRING_CONE_HEIGHT = 2.4;
const BOOSTER_COUNT = 4;
/** Panjang nosel di bawah dasar tahap; dasar roket sebenarnya berada sekian satuan di bawah y = 0. */
export const NOZZLE_LENGTH = 0.9;

export interface RocketModel {
  root: THREE.Group;
  /** Indeks sama dengan indeks tahap pada data roket (0 = paling bawah). */
  stageGroups: THREE.Group[];
  fairingLeft: THREE.Group;
  fairingRight: THREE.Group;
  /** Slot untuk lander di bagian atas tumpukan. */
  landerSlot: THREE.Group;
  /** Cincin batas tahap (untuk preview Desain). */
  boundaryRings: THREE.Mesh[];
  radius: number;
  totalHeight: number;
  /** Tinggi puncak badan roket (tanpa fairing) per tahap yang masih menempel. */
  stageTopY: number[];
}

const isBooster = (name: string): boolean => /booster/i.test(name);

function nozzle(r: number, y0: number, x = 0, z = 0): THREE.Group {
  const g = new THREE.Group();
  g.add(column(r * 0.35, r * 0.62, y0 - 0.9, 0.9, C.rim, 8, x, z));
  g.add(column(r * 0.28, r * 0.52, y0 - 0.88, 0.85, C.nozzle, 8, x, z));
  return g;
}

function buildStageBody(index: number, r: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `stage-${index}`;
  const accent = STAGE_ACCENTS[index % STAGE_ACCENTS.length];
  g.add(column(r * 0.97, r, 0, h, C.hull, 8));
  g.add(column(r * 1.01, r * 1.01, h * 0.12, 0.38, accent, 8));
  g.add(column(r * 1.01, r * 1.01, h * 0.55, 0.12, C.dark, 8));
  g.add(column(r * 1.05, r * 1.05, h - 0.25, 0.25, C.dark, 8));
  g.add(nozzle(r, 0));
  return g;
}

/**
 * Modul transfer (tahap terakhir): tangki propelan besar berkubah ganda dengan cincin penguat, rok antar-tahap,
 * rangka struktur, empat pod RCS, dan nosel berukuran lebih besar daripada tahap bawah.
 */
function buildTransferStage(index: number, r: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `stage-${index}`;
  const accent = STAGE_ACCENTS[index % STAGE_ACCENTS.length];
  // Rok mesin di bawah, badan tangki, dan rok atas
  g.add(column(r * 0.9, r * 1.0, 0, h * 0.14, C.dark, 12));
  g.add(column(r * 0.98, r * 0.98, h * 0.14, h * 0.72, C.hull, 12));
  g.add(column(r * 1.0, r * 0.9, h * 0.86, h * 0.14, C.dark, 12));
  // Kubah tangki tersembul di antara cincin
  g.add(part(new THREE.SphereGeometry(r * 0.97, seg(12), seg(6), 0, Math.PI * 2, 0, Math.PI / 2), C.hull, [0, h * 0.86, 0]));
  // Cincin penguat dan aksen tahap
  for (const f of [0.3, 0.5, 0.7]) g.add(column(r * 1.03, r * 1.03, h * f, 0.1, f === 0.5 ? accent : C.steel, 12));
  // Rangka struktur vertikal di sekeliling tangki
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    g.add(box(0.1, h * 0.72, 0.1, C.steel, [Math.cos(a) * r * 1.02, h * 0.5, Math.sin(a) * r * 1.02]));
  }
  // Pod RCS (empat sudut) dengan nosel kecil
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * r * 1.12, z = Math.sin(a) * r * 1.12;
    g.add(box(0.34, 0.5, 0.34, C.dark, [x, h * 0.82, z]));
    g.add(column(0.05, 0.12, h * 0.82 - 0.4, 0.22, C.rim, 6, x, z));
  }
  g.add(nozzle(r * 1.2, 0));
  return g;
}

/** Posisi dan radius tiap booster samping (lokal terhadap grup tahap booster); dipakai badan dan api mesin. */
export function boosterLayout(coreR: number): { x: number; z: number; r: number }[] {
  const br = coreR * 0.38;
  return Array.from({ length: BOOSTER_COUNT }, (_, k) => {
    const a = (k / BOOSTER_COUNT) * Math.PI * 2 + Math.PI / 4;
    return { x: Math.cos(a) * (coreR + br + 0.05), z: Math.sin(a) * (coreR + br + 0.05), r: br };
  });
}

/** Apakah tahap ini berupa booster samping (api mesinnya di empat titik, bukan di tengah). */
export const isBoosterStage = (name: string): boolean => isBooster(name);

function buildBoosters(index: number, coreR: number, h: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `stage-${index}`;
  const accent = STAGE_ACCENTS[index % STAGE_ACCENTS.length];
  const br = coreR * 0.38;
  for (let k = 0; k < BOOSTER_COUNT; k++) {
    const a = (k / BOOSTER_COUNT) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * (coreR + br + 0.05);
    const z = Math.sin(a) * (coreR + br + 0.05);
    g.add(column(br, br, 0, h, C.hull, 7, x, z));
    g.add(column(br * 1.03, br * 1.03, h * 0.15, 0.3, accent, 7, x, z));
    g.add(part(new THREE.ConeGeometry(br, br * 2.2, seg(7)), C.dark, [x, h + br * 1.1, z]));
    g.add(nozzle(br * 1.3, 0, x, z));
  }
  return g;
}

function buildFairingHalf(side: 1 | -1, radius: number, y0: number): THREE.Group {
  const g = new THREE.Group();
  g.name = side === 1 ? 'fairing-right' : 'fairing-left';
  const thetaStart = side === 1 ? 0 : Math.PI; // belahan +x / -x
  const cyl = new THREE.CylinderGeometry(radius, radius, FAIRING_CYLINDER_HEIGHT, seg(8), 1, true, thetaStart, Math.PI);
  g.add(part(cyl, C.hull, [0, y0 + FAIRING_CYLINDER_HEIGHT / 2, 0], [0, 0, 0], shellMaterial));
  const cone = new THREE.CylinderGeometry(radius * 0.08, radius, FAIRING_CONE_HEIGHT, seg(8), 1, true, thetaStart, Math.PI);
  g.add(part(cone, C.hull, [0, y0 + FAIRING_CYLINDER_HEIGHT + FAIRING_CONE_HEIGHT / 2, 0], [0, 0, 0], shellMaterial));
  g.add(part(new THREE.CylinderGeometry(radius * 1.02, radius * 1.02, 0.12, seg(8), 1, true, thetaStart, Math.PI), C.stripe, [0, y0 + 0.5, 0], [0, 0, 0], shellMaterial));
  return g;
}

/** Roket modular: satu THREE.Group per tahap, fairing kiri/kanan, dan slot lander (PRD 12). */
export function buildRocket(rocket: Rocket): RocketModel {
  const root = new THREE.Group();
  root.name = `rocket-${rocket.id}`;
  const n = rocket.stages.length;
  const radius = Math.cbrt(rocket.payloadToLeoKg / ROCKET_RADIUS_REF_PAYLOAD_KG);
  const stageGroups: THREE.Group[] = [];
  const stageTopY: number[] = [];
  const boundaryRings: THREE.Mesh[] = [];
  let y = 0;

  const bodyHeight = (i: number): number => Math.max(MIN_STAGE_HEIGHT, LOWER_STAGE_HEIGHT - STAGE_HEIGHT_STEP * i);

  rocket.stages.forEach((stage, i) => {
    const last = i === n - 1;
    let group: THREE.Group;
    if (isBooster(stage.name)) {
      const h = bodyHeight(i) + 0.5;
      group = buildBoosters(i, radius, h);
      group.position.y = y;
      stageTopY.push(y + h);
    } else {
      const h = last ? TRANSFER_HEIGHT : bodyHeight(i);
      group = last ? buildTransferStage(i, radius, h) : buildStageBody(i, radius, h);
      group.position.y = y;
      y += h;
      stageTopY.push(y);
      // Cincin batas dipasang pada grup tahapnya sendiri (koordinat lokal = puncak tahap) agar ikut terlepas
      // saat tahap dilepas; di root cincin tertinggal melayang sebagai cakram biru setelah separasi.
      const ring = part(new THREE.CylinderGeometry(radius * 1.12, radius * 1.12, 0.08, seg(16)), C.cyan, [0, h, 0]);
      ring.name = `boundary-${i}`;
      boundaryRings.push(ring);
      group.add(ring);
    }
    root.add(group);
    stageGroups.push(group);
  });

  const landerSlot = new THREE.Group();
  landerSlot.name = 'lander-slot';
  landerSlot.position.y = y;
  root.add(landerSlot);

  const fairingR = Math.max(radius * 0.97, 0.9);
  const fairingLeft = buildFairingHalf(-1, fairingR, y);
  const fairingRight = buildFairingHalf(1, fairingR, y);
  root.add(fairingLeft, fairingRight);

  // Penyangga dudukan lander di atas modul transfer
  landerSlot.add(box(radius * 0.9, 0.12, radius * 0.9, C.steel, [0, 0.06, 0]));

  return {
    root, stageGroups, fairingLeft, fairingRight, landerSlot, boundaryRings, radius,
    totalHeight: y + FAIRING_CYLINDER_HEIGHT + FAIRING_CONE_HEIGHT, stageTopY,
  };
}

/** Pasang lander (sudah dibangun) pada slot dan skalakan agar muat di dalam fairing. */
export function mountLander(model: RocketModel, lander: THREE.Group): void {
  const foot = (lander.userData.reach as number | undefined) ?? (lander.userData.footRadius as number | undefined) ?? 1.7;
  const fairingR = Math.max(model.radius * 0.97, 0.9);
  const scale = Math.min(LANDER_IN_FAIRING_SCALE, (fairingR * 0.92) / foot);
  lander.scale.setScalar(scale);
  lander.position.y = 0.12;
  model.landerSlot.add(lander);
}

/** Titik pivot kamera/rotasi roket berada sekian satuan di atas slot lander (puncak badan). */
export const PIVOT_LIFT = 0.5;

/**
 * Tata letak peluncuran: `rootY` menaruh pivot (puncak roket) di y = 0, dan `padY` adalah tinggi tanah yang
 * tepat menyentuh dasar nosel. Tanah harus berada di `padY`, bukan y = 0, agar roket berdiri di atasnya.
 */
export function launchLayout(model: RocketModel): { rootY: number; padY: number } {
  const rootY = -(model.landerSlot.position.y + PIVOT_LIFT);
  return { rootY, padY: rootY - NOZZLE_LENGTH };
}
