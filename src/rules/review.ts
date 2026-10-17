import { SCORE } from '../core/constants';
import { clamp } from './margin';
import type { FlightSummary, MissionOutcome, ReviewCode, SurfaceSummary } from './missionResult';
import { missionSucceeded } from './progress';
import type { Id } from './types';

/** Bagian katalog desain yang ditandai untuk tiap kode penyebab (tombol Perbaiki desain, PRD 11). */
const SECTIONS_BY_CODE: Record<ReviewCode, string[]> = {
  LAUNCH_FAIL: ['rocket'],
  LOW_FUEL: ['tanks', 'engine', 'fuel', 'rocket'],
  CRASH_LANDING: ['engine', 'lander'],
  DAMAGED_LANDING: ['lander'],
  NIGHT_POWER: ['battery', 'solar', 'rtg'],
  LOW_COMMS: ['antenna', 'relay'],
  OXYGEN_OUT: [],
  OBJECTIVE_MISSED: ['instruments'],
  LATE_STAGING: ['rocket'],
  OVER_MARGIN_TIGHT: ['fuel', 'tanks'],
};

export function sectionsForCodes(codes: ReviewCode[]): string[] {
  return [...new Set(codes.flatMap((c) => SECTIONS_BY_CODE[c]))];
}

/** "Satu atau dua penyebab utama" (PRD 11): dua kode pertama menurut prioritas. */
export function mainCauses(codes: ReviewCode[]): ReviewCode[] {
  return codes.slice(0, 2);
}

export const MEDALS = {
  frugal: { id: 'frugal', name: 'Misi Hemat' },
  smooth: { id: 'smooth', name: 'Pendarat Mulus' },
  storm: { id: 'storm', name: 'Selamat dari Badai' },
} as const;

export interface MedalInput {
  outcome: MissionOutcome;
  flight: FlightSummary;
  surface: SurfaceSummary | null;
  budgetMargin: number;
}

/** Pencapaian dari PRD 11: Misi Hemat, Pendarat Mulus, Selamat dari Badai. */
export function earnedMedals(i: MedalInput): Id[] {
  const medals: Id[] = [];
  const ok = missionSucceeded(i.outcome);
  if (ok && i.budgetMargin >= SCORE.efficiencyBudgetSat) medals.push(MEDALS.frugal.id);
  if (ok && i.flight.touchdown === 'perfect') medals.push(MEDALS.smooth.id);
  if (ok && (i.surface?.handledEventIds.includes('ev_dust_storm') ?? false)) medals.push(MEDALS.storm.id);
  return medals;
}

export interface ScoreExplanation {
  science: { uplinkU: number; requiredDone: number; requiredTotal: number; minigameAvg: number };
  efficiency: { budget: number; mass: number; power: number };
  safety: { touchdownFactor: number; faints: number; lost: number; late: number };
  bonus: { objectives: number; goodEvents: number };
}

export interface ExplainInput {
  uplinkU: number;
  requiredDone: number;
  requiredTotal: number;
  minigameScores: number[];
  budgetMargin: number;
  massMargin: number;
  powerMargin: number;
  flight: FlightSummary;
  faintCount: number;
  bonusDone: number;
  goodEvents: number;
}

/** Masukan tiap komponen skor, agar layar review dapat menampilkan skor secara transparan. */
export function explainScore(i: ExplainInput): ScoreExplanation {
  const avg = i.minigameScores.length > 0 ? i.minigameScores.reduce((s, x) => s + x, 0) / i.minigameScores.length : 0;
  return {
    science: { uplinkU: clamp(i.uplinkU, 0, 1), requiredDone: i.requiredDone, requiredTotal: i.requiredTotal, minigameAvg: avg },
    efficiency: { budget: i.budgetMargin, mass: i.massMargin, power: i.powerMargin },
    safety: { touchdownFactor: i.flight.touchdownFactor, faints: i.faintCount, lost: i.flight.instrumentsLost.length, late: i.flight.lateStageCount },
    bonus: { objectives: i.bonusDone, goodEvents: i.goodEvents },
  };
}
