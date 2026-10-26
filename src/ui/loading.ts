import { LOADING_UI, TITLE_UI } from '../core/strings';
import { createLogo } from './logo';

const FADE_MS = 650;

/**
 * Layar memuat yang sudah ada di index.html (tampil sebelum skrip dimuat). Kelas ini mengganti judul cadangan dengan
 * logo SVG, lalu memperbarui bilah progres, persentase, dan langkah.
 */
export class LoadingScreen {
  private readonly fill: HTMLElement | null;
  private readonly step: HTMLElement | null;
  private readonly pct: HTMLElement | null;

  constructor(private readonly root: HTMLElement | null = document.getElementById('loading')) {
    this.fill = root?.querySelector<HTMLElement>('.loading-fill') ?? null;
    this.step = root?.querySelector<HTMLElement>('.loading-step') ?? null;
    this.pct = root?.querySelector<HTMLElement>('.loading-pct') ?? null;
    const title = root?.querySelector<HTMLElement>('.loading-title');
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    title?.replaceChildren(createLogo(TITLE_UI.logo, !reduced));
  }

  set(fraction01: number, label: string): void {
    const f = Math.min(1, Math.max(0, fraction01));
    const pct = Math.round(f * 100);
    if (this.fill) this.fill.style.width = `${pct}%`;
    if (this.pct) this.pct.textContent = `${pct}%`;
    if (this.step) this.step.textContent = f >= 1 ? LOADING_UI.ready : label;
  }

  /** Tampilkan pesan bila ada langkah yang gagal (permainan tetap lanjut). */
  warn(message: string = LOADING_UI.failed): void {
    if (this.step) this.step.textContent = message;
  }

  /** Pudarkan lalu lepas dari DOM. */
  hide(): void {
    const root = this.root;
    if (!root) return;
    root.classList.add('hide');
    window.setTimeout(() => root.remove(), FADE_MS);
  }
}
