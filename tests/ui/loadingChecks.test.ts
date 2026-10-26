import { describe, expect, it } from 'vitest';
import { checksDone } from '../../src/ui/loading';

describe('poll GO/NO-GO layar memuat', () => {
  it('pemeriksaan menyala bertahap per seperempat, yang terakhir tepat di 100%', () => {
    expect(checksDone(0, 4)).toBe(0);
    expect(checksDone(0.24, 4)).toBe(0);
    expect(checksDone(0.25, 4)).toBe(1);
    expect(checksDone(0.74, 4)).toBe(2);
    expect(checksDone(0.99, 4)).toBe(3);
    expect(checksDone(1, 4)).toBe(4);
  });
  it('nilai di luar [0, 1] dijepit', () => {
    expect(checksDone(-1, 4)).toBe(0);
    expect(checksDone(2, 4)).toBe(4);
  });
});
