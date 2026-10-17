import { MG } from '../core/constants';
import { rngRange, type Rng } from '../core/rng';
import { clamp } from './margin';

/* ------------------------------------------------------------------ Foto Panorama */

export interface PhotoParams { frameTolDeg: number; blurSpeedDegS: number; shots: number }
export interface PhotoTarget { angleDeg: number; kind: number }

export function photoParams(difficulty: number): PhotoParams {
  const d = clamp(difficulty, 0, 1);
  return {
    frameTolDeg: MG.photo.frameTolBase - MG.photo.frameTolDiffGain * d,
    blurSpeedDegS: MG.photo.blurSpeedBase - MG.photo.blurSpeedDiffGain * d,
    shots: MG.photo.shots,
  };
}

/** Selisih sudut bertanda terpendek, -180..180 derajat. */
export function angleDiffDeg(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Target foto dengan jarak antar-target minimal; sudut 0-360, deterministik dari rng. */
export function generatePhotoTargets(rng: Rng, count: number): PhotoTarget[] {
  const targets: PhotoTarget[] = [];
  let guard = 0;
  while (targets.length < count && guard++ < 500) {
    const angleDeg = rngRange(rng, 0, 360);
    if (targets.every((t) => Math.abs(angleDiffDeg(t.angleDeg, angleDeg)) >= MG.photo.minTargetSepDeg)) {
      targets.push({ angleDeg, kind: Math.floor(rng() * 3) });
    }
  }
  return targets;
}

/** Kualitas satu foto = pemusatan x kestabilan (kamera yang bergerak menjadi buram). */
export function photoShotQuality(offsetDeg: number, panSpeedDegS: number, p: PhotoParams): number {
  const centering = clamp(1 - Math.abs(offsetDeg) / p.frameTolDeg, 0, 1);
  const steadiness = clamp(1 - Math.abs(panSpeedDegS) / p.blurSpeedDegS, 0, 1);
  return centering * steadiness;
}

/** Skor = rata-rata kualitas dari jumlah foto yang diwajibkan (foto yang tidak diambil bernilai 0). */
export function photoScore(qualities: number[], shots: number): number {
  return shots > 0 ? clamp(qualities.reduce((s, q) => s + q, 0) / shots, 0, 1) : 0;
}

/* ------------------------------------------------------------------ Bor Presisi */

export interface DrillParams { zoneLo: number; zoneHi: number }

export interface DrillState {
  pressure: number;
  depth01: number;
  heat: number;
  elapsedSec: number;
  timeInZoneSec: number;
  overheats: number;
  coolingSec: number;
  done: boolean;
}

export function drillParams(difficulty: number): DrillParams {
  const width = MG.drill.zoneWidthBase - MG.drill.zoneWidthDiffLoss * clamp(difficulty, 0, 1);
  return { zoneLo: MG.drill.zoneLo, zoneHi: MG.drill.zoneLo + width };
}

export function createDrill(): DrillState {
  return { pressure: 0, depth01: 0, heat: 0, elapsedSec: 0, timeInZoneSec: 0, overheats: 0, coolingSec: 0, done: false };
}

/**
 * Satu langkah bor: menekan menaikkan tekanan, melepas menurunkannya. Di zona hijau bor maju penuh,
 * di bawah zona proporsional terhadap tekanan, di atas zona lebih lambat dan memanaskan; panas penuh = macet 2 detik.
 */
export function stepDrill(s: DrillState, pressing: boolean, p: DrillParams, dt: number): DrillState {
  if (s.done) return s;
  const D = MG.drill;
  const next = { ...s, elapsedSec: s.elapsedSec + dt };
  next.pressure = clamp(s.pressure + (pressing ? D.pressRate : -D.decayRate) * dt, 0, 1);
  const inZone = next.pressure >= p.zoneLo && next.pressure <= p.zoneHi;
  const above = next.pressure > p.zoneHi;

  if (s.coolingSec > 0) {
    next.coolingSec = Math.max(0, s.coolingSec - dt);
  } else {
    // Di bawah zona laju naik linear dari 0 (tanpa tekanan) ke 1 (awal zona); di atas zona lebih lambat karena bor menghentak.
    const rate = inZone ? 1 : above ? D.aboveZoneRate : next.pressure / p.zoneLo;
    next.depth01 = clamp(s.depth01 + (rate * dt) / D.depthTimeSec, 0, 1);
    if (inZone) next.timeInZoneSec = s.timeInZoneSec + dt;
    next.heat = above ? s.heat + D.heatRisePerSec * dt : Math.max(0, s.heat - D.heatCoolPerSec * dt);
    if (next.heat >= 1) {
      next.heat = D.heatAfterOverheat;
      next.overheats = s.overheats + 1;
      next.coolingSec = D.overheatCooldownSec;
    }
  }
  if (next.depth01 >= 1 || next.elapsedSec >= D.timeLimitSec) next.done = true;
  return next;
}

/** Skor bor = 0,6 x kedalaman + 0,4 x porsi waktu di zona hijau - 0,1 per overheat. */
export function drillScore(depth01: number, timeInZoneSec: number, elapsedSec: number, overheats: number): number {
  const zone = elapsedSec > 0 ? timeInZoneSec / elapsedSec : 0;
  return clamp(MG.drill.depthWeight * depth01 + MG.drill.zoneWeight * zone - MG.drill.overheatPenalty * overheats, 0, 1);
}

/* ------------------------------------------------------------------ Cocokkan Spektrum */

export interface SpectrumDip { center: number; depth: number }
export interface SpectrumControls { shift: number; scale: number }
export interface SpectrumPuzzle { dips: SpectrumDip[]; width: number; hidden: SpectrumControls }

export function generateSpectrum(rng: Rng, difficulty: number): SpectrumPuzzle {
  const S = MG.spectrum;
  const d = clamp(difficulty, 0, 1);
  const count = S.dipsBase + Math.round(S.dipsDiffGain * d);
  const dips: SpectrumDip[] = [];
  for (let i = 0; i < count; i++) {
    const slot = (i + 0.5) / count;
    dips.push({ center: clamp(slot + rngRange(rng, -0.05, 0.05), 0.12, 0.88), depth: rngRange(rng, S.dipDepthMin, S.dipDepthMax) });
  }
  return {
    dips, width: S.dipWidthBase - S.dipWidthDiffLoss * d,
    hidden: { shift: rngRange(rng, -S.hiddenShiftMax, S.hiddenShiftMax), scale: rngRange(rng, S.hiddenScaleMin, S.hiddenScaleMax) },
  };
}

/** Nilai kurva spektrum di x (0-1): 1 dikurangi dip absorpsi bergeser dan terskala dari tengah. */
export function spectrumValue(dips: SpectrumDip[], width: number, c: SpectrumControls, x: number): number {
  let v = 1;
  for (const dip of dips) {
    const center = 0.5 + (dip.center - 0.5) * c.scale + c.shift;
    v -= dip.depth * Math.exp(-((x - center) ** 2) / (2 * width * width));
  }
  return v;
}

/** Skor = 1 - RMSE(kurva pemain, kurva referensi) / 0,3, dijaga 0-1. */
export function spectrumScore(puzzle: SpectrumPuzzle, player: SpectrumControls): number {
  const n = MG.spectrum.samples;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    const diff = spectrumValue(puzzle.dips, puzzle.width, player, x) - spectrumValue(puzzle.dips, puzzle.width, puzzle.hidden, x);
    sum += diff * diff;
  }
  return clamp(1 - Math.sqrt(sum / n) / MG.spectrum.rmseZero, 0, 1);
}

/* ------------------------------------------------------------------ Kalibrasi Getaran */

export function rhythmWindowSec(difficulty: number): number {
  return MG.rhythm.windowBase - MG.rhythm.windowDiffLoss * clamp(difficulty, 0, 1);
}

/** Waktu ketukan (detik) dengan selang acak 0,85-1,3 detik; deterministik dari rng. */
export function generateBeats(rng: Rng): number[] {
  const R = MG.rhythm;
  const beats: number[] = [];
  let t = R.firstBeatSec;
  for (let i = 0; i < R.beats; i++) {
    beats.push(t);
    t += rngRange(rng, R.intervalMin, R.intervalMax);
  }
  return beats;
}

export const rhythmDurationSec = (beats: number[]): number => (beats.length > 0 ? beats[beats.length - 1] + MG.rhythm.tailSec : 0);

export interface RhythmMatch { beatIndex: number; pressIndex: number; errorSec: number; accuracy: number }

/** Cocokkan tiap ketukan ke penekanan terdekat yang belum dipakai dalam jendela; sisa penekanan = ekstra. */
export function matchPresses(beats: number[], presses: number[], windowSec: number): { matches: RhythmMatch[]; extra: number } {
  const used = new Set<number>();
  const matches: RhythmMatch[] = [];
  beats.forEach((beat, beatIndex) => {
    let best = -1;
    let bestErr = Infinity;
    presses.forEach((p, i) => {
      const err = Math.abs(p - beat);
      if (!used.has(i) && err <= windowSec && err < bestErr) { best = i; bestErr = err; }
    });
    if (best >= 0) {
      used.add(best);
      matches.push({ beatIndex, pressIndex: best, errorSec: presses[best] - beat, accuracy: 1 - bestErr / windowSec });
    }
  });
  return { matches, extra: presses.length - used.size };
}

/** Skor = rata-rata akurasi semua ketukan (terlewat = 0) - 0,03 per penekanan ekstra. */
export function rhythmScore(beats: number[], presses: number[], windowSec: number): number {
  if (beats.length === 0) return 0;
  const { matches, extra } = matchPresses(beats, presses, windowSec);
  const sum = matches.reduce((s, m) => s + m.accuracy, 0);
  return clamp(sum / beats.length - MG.rhythm.extraPressPenalty * extra, 0, 1);
}


/* ------------------------------------------------------------------ Pasang dan Sambungkan */

export interface WeatherPuzzle {
  /** portOfCable[k] = indeks port (urutan tampilan) tempat kabel k harus dipasang. */
  portOfCable: number[];
}

export interface WeatherState { linked: boolean[]; wrong: number }

export function weatherCableCount(difficulty: number): number {
  return Math.round(MG.weather.cablesBase + MG.weather.cablesDiffGain * clamp(difficulty, 0, 1));
}

/** Permutasi kabel ke port (Fisher-Yates dengan rng berseed). */
export function generateWeatherPuzzle(rng: Rng, difficulty: number): WeatherPuzzle {
  const n = weatherCableCount(difficulty);
  const ports = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ports[i], ports[j]] = [ports[j], ports[i]];
  }
  return { portOfCable: ports };
}

export function createWeatherState(puzzle: WeatherPuzzle): WeatherState {
  return { linked: puzzle.portOfCable.map(() => false), wrong: 0 };
}

/** Pasang kabel ke port: benar menyambungkan, salah menambah hitungan kesalahan. Kabel terpasang diabaikan. */
export function connectCable(puzzle: WeatherPuzzle, s: WeatherState, cable: number, port: number): WeatherState {
  if (cable < 0 || cable >= s.linked.length || s.linked[cable]) return s;
  if (puzzle.portOfCable[cable] === port) {
    const linked = s.linked.slice();
    linked[cable] = true;
    return { linked, wrong: s.wrong };
  }
  return { linked: s.linked, wrong: s.wrong + 1 };
}

export const weatherDone = (s: WeatherState): boolean => s.linked.every(Boolean);

/** Skor = porsi kabel terpasang (dengan bonus kecepatan bila semua tersambung) dikurangi penalti salah colok. */
export function weatherScore(s: WeatherState, elapsedSec: number): number {
  const total = s.linked.length;
  if (total === 0) return 0;
  const w = MG.weather;
  const base = s.linked.filter(Boolean).length / total;
  const speed = weatherDone(s) ? clamp(1 - elapsedSec / w.timeLimitSec, 0, 1) : 0;
  return clamp(base * (1 - w.speedWeight) + speed * w.speedWeight - s.wrong * w.wrongPenalty, 0, 1);
}

/* ------------------------------------------------------------------ Bersihkan Panel */

export interface PanelDust { cols: number; rows: number; dust: number[] }

/** Lapisan debu awal per sel panel (0 = bersih, 1 = tertutup), deterministik dari rng. */
export function generatePanelDust(rng: Rng): PanelDust {
  const { cols, rows, dustMin, dustMax } = MG.panel;
  return { cols, rows, dust: Array.from({ length: cols * rows }, () => rngRange(rng, dustMin, dustMax)) };
}

/** Gosok: sel dalam radius kuas berkurang debunya, makin dekat pusat makin cepat. Mengembalikan panel baru. */
export function scrubPanel(p: PanelDust, cx: number, cy: number, dt: number): PanelDust {
  const { brushRadius, scrubRatePerSec } = MG.panel;
  const dust = p.dust.slice();
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      const d = Math.hypot(c + 0.5 - cx, r + 0.5 - cy);
      if (d > brushRadius) continue;
      const i = r * p.cols + c;
      dust[i] = Math.max(0, dust[i] - scrubRatePerSec * (1 - d / brushRadius) * dt);
    }
  }
  return { ...p, dust };
}

/** Debu statis perlahan menempel lagi pada sel yang sudah bersih; makin sulit, makin cepat. */
export function settlePanel(p: PanelDust, difficulty: number, dt: number): PanelDust {
  const rate = MG.panel.settleRatePerSec + MG.panel.settleRateDiffGain * clamp(difficulty, 0, 1);
  return { ...p, dust: p.dust.map((v) => Math.min(1, v + rate * dt)) };
}

export const panelMeanDust = (p: PanelDust): number => (p.dust.length > 0 ? p.dust.reduce((s, v) => s + v, 0) / p.dust.length : 0);

/** Skor = fraksi debu yang berhasil dibersihkan. */
export const panelScore = (p: PanelDust): number => clamp(1 - panelMeanDust(p), 0, 1);

export const panelClean = (p: PanelDust): boolean => panelMeanDust(p) <= MG.panel.cleanEnoughMean;
