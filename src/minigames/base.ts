import { audio } from '../core/audio';
import { MG } from '../core/constants';
import type { Rng } from '../core/rng';
import { MINIGAME_UI } from '../core/strings';
import { clamp } from '../rules/margin';
import type { Id, MinigameResult } from '../rules/types';
import { el } from '../ui/dom';
import { renderKeyHints } from '../ui/keyHints';
import type { Minigame, MinigameContext } from './types';

export const CANVAS_W = 560;
export const CANVAS_H = 260;

export interface Panel {
  root: HTMLElement;
  body: HTMLElement;
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  status: HTMLElement;
  setTimer(fraction01: number): void;
  showResult(score01: number): void;
}

function createPanel(container: HTMLElement, title: string, hint: string): Panel {
  const root = el('div', 'dialog modal minigame');
  const body = el('div', 'minigame-body');
  const canvas = el('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas 2D tidak tersedia');
  const status = el('div', 'minigame-status');
  const timer = el('div', 'minigame-timer');
  const fill = el('div', 'minigame-timer-fill');
  timer.appendChild(fill);
  const result = el('div', 'minigame-result');
  result.hidden = true;
  const hintEl = el('div', 'minigame-hint');
  renderKeyHints(hintEl, hint);
  body.append(canvas, timer, status, hintEl, result);
  root.append(el('div', 'minigame-title', title), body);
  container.appendChild(root);
  return {
    root, body, canvas, g, status,
    setTimer: (f) => { fill.style.width = `${clamp(f, 0, 1) * 100}%`; },
    showResult: (score01) => {
      result.textContent = `${MINIGAME_UI.result} ${Math.round(score01 * 100)}%`;
      result.hidden = false;
    },
  };
}

/**
 * Dasar minigame: panel DOM, timer, layar hasil singkat, dan pembersihan listener. Subkelas mengisi
 * onStart/onUpdate/draw dan memanggil complete(score) saat selesai.
 */
export abstract class BaseMinigame implements Minigame {
  abstract readonly id: Id;
  abstract readonly title: string;
  abstract readonly hint: string;
  abstract get durationSec(): number;

  protected rng!: Rng;
  protected difficulty = 0.5;
  protected elapsed = 0;
  protected panel!: Panel;
  protected finished = false;
  private score = 0;
  private shownSec = 0;
  private res: MinigameResult | null = null;
  private readonly listeners: { target: EventTarget; type: string; fn: EventListener }[] = [];

  start(ctx: MinigameContext): void {
    this.rng = ctx.rng;
    this.difficulty = ctx.difficulty;
    this.panel = createPanel(ctx.container, this.title, this.hint);
    this.onStart();
    this.draw();
  }

  protected abstract onStart(): void;
  protected abstract onUpdate(dt: number): void;
  protected abstract draw(): void;
  /** Skor saat waktu habis. */
  protected abstract timeoutScore(): number;

  protected listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn);
    this.listeners.push({ target, type, fn });
  }

  /** Daftarkan pelacak tombol di window; mengembalikan himpunan tombol yang sedang ditekan. */
  protected trackKeys(onPress?: (code: string) => void): Set<string> {
    const down = new Set<string>();
    this.listen(window, 'keydown', (e) => {
      const k = e as KeyboardEvent;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k.code)) k.preventDefault();
      if (k.repeat) return;
      down.add(k.code);
      onPress?.(k.code);
    });
    this.listen(window, 'keyup', (e) => down.delete((e as KeyboardEvent).code));
    return down;
  }

  protected complete(score01: number): void {
    if (this.finished) return;
    this.finished = true;
    this.score = clamp(score01, 0, 1);
    this.panel.showResult(this.score);
    audio.jingle(this.score >= 0.5);
  }

  update(dt: number): void {
    if (this.res) return;
    if (!this.finished) {
      this.elapsed += dt;
      this.onUpdate(dt);
      this.panel.setTimer(1 - this.elapsed / this.durationSec);
      if (!this.finished && this.elapsed >= this.durationSec) this.complete(this.timeoutScore());
    } else {
      this.shownSec += dt;
      if (this.shownSec >= MG.resultShowSec) this.res = { score01: this.score, durationSec: Math.min(this.elapsed, this.durationSec) };
    }
    this.draw();
  }

  result(): MinigameResult | null {
    return this.res;
  }

  dispose(): void {
    for (const l of this.listeners) l.target.removeEventListener(l.type, l.fn);
    this.listeners.length = 0;
    this.panel?.root.remove();
  }
}
