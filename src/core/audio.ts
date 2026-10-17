import { AUDIO } from './constants';
import { barSeconds, generateBar, midiToHz, TRACKS, type NoteEvent, type TrackId, type TrackProfile } from './musicTheory';
import { createRng, hashString, type Rng } from './rng';

type Factory = () => AudioContext | null;

const defaultFactory: Factory = () => {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch {
    return null;
  }
};

interface MusicPlayer {
  track: TrackId;
  profile: TrackProfile;
  rng: Rng;
  bus: GainNode;
  delay: { input: GainNode } | null;
  nextTime: number;
  bar: number;
  timer: ReturnType<typeof setInterval>;
}

interface Loop { nodes: AudioNode[]; gain: GainNode; stop(): void }

/**
 * Synthesizer Web Audio prosedural (PRD 12): semua suara dibuat dari osilator, noise, filter, dan envelope
 * gain; tidak ada berkas audio. Semua metode aman dipanggil sebelum konteks audio tersedia (tidak melakukan apa-apa).
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private muted = false;
  private volume: number = 0.7;
  private engine: (Loop & { filter: BiquadFilterNode }) | null = null;
  private ambient: (Loop & { wind: GainNode }) | null = null;
  private ambientKey = '';
  private statik: Loop | null = null;
  private rover: { motor: OscillatorNode; motorGain: GainNode; motorFilter: BiquadFilterNode; rumble: Loop & { filter: BiquadFilterNode } } | null = null;
  private music: MusicPlayer | null = null;
  private wantedTrack: TrackId | null = null;
  private musicOn = true;

  constructor(private readonly factory: Factory = defaultFactory) {}

  get isMuted(): boolean { return this.muted; }
  get currentVolume(): number { return this.volume; }
  get ready(): boolean { return this.ctx !== null; }

  /** Buat konteks audio; harus dipanggil dari gestur pengguna (klik/tombol) agar tidak diblokir browser. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = this.factory();
      if (!this.ctx) return;
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.applyMaster(true);
      this.noise = this.makeNoise(this.ctx);
    }
    if (this.ctx && !this.music) this.startMusic();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * AUDIO.noiseSeconds);
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    const rng = createRng(AUDIO.noiseSeed);
    for (let i = 0; i < length; i++) data[i] = rng() * 2 - 1;
    return buf;
  }

  private applyMaster(immediate: boolean): void {
    if (!this.ctx || !this.master) return;
    const g = this.master.gain;
    const target = this.muted ? 0 : this.volume;
    g.cancelScheduledValues(this.ctx.currentTime);
    if (immediate || this.muted) g.value = target;
    else g.setTargetAtTime(target, this.ctx.currentTime, AUDIO.rampSec);
  }

  /** Mute berlaku seketika (gain master langsung 0). */
  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMaster(true);
  }

  setVolume(v01: number): void {
    this.volume = Math.min(1, Math.max(0, v01));
    this.applyMaster(false);
  }

  private get live(): { ctx: AudioContext; out: GainNode } | null {
    return this.ctx && this.master ? { ctx: this.ctx, out: this.master } : null;
  }

  /** Nada tunggal dengan envelope, opsional meluncur ke frekuensi lain. */
  tone(freq: number, durSec: number, type: OscillatorType = 'sine', vol = 0.2, slideTo?: number, delaySec = 0): void {
    const a = this.live;
    if (!a) return;
    const t0 = a.ctx.currentTime + delaySec;
    const osc = a.ctx.createOscillator();
    const g = a.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + durSec);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    osc.connect(g).connect(a.out);
    osc.start(t0);
    osc.stop(t0 + durSec + 0.05);
  }

  /** Semburan noise terfilter (desis gas, dentuman, langkah). */
  private burst(durSec: number, filter: BiquadFilterType, freq: number, vol: number, delaySec = 0): void {
    const a = this.live;
    if (!a || !this.noise) return;
    const t0 = a.ctx.currentTime + delaySec;
    const src = a.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = a.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = a.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durSec);
    src.connect(f).connect(g).connect(a.out);
    src.start(t0);
    src.stop(t0 + durSec + 0.05);
  }

  private loop(filter: BiquadFilterType, freq: number): Loop & { filter: BiquadFilterNode } | null {
    const a = this.live;
    if (!a || !this.noise) return null;
    const src = a.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = a.ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    const g = a.ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(a.out);
    src.start();
    return { nodes: [src, f, g], gain: g, filter: f, stop: () => { try { src.stop(); } catch { /* sudah berhenti */ } g.disconnect(); } };
  }

  click(): void { this.tone(660, 0.05, 'square', 0.08); }
  blip(): void { this.tone(520 + (Date.now() % 5) * 40, 0.035, 'square', 0.04); }
  beep(freq = 880): void { this.tone(freq, 0.12, 'sine', 0.14); }
  ping(): void { this.tone(1200, 0.35, 'sine', 0.12, 600); }
  alarm(): void {
    this.tone(880, 0.16, 'sawtooth', 0.1);
    this.tone(660, 0.16, 'sawtooth', 0.1, undefined, 0.2);
  }
  /** Dentuman mekanis singkat + desis gas saat pelepasan tahap roket. */
  stageSeparation(): void {
    this.tone(90, 0.18, 'square', 0.25, 40);
    this.burst(0.7, 'highpass', 2500, 0.18, 0.05);
  }
  /** Ledakan: letusan noise rendah, dentuman sangat rendah, dan retakan tajam di awal. */
  explosion(): void {
    this.burst(0.15, 'highpass', 1800, 0.35);
    this.burst(1.8, 'lowpass', 700, 0.55, 0.02);
    this.tone(70, 1.4, 'sawtooth', 0.4, 26);
    this.tone(120, 0.5, 'square', 0.2, 40, 0.02);
    this.burst(2.6, 'lowpass', 240, 0.4, 0.3);
  }
  touchdown(): void { this.tone(70, 0.3, 'sine', 0.3, 35); this.burst(0.5, 'lowpass', 500, 0.2); }
  footstep(): void { this.burst(0.09, 'lowpass', 420, 0.12); }
  jingle(success: boolean): void {
    const notes = success ? [523, 659, 784, 1047] : [392, 349, 311, 262];
    notes.forEach((n, i) => this.tone(n, 0.28, success ? 'triangle' : 'sawtooth', success ? 0.16 : 0.1, undefined, i * 0.16));
  }

  /** Suara mesin: noise terfilter yang mengikuti throttle (0-1) ditambah dengung rendah. */
  setEngine(level01: number): void {
    if (!this.live) return;
    if (level01 <= 0.001) {
      this.engine?.stop();
      this.engine = null;
      return;
    }
    if (!this.engine) {
      const l = this.loop('lowpass', AUDIO.engineMinHz);
      if (!l) return;
      this.engine = l;
    }
    const t = this.live!.ctx.currentTime;
    this.engine.gain.gain.setTargetAtTime(level01 * AUDIO.engineMaxGain, t, AUDIO.rampSec);
    this.engine.filter.frequency.setTargetAtTime(AUDIO.engineMinHz + level01 * (AUDIO.engineMaxHz - AUDIO.engineMinHz), t, AUDIO.rampSec);
  }

  /**
   * Suara Lunar Cruiser saat dikemudikan: dengung motor listrik (gergaji terfilter, nada naik dengan kecepatan)
   * ditambah gemuruh roda di atas regolit. `speed01` = kecepatan relatif 0-1; null = tidak sedang mengemudi.
   */
  setRover(speed01: number | null): void {
    const a = this.live;
    if (!a) return;
    if (speed01 === null) {
      this.stopRover();
      return;
    }
    const R = AUDIO.rover;
    const k = Math.min(1, Math.max(0, speed01));
    if (!this.rover) {
      const rumble = this.loop('lowpass', R.rumbleMinHz);
      if (!rumble) return;
      const motor = a.ctx.createOscillator();
      const motorFilter = a.ctx.createBiquadFilter();
      const motorGain = a.ctx.createGain();
      motor.type = 'sawtooth';
      motor.frequency.value = R.motorMinHz;
      motorFilter.type = 'lowpass';
      motorFilter.frequency.value = R.motorFilterMinHz;
      motorGain.gain.value = 0;
      motor.connect(motorFilter).connect(motorGain).connect(a.out);
      motor.start();
      this.rover = { motor, motorGain, motorFilter, rumble };
    }
    const t = a.ctx.currentTime;
    const r = this.rover;
    r.motor.frequency.setTargetAtTime(R.motorMinHz + k * (R.motorMaxHz - R.motorMinHz), t, 0.12);
    r.motorFilter.frequency.setTargetAtTime(R.motorFilterMinHz + k * (R.motorFilterMaxHz - R.motorFilterMinHz), t, 0.12);
    r.motorGain.gain.setTargetAtTime(R.motorIdleGain + k * (R.motorMaxGain - R.motorIdleGain), t, 0.1);
    r.rumble.filter.frequency.setTargetAtTime(R.rumbleMinHz + k * (R.rumbleMaxHz - R.rumbleMinHz), t, 0.12);
    r.rumble.gain.gain.setTargetAtTime(k * k * R.rumbleMaxGain, t, 0.12);
  }

  private stopRover(): void {
    const r = this.rover;
    this.rover = null;
    if (!r) return;
    r.rumble.stop();
    try { r.motor.stop(); } catch { /* sudah berhenti */ }
    r.motorGain.disconnect();
  }

  /** Pintu kabin Lunar Cruiser: dentang logam dan desis tekanan udara (masuk lebih tinggi, keluar lebih rendah). */
  roverDoor(entering: boolean): void {
    this.tone(entering ? 210 : 150, 0.14, 'square', 0.16, entering ? 120 : 90);
    this.tone(entering ? 740 : 520, 0.1, 'sine', 0.1, undefined, 0.16);
    this.burst(0.55, 'highpass', 3200, 0.14, 0.1);
  }

  /** Dengung ambient per destinasi: osilator rendah + noise terfilter (angin lebih kuat di Mars). */
  setAmbient(destinationId: string | null, wind01 = 0): void {
    const a = this.live;
    if (!a) return;
    const key = destinationId ?? '';
    if (key !== this.ambientKey) {
      this.ambient?.stop();
      this.ambient = null;
      this.ambientKey = key;
      if (destinationId) {
        const l = this.loop('bandpass', destinationId === 'mars' ? 380 : 140);
        if (l) {
          const hum = a.ctx.createOscillator();
          const hg = a.ctx.createGain();
          hum.type = 'sine';
          hum.frequency.value = AUDIO.ambientHum[destinationId] ?? 55;
          hg.gain.value = 0.05;
          hum.connect(hg).connect(a.out);
          hum.start();
          this.ambient = {
            ...l, wind: l.gain,
            stop: () => { l.stop(); try { hum.stop(); } catch { /* sudah berhenti */ } hg.disconnect(); },
          };
        }
      }
    }
    if (this.ambient) {
      const base = destinationId === 'mars' ? 0.12 : 0.03;
      this.ambient.wind.gain.setTargetAtTime(base + wind01 * 0.35, a.ctx.currentTime, 0.3);
    }
  }

  /** Statik radio saat sinyal lemah (level 0-1). */
  setStatic(level01: number): void {
    if (!this.live) return;
    if (level01 <= 0.01) {
      this.statik?.stop();
      this.statik = null;
      return;
    }
    if (!this.statik) this.statik = this.loop('highpass', 2500);
    this.statik?.gain.gain.setTargetAtTime(level01 * 0.1, this.live!.ctx.currentTime, 0.1);
  }

  get currentTrack(): TrackId | null { return this.music?.track ?? null; }
  get musicEnabled(): boolean { return this.musicOn; }

  /** Musik latar prosedural per scene/planet; null = hening. Aman dipanggil sebelum audio dibuka (dimulai saat unlock). */
  playMusic(track: TrackId | null): void {
    this.wantedTrack = track;
    if (this.music && this.music.track === track) return;
    this.stopMusic();
    if (track) this.startMusic();
  }

  setMusicEnabled(on: boolean): void {
    this.musicOn = on;
    if (!on) this.stopMusic();
    else if (this.wantedTrack && !this.music) this.startMusic();
  }

  private startMusic(): void {
    const a = this.live;
    const track = this.wantedTrack;
    if (!a || !track || !this.musicOn || this.music) return;
    const profile = TRACKS[track];
    const bus = a.ctx.createGain();
    bus.gain.setValueAtTime(0.0001, a.ctx.currentTime);
    bus.gain.setTargetAtTime(AUDIO.musicGain, a.ctx.currentTime, AUDIO.musicFadeInSec / 3);
    bus.connect(a.out);
    let delay: MusicPlayer['delay'] = null;
    if (typeof a.ctx.createDelay === 'function') {
      // Gema berumpan balik untuk nuansa ruang luas pada not lead.
      const input = a.ctx.createGain();
      const echo = a.ctx.createDelay(2);
      const feedback = a.ctx.createGain();
      echo.delayTime.value = (60 / profile.bpm) * 0.75;
      feedback.gain.value = 0.42;
      input.connect(echo);
      echo.connect(feedback);
      feedback.connect(echo);
      echo.connect(bus);
      delay = { input };
    }
    const player: MusicPlayer = {
      track, profile, rng: createRng((hashString(track) ^ AUDIO.musicSeedSalt) >>> 0), bus, delay,
      nextTime: a.ctx.currentTime + 0.1, bar: 0,
      timer: setInterval(() => this.tickMusic(), AUDIO.musicTickMs),
    };
    this.music = player;
    this.tickMusic();
  }

  private stopMusic(): void {
    const m = this.music;
    this.music = null;
    if (!m) return;
    clearInterval(m.timer);
    const a = this.live;
    if (!a) return;
    m.bus.gain.cancelScheduledValues(a.ctx.currentTime);
    m.bus.gain.setTargetAtTime(0.0001, a.ctx.currentTime, AUDIO.musicFadeOutSec / 3);
    setTimeout(() => { try { m.bus.disconnect(); } catch { /* sudah lepas */ } }, AUDIO.musicFadeOutSec * 1000 + 300);
  }

  /** Jadwalkan birama berikutnya sampai batas lookahead (dipanggil timer; publik agar bisa diuji tanpa timer). */
  tickMusic(): void {
    const a = this.live;
    const m = this.music;
    if (!a || !m) return;
    const now = a.ctx.currentTime;
    if (m.nextTime < now) m.nextTime = now + 0.05;
    const beatSec = 60 / m.profile.bpm;
    while (m.nextTime < now + AUDIO.musicLookaheadSec) {
      for (const ev of generateBar(m.profile, m.bar, m.rng)) this.playNote(m, ev, m.nextTime + ev.beat * beatSec, beatSec);
      m.nextTime += barSeconds(m.profile);
      m.bar += 1;
    }
  }

  private playNote(m: MusicPlayer, ev: NoteEvent, t0: number, beatSec: number): void {
    const a = this.live;
    if (!a) return;
    const p = m.profile;
    const dur = ev.dur * beatSec;
    const freq = midiToHz(ev.midi);
    const g = a.ctx.createGain();
    const peak = Math.max(0.0002, ev.vel * (ev.voice === 'pad' ? p.pad.gain : ev.voice === 'lead' ? p.lead?.gain ?? 0 : p.bass?.gain ?? 0));
    let tail: number;
    const oscs: OscillatorNode[] = [];
    const makeOsc = (type: OscillatorType, detune: number): OscillatorNode => {
      const o = a.ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      o.detune.value = detune;
      oscs.push(o);
      return o;
    };
    if (ev.voice === 'pad') {
      const f = a.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = p.pad.filterHz;
      for (const d of [-p.pad.detuneCents, p.pad.detuneCents]) makeOsc(p.pad.type, d).connect(f);
      f.connect(g);
      tail = p.pad.releaseSec;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + p.pad.attackSec);
      g.gain.setValueAtTime(peak, t0 + Math.max(p.pad.attackSec, dur));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + tail);
    } else if (ev.voice === 'lead' && p.lead) {
      makeOsc(p.lead.type, 0).connect(g);
      tail = p.lead.decaySec;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.012 + tail);
      if (m.delay) {
        const send = a.ctx.createGain();
        send.gain.value = p.lead.delayMix;
        g.connect(send);
        send.connect(m.delay.input);
      }
    } else if (ev.voice === 'bass' && p.bass) {
      const f = a.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(p.bass.filterHz * 2.2, t0);
      f.frequency.exponentialRampToValueAtTime(p.bass.filterHz, t0 + dur);
      makeOsc(p.bass.type, 0).connect(f);
      f.connect(g);
      tail = 0.08;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + tail);
    } else return;
    g.connect(m.bus);
    for (const o of oscs) {
      o.start(t0);
      o.stop(t0 + dur + tail + 0.1);
    }
  }

  /** Hentikan semua suara berkelanjutan (saat ganti scene). */
  stopLoops(): void {
    this.engine?.stop();
    this.engine = null;
    this.statik?.stop();
    this.statik = null;
    this.ambient?.stop();
    this.ambient = null;
    this.ambientKey = '';
    this.stopRover();
  }
}

export const audio = new AudioEngine();
