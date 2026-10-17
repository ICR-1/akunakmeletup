import type { Id } from '../rules/types';

export interface SummaryItem { id: Id; label: string }

const NONE = '—';

/** Ringkasan satu pilihan eksklusif untuk header akordeon (nama item terpilih). */
export function summarizeSelection(items: SummaryItem[], selected: Id | null): string {
  return items.find((i) => i.id === selected)?.label.replace(/^🔒\s*/, '') ?? NONE;
}

/** Ringkasan jumlah per item, mis. "2× Panel Surya Sedang, 1× Baterai Kecil". */
export function summarizeCounts(items: SummaryItem[], getCount: (id: Id) => number): string {
  const parts = items.filter((i) => getCount(i.id) > 0).map((i) => `${getCount(i.id)}× ${i.label}`);
  return parts.length > 0 ? parts.join(', ') : NONE;
}
