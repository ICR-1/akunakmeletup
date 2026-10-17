import { describe, expect, it } from 'vitest';
import { SHAKE } from '../../src/core/constants';
import { CameraShake } from '../../src/core/cameraShake';
import { createRng } from '../../src/core/rng';

describe('guncangan kamera', () => {
  it('tanpa trauma tidak ada offset', () => {
    expect(new CameraShake(createRng(1)).update(1 / 60)).toEqual([0, 0, 0]);
  });
  it('trauma menimbulkan offset terbatas yang meluruh sampai nol', () => {
    const s = new CameraShake(createRng(2));
    s.add(1);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      const [x, y, z] = s.update(1 / 60);
      peak = Math.max(peak, Math.abs(x), Math.abs(y), Math.abs(z));
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(SHAKE.maxOffset);
    expect(s.level).toBe(0);
    expect(s.update(1 / 60)).toEqual([0, 0, 0]);
  });
  it('trauma dijaga maksimal 1 dan add negatif diabaikan', () => {
    const s = new CameraShake(createRng(3));
    s.add(5);
    expect(s.level).toBe(1);
    s.add(-3);
    expect(s.level).toBe(1);
  });
  it('hold menahan level minimal walau terus meluruh', () => {
    const s = new CameraShake(createRng(4));
    for (let i = 0; i < 120; i++) { s.hold(0.3); s.update(1 / 60); }
    expect(s.level).toBeGreaterThanOrEqual(0.3 - SHAKE.decayPerSec / 60);
    s.hold(0.1);
    expect(s.level).toBeGreaterThanOrEqual(0.25);
  });
  it('deterministik untuk seed yang sama', () => {
    const run = () => { const s = new CameraShake(createRng(9)); s.add(0.8); return Array.from({ length: 20 }, () => s.update(1 / 60)); };
    expect(run()).toEqual(run());
  });
});
