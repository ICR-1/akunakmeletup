import { describe, expect, it } from 'vitest';
import { padSmokeStrength, SMOKE_FADE_IN_SEC, smokeAlpha, smokeHeat, smokeSize, trailStrength } from '../../src/gen/smoke';

describe('asap peluncuran (fungsi murni)', () => {
  it('gumpalan mekar dari s0 ke s1, cepat di awal lalu melambat', () => {
    expect(smokeSize(0, 10, 2, 12)).toBe(2);
    expect(smokeSize(10, 10, 2, 12)).toBe(12);
    expect(smokeSize(20, 10, 2, 12)).toBe(12);
    const early = smokeSize(2, 10, 2, 12) - smokeSize(0, 10, 2, 12);
    const late = smokeSize(10, 10, 2, 12) - smokeSize(8, 10, 2, 12);
    expect(early).toBeGreaterThan(late);
  });

  it('opasitas muncul cepat, pekat di tengah, lalu habis di akhir umur dan selalu di [0, 1]', () => {
    expect(smokeAlpha(0, 8)).toBe(0);
    expect(smokeAlpha(SMOKE_FADE_IN_SEC, 8)).toBe(1);
    expect(smokeAlpha(3, 8)).toBe(1);
    expect(smokeAlpha(8, 8)).toBe(0);
    for (let a = 0; a <= 10; a += 0.25) {
      const v = smokeAlpha(a, 8);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('pendar api pada asap meredup seiring umur', () => {
    expect(smokeHeat(0)).toBe(1);
    expect(smokeHeat(1)).toBeLessThan(smokeHeat(0.2));
    expect(smokeHeat(-1)).toBe(1);
  });

  it('awan landasan mengikuti throttle dan berhenti setelah roket cukup tinggi', () => {
    expect(padSmokeStrength(0, 0, 20)).toBe(0);
    expect(padSmokeStrength(1, 0, 20)).toBe(1);
    expect(padSmokeStrength(0.5, 0, 20)).toBe(0.5);
    expect(padSmokeStrength(1, 10, 20)).toBeLessThan(1);
    expect(padSmokeStrength(1, 20, 20)).toBe(0);
    expect(padSmokeStrength(1, 50, 20)).toBe(0);
  });

  it('jejak asap tebal di udara bawah dan hilang saat udara menipis', () => {
    expect(trailStrength(0)).toBe(1);
    expect(trailStrength(0.22)).toBe(1);
    expect(trailStrength(0.4)).toBeGreaterThan(0);
    expect(trailStrength(0.4)).toBeLessThan(1);
    expect(trailStrength(0.6)).toBe(0);
    expect(trailStrength(1)).toBe(0);
  });
});
