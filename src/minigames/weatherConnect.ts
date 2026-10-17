import { audio } from '../core/audio';
import { MG } from '../core/constants';
import { MINIGAME_UI } from '../core/strings';
import {
  connectCable, createWeatherState, generateWeatherPuzzle, weatherDone, weatherScore,
  type WeatherPuzzle, type WeatherState,
} from '../rules/minigameScore';
import { BaseMinigame, CANVAS_H, CANVAS_W } from './base';

const COLORS = ['#ff6b6b', '#4fd1ff', '#ffd24d', '#5dff9b', '#c792ea'];
const CABLE_X = 90;
const PORT_X = CANVAS_W - 90;
const TOP = 36;
const HIT_R = 24;
const WRONG_FLASH_SEC = 0.6;

function rowY(i: number, n: number): number {
  return TOP + ((CANVAS_H - 2 * TOP) * (i + 0.5)) / n;
}

/** Gambar bentuk penanda; indeks bentuk sama dipakai kabel dan port yang cocok. */
function shape(g: CanvasRenderingContext2D, kind: number, x: number, y: number, r: number): void {
  g.beginPath();
  switch (kind % 5) {
    case 0: g.arc(x, y, r, 0, Math.PI * 2); break;
    case 1: g.rect(x - r, y - r, r * 2, r * 2); break;
    case 2: g.moveTo(x, y - r); g.lineTo(x + r, y + r * 0.8); g.lineTo(x - r, y + r * 0.8); g.closePath(); break;
    case 3: g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); break;
    default:
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        if (k === 0) g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        else g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      g.closePath();
  }
}

/** Pasang dan Sambungkan: cocokkan tiap kabel berwarna ke port berbentuk sama sebelum waktu habis. */
export class WeatherConnect extends BaseMinigame {
  readonly id = 'weather_connect';
  readonly title = MINIGAME_UI.weather.title;
  readonly hint = MINIGAME_UI.weather.hint;
  get durationSec(): number { return MG.weather.timeLimitSec; }

  private puzzle!: WeatherPuzzle;
  private state!: WeatherState;
  private selected = -1;
  private wrongFlash = 0;

  protected onStart(): void {
    this.puzzle = generateWeatherPuzzle(this.rng, this.difficulty);
    this.state = createWeatherState(this.puzzle);
    this.selected = -1;
    const n = this.state.linked.length;
    this.trackKeys((code) => {
      const digit = /^Digit([1-9])$/.exec(code);
      if (digit && Number(digit[1]) <= n) this.pickCable(Number(digit[1]) - 1);
      const letter = /^Key([A-E])$/.exec(code);
      if (letter && letter[1].charCodeAt(0) - 65 < n) this.pickPort(letter[1].charCodeAt(0) - 65);
    });
    this.listen(this.panel.canvas, 'pointerdown', (e) => this.onPointer(e as PointerEvent));
  }

  private onPointer(e: PointerEvent): void {
    const rect = this.panel.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_W;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_H;
    const n = this.state.linked.length;
    for (let i = 0; i < n; i++) {
      if (Math.hypot(x - CABLE_X, y - rowY(i, n)) <= HIT_R) { this.pickCable(i); return; }
      if (Math.hypot(x - PORT_X, y - rowY(i, n)) <= HIT_R) { this.pickPort(i); return; }
    }
  }

  private pickCable(i: number): void {
    if (this.finished || this.state.linked[i]) return;
    this.selected = i;
    audio.beep(520);
  }

  private pickPort(port: number): void {
    if (this.finished || this.selected < 0) return;
    const before = this.state.wrong;
    this.state = connectCable(this.puzzle, this.state, this.selected, port);
    if (this.state.wrong > before) {
      this.wrongFlash = WRONG_FLASH_SEC;
      audio.beep(180);
    } else {
      audio.beep(880);
      this.selected = -1;
    }
    if (weatherDone(this.state)) this.complete(this.timeoutScore());
  }

  protected onUpdate(dt: number): void {
    this.wrongFlash = Math.max(0, this.wrongFlash - dt);
    this.panel.status.textContent = this.wrongFlash > 0 ? MINIGAME_UI.weather.wrong : '';
  }

  protected timeoutScore(): number {
    return weatherScore(this.state, this.elapsed);
  }

  protected draw(): void {
    const g = this.panel.g;
    const n = this.state.linked.length;
    g.fillStyle = '#070b16';
    g.fillRect(0, 0, CANVAS_W, CANVAS_H);
    g.font = '12px monospace';
    g.fillStyle = '#9fb3d1';
    g.fillText(MINIGAME_UI.weather.cables, CABLE_X - 30, 18);
    g.fillText(MINIGAME_UI.weather.ports, PORT_X - 16, 18);

    // Kabel yang sudah tersambung digambar sebagai garis ke port-nya.
    for (let c = 0; c < n; c++) {
      if (!this.state.linked[c]) continue;
      g.strokeStyle = COLORS[c];
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(CABLE_X, rowY(c, n));
      g.bezierCurveTo(CANVAS_W * 0.4, rowY(c, n), CANVAS_W * 0.6, rowY(this.puzzle.portOfCable[c], n), PORT_X, rowY(this.puzzle.portOfCable[c], n));
      g.stroke();
    }
    g.lineWidth = 2;

    for (let i = 0; i < n; i++) {
      const y = rowY(i, n);
      const done = this.state.linked[i];
      shape(g, i, CABLE_X, y, 16);
      g.fillStyle = done ? COLORS[i] : `${COLORS[i]}cc`;
      g.fill();
      g.strokeStyle = this.selected === i ? '#ffffff' : '#0b1020';
      g.lineWidth = this.selected === i ? 4 : 2;
      g.stroke();
      g.fillStyle = '#e6f1ff';
      g.fillText(String(i + 1), CABLE_X - 36, y + 4);

      // Port: bentuk milik kabel yang cocok, tanpa warna.
      const cable = this.puzzle.portOfCable.indexOf(i);
      shape(g, cable, PORT_X, y, 16);
      g.fillStyle = '#1a2036';
      g.fill();
      g.strokeStyle = this.state.linked[cable] ? '#5dff9b' : '#9fb3d1';
      g.lineWidth = 2;
      g.stroke();
      g.fillStyle = '#e6f1ff';
      g.fillText(String.fromCharCode(65 + i), PORT_X + 26, y + 4);
    }
    g.fillStyle = '#9fb3d1';
    g.fillText(`${MINIGAME_UI.weather.linked} ${this.state.linked.filter(Boolean).length}/${n}`, CANVAS_W / 2 - 40, CANVAS_H - 10);
  }
}
