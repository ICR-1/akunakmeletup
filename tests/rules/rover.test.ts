import { describe, expect, it } from 'vitest';
import { forwardOf, rightOf, stepHeading } from '../../src/rules/rover';

/** Simulasikan berkendara maju lurus dengan setir konstan; kembalikan posisi relatif terhadap awal dalam kerangka kendaraan. */
function drive(steer: number, speed: number, seconds: number, reverse = false) {
  let h = 0, x = 0, z = 0;
  const start = { f: forwardOf(0), r: rightOf(0) };
  for (let i = 0; i < seconds * 60; i++) {
    h = stepHeading(h, steer, reverse ? -speed : speed, 14, 0.95, 1 / 60);
    const f = forwardOf(h);
    x += f.x * (reverse ? -speed : speed) / 60;
    z += f.z * (reverse ? -speed : speed) / 60;
  }
  return { h, ahead: x * start.f.x + z * start.f.z, right: x * start.r.x + z * start.r.z };
}

describe('kemudi Lunar Cruiser', () => {
  it('D (setir +1) belok ke kanan, A (setir -1) belok ke kiri', () => {
    expect(drive(1, 10, 3).right).toBeGreaterThan(1);
    expect(drive(-1, 10, 3).right).toBeLessThan(-1);
  });
  it('simetris: setir kanan dan kiri membelok sama besar ke sisi berlawanan', () => {
    const r = drive(1, 10, 3), l = drive(-1, 10, 3);
    expect(r.right).toBeCloseTo(-l.right, 6);
    expect(r.ahead).toBeCloseTo(l.ahead, 6);
  });
  it('tanpa gerak tidak berbelok; tanpa setir lurus', () => {
    expect(stepHeading(0.3, 1, 0, 14, 0.95, 1)).toBe(0.3);
    expect(drive(0, 10, 2).right).toBeCloseTo(0, 9);
  });
  it('mundur membalik arah belok seperti mobil sungguhan (D saat mundur menggeser belakang ke kanan)', () => {
    const back = drive(1, 10, 2, true);
    expect(back.ahead).toBeLessThan(0);
    expect(back.right).toBeGreaterThan(0);
  });
  it('vektor kanan tegak lurus maju dan berada di sisi kanan: maju +z, kanan -x', () => {
    const f = forwardOf(0), r = rightOf(0);
    expect(f.z).toBeCloseTo(1, 9);
    expect(r.x).toBeCloseTo(-1, 9);
    expect(f.x * r.x + f.z * r.z).toBeCloseTo(0, 9);
  });
});
