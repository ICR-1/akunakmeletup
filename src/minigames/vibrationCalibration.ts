import { audio } from '../core/audio';
import { MG } from '../core/constants';
import { MINIGAME_UI } from '../core/strings';
import {
  generateBeats, matchPresses, rhythmDurationSec, rhythmScore, rhythmWindowSec,
} from '../rules/minigameScore';
import { BaseMinigame, CANVAS_H, CANVAS_W } from './base';

const R = MG.rhythm;
const HIT_X = 130;
const MID_Y = CANVAS_H / 2;
const PULSE_SIGMA = 0.09;
const WAVE_FREQ = 38;
const NOMINAL_SEC = R.firstBeatSec + ((R.beats - 1) * (R.intervalMin + R.intervalMax)) / 2 + R.tailSec;

/** Kalibrasi Getaran: ketuk tepat saat puncak gelombang seismik melewati garis bidik. */
export class VibrationCalibration extends BaseMinigame {
  readonly id = 'vibration_calibration';
  readonly title = MINIGAME_UI.rhythm.title;
  readonly hint = MINIGAME_UI.rhythm.hint;
  get durationSec(): number { return this.beats.length > 0 ? rhythmDurationSec(this.beats) : NOMINAL_SEC; }

  private beats: number[] = [];
  private presses: number[] = [];
  private windowSec = 0.25;
  private flash = 0;
  private flashText = '';

  protected onStart(): void {
    this.beats = generateBeats(this.rng);
    this.windowSec = rhythmWindowSec(this.difficulty);
    this.presses = [];
    this.trackKeys((code) => { if (code === 'Space') this.press(); });
    this.listen(this.panel.canvas, 'pointerdown', () => this.press());
  }

  private press(): void {
    if (this.finished) return;
    const t = this.elapsed;
    this.presses.push(t);
    const near = this.beats.reduce((best, b) => (Math.abs(b - t) < Math.abs(best - t) ? b : best), this.beats[0]);
    const err = t - near;
    const R2 = MINIGAME_UI.rhythm;
    const abs = Math.abs(err);
    if (abs > this.windowSec) this.flashText = R2.miss;
    else if (abs < this.windowSec * 0.25) this.flashText = R2.perfect;
    else if (abs < this.windowSec * 0.6) this.flashText = R2.good;
    else this.flashText = err < 0 ? R2.early : R2.late;
    this.flash = 0.6;
    audio.beep(abs <= this.windowSec ? 660 + (1 - abs / this.windowSec) * 440 : 200);
  }

  protected onUpdate(dt: number): void {
    this.flash = Math.max(0, this.flash - dt);
    this.panel.status.textContent = this.flash > 0 ? this.flashText : '';
    if (this.elapsed >= this.durationSec) this.complete(this.timeoutScore());
  }

  protected timeoutScore(): number {
    return rhythmScore(this.beats, this.presses, this.windowSec);
  }

  protected draw(): void {
    const g = this.panel.g;
    const t = this.elapsed;
    g.fillStyle = '#070b16';
    g.fillRect(0, 0, CANVAS_W, CANVAS_H);
    g.strokeStyle = '#1c2a44';
    g.beginPath(); g.moveTo(0, MID_Y); g.lineTo(CANVAS_W, MID_Y); g.stroke();

    // Jendela waktu yang dihitung sebagai ketukan
    g.fillStyle = 'rgba(93,255,155,0.12)';
    g.fillRect(HIT_X - this.windowSec * R.pxPerSec, 10, this.windowSec * 2 * R.pxPerSec, CANVAS_H - 20);

    // Gelombang seismik: ledakan di tiap ketukan
    g.strokeStyle = '#4fd1ff';
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x < CANVAS_W; x += 2) {
      const tau = t + (x - HIT_X) / R.pxPerSec;
      let amp = 0.04;
      for (const b of this.beats) {
        const d = tau - b;
        if (Math.abs(d) < 0.6) amp += Math.exp(-(d * d) / (2 * PULSE_SIGMA * PULSE_SIGMA));
      }
      const y = MID_Y - Math.sin(tau * WAVE_FREQ) * amp * 80;
      if (x === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();

    // Penanda ketukan dan garis bidik
    for (const b of this.beats) {
      const x = HIT_X + (b - t) * R.pxPerSec;
      if (x < -10 || x > CANVAS_W + 10) continue;
      g.fillStyle = b < t - this.windowSec ? '#3a3f4d' : '#ffd24d';
      g.beginPath(); g.arc(x, 24, 7, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = this.flash > 0 ? '#ffffff' : '#5dff9b';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(HIT_X, 8); g.lineTo(HIT_X, CANVAS_H - 8); g.stroke();

    const { matches } = matchPresses(this.beats, this.presses, this.windowSec);
    g.fillStyle = '#e6f1ff';
    g.font = '12px monospace';
    g.fillText(`${matches.length}/${this.beats.length}`, CANVAS_W - 56, CANVAS_H - 10);
  }
}
