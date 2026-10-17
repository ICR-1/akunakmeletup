import rockets from '../../data/rockets.json';
import modules from '../../data/modules.json';
import instruments from '../../data/instruments.json';
import destinations from '../../data/destinations.json';
import events from '../../data/events.json';
import dialogs from '../../data/dialogs.json';
import { validateCatalog } from '../rules/schemaValidator';
import type { Catalog } from '../rules/types';

/** Memuat dan memvalidasi seluruh data/*.json; melempar DataValidationError jika tidak valid. */
export function loadCatalog(): Catalog {
  return validateCatalog({ rockets, modules, instruments, destinations, events, dialogs });
}
