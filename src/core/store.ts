import { DEFAULT_SEED, type SceneId } from './constants';

import type { FlightSummary, MissionOutcome, SurfaceSummary } from '../rules/missionResult';
import { defaultSave, type SaveData } from '../rules/progress';
import type { GameMode, MissionConfig } from '../rules/types';

export type { GameMode, MissionConfig };

export interface GameState {
  currentScene: SceneId;
  /** Mode permainan sesi ini (tidak disimpan; setiap muat ulang kembali ke Cerita). */
  mode: GameMode;
  mission: MissionConfig;
  flight: FlightSummary | null;
  surface: SurfaceSummary | null;
  outcome: MissionOutcome | null;
  save: SaveData;
  /** Bagian katalog desain yang ditandai setelah review gagal (tombol Perbaiki desain). */
  flaggedSections: string[];
}

type Listener<T> = (state: T, prev: T) => void;

export interface Store<T> {
  get(): T;
  set(patch: Partial<T>): void;
  subscribe(fn: Listener<T>): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...patch };
      listeners.forEach((fn) => fn(state, prev));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export function createGameStore(mission?: MissionConfig, save?: SaveData): Store<GameState> {
  return createStore<GameState>({
    currentScene: 'briefing',
    mode: 'story',
    mission: mission ?? { destinationId: 'moon', rocketId: '', moduleIds: [], instrumentIds: [], seed: DEFAULT_SEED },
    flight: null,
    surface: null,
    outcome: null,
    save: save ?? defaultSave(),
    flaggedSections: [],
  });
}
