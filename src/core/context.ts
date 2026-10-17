import type * as THREE from 'three';
import type { SceneId } from './constants';
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
  go(scene: SceneId): void;
}
