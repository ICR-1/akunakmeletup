import { describe, expect, it } from 'vitest';
import { FIXED_DT, FLIGHT } from '../../src/core/constants';
import { defaultMission } from '../../src/core/missionBuilder';
import { makeAutopilot, type AutopilotOptions } from '../../src/rules/autopilot';
import {
  createFlightSimConfig, FlightSim, NO_INPUT, type FlightEvent,
} from '../../src/rules/flightSim';
import type { MissionConfig } from '../../src/rules/types';
import { catalog } from './helpers';

type Pilot = AutopilotOptions;
const SKILLED: Pilot = {};

const makePilot = (sim: FlightSim, pilot: Pilot) => makeAutopilot(sim, pilot);

function fly(config: MissionConfig, pilot: Pilot = SKILLED, maxSec = 900) {
  const sim = new FlightSim(createFlightSimConfig(config, catalog));
  const next = makePilot(sim, pilot);
  const events: FlightEvent[] = [];
  const phases: string[] = [sim.phase];
  while (!sim.ended && sim.elapsedSec < maxSec) {
    for (const e of sim.step(next(), FIXED_DT)) {
      events.push(e);
      if (e.type === 'phase') phases.push(e.phase);
      if (e.type === 'ended') phases.push('ended');
    }
  }
  return { sim, events, phases };
}

const moon = defaultMission('moon');
const mars = defaultMission('mars');
const jettisons = (events: FlightEvent[]) => events.filter((e) => e.type === 'jettison');

describe('simulasi penerbangan penuh', () => {
  it('pilot terampil: Bulan melewati semua fase dan mendarat tanpa gagal', () => {
    const { sim, phases } = fly(moon);
    expect(phases).toEqual(['launch', 'orbit', 'transfer', 'capture', 'landing', 'ended']);
    const s = sim.summary()!;
    expect(s.failed).toBe(false);
    expect(['perfect', 'success']).toContain(s.touchdown);
    expect(s.lateStageCount).toBe(0);
    expect(s.flightQuality).toBeGreaterThan(0.9);
    expect(s.fuelRemainingKg).toBeGreaterThan(0);
    expect(sim.landing?.landed).toBe(true);
  });
  it('Mars dapat diterbangkan sampai mendarat', () => {
    const { sim } = fly(mars);
    expect(sim.summary()!.failed).toBe(false);
  });
  it.each([['pandu_1', 2], ['rajawali_2', 3], ['garuda_heavy', 4]])('%s: jumlah F sama dengan jumlah tahap (%i)', (rocketId, n) => {
    const cfg = { ...moon, rocketId, fuelFraction: 0.5 };
    const { sim, events } = fly(cfg);
    expect(jettisons(events)).toHaveLength(n);
    expect(sim.staging.jettisoned).toBe(n);
    expect(sim.summary()!.lateStageCount).toBe(0);
  });
  it('lebih banyak tahap dilepas membuat roket lebih lincah (handlingEff naik 0,25 per tahap)', () => {
    const sim = new FlightSim(createFlightSimConfig({ ...moon, rocketId: 'rajawali_2' }, catalog));
    expect(sim.handling).toBeCloseTo(1.0, 10);
    const { sim: done } = fly({ ...moon, rocketId: 'rajawali_2' });
    expect(done.handling).toBeCloseTo(1.75, 10);
  });
  it('deterministik: seed dan input sama menghasilkan hasil sama; seed beda boleh beda', () => {
    expect(fly(moon).sim.summary()).toEqual(fly(moon).sim.summary());
    const a = fly(moon).sim;
    const b = fly({ ...moon, seed: 777 }).sim;
    expect(a.markerYawDeg === b.markerYawDeg && a.aimYawDeg === b.aimYawDeg && a.pitchDeg === b.pitchDeg).toBe(false);
  });
});

describe('kunci pitch di landasan', () => {
  it('input pitch diabaikan sebelum lepas landas dan di dekat tanah', () => {
    const sim = new FlightSim(createFlightSimConfig(moon, catalog));
    const start = sim.pitchDeg;
    for (let i = 0; i < 120; i++) sim.step({ ...NO_INPUT, pitch: 1 }, FIXED_DT);
    expect(sim.pitchDeg).toBe(start);
    // Mesin menyala tetapi masih di bawah ambang: tetap tegak.
    while (sim.progress < FLIGHT.pitchUnlockProgress * 0.5) sim.step({ ...NO_INPUT, throttle: 1, pitch: 1 }, FIXED_DT);
    expect(sim.pitchDeg).toBe(start);
  });

  it('pitch bisa diatur setelah melewati ambang lepas landas', () => {
    const sim = new FlightSim(createFlightSimConfig(moon, catalog));
    while (sim.progress < FLIGHT.pitchUnlockProgress) sim.step({ ...NO_INPUT, throttle: 1 }, FIXED_DT);
    for (let i = 0; i < 30; i++) sim.step({ ...NO_INPUT, throttle: 1, pitch: 1 }, FIXED_DT);
    expect(sim.pitchDeg).toBeLessThan(FLIGHT.launchStartPitchDeg);
  });
});

describe('bahan bakar wahana yang ditampilkan', () => {
  it('penuh saat peluncuran dan orbit (digerakkan roket), turun saat burn transfer, sama dengan sisa akhir setelahnya', () => {
    const sim = new FlightSim(createFlightSimConfig(moon, catalog));
    const full = sim.fuelDisplayKg;
    expect(full).toBeCloseTo(sim.cfg.m0Kg - sim.cfg.mfKg, 6);
    const next = makeAutopilot(sim, SKILLED);
    let prev = full, sawTransfer = false, minInTransfer = full;
    while (!sim.ended && sim.phase !== 'landing' && sim.elapsedSec < 900) {
      sim.step(next(), FIXED_DT);
      const v = sim.fuelDisplayKg;
      if (sim.phase === 'launch' || sim.phase === 'orbit') expect(v).toBe(full);
      if (sim.phase === 'transfer') { sawTransfer = true; expect(v).toBeLessThanOrEqual(prev + 1e-9); minInTransfer = Math.min(minInTransfer, v); }
      prev = v;
    }
    expect(sawTransfer).toBe(true);
    expect(minInTransfer).toBeLessThan(full);
    expect(sim.fuelDisplayKg).toBeCloseTo(sim.transfer!.fuelRemainingKg, 6);
    expect(sim.fuelDisplayKg).toBeLessThan(full);
  });
});

describe('thrust harus ditahan: roket jatuh bila W dilepas di udara', () => {
  const W = { ...NO_INPUT, throttle: 1 };
  const fresh = () => new FlightSim(createFlightSimConfig(moon, catalog));
  const run = (sim: FlightSim, input: typeof W, seconds: number): FlightEvent[] => {
    const events: FlightEvent[] = [];
    for (let i = 0; i < Math.round(seconds / FIXED_DT) && !sim.ended; i++) events.push(...sim.step(input, FIXED_DT));
    return events;
  };

  it('di landasan tanpa menekan W roket diam: tidak jatuh dan tidak gagal', () => {
    const sim = fresh();
    run(sim, NO_INPUT, 20);
    expect(sim.progress).toBe(0);
    expect(sim.ended).toBe(false);
    expect(sim.falling).toBe(false);
  });
  it('throttle turun sendiri saat W dilepas (peluncuran) tetapi tetap pada saat mendarat', () => {
    const sim = fresh();
    run(sim, W, 3);
    expect(sim.throttle).toBe(1);
    run(sim, NO_INPUT, 1.2);
    expect(sim.throttle).toBeLessThan(0.3);
  });
  it('tahap tidak terpakai selama thrust di bawah ambang angkat (belum lepas landas)', () => {
    const sim = fresh();
    run(sim, { ...NO_INPUT, throttle: 0.4 }, 0.5);
    const before = sim.staging.stages[0].burnRemainingSec;
    expect(sim.throttle).toBeLessThan(0.5);
    run(sim, { ...NO_INPUT, throttle: 0 }, 1);
    expect(sim.staging.stages[0].burnRemainingSec).toBe(before);
  });
  it('melepas W di udara: roket jatuh makin cepat dan menyentuh tanah = LAUNCH_FAIL (misi gagal) dengan event rocket_crash', () => {
    const sim = fresh();
    run(sim, W, 12);
    expect(sim.progress).toBeGreaterThan(0.1);
    const events = run(sim, NO_INPUT, 60);
    expect(sim.falling || sim.ended).toBe(true);
    expect(sim.ended).toBe(true);
    expect(events.some((e) => e.type === 'rocket_crash')).toBe(true);
    expect(sim.failed).toBe(true);
    expect(sim.summary()!.failCodes).toContain('LAUNCH_FAIL');
    expect(sim.progress).toBe(0);
    expect(sim.crashed).toBe(true);
  });
  it('kecepatan jatuh bertambah terus dan ketinggian menurun monoton saat mesin mati', () => {
    const sim = fresh();
    run(sim, W, 12);
    let prevProgress = Infinity, prevFall = 0;
    // Tunggu throttle turun di bawah ambang (thrust belum cukup lagi), lalu jatuh harus makin cepat dan makin rendah
    for (let i = 0; i < 90; i++) {
      sim.step(NO_INPUT, FIXED_DT);
      if (sim.ended) break;
      if (sim.throttle >= 0.5) continue;
      expect(sim.progress).toBeLessThan(prevProgress);
      expect(sim.fallSpeed01).toBeGreaterThanOrEqual(prevFall);
      prevProgress = sim.progress;
      prevFall = sim.fallSpeed01;
    }
    expect(prevFall).toBeGreaterThan(0);
  });
  it('lepas W sebentar lalu menahan lagi: jatuh berhenti, ketinggian pulih, dan misi berlanjut', () => {
    const sim = fresh();
    run(sim, W, 12);
    run(sim, NO_INPUT, 0.4); // throttle masih di atas ambang: masih naik
    const before = sim.progress;
    run(sim, NO_INPUT, 1.6);
    expect(sim.falling).toBe(true);
    const low = sim.progress;
    expect(low).toBeLessThan(before);
    run(sim, W, 10);
    expect(sim.ended).toBe(false);
    expect(sim.fallSpeed01).toBe(0);
    expect(sim.progress).toBeGreaterThan(low);
    expect(sim.falling).toBe(false);
  });
  it('setelah jatuh sebagian dan pulih, ketinggian mengejar kemajuan bahan bakar tanpa melewatinya', () => {
    const sim = fresh();
    run(sim, W, 15);
    run(sim, NO_INPUT, 1);
    run(sim, W, 25);
    expect(sim.progress).toBeLessThanOrEqual(1);
    const pilot = fly(moon).sim;
    expect(pilot.failed).toBe(false);
  });
});

describe('kegagalan dan penalti', () => {
  it('mengabaikan panduan pitch menghasilkan LAUNCH_FAIL', () => {
    const { sim, phases } = fly(moon, { skipPitch: true });
    expect(phases).toEqual(['launch', 'orbit', 'ended']);
    const s = sim.summary()!;
    expect(s.failed).toBe(true);
    expect(s.failCodes).toContain('LAUNCH_FAIL');
    expect(s.flightQuality).toBeLessThan(0.3);
  });
  it('delta-v kurang saat burn menghasilkan LOW_FUEL', () => {
    const { sim, phases } = fly({ ...moon, fuelFraction: 0.3 });
    expect(phases).toEqual(['launch', 'orbit', 'transfer', 'ended']);
    expect(sim.summary()!.failCodes).toContain('LOW_FUEL');
    expect(sim.transfer?.sufficient).toBe(false);
  });
  it('touchdown dengan vy di atas 12 m/s menghasilkan CRASH_LANDING', () => {
    const { sim } = fly(moon, { skipLanding: true });
    const s = sim.summary()!;
    expect(s.failed).toBe(true);
    expect(s.touchdown).toBe('crash');
    expect(s.failCodes).toContain('CRASH_LANDING');
  });
  it('bahan bakar habis sebelum mendarat menghasilkan LOW_FUEL', () => {
    const cfg = createFlightSimConfig(moon, catalog);
    const sim = new FlightSim(cfg);
    const next = makePilot(sim, SKILLED);
    while (sim.phase !== 'landing') sim.step(next(), FIXED_DT);
    sim.landing!.fuelKg = 0.5;
    sim.landing!.fuelOut = false;
    while (!sim.ended) sim.step({ ...NO_INPUT, throttle: 1 }, FIXED_DT);
    const s = sim.summary()!;
    expect(s.failCodes).toContain('LOW_FUEL');
    expect(s.failed).toBe(true);
  });
  it('tahap terlambat menurunkan kualitas dan memunculkan LATE_STAGING', () => {
    const early = fly({ ...moon, rocketId: 'rajawali_2' }).sim;
    const late = fly({ ...moon, rocketId: 'rajawali_2' }, { fDelaySec: 4 }).sim;
    const s = late.summary()!;
    expect(s.lateStageCount).toBe(3);
    expect(s.failCodes).toContain('LATE_STAGING');
    expect(early.summary()!.failCodes).not.toContain('LATE_STAGING');
    expect(s.flightQuality).toBeLessThan(early.summary()!.flightQuality);
    expect(s.errorFraction).toBeGreaterThan(early.summary()!.errorFraction);
    expect(late.transfer!.burnCostMs).toBeGreaterThan(early.transfer!.burnCostMs);
  });
  it('F tidak ditekan: tahap dilepas otomatis dan dihitung terlambat', () => {
    const sim = new FlightSim(createFlightSimConfig({ ...moon, rocketId: 'rajawali_2' }, catalog));
    const p = makePilot(sim, SKILLED);
    const events: FlightEvent[] = [];
    while (!sim.ended && sim.elapsedSec < 900) {
      const input = p();
      input.jettison = false;
      events.push(...sim.step(input, FIXED_DT));
    }
    expect(jettisons(events).every((e) => e.type === 'jettison' && e.auto && e.late)).toBe(true);
    expect(sim.staging.lateStageCount).toBe(3);
  });
  it('tahap terlambat menempel memperlambat kemajuan peluncuran (faktor 0,8)', () => {
    const progressAfter = (jettisonFirst: boolean) => {
      const sim = new FlightSim(createFlightSimConfig({ ...moon, rocketId: 'rajawali_2' }, catalog));
      const p = makePilot(sim, SKILLED);
      while (sim.staging.stages[0].phase !== 'depleted') sim.step(p(), FIXED_DT);
      const start = sim.progress;
      for (let i = 0; i < 300; i++) {
        const input = p();
        input.jettison = jettisonFirst && input.jettison;
        sim.step(input, FIXED_DT);
        if (!jettisonFirst && sim.staging.stages[0].phase !== 'depleted') break;
      }
      return sim.progress - start;
    };
    expect(progressAfter(false)).toBeLessThan(progressAfter(true));
  });
});

describe('peristiwa dan prompt', () => {
  it('prompt F menyala saat tahap habis dan hilang setelah dilepas', () => {
    const sim = new FlightSim(createFlightSimConfig(moon, catalog));
    const p = makePilot(sim, SKILLED);
    expect(sim.jettisonPrompt).toBe(false);
    while (!sim.jettisonPrompt) sim.step({ ...p(), jettison: false }, FIXED_DT);
    sim.step({ ...NO_INPUT, jettison: true }, FIXED_DT);
    expect(sim.jettisonPrompt).toBe(false);
  });
  it('fairing membelah otomatis pada ketinggian 100 km (bukan aksi pemain)', () => {
    const { events, sim } = fly(moon);
    expect(events.filter((e) => e.type === 'fairing')).toHaveLength(1);
    expect(sim.fairingSeparated).toBe(true);
  });
  it('roket Garuda: tahap pertama adalah Side Booster dan dilepas lebih dulu', () => {
    const { events } = fly({ ...moon, rocketId: 'garuda_heavy', fuelFraction: 0.5 });
    const first = events.find((e) => e.type === 'jettison');
    expect(first && first.type === 'jettison' && first.stageIndex).toBe(0);
  });
});

describe('kontrol kecepatan pendaratan (landing speed control)', () => {
  function startLandingSim() {
    const sim = new FlightSim(createFlightSimConfig(moon, catalog));
    const p = makePilot(sim, SKILLED);
    while (sim.phase !== 'landing') sim.step(p(), FIXED_DT);
    return sim;
  }

  it('W meningkatkan throttle pendaratan dengan respons cepat (2.0/s)', () => {
    const sim = startLandingSim();
    expect(sim.throttle).toBe(0);
    sim.step({ ...NO_INPUT, throttle: 1 }, 0.25);
    expect(sim.throttle).toBeCloseTo(0.5, 1);
  });

  it('S memotong throttle pendaratan dengan cepat (2.5/s)', () => {
    const sim = startLandingSim();
    sim.step({ ...NO_INPUT, throttle: 1 }, 0.5);
    expect(sim.throttle).toBeGreaterThan(0.8);
    sim.step({ ...NO_INPUT, throttle: -1 }, 0.2);
    expect(sim.throttle).toBeLessThan(0.6);
  });

  it('saat wahana naik (vy > 0), melepas W memotong throttle agar tidak meluncur kabur ke angkasa', () => {
    const sim = startLandingSim();
    sim.landing!.vy = 5;
    sim.throttle = 0.8;
    sim.step(NO_INPUT, 0.2);
    expect(sim.throttle).toBeLessThan(0.8);
  });

  it('tahan Spasi (precision cushion) mengatur kecepatan vertikal ke zona aman dan mendarat sempurna', () => {
    const sim = startLandingSim();
    expect(sim.phase).toBe('landing');
    expect(sim.landingCushionActive).toBe(false);

    let guard = 0;
    while (!sim.ended && guard++ < 60 * 200) {
      sim.step({ ...NO_INPUT, precision: true }, FIXED_DT);
      if (!sim.ended) expect(sim.landingCushionActive).toBe(true);
    }
    expect(sim.ended).toBe(true);
    const summary = sim.summary()!;
    expect(summary.failed).toBe(false);
    expect(summary.touchdown).toBe('perfect');
    expect(Math.abs(sim.landing!.vy)).toBeLessThanOrEqual(2.0);
    expect(Math.abs(sim.landing!.tiltDeg)).toBeLessThanOrEqual(5.0);
  });
});
