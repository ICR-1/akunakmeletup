import { describe, expect, it } from 'vitest';
import { runPreload, type PreloadStep } from '../../src/core/preload';

const noWait = (): Promise<void> => Promise.resolve();

describe('pemuatan awal (eager loading)', () => {
  it('menjalankan semua langkah berurutan dan melaporkan progres 0 sampai 1 sesuai bobot', async () => {
    const order: string[] = [];
    const steps: PreloadStep[] = [
      { label: 'a', weight: 1, run: () => order.push('a') },
      { label: 'b', weight: 3, run: () => order.push('b') },
    ];
    const seen: [number, string][] = [];
    const errors = await runPreload(steps, (f, l) => seen.push([f, l]), noWait);
    expect(errors).toEqual([]);
    expect(order).toEqual(['a', 'b']);
    expect(seen[0][0]).toBe(0);
    expect(seen.find(([, l]) => l === 'b')![0]).toBeCloseTo(0.25, 6);
    expect(seen[seen.length - 1][0]).toBe(1);
    for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThanOrEqual(seen[i - 1][0]);
  });

  it('langkah yang gagal dicatat tetapi tidak menghentikan langkah lain', async () => {
    const order: string[] = [];
    const steps: PreloadStep[] = [
      { label: 'x', weight: 1, run: () => { throw new Error('rusak'); } },
      { label: 'y', weight: 1, run: () => order.push('y') },
    ];
    const errors = await runPreload(steps, () => undefined, noWait);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('rusak');
    expect(order).toEqual(['y']);
  });

  it('memberi kesempatan menggambar (yield) sebelum setiap langkah berat', async () => {
    let yields = 0;
    const steps: PreloadStep[] = [1, 2, 3].map((n) => ({ label: `s${n}`, weight: 1, run: () => undefined }));
    await runPreload(steps, () => undefined, () => { yields += 1; return Promise.resolve(); });
    expect(yields).toBeGreaterThanOrEqual(steps.length);
  });

  it('daftar kosong langsung selesai tanpa pembagian nol', async () => {
    const seen: number[] = [];
    await runPreload([], (f) => seen.push(f), noWait);
    expect(seen[seen.length - 1]).toBe(1);
  });
});
