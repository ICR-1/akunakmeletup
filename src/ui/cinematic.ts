import { el } from './dom';

export type CinematicTone = 'alert' | 'flare' | 'static' | 'dust';

/**
 * Lapisan sinematik adegan event: dua bilah layar lebar, keterangan di bilah bawah, dan pewarnaan sesuai
 * jenis kejadian (alert merah, semburan surya, gangguan sinyal, debu). Kekuatan 0..1 diatur per frame.
 */
export class Cinematic {
  private readonly root = el('div', 'cine');
  private readonly top = el('div', 'cine-bar cine-top');
  private readonly bottom = el('div', 'cine-bar cine-bottom');
  private readonly caption = el('div', 'cine-caption');
  private readonly tint = el('div', 'cine-tint');

  constructor(host: HTMLElement) {
    this.bottom.appendChild(this.caption);
    this.root.append(this.tint, this.top, this.bottom);
    this.root.style.display = 'none';
    host.appendChild(this.root);
  }

  /** `k01` = 0 menyembunyikan seluruh lapisan. */
  set(caption: string, tone: CinematicTone, k01: number): void {
    const k = Math.min(1, Math.max(0, k01));
    if (k <= 0) { this.root.style.display = 'none'; return; }
    this.root.style.display = 'block';
    this.root.dataset.tone = tone;
    this.top.style.height = `${(k * 9).toFixed(2)}vh`;
    this.bottom.style.height = `${(k * 9).toFixed(2)}vh`;
    this.tint.style.opacity = k.toFixed(3);
    this.caption.textContent = caption;
    this.caption.style.opacity = k.toFixed(3);
  }

  hide(): void {
    this.root.style.display = 'none';
  }

  dispose(): void {
    this.root.remove();
  }
}
