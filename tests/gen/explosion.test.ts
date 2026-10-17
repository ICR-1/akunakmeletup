import { describe, expect, it } from 'vitest';
import { EXPLOSION, stepBallistic } from '../../src/gen/explosion';

describe('serpihan ledakan (balistik)', () => {
  it('jatuh dipercepat gravitasi, memantul kecil, lalu berhenti di tanah', () => {
    const pos = { x: 0, y: 10, z: 0 }, vel = { x: 8, y: 12, z: -4 };
    let landed = false, steps = 0, maxY = 0;
    while (!landed && steps < 3000) {
      landed = stepBallistic(pos, vel, EXPLOSION.gravity, 0, 1 / 60).landed;
      maxY = Math.max(maxY, pos.y);
      steps++;
    }
    expect(landed).toBe(true);
    expect(pos.y).toBe(0);
    expect(maxY).toBeGreaterThan(10);
    expect(Math.abs(vel.x)).toBeLessThan(0.5);
    // x bergerak maju selama melayang
    expect(pos.x).toBeGreaterThan(5);
  });
  it('tidak pernah menembus tanah dan kecepatan vertikal awal naik menurun karena gravitasi', () => {
    const pos = { x: 0, y: 0.1, z: 0 }, vel = { x: 0, y: 5, z: 0 };
    stepBallistic(pos, vel, EXPLOSION.gravity, 0, 0.1);
    expect(vel.y).toBeLessThan(5);
    for (let i = 0; i < 600; i++) {
      stepBallistic(pos, vel, EXPLOSION.gravity, 0, 1 / 60);
      expect(pos.y).toBeGreaterThanOrEqual(0);
    }
  });
});
