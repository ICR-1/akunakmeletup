import type { Rng } from '../core/rng';
import type { Id, MinigameResult } from '../rules/types';

export interface MinigameContext {
  rng: Rng;
  /** 0-1; makin tinggi makin sulit. */
  difficulty: number;
  container: HTMLElement;
}

/** Kontrak minigame (PRD 13): start, update tiap langkah tetap, result() bernilai null sampai selesai. */
export interface Minigame {
  id: Id;
  /** Batas waktu rancangan (detik), dalam rentang 20-45. */
  durationSec: number;
  start(ctx: MinigameContext): void;
  update(dtSec: number): void;
  result(): MinigameResult | null;
  /** Bersihkan elemen DOM dan listener. */
  dispose(): void;
}

export type MinigameFactory = () => Minigame;
