import { describe, expect, it } from 'vitest';
import { defaultMission, setExclusive, setModuleCount, toggleInstrument } from '../../src/core/missionBuilder';
import { barFill, formatMargin } from '../../src/ui/hud';
import { novaWarnings } from '../../src/ui/warnings';
import { preflight } from '../../src/rules/preflight';
import { catalog } from '../rules/helpers';

const warn = (c: ReturnType<typeof defaultMission>) => novaWarnings(preflight(c, catalog), c, catalog);

describe('peringatan NOVA', () => {
  it('rakitan Go dengan margin tipis memberi peringatan margin', () => {
    expect(warn(defaultMission('moon'))).toEqual([expect.stringMatching(/Margin tipis/)]);
  });
  it('objektif wajib tanpa instrumen disebut lengkap dengan nama instrumen', () => {
    const c = toggleInstrument(defaultMission('moon'), catalog, 'sample_drill');
    expect(warn(c).join(' ')).toMatch(/Ambil sampel regolit.*Bor Sampel/);
  });
  it('daya merah menyebut malam planet', () => {
    const c = setModuleCount(defaultMission('moon'), catalog, 'battery_m', 0);
    expect(warn(c).join(' ')).toMatch(/malam planet/);
  });
  it('aturan perakitan dilaporkan', () => {
    const c = setExclusive(defaultMission('moon'), catalog, ['lander_s', 'lander_m'], null);
    expect(warn(c)).toContain('Pasang tepat 1 lander.');
  });
  it('massa melebihi muatan roket', () => {
    const c = { ...defaultMission('moon'), fuelFraction: 1 };
    expect(warn(c).join(' ')).toMatch(/melebihi muatan maksimum/);
  });
});

describe('format indikator', () => {
  it('formatMargin menangani nol, tak hingga, dan nilai besar', () => {
    expect(formatMargin(0.082)).toBe('8%');
    expect(formatMargin(Infinity)).toBe('∞');
    expect(formatMargin(-Infinity)).toBe('-∞');
    expect(formatMargin(12.3)).toBe('>999%');
  });
  it('barFill dijaga di rentang bar', () => {
    expect(barFill(-5)).toBe(0.04);
    expect(barFill(0.1)).toBeCloseTo(0.6, 10);
    expect(barFill(10)).toBe(1);
  });
});
