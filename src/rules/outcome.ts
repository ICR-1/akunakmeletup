import { computeScore, starsFor } from './score';
import type { FlightSummary, MissionOutcome, ReviewCode, SurfaceSummary } from './missionResult';
import { preflight } from './preflight';
import type { Catalog, MissionConfig } from './types';
import { LOW_COMMS_U, SCORE } from '../core/constants';

/** Urutan prioritas kode penyebab (yang paling menentukan lebih dulu). */
export const CODE_PRIORITY: ReviewCode[] = [
  'LAUNCH_FAIL', 'LOW_FUEL', 'CRASH_LANDING', 'NIGHT_POWER', 'DAMAGED_LANDING', 'OXYGEN_OUT',
  'LOW_COMMS', 'OBJECTIVE_MISSED', 'LATE_STAGING', 'OVER_MARGIN_TIGHT',
];

export interface OutcomeInput {
  config: MissionConfig;
  catalog: Catalog;
  flight: FlightSummary;
  /** null jika misi berakhir sebelum permukaan. */
  surface: SurfaceSummary | null;
}

/** Skor akhir dan kode penyebab dari hasil penerbangan dan permukaan. */
export function buildOutcome(input: OutcomeInput): MissionOutcome {
  const { config, catalog, flight, surface } = input;
  const pre = preflight(config, catalog);
  const dest = catalog.destinations.find((d) => d.id === config.destinationId);
  const required = dest?.objectives.filter((o) => o.required) ?? [];
  const bonus = dest?.objectives.filter((o) => o.bonus) ?? [];
  const done = new Set(surface?.completedObjectives ?? []);
  const requiredDone = required.filter((o) => done.has(o.id)).length;
  const minigameScores = Object.values(surface?.minigameScores ?? {});

  const score = computeScore({
    uplinkU: surface?.uplinkU ?? 0,
    requiredDone,
    requiredTotal: required.length,
    minigameScores,
    budgetMargin: pre.indicators.budget.margin,
    massMargin: pre.indicators.mass.margin,
    powerMargin: pre.indicators.power.margin,
    touchdownFactor: flight.touchdownFactor,
    faintCount: surface?.faintCount ?? 0,
    instrumentsLost: flight.instrumentsLost.length,
    lateStageCount: flight.lateStageCount,
    bonusObjectivesDone: bonus.filter((o) => done.has(o.id)).length,
    eventsHandledWell: (surface?.eventsHandledWell ?? 0) + flight.eventsHandledWell,
    failed: flight.failed || surface === null,
  });

  const codes = new Set<ReviewCode>(flight.failCodes);
  if (surface && !flight.failed) {
    if (surface.nightPowerOut) codes.add('NIGHT_POWER');
    if (surface.faintCount > 0) codes.add('OXYGEN_OUT');
    if (minigameScores.length > 0 && surface.uplinkU < LOW_COMMS_U) codes.add('LOW_COMMS');
    if (requiredDone < required.length) codes.add('OBJECTIVE_MISSED');
  }
  if (surface && surface.scoreAdjust !== 0) {
    score.total = Math.min(100, Math.max(0, score.total + surface.scoreAdjust));
    score.stars = starsFor(score.total, flight.failed);
    score.sciencePoints = flight.failed ? 0 : Math.round(score.total / SCORE.sciencePointsDivisor);
  }
  return { score, codes: CODE_PRIORITY.filter((c) => codes.has(c)) };
}
