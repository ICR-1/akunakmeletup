import { LOADING_UI, TITLE_UI } from '../core/strings';
import { createLogo } from './logo';

const FADE_MS = 650;

/**
 * Indeks pemeriksaan GO/NO-GO yang sudah menyala untuk progres `fraction01`: `count` pemeriksaan dibagi rata, yang
 * terakhir menyala tepat di 100%. Murni.
 */
export function checksDone(fraction01: number, count: number): number {
  return Math.min(count, Math.floor(Math.min(1, Math.max(0, fraction01)) * count + 1e-9));
}

/**
 * Layar memuat yang sudah ada di index.html (tampil sebelum skrip dimuat). Kelas ini mengganti judul cadangan dengan
 * logo SVG, lalu memperbarui lintasan progres, persentase, langkah, tanda, dan poll GO/NO-GO.
 */
export class LoadingScreen {
  private readonly fill: HTMLElement | null;
  private readonly step: HTMLElement | null;
  private readonly pct: HTMLElement | null;
  private readonly ticks: HTMLElement[];
  private readonly checks: HTMLElement[];

  constructor(private readonly root: HTMLElement | null = document.getElementById('loading')) {
    this.fill = root?.querySelector<HTMLElement>('.loading-fill') ?? null;
    this.step = root?.querySelector<HTMLElement>('.loading-step') ?? null;
    this.pct = root?.querySelector<HTMLElement>('.loading-pct') ?? null;
    this.ticks = [...(root?.querySelectorAll<HTMLElement>('.loading-tick') ?? [])];
    this.checks = [...(root?.querySelectorAll<HTMLElement>('.loading-checks li') ?? [])];
    this.checks.forEach((li, i) => {
      li.textContent = LOADING_UI.checks[i] ?? li.textContent;
      li.dataset.state = LOADING_UI.standby;
    });
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
    const done = checksDone(f, this.checks.length);
    this.checks.forEach((li, i) => {
      const on = i < done;
      li.classList.toggle('on', on);
      li.dataset.state = on ? LOADING_UI.go : LOADING_UI.standby;
    });
    // Tanda di lintasan (25/50/75%) menyala bersama pemeriksaan yang sejajar dengannya.
    this.ticks.forEach((t, i) => t.classList.toggle('on', i < done));
  }

  /** Tampilkan pesan bila ada langkah yang gagal (permainan tetap lanjut). */
  warn(message: string = LOADING_UI.failed): void {
    if (this.step) this.step.textContent = message;
  }

  /** Roket melesat keluar layar, layar memudar, lalu dilepas dari DOM. */
  hide(): void {
    const root = this.root;
    if (!root) return;
    root.classList.add('hide');
    window.setTimeout(() => root.remove(), FADE_MS);
  }
}
