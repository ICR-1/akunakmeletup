import * as THREE from 'three';
import type { SceneId } from '../core/constants';
import type { GameContext } from '../core/context';
import { BaseScene } from './baseScene';

export interface PlaceholderOptions {
  id: SceneId;
  background: number;
  fog: number;
  accent: number;
}

/** Scene kosong berlatar warna + fog dengan satu mesh low-poly berputar (sebelum milestone-nya dikerjakan). */
export class PlaceholderScene extends BaseScene {
  readonly id: SceneId;
  private mesh: THREE.Mesh;

  constructor(ctx: GameContext, opts: PlaceholderOptions) {
    super(ctx);
    this.id = opts.id;
    this.scene.background = new THREE.Color(opts.background);
    this.scene.fog = new THREE.Fog(opts.fog, 8, 40);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, opts.fog, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(5, 8, 4);
    this.scene.add(sun);
    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.5, 0),
      new THREE.MeshStandardMaterial({ color: opts.accent, flatShading: true }),
    );
    this.scene.add(this.mesh);
    this.camera.position.set(0, 1.5, 6);
    this.camera.lookAt(0, 0, 0);
  }

  protected onEnter(ui: HTMLElement): void {
    void ui;
  }

  update(dt: number): void {
    this.mesh.rotation.y += dt * 0.6;
    this.mesh.rotation.x += dt * 0.2;
  }
}
