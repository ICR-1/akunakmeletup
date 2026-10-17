import type { Assembly } from './catalog';
import { ratioMargin } from './margin';

export function totalCostMusd(a: Assembly): number {
  return (
    a.rocket.costMusd +
    a.modules.reduce((s, m) => s + m.costMusd, 0) +
    a.instruments.reduce((s, i) => s + i.costMusd, 0)
  );
}

export function budgetMargin(a: Assembly): number {
  const budget = a.destination.budgetMusd;
  return ratioMargin(budget - totalCostMusd(a), budget);
}
