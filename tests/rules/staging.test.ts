import { describe, expect, it } from 'vitest';
import { FIXED_DT, FLIGHT } from '../../src/core/constants';
import { defaultMission } from '../../src/core/missionBuilder';
import { resolveAssembly } from '../../src/rules/catalog';
import { createFlightSimConfig, FlightSim, NO_INPUT } from '../../src/rules/flightSim';
import {
  accelFactor, createStaging, errorFraction, flightQuality, handlingEff, lateSafetyPenalty, paceRocket,
  stepStaging, type StagingState,
} from '../../src/rules/staging';
import { catalog } from './helpers';

/** Jalankan semua tahap tepat waktu: habiskan bar, lalu F seketika. Mengembalikan handlingEff tiap titik. */
function runOnTime(rocketId: string): { handling: number[]; state: StagingState } {
  const rocket = catalog.rockets.find((r) => r.id === rocketId)!;
  let state = createStaging(rocket.stages.map((s) => s.burnSec));
  const handling = [handlingEff(rocket.handling, state.jettisoned)];
  for (const stage of rocket.stages) {
    state = stepStaging(state, stage.burnSec, 1, false).state;
    state = stepStaging(state, 0, 0, true).state;
    handling.push(handlingEff(rocket.handling, state.jettisoned));
  }
  return { handling, state };
}

const close = (xs: number[], ys: number[]) => {
  expect(xs).toHaveLength(ys.length);
  xs.forEach((x, i) => expect(x).toBeCloseTo(ys[i], 10));
};

describe('staging: tepat waktu', () => {
  it('Pandu-1', () => {
    const { handling, state } = runOnTime('pandu_1');
    close(handling, [1.2, 1.45, 1.7]);
    expect(state.lateStageCount).toBe(0);
  });
  it('Rajawali-2', () => close(runOnTime('rajawali_2').handling, [1.0, 1.25, 1.5, 1.75]));
  it('Garuda Heavy', () => close(runOnTime('garuda_heavy').handling, [0.7, 0.95, 1.2, 1.45, 1.7]));
  it('jumlah F sama dengan jumlah tahap', () => {
    expect(runOnTime('garuda_heavy').state.jettisoned).toBe(4);
  });
});

describe('staging: keterlambatan', () => {
  const rajawali = () => createStaging([25, 30, 40]);
  const depleted = () => stepStaging(rajawali(), 25, 1, false).state;

  it('F tepat 3,0 dtk setelah habis tidak terlambat', () => {
    let s = stepStaging(depleted(), 3, 0, false).state;
    const r = stepStaging(s, 0, 0, true);
    s = r.state;
    expect(s.lateStageCount).toBe(0);
    expect(r.events).toContainEqual({ type: 'jettison', stageIndex: 0, late: false, auto: false });
  });
  it('F 4 dtk setelah habis: terlambat, penalti berlaku, bonus handling tetap', () => {
    const s0 = stepStaging(depleted(), 4, 0, false).state;
    const s = stepStaging(s0, 0, 0, true).state;
    expect(s.lateStageCount).toBe(1);
    expect(s.jettisoned).toBe(1);
    expect(handlingEff(1.0, s.jettisoned)).toBeCloseTo(1.25, 10);
    expect(flightQuality(0.9, s.lateStageCount)).toBeCloseTo(0.8, 10);
    expect(errorFraction(0.2, s.lateStageCount)).toBeCloseTo(0.25, 10);
    expect(lateSafetyPenalty(s.lateStageCount)).toBe(2);
  });
  it('F tidak pernah ditekan: dilepas otomatis pada 8 dtk dan dihitung terlambat', () => {
    const s0 = stepStaging(depleted(), 7.9, 0, false);
    expect(s0.state.jettisoned).toBe(0);
    const r = stepStaging(s0.state, 0.1, 0, false);
    expect(r.state.jettisoned).toBe(1);
    expect(r.state.lateStageCount).toBe(1);
    expect(r.events).toContainEqual({ type: 'jettison', stageIndex: 0, late: true, auto: true });
  });
  it('faktor percepatan 0,8 selama tahap habis menempel, kembali 1,0 setelah dilepas', () => {
    expect(accelFactor(createStaging([25, 30, 40]))).toBe(1);
    const s = depleted();
    expect(accelFactor(s)).toBe(0.8);
    expect(accelFactor(stepStaging(s, 0, 0, true).state)).toBe(1);
  });
});

describe('staging: mekanik bar', () => {
  it('throttle parsial memperlambat bar dan tahap berikutnya menyala saat habis', () => {
    const half = stepStaging(createStaging([20, 40]), 10, 0.5, false);
    expect(half.state.stages[0].burnRemainingSec).toBeCloseTo(15, 10);
    const r = stepStaging(half.state, 15, 1, false);
    expect(r.events).toEqual([{ type: 'depleted', stageIndex: 0 }, { type: 'ignite', stageIndex: 1 }]);
    expect(r.state.stages[1].phase).toBe('burning');
    expect(r.state.stages[0].phase).toBe('depleted');
  });
  it('fungsi murni: state masukan tidak berubah', () => {
    const s = createStaging([5, 5]);
    const snapshot = JSON.stringify(s);
    stepStaging(s, 5, 1, false);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
  it('flightQuality dan errorFraction dijaga di [0, 1]', () => {
    expect(flightQuality(0.1, 5)).toBe(0);
    expect(errorFraction(0.99, 5)).toBe(1);
  });
});

describe('pacing tahap peluncuran', () => {
  it('paceRocket mengalikan lama nyala tahap 1 sampai n-1 dan tidak mengubah tahap transfer', () => {
    for (const rocket of catalog.rockets) {
      const paced = paceRocket(rocket);
      const last = rocket.stages.length - 1;
      rocket.stages.forEach((s, i) => {
        expect(paced.stages[i].burnSec).toBe(i === last ? s.burnSec : s.burnSec * FLIGHT.launchBurnScale);
        expect(paced.stages[i].name).toBe(s.name);
      });
    }
  });
  it('tidak mengubah data katalog asli (PRD) dan resolveAssembly memakai angka ber-pacing', () => {
    const raw = catalog.rockets.find((r) => r.id === 'pandu_1')!;
    expect(raw.stages[0].burnSec).toBe(30);
    const a = resolveAssembly(defaultMission('moon'), catalog);
    expect(a.rocket.stages[0].burnSec).toBe(30 * FLIGHT.launchBurnScale);
    expect(a.rocket.stages[1].burnSec).toBe(40);
    expect(raw.stages[0].burnSec).toBe(30);
  });
  it('peluncuran gaya throttle penuh memakan waktu sebanyak total nyala tahap bawah ber-pacing', () => {
    const sim = new FlightSim(createFlightSimConfig(defaultMission('moon'), catalog));
    let t = 0;
    while (sim.phase === 'launch' && t < 600) {
      sim.step({ ...NO_INPUT, throttle: 1, jettison: true }, FIXED_DT);
      t += FIXED_DT;
    }
    expect(sim.phase).toBe('orbit');
    expect(t).toBeGreaterThan(30 * FLIGHT.launchBurnScale * 0.9);
  });
});
