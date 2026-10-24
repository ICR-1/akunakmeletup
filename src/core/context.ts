import type * as THREE from 'three';
import type { SceneId } from './constants';
import type { CursorManager } from './cursor';
import type { Input } from './input';
import type { GameState, Store } from './store';
import type { Catalog } from '../rules/types';

/** Dependensi bersama yang diberikan ke setiap scene (scene tidak saling memanggil langsung). */
export interface GameContext {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  store: Store<GameState>;
  input: Input;
  catalog: Catalog;
  cursor: CursorManager;
  go(scene: SceneId): void;
  /** Buka panel Pengaturan (dipakai tombol di layar judul). */
  openSettings(): void;
}
