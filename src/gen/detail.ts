import * as THREE from 'three';

/**
 * Tingkat detail model 3D. "high" (default): geometri halus bersegmen banyak dengan shading mulus dan
 * tepi membulat; "low": tampilan low-poly flat shading asli (untuk perangkat lemah). Dipilih di bilah
 * pengaturan dan berlaku pada model yang dibangun setelahnya (scene dibangun ulang saat diganti).
 */
export type DetailLevel = 'low' | 'high';

export const DETAIL = {
  /** Pengali jumlah segmen melingkar/bola per tingkat. */
  segmentMul: { low: 1, high: 2 },
  /** Tambahan subdivisi ikosahedron (batu, helm, awan). */
  icoExtra: { low: 0, high: 1 },
  /** Radius sudut membulat (rasio terhadap sisi terpendek) untuk kotak; 0 = kotak tajam. */
  boxBevel: { low: 0, high: 0.25 },
  boxBevelSegments: 1,
  /** Pengali resolusi grid terrain. */
  terrainMul: { low: 1, high: 1.25 },
  /** Batas segmen agar jumlah segitiga tetap terkendali. */
  maxSegments: 32,
} as const;

let level: DetailLevel = 'high';
const flatMaterials = new Set<THREE.Material & { flatShading: boolean }>();

export const getDetail = (): DetailLevel => level;
export const isHigh = (): boolean => level === 'high';

/** Material yang harus flat saat "low" dan mulus saat "high". */
export function registerDetailMaterial<T extends THREE.Material & { flatShading: boolean }>(mat: T): T {
  flatMaterials.add(mat);
  mat.flatShading = level === 'low';
  return mat;
}

export function setDetail(next: DetailLevel): void {
  level = next;
  for (const m of flatMaterials) {
    m.flatShading = next === 'low';
    m.needsUpdate = true;
  }
}

/** Jumlah segmen setelah dikalikan tingkat detail (minimal 3). */
export function seg(n: number): number {
  return Math.min(DETAIL.maxSegments, Math.max(3, Math.round(n * DETAIL.segmentMul[level])));
}

/** Detail ikosahedron: dasar + tambahan tingkat detail. */
export const ico = (base: number): number => base + DETAIL.icoExtra[level];

export const boxBevel = (): number => DETAIL.boxBevel[level];
