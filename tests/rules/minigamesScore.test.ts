import { describe, expect, it } from 'vitest';
import { FIXED_DT, MG, MINIGAME } from '../../src/core/constants';
import { createRng } from '../../src/core/rng';
import {
  angleDiffDeg, connectCable, createDrill, createWeatherState, generatePanelDust, generateWeatherPuzzle,
  panelClean, panelMeanDust, panelScore, scrubPanel, settlePanel, weatherCableCount, weatherDone, weatherScore, drillParams, drillScore, generateBeats, generatePhotoTargets, generateSpectrum,
  matchPresses, photoParams, photoScore, photoShotQuality, rhythmDurationSec, rhythmScore, rhythmWindowSec,
  spectrumScore, spectrumValue, stepDrill,
} from '../../src/rules/minigameScore';

describe('Foto Panorama: penilaian', () => {
  const p = photoParams(0.5);
  it('selisih sudut terpendek melewati batas 0/360', () => {
    expect(angleDiffDeg(10, 350)).toBe(20);
    expect(angleDiffDeg(350, 10)).toBe(-20);
    expect(angleDiffDeg(180, 0)).toBe(-180);
    expect(angleDiffDeg(90, 90)).toBe(0);
  });
  it('kualitas = pemusatan x kestabilan', () => {
    expect(photoShotQuality(0, 0, p)).toBe(1);
    expect(photoShotQuality(p.frameTolDeg, 0, p)).toBe(0);
    expect(photoShotQuality(0, p.blurSpeedDegS, p)).toBe(0);
    expect(photoShotQuality(p.frameTolDeg / 2, p.blurSpeedDegS / 2, p)).toBeCloseTo(0.25, 10);
    expect(photoShotQuality(-p.frameTolDeg / 2, 0, p)).toBeCloseTo(0.5, 10);
  });
  it('skor = rata-rata dari jumlah foto wajib (foto tak diambil = 0)', () => {
    expect(photoScore([1, 1, 1], 3)).toBe(1);
    expect(photoScore([1, 0.5], 3)).toBeCloseTo(0.5, 10);
    expect(photoScore([], 3)).toBe(0);
  });
  it('kesulitan menyempitkan bingkai dan toleransi goyang', () => {
    expect(photoParams(1).frameTolDeg).toBeLessThan(photoParams(0).frameTolDeg);
    expect(photoParams(1).blurSpeedDegS).toBeLessThan(photoParams(0).blurSpeedDegS);
  });
  it('target foto: jumlah benar, berjarak minimal, deterministik', () => {
    const t = generatePhotoTargets(createRng(4), 3);
    expect(t).toHaveLength(3);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.abs(angleDiffDeg(t[i].angleDeg, t[j].angleDeg))).toBeGreaterThanOrEqual(MG.photo.minTargetSepDeg);
    expect(generatePhotoTargets(createRng(4), 3)).toEqual(t);
  });
});

describe('Bor Presisi: simulasi dan skor', () => {
  const params = drillParams(0.5);
  const play = (controller: (s: ReturnType<typeof createDrill>) => boolean) => {
    let s = createDrill();
    for (let i = 0; i < 60 * 60 && !s.done; i++) s = stepDrill(s, controller(s), params, FIXED_DT);
    return s;
  };
  const mid = (params.zoneLo + params.zoneHi) / 2;
  const skilled = (s: { pressure: number }) => s.pressure < mid;

  it('pemain ahli mencapai kedalaman penuh tanpa panas, dalam 20-45 detik', () => {
    const s = play(skilled);
    expect(s.depth01).toBe(1);
    expect(s.overheats).toBe(0);
    expect(s.elapsedSec).toBeGreaterThanOrEqual(MINIGAME.minDurationSec);
    expect(s.elapsedSec).toBeLessThanOrEqual(MINIGAME.maxDurationSec);
    expect(drillScore(s.depth01, s.timeInZoneSec, s.elapsedSec, s.overheats)).toBeGreaterThan(0.85);
  });
  it('tidak menekan sama sekali: waktu habis tanpa kemajuan', () => {
    const s = play(() => false);
    expect(s.done).toBe(true);
    expect(s.elapsedSec).toBeGreaterThanOrEqual(MG.drill.timeLimitSec);
    expect(drillScore(s.depth01, s.timeInZoneSec, s.elapsedSec, s.overheats)).toBeLessThan(0.1);
  });
  it('menekan terus: overheat berulang, skor menengah-rendah', () => {
    const s = play(() => true);
    expect(s.overheats).toBeGreaterThan(0);
    const score = drillScore(s.depth01, s.timeInZoneSec, s.elapsedSec, s.overheats);
    expect(score).toBeLessThan(0.8);
  });
  it('pemain kasar (tekan-lepas terlalu lebar) mendapat skor di antara', () => {
    let on = true;
    const sloppy = (s: { pressure: number }) => { if (s.pressure > 0.85) on = false; if (s.pressure < 0.2) on = true; return on; };
    const s = play(sloppy);
    const score = drillScore(s.depth01, s.timeInZoneSec, s.elapsedSec, s.overheats);
    expect(score).toBeGreaterThan(0.2);
    expect(score).toBeLessThan(0.95);
  });
  it('rumus skor: 0,6 kedalaman + 0,4 porsi zona - 0,1 per overheat, dijaga 0-1', () => {
    expect(drillScore(1, 10, 10, 0)).toBe(1);
    expect(drillScore(0.5, 5, 10, 1)).toBeCloseTo(0.3 + 0.2 - 0.1, 10);
    expect(drillScore(0, 0, 10, 5)).toBe(0);
    expect(drillScore(0, 0, 0, 0)).toBe(0);
  });
  it('tekanan naik saat ditekan, turun saat dilepas, dan dijaga 0-1', () => {
    let s = createDrill();
    for (let i = 0; i < 300; i++) s = stepDrill(s, true, params, FIXED_DT);
    expect(s.pressure).toBe(1);
    for (let i = 0; i < 300; i++) s = stepDrill(s, false, params, FIXED_DT);
    expect(s.pressure).toBe(0);
  });
  it('panas penuh membuat bor macet 2 detik tanpa kemajuan', () => {
    let s = createDrill();
    let before = 0;
    for (let i = 0; i < 60 * 30 && s.coolingSec === 0; i++) { s = stepDrill(s, true, params, FIXED_DT); before = s.depth01; }
    expect(s.coolingSec).toBeGreaterThan(0);
    const after = stepDrill(s, true, params, FIXED_DT);
    expect(after.depth01).toBe(before);
  });
  it('kesulitan menyempitkan zona hijau', () => {
    const w = (d: number) => drillParams(d).zoneHi - drillParams(d).zoneLo;
    expect(w(1)).toBeLessThan(w(0));
  });
});

describe('Cocokkan Spektrum: penilaian', () => {
  const puzzle = generateSpectrum(createRng(8), 0.5);
  it('jawaban tepat bernilai 1; makin jauh makin rendah; tidak negatif', () => {
    expect(spectrumScore(puzzle, puzzle.hidden)).toBeCloseTo(1, 10);
    const near = spectrumScore(puzzle, { shift: puzzle.hidden.shift + 0.02, scale: puzzle.hidden.scale });
    const far = spectrumScore(puzzle, { shift: puzzle.hidden.shift + 0.25, scale: puzzle.hidden.scale });
    expect(near).toBeLessThan(1);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(0);
  });
  it('posisi awal (tanpa geser) bukan jawaban sempurna: ada teka-teki nyata', () => {
    expect(spectrumScore(puzzle, { shift: 0, scale: 1 })).toBeLessThan(0.98);
  });
  it('kurva: 1 di luar dip, turun sedalam dip di pusatnya, dip bergeser mengikuti kontrol', () => {
    const dips = [{ center: 0.5, depth: 0.6 }];
    expect(spectrumValue(dips, 0.05, { shift: 0, scale: 1 }, 0.5)).toBeCloseTo(0.4, 10);
    expect(spectrumValue(dips, 0.05, { shift: 0, scale: 1 }, 0)).toBeCloseTo(1, 6);
    expect(spectrumValue(dips, 0.05, { shift: 0.2, scale: 1 }, 0.7)).toBeCloseTo(0.4, 10);
  });
  it('teka-teki deterministik, jumlah dip naik dengan kesulitan, kontrol tersembunyi dapat dijangkau slider', () => {
    expect(generateSpectrum(createRng(8), 0.5)).toEqual(puzzle);
    expect(generateSpectrum(createRng(8), 1).dips.length).toBeGreaterThan(generateSpectrum(createRng(8), 0).dips.length);
    for (let seed = 0; seed < 50; seed++) {
      const p = generateSpectrum(createRng(seed), 1);
      expect(Math.abs(p.hidden.shift)).toBeLessThanOrEqual(MG.spectrum.ctrlShiftMax);
      expect(p.hidden.scale).toBeGreaterThanOrEqual(MG.spectrum.ctrlScaleMin);
      expect(p.hidden.scale).toBeLessThanOrEqual(MG.spectrum.ctrlScaleMax);
    }
  });
});

describe('Kalibrasi Getaran: penilaian', () => {
  const beats = generateBeats(createRng(3));
  const win = rhythmWindowSec(0.5);
  it('ketukan: jumlah, urutan naik, durasi dalam 20-45 detik', () => {
    expect(beats).toHaveLength(MG.rhythm.beats);
    for (let i = 1; i < beats.length; i++) expect(beats[i]).toBeGreaterThan(beats[i - 1]);
    for (let seed = 0; seed < 200; seed++) {
      const d = rhythmDurationSec(generateBeats(createRng(seed)));
      expect(d).toBeGreaterThanOrEqual(MINIGAME.minDurationSec);
      expect(d).toBeLessThanOrEqual(MINIGAME.maxDurationSec);
    }
  });
  it('tepat waktu = 1; tanpa tekan = 0; meleset separuh jendela = sekitar 0,5', () => {
    expect(rhythmScore(beats, beats, win)).toBe(1);
    expect(rhythmScore(beats, [], win)).toBe(0);
    expect(rhythmScore(beats, beats.map((b) => b + win / 2), win)).toBeCloseTo(0.5, 6);
  });
  it('penekanan di luar jendela tidak menghasilkan poin; ekstra dikenai penalti', () => {
    expect(rhythmScore(beats, beats.map((b) => b + win * 2), win)).toBe(0);
    const spam = [...beats, 0.1, 0.2, 0.3];
    expect(rhythmScore(beats, spam, win)).toBeCloseTo(1 - 3 * MG.rhythm.extraPressPenalty, 10);
  });
  it('satu penekanan tidak boleh dipakai untuk dua ketukan', () => {
    const close = [1, 1.1];
    const { matches, extra } = matchPresses(close, [1.05], 0.3);
    expect(matches).toHaveLength(1);
    expect(extra).toBe(0);
    expect(rhythmScore(close, [1.05], 0.3)).toBeLessThan(0.6);
  });
  it('kesulitan mempersempit jendela', () => {
    expect(rhythmWindowSec(1)).toBeLessThan(rhythmWindowSec(0));
  });
  it('skor dijaga 0-1 dan ketukan kosong aman', () => {
    expect(rhythmScore([], [1, 2], 0.3)).toBe(0);
    expect(rhythmScore(beats, Array.from({ length: 200 }, (_, i) => i * 0.1), win)).toBeGreaterThanOrEqual(0);
  });
});

describe('Pasang dan Sambungkan: penilaian', () => {
  const puzzle = generateWeatherPuzzle(createRng(7), 0.5);
  const n = puzzle.portOfCable.length;
  const solve = (): ReturnType<typeof createWeatherState> => {
    let s = createWeatherState(puzzle);
    puzzle.portOfCable.forEach((port, cable) => { s = connectCable(puzzle, s, cable, port); });
    return s;
  };
  it('jumlah kabel naik dengan kesulitan dan puzzle adalah permutasi deterministik', () => {
    expect(weatherCableCount(0)).toBe(MG.weather.cablesBase);
    expect(weatherCableCount(1)).toBe(MG.weather.cablesBase + MG.weather.cablesDiffGain);
    expect([...puzzle.portOfCable].sort()).toEqual(Array.from({ length: n }, (_, i) => i));
    expect(generateWeatherPuzzle(createRng(7), 0.5)).toEqual(puzzle);
  });
  it('colok benar menyambung, salah menambah hitungan, kabel terpasang diabaikan', () => {
    const s0 = createWeatherState(puzzle);
    const wrongPort = (puzzle.portOfCable[0] + 1) % n;
    const s1 = connectCable(puzzle, s0, 0, wrongPort);
    expect(s1.wrong).toBe(1);
    expect(s1.linked[0]).toBe(false);
    const s2 = connectCable(puzzle, s1, 0, puzzle.portOfCable[0]);
    expect(s2.linked[0]).toBe(true);
    expect(connectCable(puzzle, s2, 0, wrongPort)).toBe(s2);
  });
  it('semua tersambung cepat = skor penuh; lambat = lebih rendah; salah colok mengurangi', () => {
    const done = solve();
    expect(weatherDone(done)).toBe(true);
    expect(weatherScore(done, 0)).toBe(1);
    expect(weatherScore(done, MG.weather.timeLimitSec)).toBeCloseTo(1 - MG.weather.speedWeight, 10);
    expect(weatherScore({ ...done, wrong: 2 }, 0)).toBeCloseTo(1 - 2 * MG.weather.wrongPenalty, 10);
  });
  it('sebagian tersambung tanpa bonus kecepatan; tidak ada sambungan = 0; skor di 0-1', () => {
    const half = connectCable(puzzle, createWeatherState(puzzle), 0, puzzle.portOfCable[0]);
    expect(weatherScore(half, 1)).toBeCloseTo((1 / n) * (1 - MG.weather.speedWeight), 10);
    expect(weatherScore(createWeatherState(puzzle), 0)).toBe(0);
    expect(weatherScore({ ...createWeatherState(puzzle), wrong: 99 }, 0)).toBe(0);
  });
});

describe('Bersihkan Panel: penilaian', () => {
  const panel = generatePanelDust(createRng(3));
  it('debu awal deterministik dan dalam rentang', () => {
    expect(generatePanelDust(createRng(3))).toEqual(panel);
    expect(panel.dust.length).toBe(MG.panel.cols * MG.panel.rows);
    for (const d of panel.dust) {
      expect(d).toBeGreaterThanOrEqual(MG.panel.dustMin);
      expect(d).toBeLessThanOrEqual(MG.panel.dustMax);
    }
    expect(panelScore(panel)).toBeLessThan(0.5);
  });
  it('menggosok mengurangi debu hanya dalam radius kuas, tidak mengubah panel asli', () => {
    const before = panel.dust.slice();
    const out = scrubPanel(panel, 1, 1, 0.5);
    expect(panel.dust).toEqual(before);
    expect(out.dust[0]).toBeLessThan(before[0]);
    expect(out.dust[out.dust.length - 1]).toBe(before[before.length - 1]);
  });
  it('menggosok seluruh panel cukup lama membersihkannya (skor ~1)', () => {
    let p = panel;
    for (let r = 0; r < p.rows; r++) {
      for (let c = 0; c < p.cols; c++) p = scrubPanel(p, c + 0.5, r + 0.5, 1);
    }
    expect(panelClean(p)).toBe(true);
    expect(panelScore(p)).toBeGreaterThan(0.95);
  });
  it('debu menempel lagi pelan dan makin cepat pada kesulitan tinggi, maksimum 1', () => {
    const clean = { ...panel, dust: panel.dust.map(() => 0) };
    const easy = panelMeanDust(settlePanel(clean, 0, 1));
    const hard = panelMeanDust(settlePanel(clean, 1, 1));
    expect(easy).toBeCloseTo(MG.panel.settleRatePerSec, 10);
    expect(hard).toBeGreaterThan(easy);
    expect(panelMeanDust(settlePanel(panel, 1, 1000))).toBe(1);
  });
});
