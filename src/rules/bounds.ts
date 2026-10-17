/**
 * Batas area jelajah berbentuk cakram (murni): posisi yang keluar dari lingkaran berjari-jari `radius` di sekitar
 * titik asal dijepit kembali ke lingkar, searah dengan posisi (bukan persegi seperti sebelumnya).
 */
export function clampToDisc(x: number, z: number, radius: number): { x: number; z: number } {
  const d = Math.hypot(x, z);
  if (d <= radius || d === 0) return { x, z };
  const k = radius / d;
  return { x: x * k, z: z * k };
}

/** Jarak tersisa ke lingkar batas (m); negatif bila di luar. */
export const distanceToBoundary = (x: number, z: number, radius: number): number => radius - Math.hypot(x, z);
