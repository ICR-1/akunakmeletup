import { describe, expect, it } from 'vitest';
import {
  defaultMission, moduleCount, setDestination, setExclusive, setFuelFraction, setModuleCount,
  setRocket, toggleInstrument,
} from '../../src/core/missionBuilder';
import { preflight } from '../../src/rules/preflight';
import { catalog } from '../rules/helpers';

describe('missionBuilder', () => {
  it.each(['moon', 'mars'])('rakitan awal %s berstatus Go', (dest) => {
    const r = preflight(defaultMission(dest), catalog);
    expect(r.assemblyErrors).toEqual([]);
    expect(r.go).toBe(true);
  });
  it('setExclusive mengganti lander tanpa menyentuh modul lain', () => {
    const c = setExclusive(defaultMission('moon'), catalog, ['lander_s', 'lander_m'], 'lander_m');
    expect(moduleCount(c, 'lander_m')).toBe(1);
    expect(moduleCount(c, 'lander_s')).toBe(0);
    expect(moduleCount(c, 'tank_l')).toBe(1);
  });
  it('setModuleCount menambah dan mengurangi, tidak negatif', () => {
    let c = setModuleCount(defaultMission('moon'), catalog, 'solar_s', 2);
    expect(moduleCount(c, 'solar_s')).toBe(2);
    c = setModuleCount(c, catalog, 'solar_s', -3);
    expect(moduleCount(c, 'solar_s')).toBe(0);
  });
  it('toggleInstrument memasang dan melepas', () => {
    const base = defaultMission('moon');
    const on = toggleInstrument(base, catalog, 'seismometer');
    expect(on.instrumentIds).toContain('seismometer');
    expect(toggleInstrument(on, catalog, 'seismometer').instrumentIds.sort()).toEqual([...base.instrumentIds].sort());
  });
  it('fuel dijaga 0-1, setRocket dan setDestination tidak mengubah objek lama', () => {
    const base = defaultMission('moon');
    expect(setFuelFraction(base, 5).fuelFraction).toBe(1);
    expect(setFuelFraction(base, -1).fuelFraction).toBe(0);
    expect(setRocket(base, 'garuda_heavy').rocketId).toBe('garuda_heavy');
    expect(base.rocketId).toBe('pandu_1');
    expect(setDestination(base, 'mars').destinationId).toBe('mars');
    expect(setDestination({ ...base, seed: 9 }, 'mars').seed).toBe(9);
  });
  it('perubahan modul langsung mengubah indikator (reaktivitas preflight)', () => {
    const base = defaultMission('moon');
    const before = preflight(base, catalog).indicators.power.margin;
    const noBattery = setModuleCount(base, catalog, 'battery_m', 0);
    expect(preflight(noBattery, catalog).indicators.power.margin).toBeLessThan(before);
    expect(preflight(noBattery, catalog).indicators.power.status).toBe('red');
  });
  it('destinasi tak dikenal menghasilkan error jelas', () => {
    expect(() => defaultMission('venus')).toThrow(/venus/);
  });
});
