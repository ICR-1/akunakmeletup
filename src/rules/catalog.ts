import { DEFAULT_FUEL_FRACTION } from '../core/constants';
import type { Catalog, Destination, Instrument, MissionConfig, Module, Rocket } from './types';
import { paceRocket } from './staging';

/** MissionConfig yang sudah di-resolve terhadap katalog. */
export interface Assembly {
  rocket: Rocket;
  destination: Destination;
  modules: Module[];
  instruments: Instrument[];
  fuelFraction: number;
}

function find<T extends { id: string }>(list: T[], id: string, what: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new Error(`${what} tidak dikenal: "${id}"`);
  return item;
}

export function resolveAssembly(config: MissionConfig, catalog: Catalog): Assembly {
  return {
    rocket: paceRocket(find(catalog.rockets, config.rocketId, 'Roket')),
    destination: find(catalog.destinations, config.destinationId, 'Destinasi'),
    modules: config.moduleIds.map((id) => find(catalog.modules, id, 'Modul')),
    instruments: config.instrumentIds.map((id) => find(catalog.instruments, id, 'Instrumen')),
    fuelFraction: config.fuelFraction ?? DEFAULT_FUEL_FRACTION,
  };
}

export function modulesOfKind(a: Assembly, kind: Module['kind']): Module[] {
  return a.modules.filter((m) => m.kind === kind);
}

export function sumStat(modules: Module[], stat: string): number {
  return modules.reduce((sum, m) => sum + (m.stats[stat] ?? 0), 0);
}
