/** Tata letak label melayang (murni: tanpa DOM maupun Three.js). */

/** x,y = titik tengah bawah label, dalam px. */
export interface LabelBox { x: number; y: number; w: number; h: number }

/**
 * Geser-Y (<= 0, ke atas) per label agar tidak saling tumpuk.
 * Label diproses dari y terbesar ke terkecil; tiap label naik sampai lepas dari yang sudah ditempatkan.
 */
export function nudgeApart(boxes: LabelBox[], gap: number): number[] {
  const shifts = boxes.map(() => 0);
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[b].y - boxes[a].y);
  const placed: number[] = [];
  for (const i of order) {
    const b = boxes[i];
    let bottom = b.y;
    for (let guard = 0; guard <= placed.length; guard++) {
      let moved = false;
      for (const j of placed) {
        const p = boxes[j];
        if (Math.abs(b.x - p.x) >= (b.w + p.w) / 2) continue;
        const pTop = p.y + shifts[j] - p.h;
        const pBottom = p.y + shifts[j];
        if (bottom > pTop - gap && bottom - b.h < pBottom + gap) {
          bottom = pTop - gap;
          moved = true;
        }
      }
      if (!moved) break;
    }
    shifts[i] = bottom - b.y;
    placed.push(i);
  }
  return shifts;
}

/**
 * Jepit titik tengah label (x) agar label selebar w utuh di [minX, maxX].
 * Mengembalikan null bila jangkar di luar zona lebih dari w.
 */
export function clampToZone(x: number, w: number, minX: number, maxX: number): number | null {
  if (x < minX - w || x > maxX + w) return null;
  const lo = minX + w / 2, hi = maxX - w / 2;
  if (hi < lo) return (minX + maxX) / 2;
  return Math.min(hi, Math.max(lo, x));
}
