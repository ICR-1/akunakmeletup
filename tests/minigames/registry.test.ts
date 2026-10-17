import { describe, expect, it } from 'vitest';
import { MINIGAME } from '../../src/core/constants';
import { createMinigame, hasMinigame, minigameIds } from '../../src/minigames';
import { availableInstrumentIds, minigameAvailable } from '../../src/rules/minigameAccess';
import { defaultMission } from '../../src/core/missionBuilder';
import { catalog } from '../rules/helpers';

describe('registri minigame', () => {
  const ids = ['photo_panorama', 'precise_drill', 'spectrum_match', 'vibration_calibration', 'weather_connect', 'clean_panel'];
  it('minigame MVP dan minigame Should terdaftar', () => {
    for (const id of ids) expect(hasMinigame(id)).toBe(true);
    expect(minigameIds().sort()).toEqual([...ids].sort());
    expect(createMinigame('tidak_ada')).toBeNull();
  });
  it.each(ids)('%s: id cocok, durasi rancangan 20-45 detik, result() null sebelum selesai', (id) => {
    const g = createMinigame(id)!;
    expect(g.id).toBe(id);
    expect(g.durationSec).toBeGreaterThanOrEqual(MINIGAME.minDurationSec);
    expect(g.durationSec).toBeLessThanOrEqual(MINIGAME.maxDurationSec);
    expect(g.result()).toBeNull();
  });
  it('setiap instrumen MVP bermain minigame yang terdaftar', () => {
    const playable = catalog.instruments.filter((i) => hasMinigame(i.minigameId)).map((i) => i.id).sort();
    expect(playable).toEqual(['cam_pano', 'sample_drill', 'seismometer', 'spectrometer', 'weather_station']);
  });
  it('setiap objektif Bulan dan Mars bisa dimainkan dengan instrumen yang diminta', () => {
    for (const dest of catalog.destinations) {
      for (const o of dest.objectives) {
        const inst = catalog.instruments.find((i) => i.id === o.instrumentId);
        expect(inst && hasMinigame(inst.minigameId)).toBe(true);
        expect(dest.minigameIds).toContain(inst!.minigameId);
      }
    }
  });
});

describe('akses minigame berdasarkan instrumen terpasang', () => {
  const cfg = defaultMission('moon');
  const cam = catalog.instruments.find((i) => i.id === 'cam_pano')!;
  const spectro = catalog.instruments.find((i) => i.id === 'spectrometer')!;
  it('hanya instrumen terpasang yang membuka minigame', () => {
    const installed = availableInstrumentIds(cfg, []);
    expect(minigameAvailable(cam, installed)).toBe(true);
    expect(minigameAvailable(spectro, installed)).toBe(false);
    expect(minigameAvailable(undefined, installed)).toBe(false);
  });
  it('instrumen yang hilang saat pendaratan kasar menutup minigamenya', () => {
    const installed = availableInstrumentIds(cfg, ['cam_pano']);
    expect(minigameAvailable(cam, installed)).toBe(false);
    expect(installed).toEqual(['sample_drill']);
  });
});
