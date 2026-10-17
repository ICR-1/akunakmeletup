import { describe, expect, it } from 'vitest';
import { createRng, rngRange } from '../../src/core/rng';

describe('rng', () => {
  it('seed sama menghasilkan urutan sama', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 10 }, a)).toEqual(Array.from({ length: 10 }, b));
  });
  it('seed berbeda menghasilkan urutan berbeda', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });
  it('nilai berada di [0,1) dan rngRange menghormati batas', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const x = rngRange(r, 45, 180);
      expect(x).toBeGreaterThanOrEqual(45);
      expect(x).toBeLessThan(180);
    }
  });
});
