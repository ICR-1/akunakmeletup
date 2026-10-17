import type { SceneId } from './constants';

export interface GameScene {
  readonly id: SceneId;
  enter(): void;
  exit(): void;
  update(dt: number): void;
  render(): void;
  resize(width: number, height: number): void;
}

/** Mengelola scene aktif; sengaja bebas dari Three.js agar mudah diuji. */
export class SceneManager {
  private scenes = new Map<SceneId, GameScene>();
  private active: GameScene | null = null;
  onChange: (id: SceneId) => void = () => {};

  register(scene: GameScene): void {
    this.scenes.set(scene.id, scene);
  }

  get current(): SceneId | null {
    return this.active?.id ?? null;
  }

  switchTo(id: SceneId): void {
    const next = this.scenes.get(id);
    if (!next) throw new Error(`Scene tidak terdaftar: ${id}`);
    if (next === this.active) return;
    this.active?.exit();
    this.active = next;
    next.enter();
    this.onChange(id);
  }

  /** Bangun ulang scene aktif (keluar lalu masuk) agar model dibuat dengan pengaturan terbaru. */
  reload(): void {
    const active = this.active;
    if (!active) return;
    active.exit();
    active.enter();
  }

  update(dt: number): void {
    this.active?.update(dt);
  }

  render(): void {
    this.active?.render();
  }

  resize(width: number, height: number): void {
    this.scenes.forEach((s) => s.resize(width, height));
  }
}
