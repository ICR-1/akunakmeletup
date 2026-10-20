import { describe, expect, it } from 'vitest';
import { preflight } from '../../src/rules/preflight';
import { catalog } from './helpers';

describe('verifikasi preset misi siswa untuk Bulan dan Mars', () => {
  it('preset standar Bulan adalah GO', () => {
    const config = {
      destinationId: 'moon',
      rocketId: 'pandu_1',
      moduleIds: ['lander_s', 'tank_l', 'eng_eff', 'solar_m', 'battery_m', 'ant_hga'],
      instrumentIds: ['sample_drill', 'cam_pano'],
      fuelFraction: 0.75,
      seed: 1,
    };
    const r = preflight(config, catalog);
    expect(r.assemblyErrors).toEqual([]);
    expect(r.missingObjectives).toEqual([]);
    expect(r.go).toBe(true);
  });

  it('preset jelajah Bulan (+Cruiser) adalah GO', () => {
    const config = {
      destinationId: 'moon',
      rocketId: 'pandu_1',
      moduleIds: ['lander_s', 'eng_eff', 'tank_s', 'tank_m', 'rtg', 'ant_hga', 'rover_lc'],
      instrumentIds: ['sample_drill', 'cam_pano'],
      fuelFraction: 1,
      seed: 1,
    };
    const r = preflight(config, catalog);
    expect(r.assemblyErrors).toEqual([]);
    expect(r.missingObjectives).toEqual([]);
    expect(r.go).toBe(true);
  });

  it('preset standar Mars adalah GO', () => {
    const config = {
      destinationId: 'mars',
      rocketId: 'rajawali_2',
      moduleIds: ['lander_s', 'tank_l', 'eng_eff', 'solar_m', 'battery_m', 'ant_hga'],
      instrumentIds: ['spectrometer', 'seismometer'],
      fuelFraction: 1,
      seed: 1,
    };
    const r = preflight(config, catalog);
    expect(r.assemblyErrors).toEqual([]);
    expect(r.missingObjectives).toEqual([]);
    expect(r.go).toBe(true);
  });

  it('preset jelajah Mars (+Cruiser) adalah GO', () => {
    const config = {
      destinationId: 'mars',
      rocketId: 'garuda_heavy',
      moduleIds: ['lander_s', 'tank_l', 'tank_l', 'eng_eff', 'solar_m', 'battery_m', 'ant_hga', 'rover_lc'],
      instrumentIds: ['spectrometer', 'seismometer'],
      fuelFraction: 1,
      seed: 1,
    };
    const r = preflight(config, catalog);
    expect(r.assemblyErrors).toEqual([]);
    expect(r.missingObjectives).toEqual([]);
    expect(r.go).toBe(true);
  });
});
