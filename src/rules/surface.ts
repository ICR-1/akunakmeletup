import { SURFACE, SURFACE_TIME_LIMIT_SEC, UPLINK_RADIUS_M } from '../core/constants';
import { modulesOfKind, type Assembly } from './catalog';
import { signalQuality } from './comms';
import { clamp } from './margin';
import { batteryCapacityWh, isDaytime, loadW, productionW, stepBatteryWh } from './power';
import type { Effect } from './types';

export type Movement = 'idle' | 'walk' | 'run' | 'drive';

export interface SurfaceState {
  timeSec: number;
  oxygen: number;
  suitBattery: number;
  vehicleWh: number;
  vehicleCapacityWh: number;
  faintCount: number;
  /** Instrumen mati: baterai wahana kosong dan produksi tidak menutup beban. */
  powerOut: boolean;
  /** Daya wahana habis saat malam (kode NIGHT_POWER). */
  nightPowerOut: boolean;
  scannerCooldownSec: number;
  signalDelta: number;
  signalDeltaSec: number;
  scoreDelta: number;
  timeUp: boolean;
}

export type SurfaceEvent =
  | { type: 'faint' }
  | { type: 'power_out' }
  | { type: 'time_up' }
  | { type: 'daynight'; day: boolean };

export interface SurfaceStepInput {
  movement: Movement;
  distanceFromHubM: number;
}

/** Lunar Cruiser yang terpasang pada rakitan (jika ada). */
export const roverModule = (a: Assembly) => modulesOfKind(a, 'rover')[0];

/** Kecepatan jelajah Lunar Cruiser (m/s), 0 bila tidak dibawa. */
export const roverSpeedMs = (a: Assembly): number => roverModule(a)?.stats.speedMs ?? 0;

/** Beban daya tambahan saat Lunar Cruiser berjalan (W). */
export const roverDriveW = (a: Assembly): number => roverModule(a)?.stats.driveW ?? 0;

export function createSurfaceState(a: Assembly): SurfaceState {
  const capacity = batteryCapacityWh(a);
  return {
    timeSec: 0, oxygen: SURFACE.meterMax, suitBattery: SURFACE.meterMax,
    vehicleWh: capacity, vehicleCapacityWh: capacity, faintCount: 0,
    powerOut: false, nightPowerOut: false, scannerCooldownSec: 0,
    signalDelta: 0, signalDeltaSec: 0, scoreDelta: 0, timeUp: false,
  };
}

export const isInHub = (distanceM: number): boolean => distanceM <= UPLINK_RADIUS_M;

/** Satu langkah sumber daya permukaan (PRD 14); mengembalikan state baru dan peristiwa. */
export function stepSurface(s: SurfaceState, input: SurfaceStepInput, a: Assembly, dt: number): { state: SurfaceState; events: SurfaceEvent[] } {
  const events: SurfaceEvent[] = [];
  const next: SurfaceState = { ...s, timeSec: s.timeSec + dt };
  const hub = isInHub(input.distanceFromHubM);

  next.oxygen = hub
    ? Math.min(SURFACE.meterMax, s.oxygen + SURFACE.oxygenRecoverPerSec * dt)
    : s.oxygen - SURFACE.oxygenDrain[input.movement] * dt;
  next.suitBattery = hub
    ? Math.min(SURFACE.meterMax, s.suitBattery + SURFACE.suitRecoverPerSec * dt)
    : Math.max(0, s.suitBattery - SURFACE.suitDrainPerSec * dt);
  next.scannerCooldownSec = Math.max(0, s.scannerCooldownSec - dt);

  if (s.signalDeltaSec > 0) {
    next.signalDeltaSec = Math.max(0, s.signalDeltaSec - dt);
    if (next.signalDeltaSec === 0) next.signalDelta = 0;
  }

  const production = productionW(a, s.timeSec);
  const load = loadW(a) + (input.movement === 'drive' ? roverDriveW(a) : 0);
  next.vehicleWh = stepBatteryWh(s.vehicleWh, s.vehicleCapacityWh, production, load, dt);
  next.powerOut = next.vehicleWh <= 0 && production < load;
  if (next.powerOut && !s.powerOut) {
    events.push({ type: 'power_out' });
    if (!isDaytime(s.timeSec)) next.nightPowerOut = true;
  }
  if (isDaytime(s.timeSec) !== isDaytime(next.timeSec)) events.push({ type: 'daynight', day: isDaytime(next.timeSec) });

  if (next.oxygen <= 0) {
    next.faintCount = s.faintCount + 1;
    next.timeSec += SURFACE.faintPenaltySec;
    next.oxygen = SURFACE.faintRespawnOxygen;
    events.push({ type: 'faint' });
  }
  if (!s.timeUp && next.timeSec >= SURFACE_TIME_LIMIT_SEC) {
    next.timeUp = true;
    events.push({ type: 'time_up' });
  }
  return { state: next, events };
}

/** Pemindai (Q): memakai 3 baterai suit, cooldown 3 detik. */
export function tryScan(s: SurfaceState): { state: SurfaceState; ok: boolean } {
  if (s.scannerCooldownSec > 0 || s.suitBattery < SURFACE.scannerCost) return { state: s, ok: false };
  return { state: { ...s, suitBattery: s.suitBattery - SURFACE.scannerCost, scannerCooldownSec: SURFACE.scannerCooldownSec }, ok: true };
}

/** Biaya baterai suit (mis. memulai minigame = 5). */
export function spendSuitBattery(s: SurfaceState, amount: number): { state: SurfaceState; ok: boolean } {
  if (s.suitBattery < amount) return { state: s, ok: false };
  return { state: { ...s, suitBattery: s.suitBattery - amount }, ok: true };
}

/** Terapkan efek pilihan event (PRD 14): satuan sesuai target. deltaVms hanya berlaku di fase penerbangan. */
export function applyEffects(s: SurfaceState, effects: Effect[]): SurfaceState {
  const next = { ...s };
  for (const e of effects) {
    switch (e.target) {
      case 'oxygen': next.oxygen = clamp(next.oxygen + e.delta, 0, SURFACE.meterMax); break;
      case 'suitBattery': next.suitBattery = clamp(next.suitBattery + e.delta, 0, SURFACE.meterMax); break;
      case 'vehiclePower':
        next.vehicleWh = clamp(next.vehicleWh + (e.delta / 100) * next.vehicleCapacityWh, 0, next.vehicleCapacityWh);
        break;
      case 'signal':
        next.signalDelta += e.delta;
        next.signalDeltaSec = SURFACE.signalEffectSec;
        break;
      case 'timeSec': next.timeSec += e.delta; break;
      case 'score': next.scoreDelta += e.delta; break;
      case 'deltaVms': break;
    }
  }
  return next;
}

/** Kualitas sinyal saat ini dari jarak ke wahana dan efek event. */
export function currentSignal(s: SurfaceState, distanceFromHubM: number): number {
  return signalQuality(distanceFromHubM, s.signalDelta);
}

/** Uplink hanya di dalam radius hub dan saat daya wahana masih ada. */
export function canUplink(s: SurfaceState, distanceFromHubM: number): boolean {
  return isInHub(distanceFromHubM) && !s.powerOut && s.vehicleWh > 0;
}
