import * as THREE from 'three';
import { CAMERA_FAR, CAMERA_FOV, CAMERA_NEAR, type SceneId } from '../core/constants';
import type { GameContext } from '../core/context';
import type { GameScene } from '../core/sceneManager';
import { el } from '../ui/dom';

/** Dasar scene Three.js + lapisan UI DOM yang dibuat saat masuk dan dibuang saat keluar. */
export abstract class BaseScene implements GameScene {
  abstract readonly id: SceneId;
  protected readonly scene = new THREE.Scene();
  protected readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, CAMERA_NEAR, CAMERA_FAR);
  protected ui: HTMLElement | null = null;

  constructor(protected readonly ctx: GameContext) {
    this.camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
    this.camera.updateProjectionMatrix();
  }

  enter(): void {
    this.ui = el('div', `scene-ui scene-ui-${this.id}`);
    this.ctx.overlay.appendChild(this.ui);
    this.onEnter(this.ui);
  }

  exit(): void {
    this.onExit();
    this.ui?.remove();
    this.ui = null;
  }

  protected abstract onEnter(ui: HTMLElement): void;
  protected onExit(): void {}
  abstract update(dt: number): void;

  render(): void {
    this.ctx.renderer.render(this.scene, this.camera);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}
