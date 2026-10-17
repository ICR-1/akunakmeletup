/**
 * Kemudi Lunar Cruiser (murni). Konvensi: arah hadap `heading` (rad), maju = (sin h, cos h) pada bidang x-z.
 * Dilihat dari belakang kendaraan (kamera mengikuti), sumbu +x berada di sisi KIRI, jadi belok kanan
 * (masukan setir positif, tombol D) harus MENGURANGI heading dan belok kiri (A) menambahnya.
 */
export const forwardOf = (heading: number): { x: number; z: number } => ({ x: Math.sin(heading), z: Math.cos(heading) });

/** Vektor sisi kanan pengemudi (menghadap ke depan). */
export const rightOf = (heading: number): { x: number; z: number } => ({ x: -Math.cos(heading), z: Math.sin(heading) });

/**
 * Heading baru: berbelok hanya saat bergerak (sebanding kecepatan relatif, dibalik saat mundur).
 * `steer` -1 (kiri) .. 1 (kanan).
 */
export function stepHeading(heading: number, steer: number, speed: number, maxSpeed: number, turnRate: number, dt: number): number {
  const rel = maxSpeed > 0 ? Math.min(1, Math.max(-1, speed / maxSpeed)) : 0;
  return heading - steer * turnRate * rel * dt;
}

/** Sisi kanan astronot yang menghadap `yaw` (arah hadap = (sin yaw, cos yaw)). */
export const rightOfYaw = (yaw: number): { x: number; z: number } => rightOf(yaw);
