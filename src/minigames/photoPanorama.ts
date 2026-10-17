import { audio } from '../core/audio';
import { MG } from '../core/constants';
import { rngRange } from '../core/rng';
import { MINIGAME_UI } from '../core/strings';
import {
  angleDiffDeg, generatePhotoTargets, photoParams, photoScore, photoShotQuality, type PhotoParams, type PhotoTarget,
} from '../rules/minigameScore';
import { BaseMinigame, CANVAS_H, CANVAS_W } from './base';

const P = MG.photo;
const HORIZON_Y = 150;

/** Foto Panorama: geser kamera 360 derajat, pusatkan objek di bingkai, tekan Spasi dan tahan stabil. */
export class PhotoPanorama extends BaseMinigame {
  readonly id = 'photo_panorama';
  readonly title = MINIGAME_UI.photo.title;
  readonly hint = MINIGAME_UI.photo.hint;
  get durationSec(): number { return P.timeLimitSec; }

  private params!: PhotoParams;
  private targets: PhotoTarget[] = [];
  private captured = new Set<number>();
  private qualities: number[] = [];
  private yaw = 0;
  private speed = 0;
  private exposure = -1;
  private exposureSpeedSum = 0;
  private drag = 0;
  private keys = new Set<string>();

  protected onStart(): void {
    this.params = photoParams(this.difficulty);
    this.targets = generatePhotoTargets(this.rng, P.shots);
    this.yaw = rngRange(this.rng, 0, 360);
    this.keys = this.trackKeys((code) => { if (code === 'Space') this.shutter(); });
    this.listen(this.panel.canvas, 'pointerdown', () => this.shutter());
    this.listen(this.panel.canvas, 'pointermove', (e) => {
      const ev = e as PointerEvent;
      if (ev.buttons & 2 || ev.shiftKey) this.drag -= ev.movementX * P.mouseDegPerPx;
    });
  }

  private shutter(): void {
    if (this.finished || this.exposure >= 0) return;
    this.exposure = 0;
    this.exposureSpeedSum = 0;
    audio.tone(1500, 0.06, 'square', 0.08);
    this.panel.status.textContent = '';
  }

  protected onUpdate(dt: number): void {
    const dir = (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0);
    const dYaw = dir * P.panSpeedDegS * dt + this.drag;
    this.drag = 0;
    this.yaw = (((this.yaw + dYaw) % 360) + 360) % 360;
    this.speed += (Math.abs(dYaw) / dt - this.speed) * P.speedSmoothing;
    if (this.exposure >= 0) {
      this.exposure += dt;
      this.exposureSpeedSum += this.speed * dt;
      if (this.exposure >= P.exposureSec) this.finishShot();
    }
  }

  private nearestUncaptured(): { index: number; offset: number } | null {
    let best: { index: number; offset: number } | null = null;
    this.targets.forEach((t, index) => {
      if (this.captured.has(index)) return;
      const offset = angleDiffDeg(t.angleDeg, this.yaw);
      if (!best || Math.abs(offset) < Math.abs(best.offset)) best = { index, offset };
    });
    return best;
  }

  private finishShot(): void {
    const avgSpeed = this.exposureSpeedSum / P.exposureSec;
    this.exposure = -1;
    const near = this.nearestUncaptured();
    const reach = this.params.frameTolDeg * P.captureReachFactor;
    let quality = 0;
    if (near && Math.abs(near.offset) <= reach) {
      quality = photoShotQuality(near.offset, avgSpeed, this.params);
      this.captured.add(near.index);
      this.panel.status.textContent = avgSpeed > this.params.blurSpeedDegS * 0.5
        ? `${MINIGAME_UI.photo.shake} ${Math.round(quality * 100)}%` : `${MINIGAME_UI.photo.captured} ${Math.round(quality * 100)}%`;
    } else this.panel.status.textContent = MINIGAME_UI.photo.wasted;
    this.qualities.push(quality);
    if (this.qualities.length >= P.shots) this.complete(photoScore(this.qualities, P.shots));
  }

  protected timeoutScore(): number {
    return photoScore(this.qualities, P.shots);
  }

  private xOf(angle: number): number {
    return CANVAS_W / 2 + (angleDiffDeg(angle, this.yaw) / P.viewHalfFovDeg) * (CANVAS_W / 2);
  }

  protected draw(): void {
    const g = this.panel.g;
    const sky = g.createLinearGradient(0, 0, 0, HORIZON_Y);
    sky.addColorStop(0, '#05070f');
    sky.addColorStop(1, '#2a3050');
    g.fillStyle = sky;
    g.fillRect(0, 0, CANVAS_W, HORIZON_Y);
    g.fillStyle = '#4a4f5c';
    g.fillRect(0, HORIZON_Y, CANVAS_W, CANVAS_H - HORIZON_Y);
    const blur = Math.min(1, this.speed / this.params.blurSpeedDegS);
    g.globalAlpha = 1 - blur * 0.35;
    this.targets.forEach((t, i) => {
      const x = this.xOf(t.angleDeg);
      if (x < -60 || x > CANVAS_W + 60) return;
      g.fillStyle = this.captured.has(i) ? '#3d6b52' : '#8d93a3';
      g.strokeStyle = '#c9ccd4';
      if (t.kind === 0) {
        g.beginPath();
        g.ellipse(x, HORIZON_Y + 34, 46, 12, 0, 0, Math.PI * 2);
        g.fill();
        g.stroke();
      } else if (t.kind === 1) {
        g.beginPath();
        g.moveTo(x - 38, HORIZON_Y + 4); g.lineTo(x - 14, HORIZON_Y - 44); g.lineTo(x + 4, HORIZON_Y - 10);
        g.lineTo(x + 20, HORIZON_Y - 34); g.lineTo(x + 40, HORIZON_Y + 4);
        g.closePath(); g.fill(); g.stroke();
      } else {
        g.beginPath();
        g.arc(x, HORIZON_Y + 6, 42, Math.PI, 0);
        g.closePath(); g.fill(); g.stroke();
      }
      if (this.captured.has(i)) {
        g.fillStyle = '#5dff9b';
        g.font = '18px monospace';
        g.fillText('✓', x - 5, HORIZON_Y - 52);
      }
    });
    g.globalAlpha = 1;
    // Bingkai bidik
    const half = (this.params.frameTolDeg / P.viewHalfFovDeg) * (CANVAS_W / 2);
    const steady = this.speed < this.params.blurSpeedDegS * 0.3;
    g.strokeStyle = this.exposure >= 0 ? '#ffffff' : steady ? '#5dff9b' : '#ffd24d';
    g.lineWidth = 2;
    g.strokeRect(CANVAS_W / 2 - half, 40, half * 2, 170);
    g.beginPath();
    g.moveTo(CANVAS_W / 2 - 10, 125); g.lineTo(CANVAS_W / 2 + 10, 125);
    g.moveTo(CANVAS_W / 2, 115); g.lineTo(CANVAS_W / 2, 135);
    g.stroke();
    if (this.exposure >= 0) {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.fillRect(CANVAS_W / 2 - half, 206, (this.exposure / P.exposureSec) * half * 2, 4);
    }
    // Bilah kompas 0-360
    g.fillStyle = '#0b1020';
    g.fillRect(0, 232, CANVAS_W, 28);
    g.fillStyle = '#6b7280';
    for (let a = 0; a < 360; a += 30) g.fillRect((a / 360) * CANVAS_W, 238, 1, 8);
    this.targets.forEach((t, i) => {
      g.fillStyle = this.captured.has(i) ? '#5dff9b' : '#ffd24d';
      g.fillRect((t.angleDeg / 360) * CANVAS_W - 2, 236, 4, 14);
    });
    g.fillStyle = '#4fd1ff';
    g.fillRect((this.yaw / 360) * CANVAS_W - 1, 232, 3, 28);
    g.fillStyle = '#e6f1ff';
    g.font = '12px monospace';
    g.fillText(`${MINIGAME_UI.photo.shots} ${this.qualities.length}/${P.shots}`, 8, 20);
    if (this.speed > this.params.blurSpeedDegS * 0.5) {
      g.fillStyle = '#ffd24d';
      g.fillText(MINIGAME_UI.photo.shake, CANVAS_W / 2 - 40, 30);
    }
  }
}
