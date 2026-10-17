import { MG } from '../core/constants';
import { MINIGAME_UI } from '../core/strings';
import { clamp } from '../rules/margin';
import {
  generateSpectrum, spectrumScore, spectrumValue, type SpectrumControls, type SpectrumPuzzle,
} from '../rules/minigameScore';
import { el } from '../ui/dom';
import { BaseMinigame, CANVAS_H, CANVAS_W } from './base';

const S = MG.spectrum;
const PLOT = { x: 20, y: 20, w: CANVAS_W - 40, h: CANVAS_H - 50 };

/** Cocokkan Spektrum: geser dan skalakan kurva absorpsi sampai menimpa kurva mineral referensi. */
export class SpectrumMatch extends BaseMinigame {
  readonly id = 'spectrum_match';
  readonly title = MINIGAME_UI.spectrum.title;
  readonly hint = MINIGAME_UI.spectrum.hint;
  get durationSec(): number { return S.timeLimitSec; }

  private puzzle!: SpectrumPuzzle;
  private player: SpectrumControls = { shift: 0, scale: 1 };
  private keys = new Set<string>();
  private shiftInput!: HTMLInputElement;
  private scaleInput!: HTMLInputElement;
  private matchFill!: HTMLElement;

  protected onStart(): void {
    this.puzzle = generateSpectrum(this.rng, this.difficulty);
    this.player = { shift: 0, scale: 1 };
    this.keys = this.trackKeys((code) => { if (code === 'Enter') this.lock(); });

    const controls = el('div', 'minigame-controls');
    this.shiftInput = this.slider(S.ctrlShiftMax * -1, S.ctrlShiftMax, 0.002, 0);
    this.scaleInput = this.slider(S.ctrlScaleMin, S.ctrlScaleMax, 0.002, 1);
    this.shiftInput.addEventListener('input', () => { this.player.shift = Number(this.shiftInput.value); });
    this.scaleInput.addEventListener('input', () => { this.player.scale = Number(this.scaleInput.value); });
    const match = el('div', 'minigame-match');
    this.matchFill = el('div', 'minigame-match-fill');
    match.appendChild(this.matchFill);
    const lock = el('button', 'launch-button', MINIGAME_UI.spectrum.lock);
    lock.type = 'button';
    lock.addEventListener('click', () => this.lock());
    controls.append(el('span', '', MINIGAME_UI.spectrum.shift), this.shiftInput, el('span', '', MINIGAME_UI.spectrum.scale), this.scaleInput, el('span', '', MINIGAME_UI.spectrum.match), match);
    this.panel.body.insertBefore(controls, this.panel.status);
    this.panel.body.insertBefore(lock, this.panel.status);
  }

  private slider(min: number, max: number, step: number, value: number): HTMLInputElement {
    const input = el('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    return input;
  }

  private lock(): void {
    if (!this.finished) this.complete(spectrumScore(this.puzzle, this.player));
  }

  protected onUpdate(dt: number): void {
    const k = this.keys;
    const dShift = ((k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)) * S.shiftRatePerSec * dt;
    const dScale = ((k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0)) * S.scaleRatePerSec * dt;
    if (dShift !== 0 || dScale !== 0) {
      this.player.shift = clamp(this.player.shift + dShift, -S.ctrlShiftMax, S.ctrlShiftMax);
      this.player.scale = clamp(this.player.scale + dScale, S.ctrlScaleMin, S.ctrlScaleMax);
      this.shiftInput.value = String(this.player.shift);
      this.scaleInput.value = String(this.player.scale);
    }
  }

  protected timeoutScore(): number {
    return spectrumScore(this.puzzle, this.player);
  }

  private curve(controls: SpectrumControls, color: string, dashed: boolean): void {
    const g = this.panel.g;
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.setLineDash(dashed ? [6, 4] : []);
    g.beginPath();
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      const v = spectrumValue(this.puzzle.dips, this.puzzle.width, controls, x);
      const px = PLOT.x + x * PLOT.w;
      const py = PLOT.y + (1 - clamp(v, 0, 1.05) / 1.05) * PLOT.h;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
    g.setLineDash([]);
  }

  protected draw(): void {
    const g = this.panel.g;
    g.fillStyle = '#070b16';
    g.fillRect(0, 0, CANVAS_W, CANVAS_H);
    g.strokeStyle = '#1c2a44';
    g.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = PLOT.y + (i / 4) * PLOT.h;
      g.beginPath(); g.moveTo(PLOT.x, y); g.lineTo(PLOT.x + PLOT.w, y); g.stroke();
    }
    this.curve(this.puzzle.hidden, '#4fd1ff', true);
    this.curve(this.player, '#ffd24d', false);
    g.fillStyle = '#4fd1ff';
    g.font = '12px monospace';
    g.fillText(MINIGAME_UI.spectrum.reference, 24, CANVAS_H - 8);
    g.fillStyle = '#ffd24d';
    g.fillText(MINIGAME_UI.spectrum.yours, 150, CANVAS_H - 8);
    this.matchFill.style.width = `${Math.round(spectrumScore(this.puzzle, this.player) * 100)}%`;
  }
}
