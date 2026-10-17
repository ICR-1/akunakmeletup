import { SCORE } from '../core/constants';
import { clamp } from './margin';
import { lateSafetyPenalty } from './staging';

export interface ScoreInput {
  /** Faktor uplink U (0-1). */
  uplinkU: number;
  requiredDone: number;
  requiredTotal: number;
  /** score01 tiap minigame yang diselesaikan. */
  minigameScores: number[];
  /** Margin rakitan awal. */
  budgetMargin: number;
  massMargin: number;
  powerMargin: number;
  /** Faktor touchdown: mulus 1,0 / sukses 0,7 / rusak 0,3. */
  touchdownFactor: number;
  faintCount: number;
  instrumentsLost: number;
  lateStageCount: number;
  bonusObjectivesDone: number;
  eventsHandledWell: number;
  /** Misi gagal (crash, LOW_FUEL, dst.) memberi 0 bintang. */
  failed: boolean;
}

export interface ScoreBreakdown {
  science: number;
  efficiency: number;
  safety: number;
  bonus: number;
  total: number;
  stars: 0 | 1 | 2 | 3;
  sciencePoints: number;
}

const mean = (xs: number[]): number => (xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length);

export function scienceScore(i: ScoreInput): number {
  const requiredRatio = i.requiredTotal > 0 ? i.requiredDone / i.requiredTotal : 0;
  return (
    SCORE.scienceMax * i.uplinkU *
    (SCORE.scienceRequiredWeight * requiredRatio + SCORE.scienceMinigameWeight * mean(i.minigameScores))
  );
}

export function efficiencyScore(i: ScoreInput): number {
  return (
    SCORE.efficiencyMax *
    (SCORE.efficiencyBudgetWeight * clamp(i.budgetMargin / SCORE.efficiencyBudgetSat, 0, 1) +
      SCORE.efficiencyMassWeight * clamp(i.massMargin / SCORE.efficiencyMassSat, 0, 1) +
      SCORE.efficiencyPowerWeight * clamp(i.powerMargin / SCORE.efficiencyPowerSat, 0, 1))
  );
}

export function safetyScore(i: ScoreInput): number {
  return Math.max(
    0,
    SCORE.safetyMax * i.touchdownFactor -
      SCORE.safetyFaintPenalty * i.faintCount -
      SCORE.safetyLostInstrumentPenalty * i.instrumentsLost -
      lateSafetyPenalty(i.lateStageCount),
  );
}

export function bonusScore(i: ScoreInput): number {
  return Math.min(SCORE.bonusMax, SCORE.bonusPerObjective * i.bonusObjectivesDone + SCORE.bonusPerGoodEvent * i.eventsHandledWell);
}

export function starsFor(total: number, failed: boolean): 0 | 1 | 2 | 3 {
  if (failed) return 0;
  const [one, two, three] = SCORE.starThresholds;
  if (total >= three) return 3;
  if (total >= two) return 2;
  if (total >= one) return 1;
  return 0;
}

export function computeScore(i: ScoreInput): ScoreBreakdown {
  const science = scienceScore(i);
  const efficiency = efficiencyScore(i);
  const safety = safetyScore(i);
  const bonus = bonusScore(i);
  const total = clamp(science + efficiency + safety + bonus, 0, 100);
  return {
    science, efficiency, safety, bonus, total,
    stars: starsFor(total, i.failed),
    sciencePoints: i.failed ? 0 : Math.round(total / SCORE.sciencePointsDivisor),
  };
}
