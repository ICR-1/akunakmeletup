import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/core/constants';
import { defaultMission } from '../../src/core/missionBuilder';
import { makeAutopilot } from '../../src/rules/autopilot';
import { createFlightSimConfig, FlightSim } from '../../src/rules/flightSim';
import { resolveAssembly } from '../../src/rules/catalog';
import { createSurfaceState, stepSurface } from '../../src/rules/surface';
import { catalog } from './helpers';

const finite = (o: unknown): boolean => JSON.stringify(o, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? '__NaN__' : v)).indexOf('__NaN__') < 0;

describe('uji ketahanan (soak): banyak seed', () => {
  it.each(['moon', 'mars'])('penerbangan %s selesai tanpa NaN untuk 40 seed dengan pilot terampil', (dest) => {
    for (let seed = 1; seed <= 40; seed++) {
      const sim = new FlightSim(createFlightSimConfig({ ...defaultMission(dest), seed }, catalog));
      const pilot = makeAutopilot(sim);
      let guard = 0;
      while (!sim.ended && guard++ < 60 * 900) sim.step(pilot(), FIXED_DT);
      expect(sim.ended, `seed ${seed}`).toBe(true);
      const summary = sim.summary()!;
      expect(finite(summary), `seed ${seed}`).toBe(true);
      expect(summary.failed, `seed ${seed} ${summary.failCodes.join(',')}`).toBe(false);
    }
  });
  it('pilot yang menunda F dan mengabaikan pendaratan tetap berakhir dengan hasil terdefinisi', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const sim = new FlightSim(createFlightSimConfig({ ...defaultMission('moon'), rocketId: 'garuda_heavy', fuelFraction: 0.5, seed }, catalog));
      const pilot = makeAutopilot(sim, { fDelaySec: 5, skipLanding: seed % 2 === 0 });
      let guard = 0;
      while (!sim.ended && guard++ < 60 * 1200) sim.step(pilot(), FIXED_DT);
      expect(sim.ended).toBe(true);
      expect(finite(sim.summary())).toBe(true);
    }
  });
  it('permukaan: 480 detik dengan gerakan acak tidak menghasilkan NaN dan sumber daya tetap di batas', () => {
    for (const dest of ['moon', 'mars']) {
      const a = resolveAssembly(defaultMission(dest), catalog);
      let s = createSurfaceState(a);
      const moves = ['idle', 'walk', 'run'] as const;
      for (let i = 0; i < 60 * 600; i++) {
        const r = stepSurface(s, { movement: moves[Math.floor(i / 300) % 3], distanceFromHubM: (i % 4000) / 10 }, a, FIXED_DT);
        s = r.state;
        expect(s.oxygen).toBeGreaterThanOrEqual(0);
        expect(s.oxygen).toBeLessThanOrEqual(100);
        expect(s.vehicleWh).toBeGreaterThanOrEqual(0);
        expect(s.vehicleWh).toBeLessThanOrEqual(s.vehicleCapacityWh);
      }
      expect(finite(s)).toBe(true);
    }
  });
});
