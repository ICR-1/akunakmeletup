import { FLIGHT, STAGING } from '../core/constants';
import { clamp } from './margin';
import type { Rocket } from './types';

/** Toleransi float agar "tepat 3,0 dtk" tidak dihitung terlambat. */
const EPS = 1e-9;

export type StagePhase = 'ready' | 'burning' | 'depleted' | 'jettisoned';

export interface StageState {
  burnRemainingSec: number;
  phase: StagePhase;
  /** Detik sejak tahap habis (hanya bermakna saat phase = 'depleted'). */
  sinceDepletedSec: number;
}

export interface StagingState {
  stages: StageState[];
  jettisoned: number;
  lateStageCount: number;
}

export type StagingEvent =
  | { type: 'depleted'; stageIndex: number }
  | { type: 'ignite'; stageIndex: number }
  | { type: 'jettison'; stageIndex: number; late: boolean; auto: boolean };

/**
 * Roket dengan lama nyala tahap peluncuran (1 sampai n-1) dikalikan `FLIGHT.launchBurnScale`; tahap terakhir
 * (Fairing + Transfer) tetap. Data PRD di `rockets.json` tidak diubah: pengali ini hanya mengatur kecepatan
 * permainan agar tahap tidak habis dan terlepas terlalu cepat saat roket masih dekat Bumi.
 */
export function paceRocket(rocket: Rocket): Rocket {
  const last = rocket.stages.length - 1;
  return { ...rocket, stages: rocket.stages.map((s, i) => (i === last ? s : { ...s, burnSec: s.burnSec * FLIGHT.launchBurnScale })) };
}

export function createStaging(burnSecs: number[]): StagingState {
  return {
    stages: burnSecs.map((burn, i) => ({
      burnRemainingSec: burn,
      phase: i === 0 ? 'burning' : 'ready',
      sinceDepletedSec: 0,
    })),
    jettisoned: 0,
    lateStageCount: 0,
  };
}

/** Indeks tahap yang sedang menyala (bar turun), atau -1 jika tidak ada. */
export function activeStageIndex(s: StagingState): number {
  return s.stages.findIndex((st) => st.phase === 'burning');
}

/** Tahap habis tertua yang masih menempel, atau -1. */
export function oldestDepletedIndex(s: StagingState): number {
  return s.stages.findIndex((st) => st.phase === 'depleted');
}

/** Faktor percepatan: 0,8 selama ada tahap habis menempel, selain itu 1. */
export function accelFactor(s: StagingState): number {
  return oldestDepletedIndex(s) >= 0 ? STAGING.deadWeightAccelFactor : 1;
}

/** handlingEff = handling + 0,25 * jumlah tahap yang sudah dilepas. */
export function handlingEff(baseHandling: number, jettisoned: number): number {
  return baseHandling + STAGING.handlingBonusPerStage * jettisoned;
}

/**
 * Satu langkah staging (murni; mengembalikan state baru).
 * Thrust (0-1) menguras bar tahap aktif; tahap habis menyalakan tahap berikutnya;
 * F melepas tahap habis tertua; terlambat jika > lateGraceSec, auto-lepas pada autoJettisonSec.
 */
export function stepStaging(
  prev: StagingState,
  dtSec: number,
  throttle01: number,
  jettisonPressed: boolean,
): { state: StagingState; events: StagingEvent[] } {
  const state: StagingState = { ...prev, stages: prev.stages.map((st) => ({ ...st })) };
  const events: StagingEvent[] = [];

  state.stages.forEach((st) => {
    if (st.phase === 'depleted') st.sinceDepletedSec += dtSec;
  });

  const active = activeStageIndex(state);
  if (active >= 0) {
    const st = state.stages[active];
    st.burnRemainingSec = Math.max(0, st.burnRemainingSec - clamp(throttle01, 0, 1) * dtSec);
    if (st.burnRemainingSec <= 0) {
      st.phase = 'depleted';
      st.sinceDepletedSec = 0;
      events.push({ type: 'depleted', stageIndex: active });
      const next = state.stages.findIndex((x) => x.phase === 'ready');
      if (next >= 0) {
        state.stages[next].phase = 'burning';
        events.push({ type: 'ignite', stageIndex: next });
      }
    }
  }

  const jettison = (index: number, auto: boolean): void => {
    const st = state.stages[index];
    const late = st.sinceDepletedSec > STAGING.lateGraceSec + EPS || auto;
    st.phase = 'jettisoned';
    state.jettisoned += 1;
    if (late) state.lateStageCount += 1;
    events.push({ type: 'jettison', stageIndex: index, late, auto });
  };

  const oldest = oldestDepletedIndex(state);
  if (oldest >= 0) {
    if (jettisonPressed) jettison(oldest, false);
    else if (state.stages[oldest].sinceDepletedSec >= STAGING.autoJettisonSec - EPS) jettison(oldest, true);
  }
  return { state, events };
}

/** flightQuality = clamp(kualitasSudut - 0,10 * terlambat, 0, 1). */
export function flightQuality(angleQuality01: number, lateStageCount: number): number {
  return clamp(angleQuality01 - STAGING.lateFlightQualityPenalty * lateStageCount, 0, 1);
}

/** errorFraction = clamp(penyimpanganArah + 0,05 * terlambat, 0, 1). */
export function errorFraction(headingDeviation01: number, lateStageCount: number): number {
  return clamp(headingDeviation01 + STAGING.lateErrorFractionPenalty * lateStageCount, 0, 1);
}

export function lateSafetyPenalty(lateStageCount: number): number {
  return STAGING.lateSafetyScorePenalty * lateStageCount;
}
