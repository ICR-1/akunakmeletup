import { loadCatalog } from '../../src/core/data';
import type { MissionConfig } from '../../src/rules/types';

export const catalog = loadCatalog();

/** Rakitan Bulan dari contoh hitung PRD bagian 14. */
export const moonExample: MissionConfig = {
  destinationId: 'moon',
  rocketId: 'pandu_1',
  moduleIds: ['lander_s', 'eng_eff', 'tank_l', 'solar_m', 'battery_m', 'ant_hga'],
  instrumentIds: ['cam_pano', 'sample_drill'],
  seed: 1,
  fuelFraction: 0.75,
};
