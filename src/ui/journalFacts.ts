import type { Destination } from '../rules/types';

/**
 * Fakta destinasi untuk jurnal misi, hanya dari PRD bagian 9 dan 10 (angka dibulatkan). Gravitasi dan
 * irradiansi dibaca dari data kanonik; sisanya tabel PRD.
 */
const STATIC_FACTS: Record<string, { atmosphere: string; temperature: string; signalDelay: string }> = {
  moon: { atmosphere: 'Hampir tidak ada', temperature: '-173 sampai 127 °C', signalDelay: 'sekitar 1,3 detik' },
  mars: { atmosphere: 'Tipis, CO₂, kurang dari 1% tekanan Bumi', temperature: 'Rata-rata sekitar -63 °C', signalDelay: '3-22 menit' },
};

export const JOURNAL_NOTE = 'Angka dibulatkan dari data NASA; irradiansi dan jeda sinyal berupa perkiraan. Jeda sinyal ditampilkan terkompresi di game agar tetap enak dimainkan.';

export function journalFacts(dest: Destination): [string, string][] {
  const fixed = STATIC_FACTS[dest.id];
  const facts: [string, string][] = [
    ['Gravitasi', `${String(dest.gravity).replace('.', ',')} m/s²`],
  ];
  if (fixed) facts.push(['Atmosfer', fixed.atmosphere], ['Suhu permukaan', fixed.temperature]);
  facts.push(['Irradiansi Matahari', `sekitar ${dest.solarIrradianceWm2.toLocaleString('id-ID')} W/m²`]);
  if (fixed) facts.push(['Jeda sinyal satu arah (asli)', fixed.signalDelay]);
  return facts;
}
