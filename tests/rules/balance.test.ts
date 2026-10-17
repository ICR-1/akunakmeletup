import { describe, expect, it } from 'vitest';
import { preflight } from '../../src/rules/preflight';
import type { MissionConfig, Module } from '../../src/rules/types';
import { catalog } from './helpers';

/** Semua multiset berukuran minSize..maxSize dari items (urutan tidak dihitung). */
function multisets<T>(items: T[], minSize: number, maxSize: number): T[][] {
  const out: T[][] = [];
  const rec = (start: number, cur: T[]): void => {
    if (cur.length >= minSize) out.push([...cur]);
    if (cur.length === maxSize) return;
    for (let i = start; i < items.length; i++) rec(i, [...cur, items[i]]);
  };
  rec(0, []);
  return out;
}

const ids = (list: Module[]) => list.map((m) => m.id);
const kind = (k: Module['kind']) => catalog.modules.filter((m) => m.kind === k);
const mainAntennas = kind('antenna').filter((m) => m.id !== 'relay_link');
const FUEL_FRACTIONS = [0.5, 1];

function allAssemblies(destinationId: string): MissionConfig[] {
  const dest = catalog.destinations.find((d) => d.id === destinationId)!;
  const required = dest.objectives.filter((o) => o.required && o.instrumentId).map((o) => o.instrumentId!);
  const out: MissionConfig[] = [];
  for (const rocket of catalog.rockets)
    for (const lander of kind('lander'))
      for (const engine of kind('engine'))
        for (const tanks of multisets(kind('tank'), 1, 2))
          for (const solar of multisets(kind('solar'), 0, 3))
            for (const battery of multisets(kind('battery'), 0, 2))
              for (const rtg of [[], kind('rtg')])
                for (const antenna of mainAntennas)
                  for (const relay of [[], kind('antenna').filter((m) => m.id === 'relay_link')])
                    for (const fuelFraction of FUEL_FRACTIONS)
                      out.push({
                        destinationId, rocketId: rocket.id, seed: 1, fuelFraction,
                        moduleIds: ids([lander, engine, ...tanks, ...solar, ...battery, ...rtg, antenna, ...relay]),
                        instrumentIds: required,
                      });
  return out;
}

describe.each(['moon', 'mars'])('keseimbangan katalog: %s (PRD 16.10)', (destinationId) => {
  const results = allAssemblies(destinationId).map((config) => ({ config, r: preflight(config, catalog) }));
  const valid = results.filter((x) => x.r.assemblyErrors.length === 0);
  const go = valid.filter((x) => x.r.go);

  it('seluruh kombinasi yang dibangun lolos aturan perakitan', () => {
    expect(valid.length).toBe(results.length);
    expect(valid.length).toBeGreaterThan(1000);
  });
  it('ada setidaknya satu rakitan Go, tetapi tidak semua', () => {
    expect(go.length).toBeGreaterThan(0);
    expect(go.length).toBeLessThan(valid.length);
  });
  it('rakitan termurah tidak otomatis Go', () => {
    const minCost = Math.min(...valid.map((x) => x.r.metrics.totalCostMusd));
    const cheapest = valid.filter((x) => x.r.metrics.totalCostMusd === minCost);
    expect(cheapest.length).toBeGreaterThan(0);
    cheapest.forEach((x) => expect(x.r.go).toBe(false));
  });
});

describe('Lunar Cruiser (modul rover)', () => {
  const rover = kind('rover');
  it('katalog punya tepat satu Lunar Cruiser dengan stat kecepatan dan beban daya', () => {
    expect(rover.map((m) => m.id)).toEqual(['rover_lc']);
    expect(rover[0].stats.speedMs).toBeGreaterThan(0);
    expect(rover[0].stats.driveW).toBeGreaterThan(0);
  });
  it('di Bulan ada rakitan Go yang membawa Lunar Cruiser, tetapi tidak semua rakitan membawanya Go', () => {
    const withRover = allAssemblies('moon').map((c) => ({ ...c, moduleIds: [...c.moduleIds, 'rover_lc'] }));
    const results = withRover.map((config) => preflight(config, catalog));
    expect(results.every((r) => r.assemblyErrors.length === 0)).toBe(true);
    const go = results.filter((r) => r.go).length;
    expect(go).toBeGreaterThan(0);
    expect(go).toBeLessThan(results.length);
  });
  it('di Mars ada rakitan Go yang membawa Lunar Cruiser, tetapi tidak semua rakitan membawanya Go', () => {
    const withRover = allAssemblies('mars').map((c) => ({ ...c, moduleIds: [...c.moduleIds, 'rover_lc'] }));
    const results = withRover.map((config) => preflight(config, catalog));
    expect(results.every((r) => r.assemblyErrors.length === 0)).toBe(true);
    const go = results.filter((r) => r.go).length;
    expect(go).toBeGreaterThan(0);
    expect(go).toBeLessThan(results.length);
  });
  it('Lunar Cruiser tidak boleh lebih dari satu (di Bulan maupun Mars)', () => {
    const mars = allAssemblies('mars')[0];
    expect(preflight({ ...mars, moduleIds: [...mars.moduleIds, 'rover_lc', 'rover_lc'] }, catalog).assemblyErrors).toContain('ROVER_MAX');
    const m = allAssemblies('moon')[0];
    expect(preflight({ ...m, moduleIds: [...m.moduleIds, 'rover_lc', 'rover_lc'] }, catalog).assemblyErrors).toContain('ROVER_MAX');
  });
});
