import { describe, expect, it } from 'vitest';
import { preflight } from '../../src/rules/preflight';
import { FUEL_STEP, suggestChanges, weakestIndicator } from '../../src/rules/whatIf';
import { catalog, moonExample } from './helpers';

describe('bagaimana jika (saran satu langkah)', () => {
  it('rakitan dengan massa merah: saran teratas memperbaiki margin massa (indikator paling lemah)', () => {
    const heavy = { ...moonExample, fuelFraction: 1 };
    expect(preflight(heavy, catalog).indicators.mass.status).toBe('red');
    const list = suggestChanges(heavy, catalog);
    expect(list.length).toBeGreaterThan(0);
    const top = list[0];
    expect(weakestIndicator(heavy, catalog)).toBe('mass');
    expect(top.changes.some((c) => c.key === 'mass' && c.to > c.from)).toBe(true);
    expect(preflight(top.config, catalog).indicators.mass.margin).toBeGreaterThan(preflight(heavy, catalog).indicators.mass.margin);
  });
  it('tidak pernah menyarankan rakitan yang melanggar aturan atau membuat indikator baru merah', () => {
    for (const fuel of [0.4, 0.75, 1]) {
      const cfg = { ...moonExample, fuelFraction: fuel };
      const base = preflight(cfg, catalog);
      for (const s of suggestChanges(cfg, catalog, true, 8)) {
        const r = preflight(s.config, catalog);
        expect(r.assemblyErrors).toEqual([]);
        for (const k of ['budget', 'mass', 'deltaV', 'power', 'comms'] as const) {
          if (r.indicators[k].status === 'red') expect(base.indicators[k].status).toBe('red');
        }
        expect(s.go).toBe(r.go);
      }
    }
  });
  it('maksimal 3 saran, deterministik, satu per jenis perubahan, dan setiap saran mengubah minimal satu indikator', () => {
    const cfg = { ...moonExample, fuelFraction: 0.5 };
    const a = suggestChanges(cfg, catalog);
    const b = suggestChanges(cfg, catalog);
    expect(a.length).toBeLessThanOrEqual(3);
    expect(b).toEqual(a);
    expect(new Set(a.map((s) => s.kind === 'add_module' ? `add:${s.moduleName?.split(' ')[0]}` : s.kind)).size).toBe(a.length);
    for (const s of a) expect(s.changes.length).toBeGreaterThan(0);
  });
  it('perubahan bahan bakar memakai langkah 10% dan dijaga 0-100%', () => {
    const full = suggestChanges({ ...moonExample, fuelFraction: 1 }, catalog, true, 8);
    expect(full.some((s) => s.kind === 'fuel_up')).toBe(false);
    const down = full.find((s) => s.kind === 'fuel_down');
    if (down) expect(down.fuelTo).toBeCloseTo(1 - FUEL_STEP, 10);
    const empty = suggestChanges({ ...moonExample, fuelFraction: 0 }, catalog, true, 8);
    expect(empty.some((s) => s.kind === 'fuel_down')).toBe(false);
  });
  it('weakestIndicator menunjuk indikator dengan margin terendah', () => {
    const cfg = { ...moonExample, fuelFraction: 1 };
    const r = preflight(cfg, catalog);
    const k = weakestIndicator(cfg, catalog);
    for (const other of ['budget', 'mass', 'deltaV', 'power', 'comms'] as const) {
      expect(r.indicators[k].margin).toBeLessThanOrEqual(r.indicators[other].margin);
    }
  });
});
