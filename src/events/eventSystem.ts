import { EVENTS } from '../core/constants';
import { createRng, hashString, rngRange, type Rng } from '../core/rng';
import type { Effect, EventChoice, EventPhase, GameEvent, Id } from '../rules/types';

export interface ScheduledEvent {
  event: GameEvent;
  /** Waktu permukaan (detik) saat event dipicu. */
  triggerSec: number;
}

export interface ChoiceOutcome {
  choiceIndex: number;
  failed: boolean;
  /** Efek yang benar-benar diterapkan: efek pilihan, ditambah efek gagal bila dadu gagal. */
  effects: Effect[];
  /** Ditangani baik = pilihan tidak memicu failEffects (PRD 14). */
  handledWell: boolean;
}

/** Event milik destinasi (atau 'any') pada fase tertentu. */
export function eligibleEvents(events: GameEvent[], destinationId: Id, phase: EventPhase): GameEvent[] {
  return events.filter((e) => e.phase === phase && (e.destinationId === 'any' || e.destinationId === destinationId));
}

/** Indeks hasil pemilihan berbobot dari daftar (bobot positif). */
export function pickWeighted(weights: number[], rng: Rng): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Jadwal event permukaan: 1 event, ditambah 1 lagi dengan peluang 0,5; pemilihan berbobot tanpa
 * pengembalian; waktu pemicu acak seragam 45-180 detik (PRD 14). Deterministik dari seed.
 */
export function planSurfaceEvents(events: GameEvent[], destinationId: Id, seed: number): ScheduledEvent[] {
  const rng = createRng((seed ^ EVENTS.surfaceSalt) >>> 0);
  const pool = eligibleEvents(events, destinationId, 'surface');
  const count = Math.min(pool.length, 1 + (rng() < EVENTS.secondEventChance ? 1 : 0));
  const chosen: GameEvent[] = [];
  const left = [...pool];
  for (let i = 0; i < count; i++) {
    const idx = pickWeighted(left.map((e) => e.weight), rng);
    chosen.push(left.splice(idx, 1)[0]);
  }
  return chosen
    .map((event) => ({ event, triggerSec: rngRange(rng, EVENTS.surfaceMinSec, EVENTS.surfaceMaxSec) }))
    .sort((a, b) => a.triggerSec - b.triggerSec);
}

/** Tepat 1 event penerbangan dari kumpulan fase flight (berbobot, deterministik dari seed). */
export function pickFlightEvent(events: GameEvent[], destinationId: Id, seed: number): GameEvent | null {
  const pool = eligibleEvents(events, destinationId, 'flight');
  if (pool.length === 0) return null;
  const rng = createRng((seed ^ EVENTS.flightSalt) >>> 0);
  return pool[pickWeighted(pool.map((e) => e.weight), rng)];
}

/** Peluang gagal sebuah pilihan (0-1). */
export function choiceRisk(choice: EventChoice): number {
  return choice.failChance;
}

/**
 * Hasil memilih satu opsi. Dadu diturunkan dari seed dan id event (bukan dari urutan pemicu), sehingga
 * seed yang sama selalu menghasilkan hasil dadu yang sama untuk event yang sama.
 */
export function rollChoice(event: GameEvent, choiceIndex: number, seed: number, minigameScore?: number): ChoiceOutcome {
  const choice = event.choices[choiceIndex];
  if (!choice) throw new Error(`Pilihan ${choiceIndex} tidak ada pada event "${event.id}"`);
  const roll = createRng((seed ^ hashString(event.id) ^ EVENTS.diceSalt) >>> 0)();
  // Pilihan bergaya minigame: hasil ditentukan skor pemain (bukan dadu), skor rendah memicu failEffects.
  const failed = choice.minigameId !== undefined && minigameScore !== undefined
    ? minigameScore < EVENTS.minigamePassScore
    : choice.failChance > 0 && roll < choice.failChance;
  return {
    choiceIndex,
    failed,
    effects: failed ? [...choice.effects, ...choice.failEffects] : [...choice.effects],
    handledWell: !failed,
  };
}
