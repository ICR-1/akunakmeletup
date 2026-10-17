import { describe, expect, it } from 'vitest';
import rockets from '../../data/rockets.json';
import modules from '../../data/modules.json';
import instruments from '../../data/instruments.json';
import destinations from '../../data/destinations.json';
import events from '../../data/events.json';
import dialogs from '../../data/dialogs.json';
import { DataValidationError, validateCatalog } from '../../src/rules/schemaValidator';

type Raw = Record<string, any[]>; // eslint-disable-line @typescript-eslint/no-explicit-any
const raw = (): Raw => structuredClone({ rockets, modules, instruments, destinations, events, dialogs }) as Raw;
const issuesOf = (r: Raw): string[] => {
  try {
    validateCatalog(r as never);
  } catch (e) {
    expect(e).toBeInstanceOf(DataValidationError);
    return (e as DataValidationError).issues;
  }
  return [];
};

describe('validateCatalog', () => {
  it('data kanonik valid dan lengkap', () => {
    const c = validateCatalog(raw() as never);
    expect(c.rockets.map((r) => r.stages.length)).toEqual([2, 3, 4]);
    expect(c.destinations.map((d) => d.id)).toEqual(['moon', 'mars']);
    expect(c.events).toHaveLength(9);
  });
  it('menyebut path yang salah', () => {
    const r = raw();
    r.rockets[1].payloadToLeoKg = 'banyak';
    expect(issuesOf(r)).toEqual(['rockets[1].payloadToLeoKg: harus berupa angka']);
  });
  it('stat wajib per jenis modul', () => {
    const r = raw();
    delete r.modules.find((m: { id: string }) => m.id === 'eng_eff').stats.ispS;
    expect(issuesOf(r).join('\n')).toMatch(/modules\[6\]\.stats\.ispS/);
  });
  it('id duplikat dan jenis tak dikenal', () => {
    const r = raw();
    r.modules[1].id = r.modules[0].id;
    r.modules[2].kind = 'warp';
    const text = issuesOf(r).join('\n');
    expect(text).toMatch(/modules\[1\]\.id: duplikat/);
    expect(text).toMatch(/modules\[2\]\.kind: harus salah satu dari/);
  });
  it('referensi silang: instrumen, event, minigame', () => {
    const r = raw();
    r.destinations[0].objectives[0].instrumentId = 'hantu';
    r.destinations[0].eventIds.push('ev_tidak_ada');
    r.destinations[1].eventIds.push('ev_solar_flare');
    r.destinations[0].minigameIds.push('game_hantu');
    const text = issuesOf(r).join('\n');
    expect(text).toMatch(/instrumen "hantu" tidak ada/);
    expect(text).toMatch(/event "ev_tidak_ada" tidak ada/);
    expect(text).toMatch(/event "ev_solar_flare" milik destinasi lain/);
    expect(text).toMatch(/minigame "game_hantu"/);
  });
  it('event: minigameId pilihan harus minigame event yang dikenal', () => {
    const r = raw();
    const ev = r.events.find((e: { id: string }) => e.id === 'ev_dust_on_panels');
    ev.choices[0].minigameId = 'game_hantu';
    expect(issuesOf(r).join('\n')).toMatch(/minigame event "game_hantu" tidak dikenal/);
  });
  it('event: failChance di luar [0,1] dan efek tak dikenal', () => {
    const r = raw();
    r.events[0].choices[1].failChance = 1.5;
    r.events[0].choices[0].effects[0].target = 'gold';
    const text = issuesOf(r).join('\n');
    expect(text).toMatch(/events\[0\]\.choices\[1\]\.failChance/);
    expect(text).toMatch(/events\[0\]\.choices\[0\]\.effects\[0\]\.target/);
  });
  it('struktur salah: bukan array, warna palet buruk', () => {
    const r = raw();
    (r as Record<string, unknown>).dialogs = {};
    r.destinations[0].palette[0] = 'abu-abu';
    const text = issuesOf(r).join('\n');
    expect(text).toMatch(/dialogs: harus berupa array/);
    expect(text).toMatch(/palette\[0\]: harus warna hex/);
  });
  it('mengumpulkan semua masalah sekaligus dengan pesan jelas', () => {
    const r = raw();
    r.rockets[0].costMusd = -1;
    r.instruments[0].dataUnits = 'x';
    expect(() => validateCatalog(r as never)).toThrow(/Data tidak valid \(2 masalah\)/);
  });
});
