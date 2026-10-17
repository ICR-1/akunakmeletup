import { describe, expect, it } from 'vitest';
import { EVENTS } from '../../src/core/constants';
import { defaultMission } from '../../src/core/missionBuilder';
import {
  choiceRisk, eligibleEvents, pickFlightEvent, pickWeighted, planSurfaceEvents, rollChoice,
} from '../../src/events/eventSystem';
import { createRng } from '../../src/core/rng';
import { resolveAssembly } from '../../src/rules/catalog';
import { createFlightSimConfig, FlightSim, NO_INPUT } from '../../src/rules/flightSim';
import { makeAutopilot } from '../../src/rules/autopilot';
import { FIXED_DT } from '../../src/core/constants';
import { applyEffects, createSurfaceState } from '../../src/rules/surface';
import { catalog } from '../rules/helpers';

const events = catalog.events;
const byId = (id: string) => events.find((e) => e.id === id)!;
const names = (seed: number, dest: string) => planSurfaceEvents(events, dest, seed).map((s) => s.event.id);

describe('penjadwalan event permukaan', () => {
  it('seed yang sama menghasilkan urutan dan waktu event yang identik', () => {
    for (const dest of ['moon', 'mars']) {
      for (let seed = 0; seed < 50; seed++) {
        expect(planSurfaceEvents(events, dest, seed)).toEqual(planSurfaceEvents(events, dest, seed));
      }
    }
  });
  it('seed berbeda menghasilkan jadwal berbeda', () => {
    const variants = new Set(Array.from({ length: 60 }, (_, s) => JSON.stringify(planSurfaceEvents(events, 'mars', s).map((x) => [x.event.id, x.triggerSec.toFixed(3)]))));
    expect(variants.size).toBeGreaterThan(30);
  });
  it('jumlah event 1 atau 2 (peluang kedua sekitar 0,5), tanpa duplikat', () => {
    let two = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const ids = names(seed, 'moon');
      expect([1, 2]).toContain(ids.length);
      expect(new Set(ids).size).toBe(ids.length);
      if (ids.length === 2) two++;
    }
    expect(two / 1000).toBeGreaterThan(0.44);
    expect(two / 1000).toBeLessThan(0.56);
  });
  it('waktu pemicu antara 45 dan 180 detik dan terurut naik', () => {
    for (let seed = 0; seed < 300; seed++) {
      const plan = planSurfaceEvents(events, 'mars', seed);
      plan.forEach((p) => {
        expect(p.triggerSec).toBeGreaterThanOrEqual(EVENTS.surfaceMinSec);
        expect(p.triggerSec).toBeLessThanOrEqual(EVENTS.surfaceMaxSec);
      });
      for (let i = 1; i < plan.length; i++) expect(plan[i].triggerSec).toBeGreaterThanOrEqual(plan[i - 1].triggerSec);
    }
  });
  it('hanya event destinasi sendiri, fase permukaan', () => {
    for (let seed = 0; seed < 200; seed++) {
      for (const s of planSurfaceEvents(events, 'moon', seed)) {
        expect(s.event.phase).toBe('surface');
        expect(['moon', 'any']).toContain(s.event.destinationId);
      }
      for (const s of planSurfaceEvents(events, 'mars', seed)) expect(['mars', 'any']).toContain(s.event.destinationId);
    }
  });
  it('pemilihan berbobot: event berbobot 2 lebih sering muncul pertama daripada berbobot 1', () => {
    const first: Record<string, number> = {};
    for (let seed = 0; seed < 4000; seed++) {
      // event paling awal (urutan waktu); distribusinya mengikuti bobot pemilihan
      const id = planSurfaceEvents(events, 'mars', seed).at(0)!.event.id;
      first[id] = (first[id] ?? 0) + 1;
    }
    // ev_dust_storm berbobot 2 dari total 4 (2+1+1)
    expect(first.ev_dust_storm / 4000).toBeGreaterThan(0.44);
    expect(first.ev_dust_storm / 4000).toBeLessThan(0.56);
  });
  it('pickWeighted menghormati bobot dan kasus tepi', () => {
    const rng = createRng(1);
    const counts = [0, 0];
    for (let i = 0; i < 4000; i++) counts[pickWeighted([1, 3], rng)]++;
    expect(counts[1] / 4000).toBeGreaterThan(0.7);
    expect(pickWeighted([5], createRng(2))).toBe(0);
  });
});

describe('event penerbangan', () => {
  it('tepat satu event fase flight, deterministik dari seed', () => {
    for (let seed = 0; seed < 100; seed++) {
      const e = pickFlightEvent(events, 'moon', seed)!;
      expect(e.phase).toBe('flight');
      expect(pickFlightEvent(events, 'moon', seed)!.id).toBe(e.id);
    }
  });
  it('ketiga event penerbangan bisa terpilih', () => {
    const seen = new Set(Array.from({ length: 200 }, (_, s) => pickFlightEvent(events, 'mars', s)!.id));
    expect(seen).toEqual(new Set(['ev_micrometeor', 'ev_engine_glitch', 'ev_stage_clamp']));
  });
  it('tanpa event yang cocok mengembalikan null', () => {
    expect(pickFlightEvent([], 'moon', 1)).toBeNull();
    expect(eligibleEvents(events, 'moon', 'flight')).toHaveLength(3);
  });
  it('efek deltaVms mengubah sisa bahan bakar dan bisa menggagalkan misi (LOW_FUEL)', () => {
    const cfg = defaultMission('moon');
    const reachCapture = () => {
      const sim = new FlightSim(createFlightSimConfig(cfg, catalog));
      const pilot = makeAutopilot(sim);
      while (sim.phase !== 'capture') sim.step(pilot(), FIXED_DT);
      return sim;
    };
    const base = reachCapture();
    const fuel = base.transfer!.fuelRemainingKg;
    const hit = reachCapture();
    hit.applyDvAdjust(-90);
    expect(hit.transfer!.fuelRemainingKg).toBeLessThan(fuel);
    expect(hit.ended).toBe(false);
    const doomed = reachCapture();
    const evs = doomed.applyDvAdjust(-5000);
    expect(doomed.ended).toBe(true);
    expect(evs.some((e) => e.type === 'ended')).toBe(true);
    expect(doomed.summary()!.failCodes).toContain('LOW_FUEL');
    expect(NO_INPUT.jettison).toBe(false);
  });
});

describe('hasil pilihan event', () => {
  it('dadu deterministik per (seed, event) dan tidak bergantung urutan pemanggilan', () => {
    const a = byId('ev_dust_storm');
    const first = rollChoice(a, 1, 99);
    rollChoice(byId('ev_solar_flare'), 1, 99);
    expect(rollChoice(a, 1, 99)).toEqual(first);
  });
  it('pilihan tanpa risiko tidak pernah gagal dan menerapkan efeknya persis', () => {
    for (let seed = 0; seed < 200; seed++) {
      const o = rollChoice(byId('ev_dust_storm'), 0, seed);
      expect(o.failed).toBe(false);
      expect(o.handledWell).toBe(true);
      expect(o.effects).toEqual([{ target: 'timeSec', delta: 45 }, { target: 'vehiclePower', delta: -5 }]);
    }
  });
  it.each([
    ['ev_micrometeor', 1, 0.4], ['ev_engine_glitch', 0, 0.3], ['ev_stage_clamp', 0, 0.3], ['ev_solar_flare', 1, 0.5],
    ['ev_micrometeorite_rain', 1, 0.3], ['ev_dust_storm', 1, 0.5], ['ev_dust_devil', 1, 0.3], ['ev_solar_conjunction', 1, 0.6],
  ])('%s pilihan %i: frekuensi gagal sesuai failChance %f', (id, idx, p) => {
    const e = byId(id);
    expect(choiceRisk(e.choices[idx])).toBe(p);
    let fails = 0;
    const N = 4000;
    for (let seed = 0; seed < N; seed++) if (rollChoice(e, idx, seed * 7919 + 13).failed) fails++;
    expect(Math.abs(fails / N - p)).toBeLessThan(0.04);
  });
  it('gagal menambahkan failEffects dan handledWell false; berhasil hanya efek pilihan', () => {
    const e = byId('ev_dust_storm');
    const outcomes = Array.from({ length: 200 }, (_, s) => rollChoice(e, 1, s));
    const fail = outcomes.find((o) => o.failed)!;
    const ok = outcomes.find((o) => !o.failed)!;
    expect(fail.effects).toEqual([{ target: 'oxygen', delta: -25 }, { target: 'signal', delta: -0.4 }]);
    expect(fail.handledWell).toBe(false);
    expect(ok.effects).toEqual([]);
    expect(ok.handledWell).toBe(true);
  });
  it('pilihan yang tidak ada menghasilkan error jelas', () => {
    expect(() => rollChoice(byId('ev_dust_storm'), 5, 1)).toThrow(/Pilihan 5/);
  });
  it('seluruh dampak semua pilihan diterapkan dengan benar ke keadaan permukaan', () => {
    const a = resolveAssembly(defaultMission('moon'), catalog);
    for (const e of events.filter((x) => x.phase === 'surface')) {
      e.choices.forEach((c) => {
        for (const effects of [c.effects, [...c.effects, ...c.failEffects]]) {
          const s0 = createSurfaceState(a);
          const s = applyEffects(s0, effects);
          for (const ef of effects) {
            if (ef.target === 'oxygen') expect(s.oxygen).toBe(Math.max(0, Math.min(100, s0.oxygen + effects.filter((x) => x.target === 'oxygen').reduce((t, x) => t + x.delta, 0))));
            if (ef.target === 'timeSec') expect(s.timeSec).toBe(s0.timeSec + effects.filter((x) => x.target === 'timeSec').reduce((t, x) => t + x.delta, 0));
            if (ef.target === 'vehiclePower') expect(s.vehicleWh).toBeLessThan(s0.vehicleWh);
            if (ef.target === 'signal') expect(s.signalDelta).toBeCloseTo(effects.filter((x) => x.target === 'signal').reduce((t, x) => t + x.delta, 0), 10);
            if (ef.target === 'score') expect(s.scoreDelta).toBe(ef.delta);
            if (ef.target === 'suitBattery') expect(s.suitBattery).toBeLessThan(s0.suitBattery);
          }
        }
      });
    }
  });
});

describe('pilihan event bergaya minigame (Bersihkan Panel)', () => {
  const dust = byId('ev_dust_on_panels');
  const clean = dust.choices.findIndex((c) => c.minigameId === 'clean_panel');
  it('event debu punya pilihan minigame', () => {
    expect(clean).toBeGreaterThanOrEqual(0);
  });
  it('skor tinggi berhasil, skor rendah memicu failEffects, deterministik', () => {
    const good = rollChoice(dust, clean, 5, 0.9);
    const bad = rollChoice(dust, clean, 5, EVENTS.minigamePassScore - 0.01);
    expect(good.failed).toBe(false);
    expect(good.effects).toEqual(dust.choices[clean].effects);
    expect(bad.failed).toBe(true);
    expect(bad.effects).toEqual([...dust.choices[clean].effects, ...dust.choices[clean].failEffects]);
    expect(rollChoice(dust, clean, 5, 0.9)).toEqual(good);
  });
  it('ambang sukses tepat pada batas dihitung berhasil', () => {
    expect(rollChoice(dust, clean, 1, EVENTS.minigamePassScore).failed).toBe(false);
  });
});
