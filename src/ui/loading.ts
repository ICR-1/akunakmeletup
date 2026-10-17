import { LOADING_UI } from '../core/strings';

const FADE_MS = 520;

/** Layar memuat yang sudah ada di index.html (tampil sebelum skrip dimuat); kelas ini hanya memperbarui isinya. */
export class LoadingScreen {
  private readonly fill: HTMLElement | null;
  private readonly step: HTMLElement | null;

  constructor(private readonly root: HTMLElement | null = document.getElementById('loading')) {
    this.fill = root?.querySelector<HTMLElement>('.loading-fill') ?? null;
    this.step = root?.querySelector<HTMLElement>('.loading-step') ?? null;
  }

  set(fraction01: number, label: string): void {
    const pct = Math.round(Math.min(1, Math.max(0, fraction01)) * 100);
    if (this.fill) this.fill.style.width = `${pct}%`;
    if (this.step) this.step.textContent = `${pct}% · ${label}`;
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
