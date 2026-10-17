import { describe, expect, it } from 'vitest';
import { resolveAssembly } from '../../src/rules/catalog';
import { preflight } from '../../src/rules/preflight';
import { budgetMargin, totalCostMusd } from '../../src/rules/budget';
import { dayPowerMargin, nightPowerMargin, dayPowerW, loadW } from '../../src/rules/power';
import { commsMargin } from '../../src/rules/comms';
import { dvAvailableMs, dvMargin } from '../../src/rules/deltav';
import { dryMassKg, fuelMassKg, initialMassKg, massMargin } from '../../src/rules/mass';
import { catalog, moonExample } from './helpers';

const TOL = 0.005; // toleransi 0,5%
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(TOL);

describe('contoh hitung misi Bulan (PRD 14)', () => {
  const a = resolveAssembly(moonExample, catalog);

  it('massa', () => {
    expect(dryMassKg(a)).toBe(1048);
    expect(fuelMassKg(a)).toBe(2625);
    expect(initialMassKg(a)).toBe(3673);
    near(massMargin(a), 0.082);
  });
  it('delta-v', () => {
    near(dvAvailableMs(a), 5534);
    near(dvMargin(a), 0.107);
  });
  it('biaya dan budget', () => {
    expect(totalCostMusd(a)).toBe(298);
    near(budgetMargin(a), 0.255);
  });
  it('daya', () => {
    near(dayPowerW(a), 1524);
    expect(loadW(a)).toBe(115);
    near(dayPowerMargin(a), 12.3);
    near(nightPowerMargin(a), 0.449);
  });
  it('komunikasi', () => {
    near(commsMargin(a), 3.0);
  });
  it('status indikator dan Go', () => {
    const r = preflight(moonExample, catalog);
    expect(r.indicators.mass.status).toBe('yellow');
    expect(r.indicators.deltaV.status).toBe('green');
    expect(r.indicators.budget.status).toBe('green');
    expect(r.indicators.power.status).toBe('green');
    expect(r.indicators.comms.status).toBe('green');
    expect(r.assemblyErrors).toEqual([]);
    expect(r.missingObjectives).toEqual([]);
    expect(r.go).toBe(true);
    expect(r.tightMargin).toBe(true);
  });
});

describe('Go/No-Go', () => {
  it('No-Go jika objektif wajib tanpa instrumen', () => {
    const r = preflight({ ...moonExample, instrumentIds: ['cam_pano'] }, catalog);
    expect(r.missingObjectives).toEqual(['moon_regolith']);
    expect(r.go).toBe(false);
  });
  it('Free Design: objektif wajib tanpa instrumen tetap dilaporkan tetapi tidak mengunci Go', () => {
    const r = preflight({ ...moonExample, instrumentIds: ['cam_pano'] }, catalog, false);
    expect(r.missingObjectives).toEqual(['moon_regolith']);
    expect(r.go).toBe(true);
  });
  it('Free Design tetap No-Go jika ada indikator merah', () => {
    const r = preflight({ ...moonExample, fuelFraction: 1 }, catalog, false);
    expect(r.indicators.mass.status).toBe('red');
    expect(r.go).toBe(false);
  });
  it('No-Go jika ada indikator merah (massa melebihi muatan roket)', () => {
    const r = preflight({ ...moonExample, fuelFraction: 1 }, catalog);
    expect(r.indicators.mass.status).toBe('red');
    expect(r.go).toBe(false);
  });
  it('aturan perakitan dilaporkan', () => {
    const r = preflight({ ...moonExample, moduleIds: [...moonExample.moduleIds, 'eng_basic', 'relay_link', 'relay_link'] }, catalog);
    expect(r.assemblyErrors).toEqual(expect.arrayContaining(['ENGINE_COUNT', 'RELAY_MAX']));
    expect(r.go).toBe(false);
  });
  it('slot instrumen dan duplikat divalidasi', () => {
    const six = ['cam_pano', 'weather_station', 'seismometer', 'spectrometer', 'sample_drill', 'ice_radar'];
    expect(preflight({ ...moonExample, instrumentIds: six }, catalog).assemblyErrors).toContain('INSTRUMENT_SLOTS');
    expect(preflight({ ...moonExample, instrumentIds: ['cam_pano', 'cam_pano'] }, catalog).assemblyErrors).toContain('INSTRUMENT_DUPLICATE');
  });
  it('id tidak dikenal menghasilkan error jelas', () => {
    expect(() => preflight({ ...moonExample, rocketId: 'nope' }, catalog)).toThrow(/Roket tidak dikenal: "nope"/);
  });
});
