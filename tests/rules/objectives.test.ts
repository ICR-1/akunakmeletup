import { describe, expect, it } from 'vitest';
import { placeObjectives } from '../../src/rules/objectives';
import { catalog } from './helpers';

describe.each(catalog.destinations)('penempatan objektif: $id', (dest) => {
  const placements = placeObjectives(dest, 2061);
  it('satu titik per objektif, deterministik dari seed', () => {
    expect(placements.map((p) => p.objectiveId)).toEqual(dest.objectives.map((o) => o.id));
    expect(placeObjectives(dest, 2061)).toEqual(placements);
    expect(placeObjectives(dest, 99)).not.toEqual(placements);
  });
  it('objektif wajib 45-160 m, objektif bonus lebih dari 250 m dari wahana', () => {
    for (const o of dest.objectives) {
      const p = placements.find((x) => x.objectiveId === o.id)!;
      expect(p.distanceM).toBeCloseTo(Math.hypot(p.x, p.z), 6);
      if (o.bonus) expect(p.distanceM).toBeGreaterThan(250);
      else {
        expect(p.distanceM).toBeGreaterThanOrEqual(45);
        expect(p.distanceM).toBeLessThanOrEqual(160);
      }
    }
  });
  it('titik berjarak dan berada di dalam batas peta', () => {
    for (const p of placements) expect(Math.max(Math.abs(p.x), Math.abs(p.z))).toBeLessThan(380);
  });
});
