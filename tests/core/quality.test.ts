import { describe, expect, it } from 'vitest';
import { QUALITY } from '../../src/core/constants';
import { AdaptiveQuality } from '../../src/core/quality';

/** Jalankan frame berdurasi tetap selama `seconds`; kembalikan rasio terakhir yang diumumkan. */
function run(q: AdaptiveQuality, fps: number, seconds: number): number {
  let last = q.current;
  for (let i = 0; i < fps * seconds; i++) {
    const r = q.update(1 / fps);
    if (r !== null) last = r;
  }
  return last;
}

describe('penskala kualitas adaptif', () => {
  it('FPS di bawah 30 menurunkan rasio bertahap sampai batas minimum', () => {
    const q = new AdaptiveQuality(1);
    const r = run(q, 18, 4);
    expect(r).toBeLessThan(1);
    expect(r).toBeGreaterThanOrEqual(QUALITY.minRatio);
    expect(run(q, 10, 60)).toBe(QUALITY.minRatio);
  });
  it('FPS cukup tinggi tidak mengubah rasio', () => {
    const q = new AdaptiveQuality(1);
    expect(run(q, 40, 10)).toBe(1);
  });
  it('FPS longgar menaikkan rasio kembali, tidak melebihi rasio dasar', () => {
    const q = new AdaptiveQuality(1.5);
    run(q, 15, 10);
    const low = q.current;
    expect(low).toBeLessThan(1.5);
    run(q, 60, 60);
    expect(q.current).toBeGreaterThan(low);
    expect(q.current).toBeLessThanOrEqual(1.5);
    expect(q.current).toBe(1.5);
  });
  it('frame sangat lama (tab di latar) diabaikan dan tidak menurunkan kualitas', () => {
    const q = new AdaptiveQuality(1);
    for (let i = 0; i < 20; i++) expect(q.update(2)).toBeNull();
    expect(q.current).toBe(1);
    expect(q.update(0)).toBeNull();
  });
  it('perubahan hanya diumumkan sekali per jendela dua detik', () => {
    const q = new AdaptiveQuality(1);
    let changes = 0;
    for (let i = 0; i < 20 * 2; i++) if (q.update(1 / 20) !== null) changes++;
    expect(changes).toBe(1);
  });
  it('perangkat lemah: rasio minimum dan FPS rendah berturut-turut menandai struggling; FPS pulih mereset', () => {
    const q = new AdaptiveQuality(1);
    run(q, 12, 30);
    expect(q.current).toBe(QUALITY.minRatio);
    run(q, 12, QUALITY.windowSec * QUALITY.fallbackWindows + 2);
    expect(q.struggling).toBe(true);
    q.resetStruggle();
    expect(q.struggling).toBe(false);
    run(q, 40, QUALITY.windowSec * 2);
    expect(q.struggling).toBe(false);
  });
  it('FPS rendah tetapi rasio belum minimum tidak dianggap struggling', () => {
    const q = new AdaptiveQuality(1);
    run(q, 25, QUALITY.windowSec * 3);
    expect(q.struggling).toBe(false);
  });
});
