import type { Id } from './types';
import type { ScoreBreakdown } from './score';

export const REVIEW_CODES = [
  'LAUNCH_FAIL', 'LOW_FUEL', 'CRASH_LANDING', 'DAMAGED_LANDING', 'NIGHT_POWER',
  'LOW_COMMS', 'OXYGEN_OUT', 'OBJECTIVE_MISSED', 'LATE_STAGING', 'OVER_MARGIN_TIGHT',
] as const;
export type ReviewCode = (typeof REVIEW_CODES)[number];

export type TouchdownOutcome = 'perfect' | 'success' | 'damaged' | 'crash';

/** Hasil fase penerbangan (peluncuran sampai pendaratan). */
export interface FlightSummary {
  failed: boolean;
  failCodes: ReviewCode[];
  flightQuality: number;
  errorFraction: number;
  lateStageCount: number;
  touchdown: TouchdownOutcome | null;
  touchdownFactor: number;
  instrumentsLost: Id[];
  fuelRemainingKg: number;
  /** Event penerbangan yang ditangani tanpa memicu efek gagal. */
  eventsHandledWell: number;
  handledEventIds: Id[];
}

/** Hasil fase permukaan. */
export interface SurfaceSummary {
  completedObjectives: Id[];
  /** score01 terbaik per instrumen yang minigame-nya selesai. */
  minigameScores: Record<Id, number>;
  faintCount: number;
  nightPowerOut: boolean;
  uplinkU: number;
  eventsHandledWell: number;
  handledEventIds: Id[];
  /** Penyesuaian skor dari efek event (mis. -3). */
  scoreAdjust: number;
  timeSec: number;
}

export interface MissionOutcome {
  score: ScoreBreakdown;
  codes: ReviewCode[];
}
