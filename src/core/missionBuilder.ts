import { DEFAULT_SEED, RELAY_ANTENNA_ID } from './constants';
import type { Catalog, Id, MissionConfig } from '../rules/types';

export type PresetKey = 'standard' | 'cruiser';

export interface StudentPreset {
  key: PresetKey;
  name: string;
  desc: string;
  config: Omit<MissionConfig, 'seed'>;
}

/** Preset misi cepat dan seimbang untuk membantu siswa merancang misi tanpa kewalahan. */
export const STUDENT_PRESETS: Record<Id, Record<PresetKey, StudentPreset>> = {
  moon: {
    standard: {
      key: 'standard',
      name: 'Standar Disarankan',
      desc: 'Pandu-1 + Lander S (Efisien, seimbang, dan hemat anggaran)',
      config: {
        destinationId: 'moon', rocketId: 'pandu_1',
        moduleIds: ['lander_s', 'tank_l', 'eng_eff', 'solar_m', 'battery_m', 'ant_hga'],
        instrumentIds: ['sample_drill', 'cam_pano'], fuelFraction: 0.75,
      },
    },
    cruiser: {
      key: 'cruiser',
      name: 'Jelajah (+Rover)',
      desc: 'Pandu-1 + Lunar Cruiser (Eksplorasi permukaan dengan mobil penjelajah)',
      config: {
        destinationId: 'moon', rocketId: 'pandu_1',
        moduleIds: ['lander_s', 'eng_eff', 'tank_s', 'tank_m', 'rtg', 'battery_s', 'ant_hga', 'rover_lc'],
        instrumentIds: ['sample_drill', 'cam_pano'], fuelFraction: 1,
      },
    },
  },
  mars: {
    standard: {
      key: 'standard',
      name: 'Standar Disarankan',
      desc: 'Rajawali-2 + Lander S (Jangkauan optimal untuk transfer dan pendaratan Mars)',
      config: {
        destinationId: 'mars', rocketId: 'rajawali_2',
        moduleIds: ['lander_s', 'tank_l', 'eng_eff', 'solar_m', 'battery_m', 'ant_hga'],
        instrumentIds: ['spectrometer', 'seismometer'], fuelFraction: 1,
      },
    },
    cruiser: {
      key: 'cruiser',
      name: 'Jelajah (+Rover)',
      desc: 'Garuda Heavy + Lunar Cruiser (Wahana berat penjelajah medan pasir Mars)',
      config: {
        destinationId: 'mars', rocketId: 'garuda_heavy',
        moduleIds: ['lander_s', 'tank_l', 'tank_l', 'eng_eff', 'solar_m', 'battery_m', 'ant_hga', 'rover_lc'],
        instrumentIds: ['spectrometer', 'seismometer'], fuelFraction: 1,
      },
    },
  },
};

/** Pemilihan awal per destinasi: rakitan yang lolos Go (diverifikasi tes). */
const DEFAULT_PICKS: Record<string, Omit<MissionConfig, 'seed'>> = {
  moon: STUDENT_PRESETS.moon.standard.config,
  mars: STUDENT_PRESETS.mars.standard.config,
};

export function defaultMission(destinationId: Id, seed = DEFAULT_SEED): MissionConfig {
  const pick = DEFAULT_PICKS[destinationId];
  if (!pick) throw new Error(`Tidak ada rakitan awal untuk destinasi "${destinationId}"`);
  return { ...pick, moduleIds: [...pick.moduleIds], instrumentIds: [...pick.instrumentIds], seed };
}

export function getPresetMission(destinationId: Id, key: PresetKey, seed = DEFAULT_SEED): MissionConfig {
  const destPresets = STUDENT_PRESETS[destinationId] ?? STUDENT_PRESETS.moon;
  const p = destPresets[key]?.config ?? destPresets.standard.config;
  return { ...p, moduleIds: [...p.moduleIds], instrumentIds: [...p.instrumentIds], seed };
}

/** Modul yang sangat disarankan per destinasi untuk membimbing siswa. */
export const RECOMMENDED_MODULES: Record<Id, Id[]> = {
  moon: ['pandu_1', 'lander_s', 'eng_eff', 'tank_l', 'solar_m', 'battery_m', 'ant_hga', 'sample_drill', 'cam_pano'],
  mars: ['rajawali_2', 'lander_s', 'eng_eff', 'tank_l', 'solar_m', 'battery_m', 'ant_hga', 'spectrometer', 'seismometer'],
};

export function isRecommendedItem(destinationId: Id, id: Id): boolean {
  return RECOMMENDED_MODULES[destinationId]?.includes(id) ?? false;
}

export function detectActivePreset(config: MissionConfig): PresetKey | null {
  const destPresets = STUDENT_PRESETS[config.destinationId];
  if (!destPresets) return null;
  for (const [key, preset] of Object.entries(destPresets) as [PresetKey, StudentPreset][]) {
    if (config.rocketId !== preset.config.rocketId) continue;
    if (Math.abs((config.fuelFraction ?? 1) - (preset.config.fuelFraction ?? 1)) > 0.02) continue;
    const currentMods = [...config.moduleIds].sort().join(',');
    const presetMods = [...preset.config.moduleIds].sort().join(',');
    if (currentMods !== presetMods) continue;
    const currentInst = [...config.instrumentIds].sort().join(',');
    const presetInst = [...preset.config.instrumentIds].sort().join(',');
    if (currentInst !== presetInst) continue;
    return key;
  }
  return null;
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
