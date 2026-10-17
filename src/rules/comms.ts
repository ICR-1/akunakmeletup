import {
  COMMS_WINDOW_SEC, SIGNAL_DISTANCE_PENALTY, SIGNAL_MAX, SIGNAL_MIN, SIGNAL_REF_DISTANCE_M,
} from '../core/constants';
import { modulesOfKind, sumStat, type Assembly } from './catalog';
import { clamp, ratioMargin } from './margin';

/** rateTotal = rate antena utama + rate relay (jika ada). */
export function rateTotal(a: Assembly): number {
  return sumStat(modulesOfKind(a, 'antenna'), 'rate');
}

export function dataUnitsTotal(a: Assembly): number {
  return a.instruments.reduce((s, i) => s + i.dataUnits, 0);
}

export function commsMargin(a: Assembly): number {
  const data = dataUnitsTotal(a);
  return ratioMargin(rateTotal(a) * COMMS_WINDOW_SEC - data, data);
}

/** signalQuality = clamp(1 - 0,6 * jarak / 400, 0,4, 1) ditambah efek event, dijaga di [0, 1]. */
export function signalQuality(distanceM: number, eventDelta = 0): number {
  const base = clamp(1 - (SIGNAL_DISTANCE_PENALTY * distanceM) / SIGNAL_REF_DISTANCE_M, SIGNAL_MIN, SIGNAL_MAX);
  return clamp(base + eventDelta, 0, SIGNAL_MAX);
}

export interface CollectedData { dataUnits: number; score01: number }

/** D = jumlah dataUnits * score01 tiap instrumen yang minigame-nya selesai. */
export function uplinkDataD(collected: CollectedData[]): number {
  return collected.reduce((s, c) => s + c.dataUnits * c.score01, 0);
}

/** U = min(1, C / D), C = rateTotal * 30 * signalQuality; D = 0 menghasilkan U = 0. */
export function uplinkFactor(dataD: number, rate: number, quality: number): number {
  if (dataD <= 0) return 0;
  return Math.min(1, (rate * COMMS_WINDOW_SEC * quality) / dataD);
}
