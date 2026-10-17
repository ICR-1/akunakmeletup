import { QUALITY } from './constants';

/**
 * Mengatur pixel ratio render secara adaptif: turun bila rata-rata FPS satu jendela di bawah ambang,
 * naik pelan-pelan (maksimal ke rasio dasar) saat FPS longgar. Murni (tanpa DOM) agar mudah diuji.
 */
export class AdaptiveQuality {
  private ratio: number;
  private accumSec = 0;
  private frames = 0;
  private strugglingWindows = 0;

  constructor(private readonly baseRatio: number) {
    this.ratio = baseRatio;
  }

  get current(): number {
    return this.ratio;
  }

  /** True jika resolusi sudah minimum tetapi FPS tetap rendah beberapa jendela berturut-turut (saatnya menurunkan detail model). */
  get struggling(): boolean {
    return this.strugglingWindows >= QUALITY.fallbackWindows;
  }

  resetStruggle(): void {
    this.strugglingWindows = 0;
  }

  /** Masukkan durasi satu frame; mengembalikan rasio baru jika berubah, selain itu null. */
  update(frameSec: number): number | null {
    if (frameSec <= 0 || frameSec > QUALITY.ignoreFrameSec) return null;
    this.accumSec += frameSec;
    this.frames += 1;
    if (this.accumSec < QUALITY.windowSec) return null;
    const fps = this.frames / this.accumSec;
    this.accumSec = 0;
    this.frames = 0;
    this.strugglingWindows = this.ratio <= QUALITY.minRatio + 1e-6 && fps < QUALITY.downBelowFps ? this.strugglingWindows + 1 : 0;
    let next = this.ratio;
    if (fps < QUALITY.downBelowFps) next = Math.max(QUALITY.minRatio, this.ratio * QUALITY.downStep);
    else if (fps > QUALITY.upAboveFps) next = Math.min(this.baseRatio, this.ratio * QUALITY.upStep);
    if (Math.abs(next - this.ratio) < 1e-6) return null;
    this.ratio = next;
    return next;
  }
}
