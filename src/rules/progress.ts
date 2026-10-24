import { PROGRESS, TEXT_SCALES } from '../core/constants';
import type { MissionOutcome } from './missionResult';
import type { Destination, GameMode, Id } from './types';

export interface SaveData {
  version: number;
  unlocked: Id[];
  /** Bintang terbaik per destinasi. */
  stars: Record<Id, number>;
  bestScore: Record<Id, number>;
  sciencePoints: number;
  beacons: Id[];
  achievements: Id[];
  introSeen: boolean;
  tutorialSeen: boolean;
  muted: boolean;
  volume: number;
  /** Indeks skala teks UI (0 = normal). */
  textScale: number;
  /** Bayangan dinamis (PRD 13: nonaktif secara default). */
  shadows: boolean;
  /** Detail model 3D: 'high' (halus, default) atau 'low' (low-poly flat shading). */
  detail: 'low' | 'high';
  /** Musik latar prosedural per planet (terpisah dari mute efek suara). */
  music: boolean;
}

export function defaultSave(): SaveData {
  return {
    version: PROGRESS.saveVersion, unlocked: [...PROGRESS.startUnlocked], stars: {}, bestScore: {},
    sciencePoints: 0, beacons: [], achievements: [], introSeen: false, tutorialSeen: false,
    muted: false, volume: PROGRESS.defaultVolume, textScale: 0, shadows: false, detail: 'high', music: true,
  };
}

const isRecordOfNumbers = (v: unknown): v is Record<string, number> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'number' && Number.isFinite(x));
const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Membersihkan data tersimpan yang tidak dikenal/rusak; bidang tak valid kembali ke nilai awal. */
export function sanitizeSave(raw: unknown): SaveData {
  const base = defaultSave();
  if (typeof raw !== 'object' || raw === null) return base;
  const r = raw as Record<string, unknown>;
  if (r.version !== PROGRESS.saveVersion) return base;
  const unlocked = isStringArray(r.unlocked) ? [...new Set([...PROGRESS.startUnlocked, ...r.unlocked])] : base.unlocked;
  return {
    version: PROGRESS.saveVersion,
    unlocked,
    stars: isRecordOfNumbers(r.stars) ? r.stars : base.stars,
    bestScore: isRecordOfNumbers(r.bestScore) ? r.bestScore : base.bestScore,
    sciencePoints: typeof r.sciencePoints === 'number' && r.sciencePoints >= 0 ? r.sciencePoints : 0,
    beacons: isStringArray(r.beacons) ? r.beacons : base.beacons,
    achievements: isStringArray(r.achievements) ? r.achievements : base.achievements,
    introSeen: r.introSeen === true,
    tutorialSeen: r.tutorialSeen === true,
    muted: r.muted === true,
    volume: typeof r.volume === 'number' ? Math.min(1, Math.max(0, r.volume)) : base.volume,
    shadows: r.shadows === true,
    detail: r.detail === 'low' ? 'low' : 'high',
    music: r.music !== false,
    textScale: typeof r.textScale === 'number' ? Math.min(TEXT_SCALES.length - 1, Math.max(0, Math.round(r.textScale))) : 0,
  };
}

export const missionSucceeded = (outcome: MissionOutcome): boolean => outcome.score.stars >= PROGRESS.successStars;

/** Destinasi MVP berikutnya setelah `id` menurut urutan katalog, atau null jika terakhir. */
export function nextDestinationId(destinations: Destination[], id: Id): Id | null {
  const list = destinations.filter((d) => d.mvp);
  const i = list.findIndex((d) => d.id === id);
  return i >= 0 && i + 1 < list.length ? list[i + 1].id : null;
}

export const isUnlocked = (save: SaveData, id: Id): boolean => save.unlocked.includes(id);

export interface MissionRecord {
  save: SaveData;
  pointsEarned: number;
  newlyUnlocked: Id | null;
  /** Beacon yang baru ditemukan pada misi ini, atau null. */
  newBeacon: Id | null;
}

/**
 * Catat hasil misi: poin sains bertambah, bintang dan skor terbaik diperbarui, medali digabung.
 * Misi sukses (>= 1 bintang) menemukan Beacon destinasi itu dan membuka destinasi berikutnya.
 */
export function recordMission(save: SaveData, destinations: Destination[], destinationId: Id, outcome: MissionOutcome, medals: Id[]): MissionRecord {
  const pointsEarned = outcome.score.sciencePoints;
  const success = missionSucceeded(outcome);
  const beaconId = `beacon_${destinationId}`;
  const next = success ? nextDestinationId(destinations, destinationId) : null;
  const newBeacon = success && !save.beacons.includes(beaconId) ? beaconId : null;
  const newlyUnlocked = next && !save.unlocked.includes(next) ? next : null;
  return {
    pointsEarned, newlyUnlocked, newBeacon,
    save: {
      ...save,
      sciencePoints: save.sciencePoints + pointsEarned,
      stars: { ...save.stars, [destinationId]: Math.max(save.stars[destinationId] ?? 0, outcome.score.stars) },
      bestScore: { ...save.bestScore, [destinationId]: Math.max(save.bestScore[destinationId] ?? 0, Math.round(outcome.score.total)) },
      beacons: newBeacon ? [...save.beacons, newBeacon] : save.beacons,
      unlocked: newlyUnlocked ? [...save.unlocked, newlyUnlocked] : save.unlocked,
      achievements: [...new Set([...save.achievements, ...medals])],
    },
  };
}

export interface ModeRules {
  /** Semua destinasi MVP terbuka tanpa syarat progres. */
  allUnlocked: boolean;
  /** Hasil misi menambah bintang, poin sains, Beacon, dan membuka destinasi. */
  recordsProgress: boolean;
  /** Dialog cerita (intro, briefing, tutorial, Beacon). */
  storyDialogs: boolean;
  /** Objektif wajib harus punya instrumen terpasang agar status Go. */
  requireObjectives: boolean;
}

/** Aturan tiap mode (PRD 11): Free Design bebas memilih planet dan instrumen, tanpa cerita dan tanpa mengubah progres. */
export function modeRules(mode: GameMode): ModeRules {
  return mode === 'free'
    ? { allUnlocked: true, recordsProgress: false, storyDialogs: false, requireObjectives: false }
    : { allUnlocked: false, recordsProgress: true, storyDialogs: true, requireObjectives: true };
}

/** Id destinasi MVP yang boleh dipilih pada mode ini. */
export function selectableDestinationIds(save: SaveData, destinations: Destination[], mode: GameMode): Id[] {
  const mvp = destinations.filter((d) => d.mvp).map((d) => d.id);
  return modeRules(mode).allUnlocked ? mvp : mvp.filter((id) => isUnlocked(save, id));
}

/**
 * Indeks tujuan yang dipilih saat menu dibuka: tujuan terbuka pertama yang belum berbintang (misi berikutnya),
 * atau tujuan terbuka terakhir bila semua sudah dimainkan; 0 bila tidak ada yang terbuka.
 */
export function suggestedDestinationIndex(ids: Id[], selectable: Id[], stars: Record<Id, number>): number {
  const fresh = ids.findIndex((id) => selectable.includes(id) && !(stars[id] > 0));
  if (fresh >= 0) return fresh;
  for (let i = ids.length - 1; i >= 0; i--) if (selectable.includes(ids[i])) return i;
  return 0;
}
