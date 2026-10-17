import { DEFAULT_SEED, RELAY_ANTENNA_ID } from './constants';
import type { Catalog, Id, MissionConfig } from '../rules/types';

/** Pemilihan awal per destinasi: rakitan yang lolos Go (diverifikasi tes). */
const DEFAULT_PICKS: Record<string, Omit<MissionConfig, 'seed'>> = {
  moon: {
    destinationId: 'moon', rocketId: 'pandu_1',
    moduleIds: ['lander_s', 'tank_l', 'eng_eff', 'solar_m', 'battery_m', 'ant_hga'],
    instrumentIds: ['sample_drill', 'cam_pano'], fuelFraction: 0.75,
  },
  mars: {
    destinationId: 'mars', rocketId: 'rajawali_2',
    moduleIds: ['lander_s', 'tank_l', 'eng_eff', 'solar_m', 'battery_m', 'ant_hga'],
    instrumentIds: ['spectrometer', 'seismometer'], fuelFraction: 1,
  },
};

export function defaultMission(destinationId: Id, seed = DEFAULT_SEED): MissionConfig {
  const pick = DEFAULT_PICKS[destinationId];
  if (!pick) throw new Error(`Tidak ada rakitan awal untuk destinasi "${destinationId}"`);
  return { ...pick, moduleIds: [...pick.moduleIds], instrumentIds: [...pick.instrumentIds], seed };
}

/** Urutkan modul mengikuti urutan katalog agar hasil stabil dan mudah dibandingkan. */
function sortedModules(ids: Id[], catalog: Catalog): Id[] {
  const order = new Map(catalog.modules.map((m, i) => [m.id, i]));
  return [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

export function moduleCount(config: MissionConfig, id: Id): number {
  return config.moduleIds.filter((m) => m === id).length;
}

export function setRocket(config: MissionConfig, rocketId: Id): MissionConfig {
  return { ...config, rocketId };
}

export function setFuelFraction(config: MissionConfig, fraction: number): MissionConfig {
  return { ...config, fuelFraction: Math.min(1, Math.max(0, fraction)) };
}

/** Jumlah modul `id` dijadikan n (tanpa batas; batas dijaga oleh preflight). */
export function setModuleCount(config: MissionConfig, catalog: Catalog, id: Id, n: number): MissionConfig {
  const others = config.moduleIds.filter((m) => m !== id);
  const next = [...others, ...Array<Id>(Math.max(0, n)).fill(id)];
  return { ...config, moduleIds: sortedModules(next, catalog) };
}

/** Pilihan eksklusif dalam satu grup (mis. lander, mesin, antena utama). */
export function setExclusive(config: MissionConfig, catalog: Catalog, groupIds: Id[], chosen: Id | null): MissionConfig {
  const kept = config.moduleIds.filter((m) => !groupIds.includes(m));
  return { ...config, moduleIds: sortedModules(chosen ? [...kept, chosen] : kept, catalog) };
}

export function toggleInstrument(config: MissionConfig, catalog: Catalog, id: Id): MissionConfig {
  const has = config.instrumentIds.includes(id);
  const next = has ? config.instrumentIds.filter((i) => i !== id) : [...config.instrumentIds, id];
  const order = new Map(catalog.instruments.map((i, k) => [i.id, k]));
  return { ...config, instrumentIds: next.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)) };
}

/** Pindah destinasi: rakitan dikembalikan ke pilihan awal destinasi itu, seed dipertahankan. */
export function setDestination(config: MissionConfig, destinationId: Id): MissionConfig {
  return defaultMission(destinationId, config.seed);
}

export function mainAntennaIds(catalog: Catalog): Id[] {
  return catalog.modules.filter((m) => m.kind === 'antenna' && m.id !== RELAY_ANTENNA_ID).map((m) => m.id);
}
