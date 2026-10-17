import { NOVA_MESSAGES } from '../core/strings';
import type { PreflightResult } from '../rules/preflight';
import type { Catalog, MissionConfig } from '../rules/types';

/** Pesan peringatan NOVA dari hasil preflight (murni, tanpa DOM). Daftar kosong berarti aman. */
export function novaWarnings(result: PreflightResult, config: MissionConfig, catalog: Catalog): string[] {
  const out: string[] = [];
  for (const code of result.assemblyErrors) out.push(NOVA_MESSAGES.assembly[code]);

  const dest = catalog.destinations.find((d) => d.id === config.destinationId);
  for (const objectiveId of result.missingObjectives) {
    const objective = dest?.objectives.find((o) => o.id === objectiveId);
    const instrument = catalog.instruments.find((i) => i.id === objective?.instrumentId);
    if (objective && instrument) {
      out.push(NOVA_MESSAGES.missingObjective.replace('{objective}', objective.title).replace('{instrument}', instrument.name));
    }
  }

  const red = {
    budget: NOVA_MESSAGES.budgetRed, mass: NOVA_MESSAGES.massRed, deltaV: NOVA_MESSAGES.deltaVRed,
    power: NOVA_MESSAGES.powerRed, comms: NOVA_MESSAGES.commsRed,
  } as const;
  (Object.keys(red) as (keyof typeof red)[]).forEach((k) => {
    if (result.indicators[k].status === 'red') out.push(red[k]);
  });
  if (out.length === 0 && result.tightMargin) out.push(NOVA_MESSAGES.tight);
  return out;
}
