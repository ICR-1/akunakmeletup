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
  private lastSwitched: SceneId | null = null;

  constructor(private readonly fadeSec: number) {}

  get busy(): boolean {
    return this.phase !== 'idle';
  }

  request(id: SceneId): void {
    if (this.phase === 'in') {
      // Permintaan setelah scene berganti: abaikan bila tujuannya scene yang baru saja dimasuki;
      // selain itu pudar-keluar lagi dari opacity saat ini tanpa lompatan (opacity = 1 - t/fade = t'/fade).
      if (id === this.lastSwitched) return;
      this.target = id;
      this.phase = 'out';
      this.t = this.fadeSec - this.t;
      return;
    }
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
      this.lastSwitched = id;
      return { switchTo: id, opacity: 0 };
    }
    this.t += dt;
    if (this.phase === 'out') {
      if (this.t >= this.fadeSec - EPS) {
        const id = this.target;
        this.target = null;
        this.lastSwitched = id;
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
