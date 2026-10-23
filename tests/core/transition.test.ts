import { describe, expect, it } from 'vitest';
import { SceneTransition } from '../../src/core/transition';
import type { SceneId } from '../../src/core/constants';

function run(tr: SceneTransition, steps: number, onStep?: (i: number) => void) {
  const out: { switchTo: SceneId | null; opacity: number }[] = [];
  for (let i = 1; i <= steps; i++) {
    onStep?.(i);
    out.push(tr.update(0.05));
  }
  return out;
}

describe('SceneTransition', () => {
  it('berganti tepat sekali pada langkah ke-4 lalu kembali ke 0 setelah langkah ke-8', () => {
    const tr = new SceneTransition(0.2);
    tr.request('design');
    expect(tr.busy).toBe(true);
    const r = run(tr, 8);
    const sw = r.map((x, i) => (x.switchTo ? i + 1 : 0)).filter(Boolean);
    expect(sw).toEqual([4]);
    expect(r[3].switchTo).toBe('design');
    expect(r[3].opacity).toBe(1);
    expect(r[7].opacity).toBe(0);
    expect(tr.busy).toBe(false);
  });

  it('request saat memudar hanya mengganti tujuan', () => {
    const tr = new SceneTransition(0.2);
    tr.request('design');
    const r = run(tr, 8, (i) => {
      if (i === 3) tr.request('flight');
    });
    expect(r.map((x) => x.switchTo).filter(Boolean)).toEqual(['flight']);
  });

  it('tanpa request tidak melakukan apa pun', () => {
    const tr = new SceneTransition(0.2);
    expect(tr.update(0.05)).toEqual({ switchTo: null, opacity: 0 });
    expect(tr.busy).toBe(false);
  });

  it('fadeSec 0 berganti pada update pertama dengan opacity 0', () => {
    const tr = new SceneTransition(0);
    tr.request('review');
    expect(tr.update(0.016)).toEqual({ switchTo: 'review', opacity: 0 });
    expect(tr.busy).toBe(false);
  });

  it('cancel membatalkan perpindahan tertunda', () => {
    const tr = new SceneTransition(0.2);
    tr.request('design');
    tr.update(0.05);
    tr.cancel();
    expect(run(tr, 8).every((x) => x.switchTo === null)).toBe(true);
  });
});
