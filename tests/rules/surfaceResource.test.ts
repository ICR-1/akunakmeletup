import { describe, expect, it } from 'vitest';
import { FIXED_DT, SURFACE_TIME_LIMIT_SEC } from '../../src/core/constants';
import { defaultMission } from '../../src/core/missionBuilder';
import { resolveAssembly } from '../../src/rules/catalog';
import { uplinkDataD, uplinkFactor, rateTotal } from '../../src/rules/comms';
import { dayPowerW, loadW } from '../../src/rules/power';
import {
  applyEffects, canUplink, createSurfaceState, currentSignal, roverDriveW, roverSpeedMs, spendSuitBattery, stepSurface, tryScan,
  type Movement, type SurfaceEvent, type SurfaceState,
} from '../../src/rules/surface';
import { catalog } from './helpers';

const moon = resolveAssembly(defaultMission('moon'), catalog);

function run(state: SurfaceState, seconds: number, movement: Movement, distance: number, a = moon) {
  let s = state;
  const events: SurfaceEvent[] = [];
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps; i++) {
    const r = stepSurface(s, { movement, distanceFromHubM: distance }, a, FIXED_DT);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('oksigen dan baterai suit', () => {
  it('oksigen berkurang di luar hub sesuai gerakan: 0,15 / 0,30 / 0,60 per detik', () => {
    const start = createSurfaceState(moon);
    expect(100 - run(start, 10, 'idle', 50).state.oxygen).toBeCloseTo(1.5, 1);
    expect(100 - run(start, 10, 'walk', 50).state.oxygen).toBeCloseTo(3, 1);
    expect(100 - run(start, 10, 'run', 50).state.oxygen).toBeCloseTo(6, 1);
  });
  it('di dalam radius 10 m oksigen dan baterai suit pulih (5 dan 4 per detik)', () => {
    const low: SurfaceState = { ...createSurfaceState(moon), oxygen: 20, suitBattery: 20 };
    const r = run(low, 5, 'idle', 10).state;
    expect(r.oxygen).toBeCloseTo(45, 1);
    expect(r.suitBattery).toBeCloseTo(40, 1);
    expect(run(low, 60, 'idle', 5).state.oxygen).toBe(100);
  });
  it('di luar radius tidak ada pemulihan; baterai suit berkurang 0,1 per detik', () => {
    const s = run(createSurfaceState(moon), 10, 'idle', 10.5).state;
    expect(s.oxygen).toBeLessThan(100);
    expect(100 - s.suitBattery).toBeCloseTo(1, 1);
  });
  it('oksigen 0: pingsan, kembali ke hub dengan penalti waktu 90 dtk dan faintCount +1', () => {
    const almost: SurfaceState = { ...createSurfaceState(moon), oxygen: 0.2 };
    const { state, events } = run(almost, 3, 'run', 100);
    expect(events.filter((e) => e.type === 'faint')).toHaveLength(1);
    expect(state.faintCount).toBe(1);
    expect(state.timeSec).toBeGreaterThanOrEqual(3 + 90 - 0.1);
    expect(state.oxygen).toBeGreaterThan(0);
  });
  it('pemindai memakai 3 baterai dengan cooldown 3 dtk; minigame memakai 5', () => {
    const s0 = createSurfaceState(moon);
    const a = tryScan(s0);
    expect(a.ok).toBe(true);
    expect(a.state.suitBattery).toBe(97);
    expect(tryScan(a.state).ok).toBe(false);
    const later = run(a.state, 3.1, 'idle', 5).state;
    expect(tryScan(later).ok).toBe(true);
    expect(spendSuitBattery(s0, 5).state.suitBattery).toBe(95);
    expect(spendSuitBattery({ ...s0, suitBattery: 4 }, 5).ok).toBe(false);
  });
});

describe('daya wahana, siang dan malam', () => {
  it('siang: produksi panel menutup beban sehingga baterai penuh', () => {
    expect(dayPowerW(moon)).toBeGreaterThan(loadW(moon));
    const s = run(createSurfaceState(moon), 60, 'idle', 5).state;
    expect(s.vehicleWh).toBe(s.vehicleCapacityWh);
  });
  it('malam: panel surya berhenti dan baterai terkuras (P - Cload) / 20 per detik', () => {
    const night: SurfaceState = { ...createSurfaceState(moon), timeSec: 250 };
    const s = run(night, 20, 'idle', 5).state;
    expect(1000 - s.vehicleWh).toBeCloseTo((loadW(moon) / 20) * 20, 0);
  });
  it('baterai kosong saat malam: powerOut, nightPowerOut, uplink terblokir', () => {
    const tiny = resolveAssembly({ ...defaultMission('moon'), moduleIds: ['lander_s', 'tank_l', 'eng_eff', 'solar_m', 'battery_s', 'ant_hga'] }, catalog);
    const s0: SurfaceState = { ...createSurfaceState(tiny), timeSec: 241 };
    const { state, events } = run(s0, 90, 'idle', 5, tiny);
    expect(events.some((e) => e.type === 'power_out')).toBe(true);
    expect(state.powerOut).toBe(true);
    expect(state.nightPowerOut).toBe(true);
    expect(canUplink(state, 5)).toBe(false);
  });
  it('transisi siang-malam menghasilkan peristiwa', () => {
    const { events } = run({ ...createSurfaceState(moon), timeSec: 239 }, 2, 'idle', 5);
    expect(events).toContainEqual({ type: 'daynight', day: false });
  });
  it('batas waktu permukaan 480 dtk memicu time_up', () => {
    const { events } = run({ ...createSurfaceState(moon), timeSec: SURFACE_TIME_LIMIT_SEC - 0.5 }, 1, 'idle', 5);
    expect(events.filter((e) => e.type === 'time_up')).toHaveLength(1);
  });
});

describe('sinyal, uplink, dan efek event', () => {
  it('uplink hanya dalam radius 10 m dan saat daya ada', () => {
    const s = createSurfaceState(moon);
    expect(canUplink(s, 10)).toBe(true);
    expect(canUplink(s, 10.1)).toBe(false);
  });
  it('faktor uplink U = min(1, C/D) dengan C = rate x 30 x sinyal (rumus terverifikasi)', () => {
    const s = createSurfaceState(moon);
    const q = currentSignal(s, 8);
    expect(q).toBeCloseTo(1 - (0.6 * 8) / 400, 10);
    const D = uplinkDataD([{ dataUnits: 20, score01: 1 }, { dataUnits: 40, score01: 1 }]);
    expect(uplinkFactor(D, rateTotal(moon), q)).toBe(1);
    const weak = resolveAssembly({ ...defaultMission('moon'), moduleIds: ['lander_s', 'tank_l', 'eng_eff', 'solar_m', 'battery_m', 'ant_lga'] }, catalog);
    expect(uplinkFactor(D, rateTotal(weak), q)).toBeCloseTo((1 * 30 * q) / 60, 10);
  });
  it('efek event: oksigen, baterai suit, daya wahana (persen), waktu, skor, sinyal 60 dtk', () => {
    const s0 = createSurfaceState(moon);
    const s = applyEffects(s0, [
      { target: 'oxygen', delta: -25 }, { target: 'suitBattery', delta: -5 }, { target: 'vehiclePower', delta: -20 },
      { target: 'timeSec', delta: 45 }, { target: 'score', delta: -3 }, { target: 'signal', delta: -0.4 }, { target: 'deltaVms', delta: -50 },
    ]);
    expect(s.oxygen).toBe(75);
    expect(s.suitBattery).toBe(95);
    expect(s.vehicleWh).toBeCloseTo(s0.vehicleCapacityWh * 0.8, 6);
    expect(s.timeSec).toBe(45);
    expect(s.scoreDelta).toBe(-3);
    expect(s.signalDelta).toBeCloseTo(-0.4, 10);
    expect(currentSignal(s, 0)).toBeCloseTo(0.6, 10);
    const later = run(s, 61, 'idle', 5).state;
    expect(later.signalDelta).toBe(0);
    expect(currentSignal(later, 0)).toBe(1);
  });
  it('efek tidak melewati batas 0-100 dan tidak mengubah state asli', () => {
    const s0 = createSurfaceState(moon);
    expect(applyEffects(s0, [{ target: 'oxygen', delta: -500 }]).oxygen).toBe(0);
    expect(applyEffects(s0, [{ target: 'oxygen', delta: 500 }]).oxygen).toBe(100);
    expect(s0.oxygen).toBe(100);
  });
});

describe('Lunar Cruiser di permukaan', () => {
  const withRover = resolveAssembly({ ...defaultMission('moon'), moduleIds: [...defaultMission('moon').moduleIds, 'rover_lc'] }, catalog);
  const night = (a: typeof moon): SurfaceState => ({ ...createSurfaceState(a), timeSec: 250 });

  it('stat kendaraan terbaca dari modul; tanpa Cruiser kecepatan dan beban 0', () => {
    expect(roverSpeedMs(withRover)).toBe(14);
    expect(roverDriveW(withRover)).toBe(150);
    expect(roverSpeedMs(moon)).toBe(0);
    expect(roverDriveW(moon)).toBe(0);
  });
  it('mengemudi menguras baterai wahana lebih cepat daripada diam (malam, tanpa produksi surya)', () => {
    const idle = run(night(withRover), 10, 'idle', 80, withRover).state;
    const drive = run(night(withRover), 10, 'drive', 80, withRover).state;
    expect(drive.vehicleWh).toBeLessThan(idle.vehicleWh);
    // beban tambahan 150 W per jam-game (20 dtk): 150/20 Wh per detik
    expect(idle.vehicleWh - drive.vehicleWh).toBeCloseTo((roverDriveW(withRover) / 20) * 10, 0);
  });
  it('di dalam kabin oksigen terkuras 0,1 per detik (lebih hemat daripada berjalan)', () => {
    const start = createSurfaceState(withRover);
    expect(100 - run(start, 10, 'drive', 80, withRover).state.oxygen).toBeCloseTo(1, 1);
    expect(100 - run(start, 10, 'walk', 80, withRover).state.oxygen).toBeGreaterThan(2.5);
  });
});
