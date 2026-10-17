import { G0, KM_TO_M, KN_TO_N, TRANSFER_BURN_DV_FACTOR, TRANSFER_BURN_ERROR_WEIGHT } from '../core/constants';
import { modulesOfKind, type Assembly } from './catalog';
import { ratioMargin } from './margin';
import { dryMassKg, initialMassKg } from './mass';

/** Isp mesin wahana (detik); 0 jika belum ada mesin. */
export function engineIsp(a: Assembly): number {
  return modulesOfKind(a, 'engine')[0]?.stats.ispS ?? 0;
}

export function engineThrustN(a: Assembly): number {
  return (modulesOfKind(a, 'engine')[0]?.stats.thrustKn ?? 0) * KN_TO_N;
}

/** Persamaan roket Tsiolkovsky: dv = Isp * g0 * ln(m0 / mf). */
export function tsiolkovskyDv(ispS: number, m0Kg: number, mfKg: number): number {
  if (ispS <= 0 || mfKg <= 0 || m0Kg <= mfKg) return 0;
  return ispS * G0 * Math.log(m0Kg / mfKg);
}

export function dvAvailableMs(a: Assembly): number {
  return tsiolkovskyDv(engineIsp(a), initialMassKg(a), dryMassKg(a));
}

export function dvRequiredMs(a: Assembly): number {
  return a.destination.deltaVKmS * KM_TO_M;
}

export function dvMargin(a: Assembly): number {
  const required = dvRequiredMs(a);
  return ratioMargin(dvAvailableMs(a) - required, required);
}

/** Biaya delta-v burn transfer (PRD 14, aturan penerbangan 2). */
export function transferBurnCostMs(dvRequired: number, errorFraction: number): number {
  return TRANSFER_BURN_DV_FACTOR * dvRequired * (1 + TRANSFER_BURN_ERROR_WEIGHT * errorFraction);
}

/** Bahan bakar tersisa setelah burn: m0 * exp(-biaya / (Isp g0)) - mf, tidak kurang dari 0. */
export function fuelRemainingKg(m0Kg: number, mfKg: number, burnCostMs: number, ispS: number): number {
  if (ispS <= 0) return 0;
  return Math.max(0, m0Kg * Math.exp(-burnCostMs / (ispS * G0)) - mfKg);
}
