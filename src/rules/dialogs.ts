import type { DialogLine } from './types';

/**
 * Baris dialog untuk satu urutan: id persis `prefix` atau berawalan `prefix_` (mis. beacon_moon_1,
 * beacon_moon_2), diurutkan menurut urutan di berkas data.
 */
export function linesFor(dialogs: DialogLine[], prefix: string): DialogLine[] {
  return dialogs.filter((d) => d.id === prefix || d.id.startsWith(`${prefix}_`));
}
