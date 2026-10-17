/**
 * Tabrakan bidang datar (lingkaran di bidang x-z) untuk objek diam di permukaan: batu, wahana, probe,
 * kendaraan terparkir. Murni (tanpa Three.js/DOM) agar bisa diuji terisolasi.
 */
export interface Circle {
  x: number;
  z: number;
  r: number;
  /** Tinggi puncak objek (y dunia); pemain yang kakinya sudah setinggi ini (lompat/naik) melewatinya. */
  top: number;
}

/** Tinggi tapak yang masih bisa dilangkahi tanpa terhalang (meter). */
export const STEP_HEIGHT_M = 0.35;
const MAX_ITERATIONS = 4;
const EPS = 1e-6;

export interface Resolved { x: number; z: number; hit: boolean }

/**
 * Dorong lingkaran pemain (x, z, radius) keluar dari semua lingkaran penghalang. Objek yang puncaknya tidak
 * lebih tinggi daripada kaki + `step` dilewati. Beberapa iterasi menangani himpitan di antara dua objek.
 */
export function resolveCircles(x: number, z: number, radius: number, feetY: number, circles: readonly Circle[], step = STEP_HEIGHT_M): Resolved {
  let px = x, pz = z;
  let hit = false;
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    let moved = false;
    for (const c of circles) {
      if (feetY + step >= c.top) continue;
      const dx = px - c.x, dz = pz - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2);
      if (d < EPS) { px = c.x + min; moved = true; hit = true; continue; }
      const push = (min - d) / d;
      px += dx * push;
      pz += dz * push;
      moved = true;
      hit = true;
    }
    if (!moved) break;
  }
  return { x: px, z: pz, hit };
}

/** Apakah titik (x, z) berada di dalam salah satu penghalang yang menghalangi kaki di ketinggian feetY. */
export function insideAny(x: number, z: number, feetY: number, circles: readonly Circle[], step = STEP_HEIGHT_M): boolean {
  return circles.some((c) => feetY + step < c.top && Math.hypot(x - c.x, z - c.z) < c.r);
}

/** Tangga miring dalam koordinat lokal model (sumbu z ke arah luar): dari serambi (atas) sampai tanah (bawah). */
export interface LadderSpec {
  /** z lokal ujung atas (serambi) dan bawah (tanah). */
  zTop: number;
  zBottom: number;
  /** y lokal ujung atas dan bawah (dari dasar kaki model). */
  yTop: number;
  yBottom: number;
  /** Setengah lebar tangga termasuk rel. */
  halfWidth: number;
}

/**
 * Lingkaran penghalang sepanjang tangga miring: model berskala `scale`, diputar `rotY` (radian, sumbu y) di
 * (originX, originY, originZ). Puncak tiap lingkaran mengikuti tinggi tangga di titik itu, sehingga bagian bawah
 * masih bisa dilangkahi dan bagian atas menghalangi.
 */
export function ladderColliders(
  ladder: LadderSpec, originX: number, originY: number, originZ: number, scale: number, rotY: number, count: number,
): Circle[] {
  const n = Math.max(2, Math.floor(count));
  const cos = Math.cos(rotY), sin = Math.sin(rotY);
  const out: Circle[] = [];
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const lz = ladder.zTop + (ladder.zBottom - ladder.zTop) * t;
    const ly = ladder.yTop + (ladder.yBottom - ladder.yTop) * t;
    out.push({
      x: originX + lz * sin * scale,
      z: originZ + lz * cos * scale,
      r: ladder.halfWidth * scale,
      top: originY + ly * scale,
    });
  }
  return out;
}
