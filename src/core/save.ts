import { PROGRESS } from './constants';
import { defaultSave, sanitizeSave, type SaveData } from '../rules/progress';

/** Subset Storage yang dibutuhkan; memudahkan pengujian tanpa browser. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** localStorage bisa melempar (mode private, data situs diblokir); null berarti tidak tersedia. */
export function browserStorage(): StorageLike | null {
  try {
    const s = window.localStorage;
    const probe = `${PROGRESS.saveKey}.probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** Muat progres; data rusak, versi lama, atau penyimpanan tak tersedia menghasilkan progres awal. */
export function loadSave(storage: StorageLike | null): SaveData {
  if (!storage) return defaultSave();
  try {
    const raw = storage.getItem(PROGRESS.saveKey);
    return raw ? sanitizeSave(JSON.parse(raw)) : defaultSave();
  } catch {
    return defaultSave();
  }
}

/** Simpan progres; mengembalikan false jika gagal (permainan tetap berjalan tanpa penyimpanan). */
export function writeSave(storage: StorageLike | null, data: SaveData): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PROGRESS.saveKey, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}
