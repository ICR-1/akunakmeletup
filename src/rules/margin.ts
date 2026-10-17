import { MARGIN_GREEN_MIN, MARGIN_YELLOW_MIN } from '../core/constants';

export type MarginStatus = 'green' | 'yellow' | 'red';

/** numerator / denominator; penyebut tidak positif menghasilkan +-Infinity agar tidak NaN. */
export function ratioMargin(numerator: number, denominator: number): number {
  if (denominator > 0) return numerator / denominator;
  return numerator >= 0 ? Infinity : -Infinity;
}

export function marginStatus(margin: number): MarginStatus {
  if (margin >= MARGIN_GREEN_MIN) return 'green';
  if (margin >= MARGIN_YELLOW_MIN) return 'yellow';
  return 'red';
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
