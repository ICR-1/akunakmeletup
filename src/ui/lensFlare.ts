import { el } from './dom';

/**
 * Aperture ghosting Matahari (DOM + CSS murni, tanpa gambar): hanya pantulan lensa berbentuk segi enam (bukaan
 * diafragma) yang berjajar sepanjang garis dari Matahari ke pusat layar. Tidak ada garis sinar atau inti
 * bersinar tambahan; cahaya Matahari itu sendiri berasal dari model 3D-nya.
 * Posisi dihitung oleh pemanggil (proyeksi Matahari ke layar); kelas ini hanya mengatur tampilan.
 */
interface Ghost { node: HTMLElement; at: number; size: number; rotate: number; weight: number }

const GHOSTS: { at: number; size: number; color: string; rotate: number; weight: number }[] = [
  { at: 0.28, size: 46, color: '255,214,150', rotate: 0, weight: 0.7 },
  { at: 0.5, size: 88, color: '170,205,255', rotate: 18, weight: 0.55 },
  { at: 0.74, size: 34, color: '255,190,120', rotate: 8, weight: 0.8 },
  { at: 1.0, size: 120, color: '255,232,196', rotate: 30, weight: 0.4 },
  { at: 1.3, size: 58, color: '160,196,255', rotate: 12, weight: 0.6 },
  { at: 1.7, size: 150, color: '255,214,170', rotate: 24, weight: 0.3 },
];

export class LensFlare {
  readonly root = el('div', 'lens-flare');
  private readonly ghosts: Ghost[] = [];

  constructor(host: HTMLElement) {
    for (const g of GHOSTS) {
      const node = el('div', 'flare-ghost');
      node.style.setProperty('--c', g.color);
      node.style.width = node.style.height = `${g.size}px`;
      this.ghosts.push({ node, at: g.at, size: g.size, rotate: g.rotate, weight: g.weight });
      this.root.appendChild(node);
    }
    this.root.hidden = true;
    host.prepend(this.root);
  }

  /**
   * `sun` = posisi Matahari di layar (px, sudah memperhitungkan zoom UI), `center` = pusat layar,
   * `strength` 0-1 (0 = sembunyikan, mis. tertutup medan, di belakang kamera, atau malam).
   */
  update(sun: { x: number; y: number }, center: { x: number; y: number }, strength: number, time: number): void {
    this.root.hidden = strength <= 0.01;
    if (this.root.hidden) return;
    const pulse = 0.94 + 0.06 * Math.sin(time * 2.1);
    const dx = center.x - sun.x, dy = center.y - sun.y;
    // Pantulan makin kuat saat Matahari jauh dari pusat; ghost mengikuti garis Matahari - pusat layar.
    for (const g of this.ghosts) {
      g.node.style.transform = `translate3d(${(sun.x + dx * g.at).toFixed(1)}px, ${(sun.y + dy * g.at).toFixed(1)}px, 0) translate(-50%, -50%) rotate(${g.rotate}deg)`;
      g.node.style.opacity = (strength * g.weight * 0.55 * pulse).toFixed(3);
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
