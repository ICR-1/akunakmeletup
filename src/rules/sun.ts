/** Apakah medan menutupi Matahari dari titik pandang (sinar uji dari kamera ke arah Matahari). Murni. */
export interface Vec3Like { x: number; y: number; z: number }

export function sunOccludedByTerrain(
  heightAt: (x: number, z: number) => number,
  origin: Vec3Like,
  sunDir: Vec3Like,
  rangeM: number,
  stepM: number,
  halfSizeM: number,
): boolean {
  for (let d = stepM; d <= rangeM; d += stepM) {
    const x = origin.x + sunDir.x * d, z = origin.z + sunDir.z * d;
    if (Math.abs(x) > halfSizeM || Math.abs(z) > halfSizeM) return false;
    if (heightAt(x, z) > origin.y + sunDir.y * d) return true;
  }
  return false;
}

/** Pudar halus ke 0 saat posisi layar ternormalisasi (NDC) mendekati dan melewati tepi bingkai. */
export function flareEdgeFade(ndcX: number, ndcY: number, start = 0.75, end = 1.35): number {
  const m = Math.max(Math.abs(ndcX), Math.abs(ndcY));
  const t = Math.min(1, Math.max(0, (m - start) / (end - start)));
  return 1 - t * t * (3 - 2 * t);
}
