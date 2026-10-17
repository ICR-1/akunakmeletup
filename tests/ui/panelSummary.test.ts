import { describe, expect, it } from 'vitest';
import { summarizeCounts, summarizeSelection } from '../../src/ui/panelSummary';

const items = [{ id: 'a', label: 'Panel Kecil' }, { id: 'b', label: '🔒 Panel Besar' }, { id: 'c', label: 'Baterai' }];

describe('ringkasan header akordeon', () => {
  it('pilihan eksklusif menampilkan nama item terpilih (tanpa ikon kunci)', () => {
    expect(summarizeSelection(items, 'a')).toBe('Panel Kecil');
    expect(summarizeSelection(items, 'b')).toBe('Panel Besar');
    expect(summarizeSelection(items, null)).toBe('—');
    expect(summarizeSelection(items, 'zzz')).toBe('—');
  });
  it('jumlah per item, hanya yang lebih dari nol', () => {
    const counts: Record<string, number> = { a: 2, b: 0, c: 1 };
    expect(summarizeCounts(items, (id) => counts[id])).toBe('2× Panel Kecil, 1× Baterai');
    expect(summarizeCounts(items, () => 0)).toBe('—');
  });
});
