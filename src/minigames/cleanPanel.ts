import { MG } from '../core/constants';
import { MINIGAME_UI } from '../core/strings';
import {
  generatePanelDust, panelClean, panelScore, scrubPanel, settlePanel, type PanelDust,
} from '../rules/minigameScore';
import { clamp } from '../rules/margin';
import { BaseMinigame, CANVAS_H, CANVAS_W } from './base';

const P = MG.panel;
const CELL = Math.min(Math.floor((CANVAS_W - 40) / P.cols), Math.floor((CANVAS_H - 20) / P.rows));
const ORIGIN_X = (CANVAS_W - CELL * P.cols) / 2;
const ORIGIN_Y = (CANVAS_H - CELL * P.rows) / 2;

/** Bersihkan Panel: gosok debu statis dari panel surya dengan kuas (event debu di Bulan). */
export class CleanPanel extends BaseMinigame {
  readonly id = 'clean_panel';
  readonly title = MINIGAME_UI.panel.title;
  readonly hint = MINIGAME_UI.panel.hint;
  get durationSec(): number { return P.timeLimitSec; }

  private panelState!: PanelDust;
  private cx = P.cols / 2;
  private cy = P.rows / 2;
  private keys = new Set<string>();
  private pointerDown = false;

  protected onStart(): void {
    this.panelState = generatePanelDust(this.rng);
    this.keys = this.trackKeys();
    this.listen(this.panel.canvas, 'pointerdown', (e) => { this.pointerDown = true; this.aim(e as PointerEvent); });
    this.listen(this.panel.canvas, 'pointermove', (e) => this.aim(e as PointerEvent));
    this.listen(window, 'pointerup', () => { this.pointerDown = false; });
  }

  private aim(e: PointerEvent): void {
    const rect = this.panel.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    this.cx = clamp((x - ORIGIN_X) / CELL, 0, P.cols);
    this.cy = clamp((y - ORIGIN_Y) / CELL, 0, P.rows);
  }

  protected onUpdate(dt: number): void {
    const k = this.keys;
    const dx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const dy = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
    this.cx = clamp(this.cx + dx * P.cursorSpeed * dt, 0, P.cols);
    this.cy = clamp(this.cy + dy * P.cursorSpeed * dt, 0, P.rows);
    this.panelState = settlePanel(this.panelState, this.difficulty, dt);
    if (k.has('Space') || this.pointerDown) this.panelState = scrubPanel(this.panelState, this.cx, this.cy, dt);
    this.panel.status.textContent = `${MINIGAME_UI.panel.clean} ${Math.round(panelScore(this.panelState) * 100)}%`;
    if (panelClean(this.panelState)) this.complete(this.timeoutScore());
  }

  protected timeoutScore(): number {
    return panelScore(this.panelState);
  }

  protected draw(): void {
    const g = this.panel.g;
    g.fillStyle = '#070b16';
    g.fillRect(0, 0, CANVAS_W, CANVAS_H);
    const s = this.panelState;
    for (let r = 0; r < s.rows; r++) {
      for (let c = 0; c < s.cols; c++) {
        const x = ORIGIN_X + c * CELL;
        const y = ORIGIN_Y + r * CELL;
        g.fillStyle = (r + c) % 2 === 0 ? '#1d3f8a' : '#1a3677';
        g.fillRect(x, y, CELL, CELL);
        g.fillStyle = `rgba(150,138,118,${(0.9 * s.dust[r * s.cols + c]).toFixed(3)})`;
        g.fillRect(x, y, CELL, CELL);
      }
    }
    g.strokeStyle = '#c0c8d8';
    g.lineWidth = 2;
    g.strokeRect(ORIGIN_X, ORIGIN_Y, CELL * s.cols, CELL * s.rows);
    // Kuas
    const bx = ORIGIN_X + this.cx * CELL;
    const by = ORIGIN_Y + this.cy * CELL;
    g.strokeStyle = this.keys.has('Space') || this.pointerDown ? '#5dff9b' : '#ffffff';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(bx, by, P.brushRadius * CELL, 0, Math.PI * 2);
    g.stroke();
  }
}
