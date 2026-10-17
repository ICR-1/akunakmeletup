import { describe, expect, it } from 'vitest';
import { defaultMission } from '../../src/core/missionBuilder';
import type { FlightSummary, SurfaceSummary } from '../../src/rules/missionResult';
import { buildOutcome } from '../../src/rules/outcome';
import { catalog } from './helpers';

const config = defaultMission('moon');
const flightOk: FlightSummary = {
  failed: false, failCodes: ['OVER_MARGIN_TIGHT'], flightQuality: 1, errorFraction: 0, lateStageCount: 0,
  touchdown: 'perfect', touchdownFactor: 1, instrumentsLost: [], fuelRemainingKg: 100, eventsHandledWell: 0, handledEventIds: [],
};
const surfaceOk: SurfaceSummary = {
  completedObjectives: ['moon_regolith', 'moon_panorama'], minigameScores: { sample_drill: 1, cam_pano: 1 },
  faintCount: 0, nightPowerOut: false, uplinkU: 1, eventsHandledWell: 0, handledEventIds: [], scoreAdjust: 0, timeSec: 300,
};

describe('buildOutcome', () => {
  it('misi sukses: skor tinggi dan kode hanya margin tipis', () => {
    const o = buildOutcome({ config, catalog, flight: flightOk, surface: surfaceOk });
    expect(o.score.science).toBeCloseTo(40, 6);
    expect(o.score.safety).toBe(20);
    expect(o.score.stars).toBeGreaterThanOrEqual(2);
    expect(o.codes).toEqual(['OVER_MARGIN_TIGHT']);
  });
  it('penerbangan gagal: 0 bintang, tanpa kode permukaan, sains nol', () => {
    const flight = { ...flightOk, failed: true, failCodes: ['CRASH_LANDING' as const], touchdownFactor: 0 };
    const o = buildOutcome({ config, catalog, flight, surface: null });
    expect(o.score.stars).toBe(0);
    expect(o.score.science).toBe(0);
    expect(o.score.sciencePoints).toBe(0);
    expect(o.codes).toEqual(['CRASH_LANDING']);
  });
  it('kode permukaan: pingsan, daya malam, komunikasi, objektif', () => {
    const surface: SurfaceSummary = {
      ...surfaceOk, completedObjectives: ['moon_panorama'], faintCount: 2, nightPowerOut: true, uplinkU: 0.3,
    };
    const o = buildOutcome({ config, catalog, flight: { ...flightOk, failCodes: [] }, surface });
    expect(o.codes).toEqual(['NIGHT_POWER', 'OXYGEN_OUT', 'LOW_COMMS', 'OBJECTIVE_MISSED']);
  });
  it('penyesuaian skor dari event diterapkan dan dijepit 0-100', () => {
    const base = buildOutcome({ config, catalog, flight: flightOk, surface: surfaceOk }).score.total;
    const adj = buildOutcome({ config, catalog, flight: flightOk, surface: { ...surfaceOk, scoreAdjust: -3 } }).score.total;
    expect(adj).toBeCloseTo(base - 3, 6);
    expect(buildOutcome({ config, catalog, flight: flightOk, surface: { ...surfaceOk, scoreAdjust: -999 } }).score.total).toBe(0);
  });
  it('objektif bonus menambah skor dan instrumen hilang mengurangi keselamatan', () => {
    const plain = buildOutcome({ config, catalog, flight: flightOk, surface: surfaceOk }).score;
    const bonus = buildOutcome({ config, catalog, flight: flightOk, surface: { ...surfaceOk, completedObjectives: [...surfaceOk.completedObjectives, 'moon_far_crater'] } }).score;
    expect(bonus.bonus - plain.bonus).toBe(5);
    const lost = buildOutcome({ config, catalog, flight: { ...flightOk, instrumentsLost: ['cam_pano'], touchdownFactor: 0.3 }, surface: surfaceOk }).score;
    expect(lost.safety).toBeCloseTo(20 * 0.3 - 3, 6);
  });
});
