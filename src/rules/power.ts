import { DAY_SEC, GAME_HOUR_SEC, NIGHT_HOURS, DAY_HOURS } from '../core/constants';
import { modulesOfKind, sumStat, type Assembly } from './catalog';
import { clamp, ratioMargin } from './margin';

export function solarPowerW(a: Assembly): number {
  return modulesOfKind(a, 'solar').reduce(
    (s, m) => s + m.stats.areaM2 * m.stats.efficiency * a.destination.solarIrradianceWm2,
    0,
  );
}

export function rtgPowerW(a: Assembly): number {
  return sumStat(modulesOfKind(a, 'rtg'), 'powerW');
}

export function batteryCapacityWh(a: Assembly): number {
  return sumStat(modulesOfKind(a, 'battery'), 'capacityWh');
}

/**
 * Kapasitas penyimpanan daya efektif wahana (Wh):
 * Menggunakan total kapasitas modul baterai yang terpasang.
 * Bila wahana ditenagai RTG tanpa modul baterai terpisah, kapasitas penyangga diturunkan
 * dari cadangan daya RTG (PRD 14 energi malam: powerRtg * NIGHT_HOURS) agar wahana
 * tidak mengalami kehabisan daya (0%) saat tiba di permukaan.
 */
export function vehicleEnergyCapacityWh(a: Assembly): number {
  const bat = batteryCapacityWh(a);
  if (bat > 0) return bat;
  const rtg = rtgPowerW(a);
  return rtg > 0 ? rtg * NIGHT_HOURS : 0;
}

/** Pday = panel surya + RTG. */
export function dayPowerW(a: Assembly): number {
  return solarPowerW(a) + rtgPowerW(a);
}

/** Cload = beban dasar lander + daya semua instrumen. */
export function loadW(a: Assembly): number {
  return sumStat(modulesOfKind(a, 'lander'), 'baseLoadW') + a.instruments.reduce((s, i) => s + i.powerW, 0);
}

export function dayPowerMargin(a: Assembly): number {
  const load = loadW(a);
  return ratioMargin(dayPowerW(a) - load, load);
}

export function nightPowerMargin(a: Assembly): number {
  const need = loadW(a) * NIGHT_HOURS;
  return ratioMargin(batteryCapacityWh(a) + rtgPowerW(a) * NIGHT_HOURS - need, need);
}

/** Margin daya = minimum dari margin siang dan malam. */
export function powerMargin(a: Assembly): number {
  return Math.min(dayPowerMargin(a), nightPowerMargin(a));
}

/** Siklus hari permukaan: mulai siang, lalu malam, berulang. */
export function isDaytime(surfaceTimeSec: number): boolean {
  const cycle = DAY_HOURS + NIGHT_HOURS;
  return surfaceTimeSec % (cycle * GAME_HOUR_SEC) < DAY_SEC;
}

/** Produksi daya wahana saat ini: siang = Pday, malam = hanya RTG (panel surya = 0). */
export function productionW(a: Assembly, surfaceTimeSec: number): number {
  return isDaytime(surfaceTimeSec) ? dayPowerW(a) : rtgPowerW(a);
}

/** Satu langkah energi baterai wahana (Wh): (P - Cload) / jam-game per detik nyata. */
export function stepBatteryWh(currentWh: number, capacityWh: number, productionWatts: number, loadWatts: number, dtSec: number): number {
  return clamp(currentWh + ((productionWatts - loadWatts) / GAME_HOUR_SEC) * dtSec, 0, capacityWh);
}
