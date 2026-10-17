import { describe, expect, it } from 'vitest';
import { describeChoice, formatEffect, formatEffects } from '../../src/ui/effectText';
import { catalog } from '../rules/helpers';

describe('teks efek event', () => {
  it('format per jenis efek dengan satuan', () => {
    expect(formatEffect({ target: 'timeSec', delta: 45 })).toBe('Waktu +45 dtk');
    expect(formatEffect({ target: 'vehiclePower', delta: -5 })).toBe('Daya wahana −5%');
    expect(formatEffect({ target: 'oxygen', delta: -25 })).toBe('Oksigen −25');
    expect(formatEffect({ target: 'deltaVms', delta: -90 })).toBe('Delta-v −90 m/s');
    expect(formatEffect({ target: 'signal', delta: -0.4 })).toBe('Sinyal −40% selama 60 dtk');
    expect(formatEffect({ target: 'score', delta: -3 })).toBe('Skor −3');
  });
  it('daftar kosong menjadi "tidak ada dampak"', () => {
    expect(formatEffects([])).toBe('tidak ada dampak');
  });
  it('label konsekuensi dan probabilitas risiko untuk badai debu', () => {
    const e = catalog.events.find((x) => x.id === 'ev_dust_storm')!;
    const safe = describeChoice(e.choices[0]);
    expect(safe.consequence).toBe('Waktu +45 dtk, Daya wahana −5%');
    expect(safe.risk).toBeNull();
    const risky = describeChoice(e.choices[1]);
    expect(risky.consequence).toBe('tidak ada dampak');
    expect(risky.risk).toBe('Risiko gagal 50%');
    expect(risky.failImpact).toBe('Oksigen −25, Sinyal −40% selama 60 dtk');
  });
  it('setiap pilihan di events.json dapat dijelaskan tanpa teks kosong', () => {
    for (const e of catalog.events) for (const c of e.choices) {
      const d = describeChoice(c);
      expect(d.consequence.length).toBeGreaterThan(0);
      expect(d.risk !== null).toBe(c.failChance > 0);
    }
  });
});
