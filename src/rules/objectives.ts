import { SURFACE } from '../core/constants';
import { createRng, rngRange } from '../core/rng';
import type { Destination, Id } from './types';

export interface Placement { objectiveId: Id; x: number; z: number; distanceM: number }

const MAX_TRIES = 200;
const TWO_PI = Math.PI * 2;

/**
 * Posisi titik objektif (deterministik dari seed): objektif wajib 45-160 m dari wahana, objektif
 * bonus lebih dari 250 m (PRD 14), saling berjarak minimal 45 m.
 */
export function placeObjectives(destination: Destination, seed: number): Placement[] {
  const rng = createRng((seed ^ 0x51ed270b) >>> 0);
  const placed: Placement[] = [];
  for (const objective of destination.objectives) {
    const far = objective.bonus === true;
    const [minD, maxD] = far
      ? [SURFACE.objectiveFarMinM, SURFACE.objectiveFarMaxM]
      : [SURFACE.objectiveNearMinM, SURFACE.objectiveNearMaxM];
    let best: Placement | null = null;
    for (let i = 0; i < MAX_TRIES; i++) {
      const d = rngRange(rng, minD, maxD);
      const a = rngRange(rng, 0, TWO_PI);
      const p: Placement = { objectiveId: objective.id, x: Math.cos(a) * d, z: Math.sin(a) * d, distanceM: d };
      best = p;
      if (placed.every((q) => Math.hypot(q.x - p.x, q.z - p.z) >= SURFACE.objectiveSpacingM)) break;
    }
    if (best) placed.push(best);
  }
  return placed;
}
