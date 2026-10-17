import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from '../../src/core/audio';
import { AUDIO } from '../../src/core/constants';
import {
  barSeconds, degreeToMidi, generateBar, midiToHz, TRACK_IDS, TRACKS, trackFor, type TrackId,
} from '../../src/core/musicTheory';
import { createRng } from '../../src/core/rng';

describe('teori musik prosedural', () => {
  it('midiToHz: A4 = 440 Hz, oktaf menggandakan frekuensi', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
    expect(midiToHz(81)).toBeCloseTo(880, 6);
    expect(midiToHz(57)).toBeCloseTo(220, 6);
  });
  it('degreeToMidi: melewati oktaf dan derajat negatif mengikuti tangga nada', () => {
    const pent = [0, 3, 5, 7, 10];
    expect(degreeToMidi(45, pent, 0)).toBe(45);
    expect(degreeToMidi(45, pent, 4)).toBe(55);
    expect(degreeToMidi(45, pent, 5)).toBe(57);
    expect(degreeToMidi(45, pent, 7)).toBe(62);
    expect(degreeToMidi(45, pent, -1)).toBe(45 - 12 + 10);
  });
  it('setiap planet punya karakter berbeda: tangga nada, tempo, dan nada dasar', () => {
    const fingerprint = (id: TrackId) => JSON.stringify([TRACKS[id].scale, TRACKS[id].bpm, TRACKS[id].rootMidi]);
    expect(new Set(TRACK_IDS.map(fingerprint)).size).toBe(TRACK_IDS.length);
    expect(TRACKS.moon.bpm).toBeLessThan(TRACKS.mars.bpm);
    expect(TRACKS.moon.bass).toBeNull();
    expect(TRACKS.mars.bass).not.toBeNull();
  });
  it('trackFor: musik mengikuti scene dan planet; Review hening', () => {
    expect(trackFor('briefing', 'mars')).toBe('briefing');
    expect(trackFor('design', 'moon')).toBe('design');
    expect(trackFor('flight', 'moon')).toBe('flight_moon');
    expect(trackFor('flight', 'mars')).toBe('flight_mars');
    expect(trackFor('surface', 'moon')).toBe('moon');
    expect(trackFor('surface', 'mars')).toBe('mars');
    expect(trackFor('review', 'moon')).toBeNull();
  });
  it('generateBar: deterministik untuk seed yang sama, berbeda untuk seed lain', () => {
    const a = generateBar(TRACKS.mars, 3, createRng(5));
    expect(generateBar(TRACKS.mars, 3, createRng(5))).toEqual(a);
    const variants = new Set(Array.from({ length: 12 }, (_, s) => JSON.stringify(generateBar(TRACKS.mars, 3, createRng(s)))));
    expect(variants.size).toBeGreaterThan(3);
  });
  it.each(TRACK_IDS)('%s: not valid (dalam birama, di tangga nada, durasi dan kekuatan wajar)', (id) => {
    const p = TRACKS[id];
    const rng = createRng(1);
    const pitchClasses = new Set(p.scale.map((s) => (p.rootMidi + s) % 12));
    let leads = 0;
    for (let bar = 0; bar < 16; bar++) {
      const events = generateBar(p, bar, rng);
      expect(events.some((e) => e.voice === 'pad')).toBe(true);
      for (const e of events) {
        expect(e.beat).toBeGreaterThanOrEqual(0);
        expect(e.beat).toBeLessThan(p.beatsPerBar);
        expect(e.dur).toBeGreaterThan(0);
        expect(e.vel).toBeGreaterThan(0);
        expect(e.vel).toBeLessThanOrEqual(1);
        expect(pitchClasses.has(((e.midi % 12) + 12) % 12)).toBe(true);
        if (e.voice === 'lead') leads++;
      }
    }
    expect(leads > 0).toBe(p.lead !== null);
    expect(barSeconds(p)).toBeCloseTo((p.beatsPerBar * 60) / p.bpm, 10);
  });
  it('bas Mars mengikuti pola dan jatuh pada ketukan setengah', () => {
    const bass = generateBar(TRACKS.mars, 0, createRng(1)).filter((e) => e.voice === 'bass');
    expect(bass.map((e) => e.beat)).toEqual(TRACKS.mars.bass!.pattern.map((on, i) => (on ? i * 0.5 : -1)).filter((b) => b >= 0));
  });
});

class Param {
  value = 0;
  setValueAtTime(v: number): void { this.value = v; }
  exponentialRampToValueAtTime(): void { /* kosong */ }
  setTargetAtTime(v: number): void { this.value = v; }
  cancelScheduledValues(): void { /* kosong */ }
}
class Node {
  connect<T>(n: T): T { return n; }
  disconnect(): void { /* kosong */ }
}
class Gain extends Node { gain = new Param(); }
class Osc extends Node {
  frequency = new Param(); detune = new Param(); type = 'sine'; started = 0; stopped = false;
  start(): void { this.started += 1; }
  stop(): void { this.stopped = true; }
}
class Filter extends Node { frequency = new Param(); type = 'lowpass'; }
class Delay extends Node { delayTime = new Param(); }
class Source extends Node { buffer: unknown = null; loop = false; start(): void { /* kosong */ } stop(): void { /* kosong */ } }

class Ctx {
  currentTime = 0; sampleRate = 8000; state = 'running'; destination = new Node();
  oscs: Osc[] = [];
  createGain(): Gain { return new Gain(); }
  createOscillator(): Osc { const o = new Osc(); this.oscs.push(o); return o; }
  createBiquadFilter(): Filter { return new Filter(); }
  createDelay(): Delay { return new Delay(); }
  createBufferSource(): Source { return new Source(); }
  createBuffer(_c: number, length: number): { getChannelData: () => Float32Array } { const d = new Float32Array(length); return { getChannelData: () => d }; }
  resume(): Promise<void> { return Promise.resolve(); }
}

const make = () => {
  const ctx = new Ctx();
  const engine = new AudioEngine(() => ctx as unknown as AudioContext);
  return { ctx, engine };
};

describe('musik di mesin audio', () => {
  afterEach(() => vi.useRealTimers());

  it('aman sebelum audio dibuka; lagu yang diminta dimulai saat unlock', () => {
    const { ctx, engine } = make();
    engine.playMusic('moon');
    expect(engine.currentTrack).toBeNull();
    expect(ctx.oscs.length).toBe(0);
    engine.unlock();
    expect(engine.currentTrack).toBe('moon');
    expect(ctx.oscs.length).toBeGreaterThan(0);
    engine.playMusic(null);
  });
  it('tickMusic menjadwalkan birama berikutnya seiring waktu berjalan', () => {
    vi.useFakeTimers();
    const { ctx, engine } = make();
    engine.unlock();
    engine.playMusic('mars');
    const first = ctx.oscs.length;
    expect(first).toBeGreaterThan(0);
    ctx.currentTime += barSeconds(TRACKS.mars) * 2;
    engine.tickMusic();
    expect(ctx.oscs.length).toBeGreaterThan(first);
    engine.playMusic(null);
  });
  it('mengganti lagu menghentikan yang lama; lagu sama diabaikan; null menghentikan', () => {
    vi.useFakeTimers();
    const { ctx, engine } = make();
    engine.unlock();
    engine.playMusic('moon');
    const n = ctx.oscs.length;
    engine.playMusic('moon');
    expect(ctx.oscs.length).toBe(n);
    engine.playMusic('mars');
    expect(engine.currentTrack).toBe('mars');
    engine.playMusic(null);
    expect(engine.currentTrack).toBeNull();
    const after = ctx.oscs.length;
    vi.advanceTimersByTime(AUDIO.musicTickMs * 5);
    expect(ctx.oscs.length).toBe(after);
  });
  it('mematikan musik menghentikannya dan menyalakan lagi melanjutkan lagu yang diminta', () => {
    vi.useFakeTimers();
    const { engine } = make();
    engine.unlock();
    engine.playMusic('briefing');
    engine.setMusicEnabled(false);
    expect(engine.currentTrack).toBeNull();
    expect(engine.musicEnabled).toBe(false);
    engine.playMusic('design');
    expect(engine.currentTrack).toBeNull();
    engine.setMusicEnabled(true);
    expect(engine.currentTrack).toBe('design');
    engine.playMusic(null);
  });
  it('urutan not tiap lagu deterministik antar mesin (seed dari id lagu)', () => {
    vi.useFakeTimers();
    const freqs = (): number[] => {
      const { ctx, engine } = make();
      engine.unlock();
      engine.playMusic('flight_mars');
      ctx.currentTime += 12;
      engine.tickMusic();
      const f = ctx.oscs.map((o) => (o as unknown as { frequency: { value: number } }).frequency.value);
      engine.playMusic(null);
      return f;
    };
    expect(freqs()).toEqual(freqs());
  });
});
