import { describe, expect, it } from 'vitest';
import { loadSave, writeSave, type StorageLike } from '../../src/core/save';
import { PROGRESS } from '../../src/core/constants';
import { defaultMission } from '../../src/core/missionBuilder';
import { defaultSave, isUnlocked, missionSucceeded, modeRules, nextDestinationId, recordMission, sanitizeSave, selectableDestinationIds, suggestedDestinationIndex } from '../../src/rules/progress';
import type { MissionOutcome } from '../../src/rules/missionResult';
import { computeScore, type ScoreInput } from '../../src/rules/score';
import { linesFor } from '../../src/rules/dialogs';
import { earnedMedals, explainScore, mainCauses, MEDALS, sectionsForCodes } from '../../src/rules/review';
import { catalog } from '../rules/helpers';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string): string | null { return this.data.get(k) ?? null; }
  setItem(k: string, v: string): void { this.data.set(k, v); }
}
const throwing: StorageLike = {
  getItem: () => { throw new Error('diblokir'); },
  setItem: () => { throw new Error('penuh'); },
};

const base: ScoreInput = {
  uplinkU: 1, requiredDone: 2, requiredTotal: 2, minigameScores: [1, 1], budgetMargin: 0.2, massMargin: 0.2, powerMargin: 0.2,
  touchdownFactor: 1, faintCount: 0, instrumentsLost: 0, lateStageCount: 0, bonusObjectivesDone: 0, eventsHandledWell: 0, failed: false,
};
const outcome = (over: Partial<ScoreInput> = {}): MissionOutcome => ({ score: computeScore({ ...base, ...over }), codes: [] });

describe('penyimpanan localStorage', () => {
  it('bolak-balik: data yang ditulis dimuat kembali sama (progres tersimpan setelah refresh)', () => {
    const storage = new MemoryStorage();
    const rec = recordMission(defaultSave(), catalog.destinations, 'moon', outcome(), ['smooth']);
    expect(writeSave(storage, rec.save)).toBe(true);
    expect(loadSave(storage)).toEqual(rec.save);
  });
  it('tanpa penyimpanan, atau penyimpanan yang melempar: tidak crash dan kembali ke progres awal', () => {
    expect(loadSave(null)).toEqual(defaultSave());
    expect(loadSave(throwing)).toEqual(defaultSave());
    expect(writeSave(null, defaultSave())).toBe(false);
    expect(writeSave(throwing, defaultSave())).toBe(false);
  });
  it('data rusak atau versi lama diabaikan', () => {
    const s = new MemoryStorage();
    s.setItem(PROGRESS.saveKey, '{bukan json');
    expect(loadSave(s)).toEqual(defaultSave());
    s.setItem(PROGRESS.saveKey, JSON.stringify({ version: 0, sciencePoints: 999 }));
    expect(loadSave(s)).toEqual(defaultSave());
  });
  it('bidang tak valid dibersihkan, Bulan selalu terbuka, volume dijepit', () => {
    const s = sanitizeSave({ version: 1, unlocked: ['mars'], stars: { moon: 'tiga' }, sciencePoints: -5, volume: 9, muted: true });
    expect(s.unlocked).toEqual(['moon', 'mars']);
    expect(s.stars).toEqual({});
    expect(s.sciencePoints).toBe(0);
    expect(s.volume).toBe(1);
    expect(s.muted).toBe(true);
    expect(sanitizeSave(null)).toEqual(defaultSave());
  });
});

describe('progres cerita', () => {
  it('awal: hanya Bulan terbuka', () => {
    const s = defaultSave();
    expect(isUnlocked(s, 'moon')).toBe(true);
    expect(isUnlocked(s, 'mars')).toBe(false);
  });
  it('menyelesaikan misi Bulan membuka Mars, memberi poin sains dan Beacon Bulan', () => {
    const o = outcome();
    expect(missionSucceeded(o)).toBe(true);
    const r = recordMission(defaultSave(), catalog.destinations, 'moon', o, []);
    expect(r.newlyUnlocked).toBe('mars');
    expect(isUnlocked(r.save, 'mars')).toBe(true);
    expect(r.newBeacon).toBe('beacon_moon');
    expect(r.save.beacons).toEqual(['beacon_moon']);
    expect(r.pointsEarned).toBe(o.score.sciencePoints);
    expect(r.save.sciencePoints).toBe(o.score.sciencePoints);
    expect(r.save.stars.moon).toBe(o.score.stars);
  });
  it('misi gagal tidak membuka Mars dan tidak memberi poin atau Beacon', () => {
    const fail = outcome({ failed: true });
    expect(missionSucceeded(fail)).toBe(false);
    const r = recordMission(defaultSave(), catalog.destinations, 'moon', fail, []);
    expect(r.newlyUnlocked).toBeNull();
    expect(r.newBeacon).toBeNull();
    expect(r.pointsEarned).toBe(0);
    expect(isUnlocked(r.save, 'mars')).toBe(false);
  });
  it('mengulang misi: bintang dan skor hanya naik, Beacon tidak ganda, poin menumpuk', () => {
    const good = outcome();
    const worse = outcome({ uplinkU: 0.5, minigameScores: [0.3, 0.3] });
    let s = recordMission(defaultSave(), catalog.destinations, 'moon', good, []).save;
    const again = recordMission(s, catalog.destinations, 'moon', worse, []);
    expect(again.newBeacon).toBeNull();
    expect(again.newlyUnlocked).toBeNull();
    expect(again.save.stars.moon).toBe(good.score.stars);
    expect(again.save.bestScore.moon).toBe(Math.round(good.score.total));
    expect(again.save.sciencePoints).toBe(good.score.sciencePoints + worse.score.sciencePoints);
    s = again.save;
    expect(s.beacons).toHaveLength(1);
  });
  it('Mars adalah destinasi terakhir MVP: tidak membuka apa pun setelahnya', () => {
    expect(nextDestinationId(catalog.destinations, 'moon')).toBe('mars');
    expect(nextDestinationId(catalog.destinations, 'mars')).toBeNull();
    const r = recordMission(defaultSave(), catalog.destinations, 'mars', outcome(), []);
    expect(r.newlyUnlocked).toBeNull();
    expect(r.newBeacon).toBe('beacon_mars');
  });
  it('alur Story Mode: Bulan lalu Mars tersimpan dan terbaca setelah muat ulang', () => {
    const storage = new MemoryStorage();
    let s = loadSave(storage);
    s = recordMission(s, catalog.destinations, 'moon', outcome(), []).save;
    writeSave(storage, s);
    s = loadSave(storage);
    expect(isUnlocked(s, 'mars')).toBe(true);
    s = recordMission(s, catalog.destinations, 'mars', outcome(), []).save;
    writeSave(storage, s);
    expect(loadSave(storage).beacons).toEqual(['beacon_moon', 'beacon_mars']);
  });
});

describe('review: penyebab, bagian desain, medali', () => {
  it('maksimal dua penyebab utama sesuai urutan prioritas', () => {
    expect(mainCauses(['LOW_FUEL', 'NIGHT_POWER', 'OXYGEN_OUT'])).toEqual(['LOW_FUEL', 'NIGHT_POWER']);
    expect(mainCauses([])).toEqual([]);
  });
  it('kode penyebab menandai bagian desain yang relevan', () => {
    expect(sectionsForCodes(['NIGHT_POWER'])).toEqual(['battery', 'solar', 'rtg']);
    expect(sectionsForCodes(['LOW_COMMS'])).toEqual(['antenna', 'relay']);
    expect(sectionsForCodes(['OXYGEN_OUT'])).toEqual([]);
    expect(new Set(sectionsForCodes(['LOW_FUEL', 'OVER_MARGIN_TIGHT'])).size).toBe(sectionsForCodes(['LOW_FUEL', 'OVER_MARGIN_TIGHT']).length);
  });
  const flight = { failed: false, failCodes: [], flightQuality: 1, errorFraction: 0, lateStageCount: 0, touchdown: 'perfect' as const, touchdownFactor: 1, instrumentsLost: [], fuelRemainingKg: 1, eventsHandledWell: 0, handledEventIds: [] };
  const surface = { completedObjectives: [], minigameScores: {}, faintCount: 0, nightPowerOut: false, uplinkU: 1, eventsHandledWell: 1, handledEventIds: ['ev_dust_storm'], scoreAdjust: 0, timeSec: 100 };
  it('medali: Misi Hemat, Pendarat Mulus, Selamat dari Badai', () => {
    expect(earnedMedals({ outcome: outcome(), flight, surface, budgetMargin: 0.2 }).sort()).toEqual(['frugal', 'smooth', 'storm']);
    expect(earnedMedals({ outcome: outcome(), flight: { ...flight, touchdown: 'success' }, surface: { ...surface, handledEventIds: [] }, budgetMargin: 0.05 })).toEqual([]);
    expect(earnedMedals({ outcome: outcome({ failed: true }), flight, surface, budgetMargin: 0.2 })).toEqual([]);
    expect(MEDALS.frugal.name).toBe('Misi Hemat');
  });
  it('penjelasan skor memuat masukan tiap komponen', () => {
    const e = explainScore({ uplinkU: 1.4, requiredDone: 1, requiredTotal: 2, minigameScores: [1, 0.5], budgetMargin: 0.1, massMargin: 0.05, powerMargin: 0.3, flight, faintCount: 2, bonusDone: 1, goodEvents: 2 });
    expect(e.science).toEqual({ uplinkU: 1, requiredDone: 1, requiredTotal: 2, minigameAvg: 0.75 });
    expect(e.safety.faints).toBe(2);
    expect(e.bonus).toEqual({ objectives: 1, goodEvents: 2 });
    expect(explainScore({ ...{ uplinkU: 0, requiredDone: 0, requiredTotal: 0, minigameScores: [], budgetMargin: 0, massMargin: 0, powerMargin: 0, flight, faintCount: 0, bonusDone: 0, goodEvents: 0 } }).science.minigameAvg).toBe(0);
  });
});

describe('dialog cerita', () => {
  it('urutan dialog dicari menurut awalan id dan tetap berurutan', () => {
    const intro = linesFor(catalog.dialogs, 'intro');
    expect(intro.length).toBeGreaterThanOrEqual(3);
    expect(intro.map((d) => d.id)).toEqual(['intro_1', 'intro_2', 'intro_3', 'intro_4']);
    expect(linesFor(catalog.dialogs, 'tidak_ada')).toEqual([]);
  });
  it('briefing, Beacon, dan penutup tersedia untuk Bulan dan Mars', () => {
    for (const p of ['briefing_moon', 'briefing_mars', 'beacon_moon', 'beacon_mars', 'end', 'tutorial', 'nova_flight_start', 'nova_landing', 'nova_surface_moon', 'nova_surface_mars']) {
      expect(linesFor(catalog.dialogs, p).length, p).toBeGreaterThan(0);
    }
  });
  it('briefing Bulan tidak ikut memuat briefing Mars', () => {
    expect(linesFor(catalog.dialogs, 'briefing_moon').every((d) => d.id.startsWith('briefing_moon'))).toBe(true);
  });
  it('pembicara hanya NOVA, Dr. Sekar, Ground Control, dan Beacon; teks berbahasa Indonesia tidak kosong', () => {
    for (const d of catalog.dialogs) {
      expect(['nova', 'sekar', 'ground', 'beacon']).toContain(d.speaker);
      expect(d.text.length).toBeGreaterThan(10);
    }
  });
  it('misi baru dengan konfigurasi bawaan tersedia', () => {
    expect(defaultMission('mars').destinationId).toBe('mars');
  });
});

describe('pengaturan visual tersimpan', () => {
  it('bayangan nonaktif secara default dan hanya true yang diterima', () => {
    expect(defaultSave().shadows).toBe(false);
    expect(sanitizeSave({ version: 1, shadows: true }).shadows).toBe(true);
    expect(sanitizeSave({ version: 1, shadows: 'ya' }).shadows).toBe(false);
    expect(defaultSave().detail).toBe('high');
    expect(defaultSave().music).toBe(true);
    expect(sanitizeSave({ version: 1, music: false }).music).toBe(false);
    expect(sanitizeSave({ version: 1, music: 'x' }).music).toBe(true);
    expect(sanitizeSave({ version: 1, detail: 'low' }).detail).toBe('low');
    expect(sanitizeSave({ version: 1, detail: 'ultra' }).detail).toBe('high');
  });
  it('skala teks dibulatkan dan dijepit ke tingkat yang tersedia', () => {
    expect(sanitizeSave({ version: 1, textScale: 9 }).textScale).toBe(2);
    expect(sanitizeSave({ version: 1, textScale: -4 }).textScale).toBe(0);
    expect(sanitizeSave({ version: 1, textScale: 1.4 }).textScale).toBe(1);
  });
});

describe('mode Free Design', () => {
  it('aturan mode: Cerita mencatat progres dan butuh instrumen wajib; Free tidak', () => {
    expect(modeRules('story')).toEqual({ allUnlocked: false, recordsProgress: true, storyDialogs: true, requireObjectives: true });
    expect(modeRules('free')).toEqual({ allUnlocked: true, recordsProgress: false, storyDialogs: false, requireObjectives: false });
  });
  it('destinasi: Cerita mengikuti progres, Free membuka semua destinasi MVP', () => {
    const save = defaultSave();
    const mvp = catalog.destinations.filter((d) => d.mvp).map((d) => d.id);
    expect(selectableDestinationIds(save, catalog.destinations, 'story')).toEqual(['moon']);
    expect(selectableDestinationIds(save, catalog.destinations, 'free')).toEqual(mvp);
    expect(mvp).toContain('mars');
  });
  it('mode Free tidak mengubah SaveData karena tidak ada pencatatan (save tetap sama)', () => {
    const save = defaultSave();
    expect(modeRules('free').recordsProgress).toBe(false);
    expect(save.unlocked).toEqual(['moon']);
  });
});

describe('menu karusel: tujuan yang dipilih saat dibuka', () => {
  const ids = ['moon', 'mars'];
  it('memilih misi terbuka yang belum dimainkan', () => {
    expect(suggestedDestinationIndex(ids, ['moon'], {})).toBe(0);
    expect(suggestedDestinationIndex(ids, ['moon', 'mars'], { moon: 2 })).toBe(1);
  });
  it('semua sudah berbintang atau terkunci: tujuan terbuka terakhir, atau 0', () => {
    expect(suggestedDestinationIndex(ids, ['moon', 'mars'], { moon: 3, mars: 1 })).toBe(1);
    expect(suggestedDestinationIndex(ids, ['moon'], { moon: 3 })).toBe(0);
    expect(suggestedDestinationIndex(ids, [], {})).toBe(0);
  });
});
