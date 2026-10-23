import { describe, expect, it } from 'vitest';
import { clampToZone, nudgeApart } from '../../src/ui/labelLayout';

describe('nudgeApart', () => {
  it('menaikkan label atas sampai tidak beririsan', () => {
    expect(nudgeApart([{ x: 100, y: 200, w: 80, h: 20 }, { x: 110, y: 205, w: 80, h: 20 }], 4)).toEqual([-19, 0]);
  });
  it('tidak menggeser label yang terpisah', () => {
    expect(nudgeApart([{ x: 100, y: 200, w: 80, h: 20 }, { x: 400, y: 205, w: 80, h: 20 }], 4)).toEqual([0, 0]);
    expect(nudgeApart([{ x: 100, y: 100, w: 80, h: 20 }, { x: 100, y: 200, w: 80, h: 20 }], 4)).toEqual([0, 0]);
  });
  it('menumpuk tiga label berderet ke atas', () => {
    const r = nudgeApart([{ x: 0, y: 100, w: 50, h: 10 }, { x: 0, y: 100, w: 50, h: 10 }, { x: 0, y: 100, w: 50, h: 10 }], 2);
    expect(r.slice().sort((a, b) => a - b)).toEqual([-24, -12, 0]);
  });
});

describe('clampToZone', () => {
  it('menjepit label supaya utuh di zona', () => {
    expect(clampToZone(10, 60, 0, 500)).toBe(30);
    expect(clampToZone(480, 60, 0, 500)).toBe(470);
    expect(clampToZone(250, 60, 0, 500)).toBe(250);
  });
  it('null bila jangkar jauh di luar zona', () => {
    expect(clampToZone(-100, 60, 0, 500)).toBeNull();
    expect(clampToZone(700, 60, 0, 500)).toBeNull();
  });
});
