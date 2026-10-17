import { describe, expect, it } from 'vitest';
import { flareEdgeFade, sunOccludedByTerrain } from '../../src/rules/sun';

describe('Matahari di permukaan', () => {
  const flat = () => 0;
  const origin = { x: 0, y: 1.5, z: 0 };
  it('Matahari tinggi tidak tertutup medan datar; di bawah horizon tertutup', () => {
    expect(sunOccludedByTerrain(flat, origin, { x: 0, y: 0.5, z: -0.87 }, 600, 20, 400)).toBe(false);
    expect(sunOccludedByTerrain(flat, origin, { x: 0, y: -0.2, z: -0.98 }, 600, 20, 400)).toBe(true);
  });
  it('bukit di depan menutupi Matahari rendah tetapi tidak Matahari yang lebih tinggi', () => {
    const hill = (x: number, z: number) => (Math.abs(z + 100) < 30 && Math.abs(x) < 50 ? 30 : 0);
    expect(sunOccludedByTerrain(hill, origin, { x: 0, y: 0.1, z: -1 }, 600, 5, 400)).toBe(true);
    expect(sunOccludedByTerrain(hill, origin, { x: 0, y: 0.6, z: -0.8 }, 600, 5, 400)).toBe(false);
  });
  it('sinar yang keluar dari peta dianggap tidak tertutup', () => {
    const wall = (x: number) => (x > 350 ? 999 : 0);
    expect(sunOccludedByTerrain(wall, origin, { x: 1, y: 0.01, z: 0 }, 600, 20, 300)).toBe(false);
  });
  it('flareEdgeFade: penuh di tengah, 0 jauh di luar bingkai, menurun monoton', () => {
    expect(flareEdgeFade(0, 0)).toBe(1);
    expect(flareEdgeFade(2, 0)).toBe(0);
    let prev = 1;
    for (let m = 0; m <= 1.6; m += 0.05) {
      const f = flareEdgeFade(m, 0);
      expect(f).toBeLessThanOrEqual(prev + 1e-12);
      prev = f;
    }
  });
});
