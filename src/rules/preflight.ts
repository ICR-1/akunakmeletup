import { ASSEMBLY_LIMITS, MARGIN_GREEN_MIN, RELAY_ANTENNA_ID } from '../core/constants';
import { budgetMargin, totalCostMusd } from './budget';
import { modulesOfKind, resolveAssembly, type Assembly } from './catalog';
import { commsMargin } from './comms';
import { dvAvailableMs, dvMargin, dvRequiredMs } from './deltav';
import { marginStatus, type MarginStatus } from './margin';
import { dryMassKg, fuelMassKg, initialMassKg, massMargin } from './mass';
import { dayPowerW, loadW, powerMargin } from './power';
import type { Catalog, Id, MissionConfig } from './types';

export type AssemblyErrorCode =
  | 'LANDER_COUNT' | 'ENGINE_COUNT' | 'TANK_COUNT' | 'SOLAR_MAX' | 'BATTERY_MAX' | 'RTG_MAX'
  | 'ANTENNA_MAIN_COUNT' | 'RELAY_MAX' | 'INSTRUMENT_SLOTS' | 'INSTRUMENT_DUPLICATE' | 'FUEL_RANGE' | 'ROVER_MAX';

export interface Indicator { margin: number; status: MarginStatus }
export type IndicatorKey = 'budget' | 'mass' | 'deltaV' | 'power' | 'comms';

export interface PreflightResult {
  indicators: Record<IndicatorKey, Indicator>;
  assemblyErrors: AssemblyErrorCode[];
  /** Objektif wajib yang instrumennya belum terpasang. */
  missingObjectives: Id[];
  go: boolean;
  /** OVER_MARGIN_TIGHT: margin massa atau delta-v di bawah ambang hijau. */
  tightMargin: boolean;
  metrics: {
    dryMassKg: number; fuelKg: number; m0Kg: number;
    dvAvailableMs: number; dvRequiredMs: number; totalCostMusd: number;
    dayPowerW: number; loadW: number;
  };
}

export function validateAssemblyRules(a: Assembly): AssemblyErrorCode[] {
  const L = ASSEMBLY_LIMITS;
  const errors: AssemblyErrorCode[] = [];
  const count = (kind: Parameters<typeof modulesOfKind>[1]) => modulesOfKind(a, kind).length;
  if (count('lander') !== L.landers) errors.push('LANDER_COUNT');
  if (count('engine') !== L.engines) errors.push('ENGINE_COUNT');
  if (count('tank') < L.tanksMin || count('tank') > L.tanksMax) errors.push('TANK_COUNT');
  if (count('solar') > L.solarMax) errors.push('SOLAR_MAX');
  if (count('battery') > L.batteryMax) errors.push('BATTERY_MAX');
  if (count('rtg') > L.rtgMax) errors.push('RTG_MAX');
  const antennas = modulesOfKind(a, 'antenna');
  const relays = antennas.filter((m) => m.id === RELAY_ANTENNA_ID).length;
  if (antennas.length - relays !== L.mainAntennas) errors.push('ANTENNA_MAIN_COUNT');
  if (relays > L.relayMax) errors.push('RELAY_MAX');
  const slots = modulesOfKind(a, 'lander')[0]?.stats.instrumentSlots ?? 0;
  if (a.instruments.length > slots) errors.push('INSTRUMENT_SLOTS');
  if (new Set(a.instruments.map((i) => i.id)).size !== a.instruments.length) errors.push('INSTRUMENT_DUPLICATE');
  if (count('rover') > L.roverMax) errors.push('ROVER_MAX');
  if (a.fuelFraction < 0 || a.fuelFraction > 1) errors.push('FUEL_RANGE');
  return errors;
}

export function missingRequiredObjectives(a: Assembly): Id[] {
  const installed = new Set(a.instruments.map((i) => i.id));
  return a.destination.objectives
    .filter((o) => o.required && o.instrumentId !== undefined && !installed.has(o.instrumentId))
    .map((o) => o.id);
}

function indicator(margin: number): Indicator {
  return { margin, status: marginStatus(margin) };
}

/** Preflight Go/No-Go: Go hanya jika tak ada indikator merah, aturan perakitan terpenuhi, dan objektif wajib punya instrumen
 * (kecuali `requireObjectives` dimatikan, mis. Free Design; daftar `missingObjectives` tetap dilaporkan). */
export function preflight(config: MissionConfig, catalog: Catalog, requireObjectives = true): PreflightResult {
  const a = resolveAssembly(config, catalog);
  const indicators: Record<IndicatorKey, Indicator> = {
    budget: indicator(budgetMargin(a)),
    mass: indicator(massMargin(a)),
    deltaV: indicator(dvMargin(a)),
    power: indicator(powerMargin(a)),
    comms: indicator(commsMargin(a)),
  };
  const assemblyErrors = validateAssemblyRules(a);
  const missingObjectives = missingRequiredObjectives(a);
  const anyRed = Object.values(indicators).some((i) => i.status === 'red');
  return {
    indicators,
    assemblyErrors,
    missingObjectives,
    go: !anyRed && assemblyErrors.length === 0 && (!requireObjectives || missingObjectives.length === 0),
    tightMargin: indicators.mass.margin < MARGIN_GREEN_MIN || indicators.deltaV.margin < MARGIN_GREEN_MIN,
    metrics: {
      dryMassKg: dryMassKg(a), fuelKg: fuelMassKg(a), m0Kg: initialMassKg(a),
      dvAvailableMs: dvAvailableMs(a), dvRequiredMs: dvRequiredMs(a), totalCostMusd: totalCostMusd(a),
      dayPowerW: dayPowerW(a), loadW: loadW(a),
    },
  };
}
