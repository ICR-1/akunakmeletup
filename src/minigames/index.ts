import type { Id } from '../rules/types';
import { CleanPanel } from './cleanPanel';
import { PhotoPanorama } from './photoPanorama';
import { PreciseDrill } from './preciseDrill';
import { SpectrumMatch } from './spectrumMatch';
import type { Minigame, MinigameFactory } from './types';
import { VibrationCalibration } from './vibrationCalibration';
import { WeatherConnect } from './weatherConnect';

const registry = new Map<Id, MinigameFactory>();

export function registerMinigame(id: Id, factory: MinigameFactory): void {
  registry.set(id, factory);
}

export function hasMinigame(id: Id): boolean {
  return registry.has(id);
}

export function createMinigame(id: Id): Minigame | null {
  return registry.get(id)?.() ?? null;
}

export function minigameIds(): Id[] {
  return [...registry.keys()];
}

registerMinigame('photo_panorama', () => new PhotoPanorama());
registerMinigame('precise_drill', () => new PreciseDrill());
registerMinigame('spectrum_match', () => new SpectrumMatch());
registerMinigame('vibration_calibration', () => new VibrationCalibration());
registerMinigame('weather_connect', () => new WeatherConnect());
registerMinigame('clean_panel', () => new CleanPanel());
