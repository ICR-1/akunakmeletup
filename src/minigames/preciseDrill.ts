import { MG } from '../core/constants';
import { MINIGAME_UI } from '../core/strings';
import {
  createDrill, drillParams, drillScore, stepDrill, type DrillParams, type DrillState,
} from '../rules/minigameScore';
import { BaseMinigame, CANVAS_H, CANVAS_W } from './base';

/** Bor Presisi: tahan/lepas Spasi menjaga jarum tekanan di zona hijau sampai kedalaman target. */
export class PreciseDrill extends BaseMinigame {
  readonly id = 'precise_drill';
  readonly title = MINIGAME_UI.drill.title;
  readonly hint = MINIGAME_UI.drill.hint;
  get durationSec(): number { return MG.drill.timeLimitSec; }

  private params!: DrillParams;
  private state: DrillState = createDrill();
  private keys = new Set<string>();
  private pointerDown = false;

  protected onStart(): void {
    this.params = drillParams(this.difficulty);
    this.state = createDrill();
    this.keys = this.trackKeys();
    this.listen(this.panel.canvas, 'pointerdown', () => { this.pointerDown = true; });
    this.listen(window, 'pointerup', () => { this.pointerDown = false; });
  }

  protected onUpdate(dt: number): void {
    this.state = stepDrill(this.state, this.keys.has('Space') || this.pointerDown, this.params, dt);
    this.panel.status.textContent = this.state.coolingSec > 0 ? MINIGAME_UI.drill.overheat : '';
    if (this.state.done) this.complete(this.timeoutScore());
  }

  protected timeoutScore(): number {
    const s = this.state;
    return drillScore(s.depth01, s.timeInZoneSec, s.elapsedSec, s.overheats);
  }

  private bar(x: number, y: number, w: number, h: number, frac: number, color: string, label: string): void {
    const g = this.panel.g;
    g.fillStyle = '#10162a';
    g.fillRect(x, y, w, h);
    g.fillStyle = color;
    g.fillRect(x, y + h * (1 - frac), w, h * frac);
    g.strokeStyle = '#6b7280';
    g.strokeRect(x, y, w, h);
    g.fillStyle = '#e6f1ff';
    g.font = '12px monospace';
    g.fillText(label, x - 2, y + h + 16);
  }

  protected draw(): void {
    const g = this.panel.g;
    const s = this.state;
    g.fillStyle = '#070b16';
    g.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Tekanan dengan zona hijau
    const gx = 40, gy = 24, gw = 46, gh = 190;
    this.bar(gx, gy, gw, gh, s.pressure, '#4fd1ff', MINIGAME_UI.drill.pressure);
    const zy1 = gy + gh * (1 - this.params.zoneHi);
    const zy2 = gy + gh * (1 - this.params.zoneLo);
    g.fillStyle = 'rgba(93,255,155,0.35)';
    g.fillRect(gx, zy1, gw, zy2 - zy1);
    g.strokeStyle = '#5dff9b';
    g.strokeRect(gx, zy1, gw, zy2 - zy1);
    const ny = gy + gh * (1 - s.pressure);
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(gx + gw + 4, ny); g.lineTo(gx + gw + 18, ny - 7); g.lineTo(gx + gw + 18, ny + 7);
    g.fill();

    // Lapisan tanah dan mata bor
    const rx = 190, rw = 190, top = 24, bottom = 214;
    const layers = ['#6b7280', '#565b68', '#454a56', '#363a45'];
    layers.forEach((c, i) => { g.fillStyle = c; g.fillRect(rx, top + 50 + i * 36, rw, 36); });
    g.fillStyle = '#2a2d36';
    g.fillRect(rx, top, rw, 50);
    const bitY = top + 40 + s.depth01 * (bottom - top - 40);
    g.fillStyle = '#9aa3b0';
    g.fillRect(rx + rw / 2 - 5, top - 10, 10, bitY - top + 10);
    g.fillStyle = s.coolingSec > 0 ? '#ff6b6b' : '#f08a24';
    g.beginPath();
    g.moveTo(rx + rw / 2 - 9, bitY); g.lineTo(rx + rw / 2 + 9, bitY); g.lineTo(rx + rw / 2, bitY + 18);
    g.fill();
    g.fillStyle = '#e6f1ff';
    g.font = '12px monospace';
    g.fillText(`${MINIGAME_UI.drill.depth} ${Math.round(s.depth01 * 100)}%`, rx, bottom + 30);

    this.bar(440, gy, 46, gh, Math.min(1, s.heat), s.heat > 0.7 ? '#ff6b6b' : '#ffd24d', MINIGAME_UI.drill.heat);
  }
}
