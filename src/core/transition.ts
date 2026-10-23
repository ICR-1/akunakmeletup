import type { SceneId } from './constants';

type Phase = 'idle' | 'out' | 'in';

const EPS = 1e-9;

/**
 * Transisi pudar antar-scene (murni, tanpa DOM): opacity naik 0 ke 1 selama `fadeSec`, scene berganti tepat
 * saat opacity mencapai 1 (sekali), lalu opacity turun 1 ke 0. `request()` saat memudar hanya mengganti tujuan.
 */
export class SceneTransition {
  private phase: Phase = 'idle';
  private t = 0;
  private target: SceneId | null = null;

  constructor(private readonly fadeSec: number) {}

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  request(id: SceneId): void {
    this.target = id;
    if (this.phase === 'idle') {
      this.phase = 'out';
      this.t = 0;
    }
  }

  /** Batalkan transisi tertunda (mis. perpindahan langsung dari tombol dev). */
  cancel(): void {
    this.phase = 'idle';
    this.t = 0;
    this.target = null;
  }

  update(dt: number): { switchTo: SceneId | null; opacity: number } {
    if (this.phase === 'idle') return { switchTo: null, opacity: 0 };
    if (this.fadeSec <= 0) {
      const id = this.target;
      this.cancel();
      return { switchTo: id, opacity: 0 };
    }
    this.t += dt;
    if (this.phase === 'out') {
      if (this.t >= this.fadeSec - EPS) {
        const id = this.target;
        this.target = null;
        this.phase = 'in';
        this.t = 0;
        return { switchTo: id, opacity: 1 };
      }
      return { switchTo: null, opacity: this.t / this.fadeSec };
    }
    if (this.t >= this.fadeSec - EPS) {
      this.phase = 'idle';
      this.t = 0;
      return { switchTo: null, opacity: 0 };
    }
    return { switchTo: null, opacity: 1 - this.t / this.fadeSec };
  }
}
