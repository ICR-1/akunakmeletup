import { RELAY_ANTENNA_ID } from '../core/constants';
import { moduleCount, setExclusive, setFuelFraction, setModuleCount } from '../core/missionBuilder';
import { preflight, type IndicatorKey } from './preflight';
import type { Catalog, MissionConfig, Module } from './types';

/**
 * "Bagaimana jika": perubahan satu langkah pada rakitan yang dipakai dan dampaknya ke lima indikator. Murni dan
 * deterministik; dipakai layar Review agar pemain melihat bagaimana tiap pilihan membentuk keberhasilan misi.
 */
export interface IndicatorChange { key: IndicatorKey; from: number; to: number }

export interface Suggestion {
  id: string;
  /** Kata kunci perubahan untuk teks (diisi pemanggil lewat `describe`). */
  kind: 'fuel_up' | 'fuel_down' | 'add_module' | 'swap_module';
  moduleName?: string;
  fuelFrom?: number;
  fuelTo?: number;
  config: MissionConfig;
  changes: IndicatorChange[];
  costDeltaMusd: number;
  go: boolean;
}

export const FUEL_STEP = 0.1;
const KEYS: IndicatorKey[] = ['budget', 'mass', 'deltaV', 'power', 'comms'];
/** Perubahan margin di bawah ambang ini tidak ditampilkan (derau). */
const MIN_CHANGE = 0.005;

const byKind = (catalog: Catalog, kind: Module['kind']): Module[] => catalog.modules.filter((m) => m.kind === kind);

function candidates(config: MissionConfig, catalog: Catalog): Omit<Suggestion, 'changes' | 'costDeltaMusd' | 'go'>[] {
  const out: Omit<Suggestion, 'changes' | 'costDeltaMusd' | 'go'>[] = [];
  const fuel = config.fuelFraction ?? 1;
  if (fuel + FUEL_STEP <= 1 + 1e-9) {
    out.push({ id: 'fuel_up', kind: 'fuel_up', fuelFrom: fuel, fuelTo: Math.min(1, fuel + FUEL_STEP), config: setFuelFraction(config, fuel + FUEL_STEP) });
  }
  if (fuel - FUEL_STEP >= 0) {
    out.push({ id: 'fuel_down', kind: 'fuel_down', fuelFrom: fuel, fuelTo: fuel - FUEL_STEP, config: setFuelFraction(config, fuel - FUEL_STEP) });
  }
  // Tambah satu modul yang boleh berjumlah banyak
  for (const kind of ['solar', 'battery', 'tank'] as const) {
    for (const m of byKind(catalog, kind)) {
      const n = moduleCount(config, m.id);
      out.push({ id: `add_${m.id}`, kind: 'add_module', moduleName: m.name, config: setModuleCount(config, catalog, m.id, n + 1) });
    }
  }
  const relay = catalog.modules.find((m) => m.id === RELAY_ANTENNA_ID);
  if (relay && moduleCount(config, relay.id) === 0) {
    out.push({ id: `add_${relay.id}`, kind: 'add_module', moduleName: relay.name, config: setModuleCount(config, catalog, relay.id, 1) });
  }
  // Ganti ke varian lain pada grup eksklusif: mesin, lander, antena utama
  for (const kind of ['engine', 'lander'] as const) {
    const group = byKind(catalog, kind);
    for (const m of group) {
      if (moduleCount(config, m.id) > 0) continue;
      out.push({
        id: `swap_${m.id}`, kind: 'swap_module', moduleName: m.name,
        config: setExclusive(config, catalog, group.map((g) => g.id), m.id),
      });
    }
  }
  const antennas = byKind(catalog, 'antenna').filter((m) => m.id !== RELAY_ANTENNA_ID);
  for (const m of antennas) {
    if (moduleCount(config, m.id) > 0) continue;
    out.push({
      id: `swap_${m.id}`, kind: 'swap_module', moduleName: m.name,
      config: setExclusive(config, catalog, antennas.map((a) => a.id), m.id),
    });
  }
  return out;
}

/**
 * Saran terbaik: perubahan satu langkah yang memperbaiki indikator paling lemah tanpa merusak aturan perakitan atau
 * membuat indikator lain menjadi merah. Diurutkan dari perbaikan terbesar pada indikator paling lemah.
 */
export function suggestChanges(config: MissionConfig, catalog: Catalog, requireObjectives = true, max = 3): Suggestion[] {
  const base = preflight(config, catalog, requireObjectives);
  const baseMargins = Object.fromEntries(KEYS.map((k) => [k, base.indicators[k].margin])) as Record<IndicatorKey, number>;
  const weakest = KEYS.reduce((w, k) => (baseMargins[k] < baseMargins[w] ? k : w), KEYS[0]);
  const scored: { s: Suggestion; gain: number; fixes: number }[] = [];
  for (const cand of candidates(config, catalog)) {
    const r = preflight(cand.config, catalog, requireObjectives);
    if (r.assemblyErrors.length > 0) continue;
    const newRed = KEYS.some((k) => r.indicators[k].status === 'red' && base.indicators[k].status !== 'red');
    if (newRed) continue;
    const changes: IndicatorChange[] = KEYS
      .map((key) => ({ key, from: baseMargins[key], to: r.indicators[key].margin }))
      .filter((c) => Math.abs(c.to - c.from) >= MIN_CHANGE);
    const gain = r.indicators[weakest].margin - baseMargins[weakest];
    const fixes = KEYS.filter((k) => base.indicators[k].status === 'red' && r.indicators[k].status !== 'red').length;
    if (gain < MIN_CHANGE && fixes === 0) continue;
    scored.push({
      s: { ...cand, changes, costDeltaMusd: r.metrics.totalCostMusd - base.metrics.totalCostMusd, go: r.go },
      gain, fixes,
    });
  }
  scored.sort((a, b) => b.fixes - a.fixes || b.gain - a.gain || a.s.costDeltaMusd - b.s.costDeltaMusd || (a.s.id < b.s.id ? -1 : 1));
  // Satu saran per jenis (hindari tiga varian tangki berurutan)
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const { s } of scored) {
    const group = s.id.startsWith('add_') ? `add:${s.moduleName?.split(' ')[0]}` : s.kind;
    if (seen.has(group)) continue;
    seen.add(group);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Indikator dengan margin terendah pada rakitan ini. */
export function weakestIndicator(config: MissionConfig, catalog: Catalog, requireObjectives = true): IndicatorKey {
  const r = preflight(config, catalog, requireObjectives);
  return KEYS.reduce((w, k) => (r.indicators[k].margin < r.indicators[w].margin ? k : w), KEYS[0]);
}
