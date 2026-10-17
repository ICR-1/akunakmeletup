export type Id = string;

export interface Stage { id: Id; name: string; burnSec: number }
export interface Rocket { id: Id; name: string; payloadToLeoKg: number; costMusd: number; handling: number; stages: Stage[] }

export const MODULE_KINDS = ['lander', 'tank', 'engine', 'solar', 'battery', 'rtg', 'antenna', 'rover'] as const;
export type ModuleKind = (typeof MODULE_KINDS)[number];
export interface Module {
  id: Id; name: string; costMusd: number; massKg: number;
  kind: ModuleKind;
  stats: Record<string, number>;
}

export interface Instrument { id: Id; name: string; massKg: number; powerW: number; costMusd: number; dataUnits: number; minigameId: Id }

export const EFFECT_TARGETS = ['oxygen', 'suitBattery', 'vehiclePower', 'signal', 'timeSec', 'score', 'deltaVms'] as const;
export type EffectTarget = (typeof EFFECT_TARGETS)[number];
export interface Effect { target: EffectTarget; delta: number }
/** Minigame yang boleh dipakai pilihan event (bukan dari instrumen). */
export const EVENT_MINIGAMES: readonly string[] = ['clean_panel'];

export interface EventChoice {
  label: string; effects: Effect[]; failChance: number; failEffects: Effect[];
  /** Jika ada, pilihan ini dimainkan sebagai minigame; skor di bawah ambang sukses memicu failEffects. */
  minigameId?: Id;
}
export type EventPhase = 'flight' | 'surface';
export interface GameEvent {
  id: Id; destinationId: Id | 'any'; phase: EventPhase; weight: number;
  title: string; description: string; choices: EventChoice[];
}

export interface Objective { id: Id; title: string; required: boolean; instrumentId?: Id; bonus?: boolean }
export interface Destination {
  id: Id; name: string; mvp: boolean; gravity: number; solarIrradianceWm2: number;
  deltaVKmS: number; budgetMusd: number; palette: string[];
  objectives: Objective[]; eventIds: Id[]; minigameIds: Id[];
}

export const DIALOG_SPEAKERS = ['nova', 'sekar', 'ground', 'beacon'] as const;
export type DialogSpeaker = (typeof DIALOG_SPEAKERS)[number];
export interface DialogLine { id: Id; speaker: DialogSpeaker; text: string }

/** fuelFraction (0-1, default 1) ditambahkan ke skema PRD agar isi bahan bakar tersimpan; lihat DECISIONS.md. */
export interface MissionConfig {
  destinationId: Id; rocketId: Id; moduleIds: Id[]; instrumentIds: Id[]; seed: number;
  fuelFraction?: number;
}

export interface Catalog {
  rockets: Rocket[];
  modules: Module[];
  instruments: Instrument[];
  destinations: Destination[];
  events: GameEvent[];
  dialogs: DialogLine[];
}

export interface MinigameResult { score01: number; durationSec: number }

/** Mode permainan (PRD 11): cerita berurutan atau Free Design bebas tanpa cerita. */
export type GameMode = 'story' | 'free';
