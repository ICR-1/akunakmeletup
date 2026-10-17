import type { Id, Instrument, MissionConfig } from './types';

/** Instrumen yang masih bisa dipakai: terpasang pada rakitan dan tidak hilang saat pendaratan kasar. */
export function availableInstrumentIds(config: MissionConfig, lost: Id[]): Id[] {
  return config.instrumentIds.filter((id) => !lost.includes(id));
}

/** Minigame hanya terbuka jika instrumen terkaitnya terpasang dan masih utuh (PRD 15, M5). */
export function minigameAvailable(instrument: Instrument | undefined, installedIds: Id[]): boolean {
  return instrument !== undefined && installedIds.includes(instrument.id);
}
