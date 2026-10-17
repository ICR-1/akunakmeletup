import * as THREE from 'three';
import { createRng, rngRange } from '../core/rng';
import { seg } from './detail';
import { buildDish } from './dish';
import { box, column, mergeHullMeshes, part } from './mesh';

/**
 * Bangunan pendukung di pulau peluncuran: hanggar, pusat kendali, tangki bahan bakar, dan blok servis. Semua dibangun
 * dari primitif (pintu, jendela, atap, antena) lalu digabung per bangunan agar hemat draw call. Titik asal = tanah,
 * sisi depan menghadap +z.
 */
export type FacilityKind = 'hangar' | 'control' | 'tanks' | 'service';

const F = {
  wall: 0xaab4c4, wallDark: 0x7d8797, white: 0xe9edf2, roof: 0x59627a, door: 0x262c3a, doorRib: 0x3a4256,
  stripe: 0xf08a24, glass: 0x7fc4e6, steel: 0x6b7280, concrete: 0x8a909c, yellow: 0xf2c230, red: 0xff4b4b,
} as const;

export interface FacilityPlan { kind: FacilityKind; x: number; z: number; rot: number }

/** Jarak minimum antar bangunan dan jangkauan dari landasan (m); area ini di dalam zona bebas pohon (95 m). */
export const FACILITY_LAYOUT = { count: 5, minRadiusM: 58, maxRadiusM: 118, minSpacingM: 46 } as const;
/** Skala bangunan (meter nyata): hanggar sekitar 25 x 36 m dengan tinggi 13 m, pusat kendali sekitar 22 x 18 x 16 m. */
export const FACILITY_SCALE = 1.8;

const KINDS: readonly FacilityKind[] = ['hangar', 'control', 'tanks', 'hangar', 'service'];

/** Tata letak bangunan (murni, deterministik): tersebar mengelilingi landasan, saling berjarak, menghadap landasan. */
export function planFacilities(seed: number): FacilityPlan[] {
  const rng = createRng((seed ^ 0xfac11) >>> 0);
  const plans: FacilityPlan[] = [];
  let guard = 0;
  while (plans.length < FACILITY_LAYOUT.count && guard++ < 400) {
    const a = rngRange(rng, 0, Math.PI * 2);
    const d = rngRange(rng, FACILITY_LAYOUT.minRadiusM, FACILITY_LAYOUT.maxRadiusM);
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (plans.some((p) => Math.hypot(p.x - x, p.z - z) < FACILITY_LAYOUT.minSpacingM)) continue;
    // Sisi depan (+z lokal) menghadap pusat landasan, sedikit dimiringkan agar tidak terlalu kaku
    plans.push({ kind: KINDS[plans.length], x, z, rot: Math.atan2(-x, -z) + rngRange(rng, -0.35, 0.35) });
  }
  return plans;
}

const slab = (g: THREE.Group, w: number, d: number): void => { g.add(box(w, 0.3, d, F.concrete, [0, 0.15, 0])); };

function hangar(g: THREE.Group, w: number, h: number, d: number): void {
  slab(g, w + 2, d + 2);
  const y0 = 0.3;
  g.add(box(w, h, d, F.wall, [0, y0 + h / 2, 0]));
  g.add(box(w + 0.1, 0.8, d + 0.1, F.wallDark, [0, y0 + 0.4, 0]));
  // Atap pelana: dua pelat miring dan balok puncak
  const a = 0.28;
  const roofH = (w / 2) * Math.tan(a);
  const slabW = w / 2 / Math.cos(a) + 0.5;
  for (const side of [-1, 1]) g.add(box(slabW, 0.4, d + 0.8, F.roof, [side * (w / 4), y0 + h + roofH / 2 + 0.1, 0], [0, 0, -side * a]));
  g.add(box(0.6, 0.45, d + 0.9, F.wallDark, [0, y0 + h + roofH + 0.15, 0]));
  // Pintu hanggar besar di sisi depan dengan rusuk dan garis oranye di atasnya
  const dw = w * 0.72, dh = h * 0.78;
  g.add(box(dw, dh, 0.3, F.door, [0, y0 + dh / 2, d / 2 + 0.1]));
  for (let k = -3; k <= 3; k++) g.add(box(0.14, dh, 0.1, F.doorRib, [k * (dw / 7), y0 + dh / 2, d / 2 + 0.3]));
  g.add(box(dw + 0.6, 0.55, 0.4, F.stripe, [0, y0 + dh + 0.35, d / 2 + 0.12]));
  g.add(box(w * 0.14, 1.6, 0.3, F.door, [w / 2 - 0.9, y0 + 0.8, d / 2 + 0.1]));
  // Jendela tinggi di sisi, ventilasi di atap
  for (const side of [-1, 1]) for (let k = 0; k < 4; k++) g.add(box(0.2, 1.1, 2.2, F.glass, [side * (w / 2 + 0.05), y0 + h * 0.72, -d / 2 + 3 + k * (d - 6) / 3]));
  for (const z of [-d * 0.22, d * 0.22]) g.add(box(1.4, 0.9, 1.4, F.steel, [0, y0 + h + roofH + 0.7, z]));
}

function control(g: THREE.Group, w: number, h: number, d: number): void {
  slab(g, w + 3, d + 3);
  const y0 = 0.3;
  const lowH = h * 0.55, upH = h * 0.45;
  g.add(box(w, lowH, d, F.wall, [0, y0 + lowH / 2, 0]));
  g.add(box(w * 0.86, upH, d * 0.86, F.white, [0, y0 + lowH + upH / 2, -d * 0.04]));
  g.add(box(w + 0.5, 0.35, d + 0.5, F.roof, [0, y0 + lowH, 0]));
  g.add(box(w * 0.86 + 0.5, 0.4, d * 0.86 + 0.5, F.roof, [0, y0 + h + 0.05, -d * 0.04]));
  // Pita jendela di lantai atas (depan dan samping) dan jendela lantai bawah
  const fz = d * 0.43 - d * 0.04 + 0.05;
  g.add(box(w * 0.74, 1.7, 0.2, F.glass, [0, y0 + lowH + upH * 0.55, fz]));
  for (const side of [-1, 1]) g.add(box(0.2, 1.7, d * 0.62, F.glass, [side * (w * 0.43 + 0.05), y0 + lowH + upH * 0.55, -d * 0.04]));
  for (let k = -2; k <= 2; k++) if (k !== 0) g.add(box(1.3, 1.5, 0.2, F.glass, [k * (w / 5.6), y0 + lowH * 0.55, d / 2 + 0.05]));
  g.add(box(2.0, 2.6, 0.3, F.door, [0, y0 + 1.3, d / 2 + 0.1]));
  g.add(box(3.4, 0.25, 1.8, F.stripe, [0, y0 + 2.9, d / 2 + 0.9]));
  for (const x of [-1.6, 1.6]) g.add(column(0.1, 0.1, y0, 2.9, F.steel, 6, x, d / 2 + 1.7));
  // Atap: tiang antena, parabola, lampu merah, dan unit pendingin
  const rt = y0 + h + 0.25;
  g.add(column(0.14, 0.18, rt, 7, F.steel, 6, -w * 0.28, -d * 0.1));
  g.add(box(2.4, 0.14, 0.14, F.steel, [-w * 0.28, rt + 5.2, -d * 0.1]));
  g.add(part(new THREE.SphereGeometry(0.28, seg(6), seg(4)), F.red, [-w * 0.28, rt + 7.2, -d * 0.1]));
  const dish = buildDish(1.3, 0.5, { dish: F.white, strut: F.steel, hub: F.door, feed: F.stripe });
  dish.position.set(w * 0.22, rt + 2.1, -d * 0.1);
  dish.rotation.set(Math.PI / 2 - 0.7, 0.3, 0);
  g.add(column(0.1, 0.12, rt, 2.1, F.steel, 6, w * 0.22, -d * 0.1), dish);
  for (const x of [w * 0.05, w * 0.3]) g.add(box(1.6, 0.8, 1.4, F.steel, [x, rt + 0.4, d * 0.18]));
}

function tanks(g: THREE.Group): void {
  const r = 3, h = 9, y0 = 0.5;
  g.add(box(r * 2 * 3 + 6, 0.5, r * 2 + 4, F.concrete, [0, 0.25, 0]));
  for (let k = -1; k <= 1; k++) {
    const x = k * (r * 2 + 1.2);
    g.add(column(r, r, y0, h, F.white, 12, x, 0));
    g.add(column(r * 1.02, r * 1.02, y0 + h * 0.45, 0.8, F.stripe, 12, x, 0));
    g.add(column(r * 1.02, r * 1.02, y0 + 0.3, 0.45, F.wallDark, 12, x, 0));
    g.add(part(new THREE.SphereGeometry(r, seg(12), seg(6), 0, Math.PI * 2, 0, Math.PI / 2), F.white, [x, y0 + h, 0]));
    g.add(column(0.18, 0.18, y0 + h + r * 0.9, 1.2, F.steel, 6, x, 0));
    g.add(box(0.5, h * 0.9, 0.12, F.steel, [x + r * 0.9, y0 + h * 0.45, r * 0.4], [0, 0, 0]));
  }
  // Pipa penghubung dan jalur pejalan di puncak
  g.add(box(r * 2 * 2 + 2.4, 0.45, 0.45, F.steel, [0, y0 + 1.2, r + 0.7]));
  g.add(box(r * 2 * 2 + 2.4, 0.15, 1.4, F.steel, [0, y0 + h * 0.9, -r * 0.95]));
  g.add(box(2.4, 1.6, 2.4, F.wall, [r * 4.4, 0.3 + 0.8, 0]));
  g.add(box(1.0, 1.3, 0.2, F.door, [r * 4.4, 0.3 + 0.65, 1.3]));
}

function service(g: THREE.Group, w: number, h: number, d: number): void {
  slab(g, w + 2, d + 2);
  const y0 = 0.3;
  g.add(box(w, h, d, F.wall, [0, y0 + h / 2, 0]));
  g.add(box(w + 0.6, 0.35, d + 0.6, F.roof, [0, y0 + h + 0.1, 0]));
  g.add(box(w * 0.8, 0.25, 0.4, F.stripe, [0, y0 + h * 0.62, d / 2 + 0.05]));
  g.add(box(1.8, h * 0.72, 0.3, F.door, [-w * 0.2, y0 + h * 0.36, d / 2 + 0.1]));
  g.add(box(2.2, 1.2, 0.2, F.glass, [w * 0.22, y0 + h * 0.55, d / 2 + 0.05]));
  for (let k = 0; k < 3; k++) g.add(box(1.5, 0.9, 1.5, F.steel, [-w * 0.3 + k * 2.4, y0 + h + 0.7, 0]));
  for (const z of [-d * 0.2, d * 0.2]) g.add(box(0.15, 1.2, 1.6, F.wallDark, [w / 2 + 0.05, y0 + h * 0.5, z]));
  g.add(column(0.08, 0.1, y0, 6, F.steel, 6, w / 2 + 2, d / 2));
  g.add(box(0.7, 0.35, 0.5, F.yellow, [w / 2 + 2, y0 + 6, d / 2 + 0.2]));
}

/** Satu bangunan lengkap (digabung menjadi satu mesh lambung + parabola/tiang tersendiri bila ada). */
export function buildFacility(kind: FacilityKind, seed = 1): THREE.Group {
  const g = new THREE.Group();
  g.name = `facility-${kind}`;
  const rng = createRng((seed ^ 0xb111) >>> 0);
  const k = rngRange(rng, 0.9, 1.15);
  if (kind === 'hangar') hangar(g, 14 * k, 7 * k, 20 * k);
  else if (kind === 'control') control(g, 12 * k, 9 * k, 10 * k);
  else if (kind === 'tanks') tanks(g);
  else service(g, 9 * k, 4.2 * k, 6 * k);
  mergeHullMeshes(g, `${kind}-body`);
  return g;
}

/** Seluruh kompleks bangunan (dalam meter nyata) menurut `planFacilities`; pemanggil menskalakan grup ini bersama pulau. */
export function buildFacilityComplex(seed: number): THREE.Group {
  const complex = new THREE.Group();
  complex.name = 'facility-complex';
  planFacilities(seed).forEach((plan, i) => {
    const building = buildFacility(plan.kind, seed + i);
    building.scale.setScalar(FACILITY_SCALE);
    building.position.set(plan.x, 0, plan.z);
    building.rotation.y = plan.rot;
    complex.add(building);
  });
  return complex;
}
