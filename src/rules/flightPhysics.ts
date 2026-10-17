import { FLIGHT, G0 } from '../core/constants';
import type { Rng } from '../core/rng';
import { fuelRemainingKg, transferBurnCostMs, tsiolkovskyDv } from './deltav';
import { clamp } from './margin';
import type { TouchdownOutcome } from './missionResult';
import type { Id } from './types';

const L = FLIGHT.landing;
const T = FLIGHT.touchdown;

/** Pitch panduan gravity turn: vertikal (90) saat progress 0, horizontal (0) saat progress 1. */
export function guidePitchDeg(progress01: number): number {
  return FLIGHT.launchStartPitchDeg * (1 - clamp(progress01, 0, 1)) ** FLIGHT.guideExponent;
}

export function altitudeKmAt(progress01: number): number {
  return FLIGHT.orbitAltitudeKm * clamp(progress01, 0, 1) ** FLIGHT.altitudeExponent;
}

/** Kualitas sudut 0-1 dari rata-rata kesalahan sudut (derajat). */
export function angleQuality(meanErrorDeg: number): number {
  return clamp(1 - meanErrorDeg / FLIGHT.angleErrorZeroDeg, 0, 1);
}

/** Penyimpangan arah 0-1 dari rata-rata simpangan (derajat). */
export function headingDeviation01(meanDeviationDeg: number): number {
  return clamp(meanDeviationDeg / FLIGHT.angleErrorZeroDeg, 0, 1);
}

export interface TransferParams {
  m0Kg: number;
  mfKg: number;
  ispS: number;
  dvRequiredMs: number;
  /** Perubahan dvAvailable dari event (m/s, negatif = berkurang). */
  dvAdjustMs?: number;
}

export interface TransferResult {
  burnCostMs: number;
  dvAvailableMs: number;
  sufficient: boolean;
  fuelRemainingKg: number;
}

/**
 * Burn transfer (PRD 14): biaya = 0,7 x dvRequired x (1 + 0,5 x errorFraction); gagal LOW_FUEL jika
 * dvAvailable kurang. Sisa bahan bakar = m0 exp(-biaya / (Isp g0)) - mf, dengan m0 efektif dari dvAvailable
 * setelah penyesuaian event (identik dengan rumus PRD jika penyesuaian 0).
 */
export function resolveTransfer(p: TransferParams, errorFraction: number): TransferResult {
  const dvAvailableMs = Math.max(0, tsiolkovskyDv(p.ispS, p.m0Kg, p.mfKg) + (p.dvAdjustMs ?? 0));
  const burnCostMs = transferBurnCostMs(p.dvRequiredMs, errorFraction);
  const sufficient = dvAvailableMs >= burnCostMs;
  const effectiveM0 = p.ispS > 0 ? p.mfKg * Math.exp(dvAvailableMs / (p.ispS * G0)) : p.mfKg;
  return {
    burnCostMs, dvAvailableMs, sufficient,
    fuelRemainingKg: sufficient ? fuelRemainingKg(effectiveM0, p.mfKg, burnCostMs, p.ispS) : 0,
  };
}

export interface LandingParams {
  thrustN: number;
  ispS: number;
  dryMassKg: number;
  gravity: number;
}

export interface LandingState {
  altitudeM: number;
  vy: number;
  vx: number;
  tiltDeg: number;
  fuelKg: number;
  fuelOut: boolean;
  landed: boolean;
  timeSec: number;
}

export interface LandingInput {
  throttle01: number;
  /** -1 = miring kiri, +1 = miring kanan. */
  rotate: number;
  boost: boolean;
  precision: boolean;
}

export function createLanding(fuelKg: number): LandingState {
  return {
    altitudeM: L.startAltitudeM, vy: L.startVy, vx: 0, tiltDeg: 0,
    fuelKg, fuelOut: fuelKg <= 0, landed: false, timeSec: 0,
  };
}

/** Sensitivitas rotasi = 60 derajat/detik x clamp(sqrt(2000 / mCurrent), 0,5, 1,5). */
export function rotationRateDegS(mCurrentKg: number): number {
  return FLIGHT.rotationRateDegS * clamp(Math.sqrt(L.rotationMassRefKg / mCurrentKg), L.rotationScaleMin, L.rotationScaleMax);
}

/** Satu langkah pendaratan (murni). Percepatan ke atas = thrust x throttle / mCurrent - gravity. */
export function stepLanding(s: LandingState, input: LandingInput, p: LandingParams, dt: number): LandingState {
  if (s.landed) return s;
  const mCurrent = p.dryMassKg + s.fuelKg;
  const throttle = s.fuelKg > 0 ? clamp(input.throttle01, 0, 1) : 0;
  const thrustAccel = (p.thrustN * throttle) / mCurrent;
  const rate = rotationRateDegS(mCurrent) * (input.precision ? FLIGHT.precisionFactor : 1);
  const tiltDeg = clamp(s.tiltDeg + clamp(input.rotate, -1, 1) * rate * dt, -L.maxTiltDeg, L.maxTiltDeg);
  const tiltRad = (tiltDeg * Math.PI) / 180;

  let burned = (p.thrustN * throttle * dt) / (p.ispS * G0);
  let sideAccel = thrustAccel * Math.sin(tiltRad);
  if (input.boost && s.fuelKg > 0) {
    sideAccel += L.boostAccel * Math.sign(tiltDeg);
    burned += L.boostFuelKgPerSec * dt;
  }
  const fuelKg = Math.max(0, s.fuelKg - burned);
  const vy = s.vy + (thrustAccel - p.gravity) * dt;
  const altitudeM = s.altitudeM + vy * dt;
  const next: LandingState = {
    altitudeM: Math.max(0, altitudeM), vy, vx: s.vx + sideAccel * dt, tiltDeg, fuelKg,
    fuelOut: s.fuelOut || fuelKg <= 0, landed: altitudeM <= 0, timeSec: s.timeSec + dt,
  };
  return next;
}

export interface TouchdownResult { outcome: TouchdownOutcome; factor: number }

/** Hasil touchdown (PRD 14): vy dan tilt dalam nilai mutlak. */
export function classifyTouchdown(vy: number, tiltDeg: number): TouchdownResult {
  const speed = Math.abs(vy);
  const tilt = Math.abs(tiltDeg);
  if (speed > T.crashVy) return { outcome: 'crash', factor: 0 };
  if (speed <= T.perfectVy && tilt <= T.maxTiltDeg) return { outcome: 'perfect', factor: T.perfectFactor };
  if (speed <= T.successVy && tilt <= T.maxTiltDeg) return { outcome: 'success', factor: T.successFactor };
  return { outcome: 'damaged', factor: T.damagedFactor };
}

/** Tiap instrumen hilang dengan peluang 0,4 (RNG berseed, satu pengundian per instrumen sesuai urutan). */
export function rollInstrumentLoss(instrumentIds: Id[], rng: Rng): Id[] {
  return instrumentIds.filter(() => rng() < T.instrumentLossChance);
}
