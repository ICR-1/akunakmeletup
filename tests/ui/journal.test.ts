import { describe, expect, it } from 'vitest';
import { journalFacts, JOURNAL_NOTE } from '../../src/ui/journalFacts';
import { catalog } from '../rules/helpers';

describe('kartu fakta jurnal misi', () => {
  it.each(catalog.destinations)('$id memuat gravitasi dan irradiansi dari data kanonik serta fakta PRD', (dest) => {
    const facts = Object.fromEntries(journalFacts(dest));
    expect(facts.Gravitasi).toBe(`${String(dest.gravity).replace('.', ',')} m/s²`);
    expect(facts['Irradiansi Matahari']).toContain('W/m²');
    expect(facts.Atmosfer).toBeTruthy();
    expect(facts['Suhu permukaan']).toBeTruthy();
    expect(facts['Jeda sinyal satu arah (asli)']).toBeTruthy();
  });
  it('angka sesuai tabel PRD', () => {
    const moon = Object.fromEntries(journalFacts(catalog.destinations.find((d) => d.id === 'moon')!));
    const mars = Object.fromEntries(journalFacts(catalog.destinations.find((d) => d.id === 'mars')!));
    expect(moon['Jeda sinyal satu arah (asli)']).toBe('sekitar 1,3 detik');
    expect(moon['Suhu permukaan']).toBe('-173 sampai 127 °C');
    expect(mars['Jeda sinyal satu arah (asli)']).toBe('3-22 menit');
    expect(mars.Atmosfer).toContain('kurang dari 1%');
  });
  it('catatan menyebut angka dibulatkan dan jeda terkompresi', () => {
    expect(JOURNAL_NOTE).toMatch(/dibulatkan/);
    expect(JOURNAL_NOTE).toMatch(/terkompresi/);
  });
});
