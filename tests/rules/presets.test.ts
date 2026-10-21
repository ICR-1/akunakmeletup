import { describe, expect, it } from 'vitest';
import { getPresetMission } from '../../src/core/missionBuilder';
import { resolveAssembly } from '../../src/rules/catalog';
import { preflight } from '../../src/rules/preflight';
import { canUplink, createSurfaceState } from '../../src/rules/surface';
import { catalog } from './helpers';

describe('verifikasi preset misi siswa untuk Bulan dan Mars', () => {
  it('preset standar Bulan adalah GO', () => {
    const config = getPresetMission('moon', 'standard');
    const r = preflight(config, catalog);
    expect(r.assemblyErrors).toEqual([]);
    expect(r.missingObjectives).toEqual([]);
    expect(r.go).toBe(true);
  });

  it('preset jelajah Bulan (+Cruiser) adalah GO dan memiliki daya wahana penuh di permukaan', () => {
    const config = getPresetMission('moon', 'cruiser');
    const r = preflight(config, catalog);
    expect(r.assemblyErrors).toEqual([]);
    expect(r.missingObjectives).toEqual([]);
    expect(r.go).toBe(true);

    const a = resolveAssembly(config, catalog);
    const s = createSurfaceState(a);
    expect(s.vehicleCapacityWh).toBe(400); // battery_s terpasang
    expect(s.vehicleWh).toBe(400);
    expect(s.powerOut).toBe(false);
    expect(canUplink(s, 0)).toBe(true);
  });

  it('rakitan RTG tanpa baterai terpisah tetap memiliki cadangan penyangga (daya tidak 0)', () => {
    const config = {
      destinationId: 'moon',
      rocketId: 'pandu_1',
      moduleIds: ['lander_s', 'eng_eff', 'tank_s', 'tank_m', 'rtg', 'ant_hga', 'rover_lc'],
      instrumentIds: ['sample_drill', 'cam_pano'],
      fuelFraction: 1,
      seed: 1,
    };
    const r = preflight(config, catalog);
    expect(r.go).toBe(true);

    const a = resolveAssembly(config, catalog);
    const s = createSurfaceState(a);
    expect(s.vehicleCapacityWh).toBe(720); // 120W * 6 jam cadangan RTG (PRD 14)
    expect(s.vehicleWh).toBe(720);
    expect(s.powerOut).toBe(false);
    expect(canUplink(s, 0)).toBe(true);
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
