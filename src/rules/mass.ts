import { modulesOfKind, sumStat, type Assembly } from './catalog';
import { ratioMargin } from './margin';

export function dryMassKg(a: Assembly): number {
  return (
    a.modules.reduce((s, m) => s + m.massKg, 0) + a.instruments.reduce((s, i) => s + i.massKg, 0)
  );
}

export function fuelMassKg(a: Assembly): number {
  return sumStat(modulesOfKind(a, 'tank'), 'fuelKg') * a.fuelFraction;
}

export function initialMassKg(a: Assembly): number {
  return dryMassKg(a) + fuelMassKg(a);
}

export function massMargin(a: Assembly): number {
  const payload = a.rocket.payloadToLeoKg;
  return ratioMargin(payload - initialMassKg(a), payload);
}
