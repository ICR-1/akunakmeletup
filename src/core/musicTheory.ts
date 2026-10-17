import type { Rng } from './rng';
import type { SceneId } from './constants';

/**
 * Teori musik prosedural murni (tanpa Web Audio/DOM): profil per planet dan pembangkit not per birama
 * yang deterministik dari rng berseed. `AudioEngine` hanya menerjemahkan not ini menjadi osilator.
 */
export type TrackId = 'briefing' | 'design' | 'flight_moon' | 'flight_mars' | 'moon' | 'mars';

export type VoiceName = 'pad' | 'lead' | 'bass';

export interface NoteEvent {
  /** Posisi dalam birama (ketukan, 0 sampai < beatsPerBar). */
  beat: number;
  midi: number;
  /** Panjang dalam ketukan. */
  dur: number;
  /** Kekuatan 0-1. */
  vel: number;
  voice: VoiceName;
}

interface VoiceBase { type: OscillatorType; octave: number; gain: number }

export interface TrackProfile {
  id: TrackId;
  label: string;
  bpm: number;
  beatsPerBar: number;
  rootMidi: number;
  /** Selisih semiton dari nada dasar (tangga nada). */
  scale: number[];
  /** Derajat tangga nada akar tiap birama (berulang). */
  progression: number[];
  pad: VoiceBase & { chord: number[]; attackSec: number; releaseSec: number; filterHz: number; detuneCents: number };
  lead: (VoiceBase & { density: number; strongBoost: number; range: [number, number]; durBeats: number; decaySec: number; delayMix: number }) | null;
  bass: (VoiceBase & { pattern: number[]; filterHz: number; durBeats: number }) | null;
}

export const midiToHz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** Nada MIDI dari derajat tangga nada (derajat boleh negatif atau melewati satu oktaf). */
export function degreeToMidi(rootMidi: number, scale: number[], degree: number): number {
  const n = scale.length;
  const octave = Math.floor(degree / n);
  const idx = ((degree % n) + n) % n;
  return rootMidi + 12 * octave + scale[idx];
}

export const barSeconds = (p: TrackProfile): number => (p.beatsPerBar * 60) / p.bpm;

const pick = <T>(rng: Rng, items: T[]): T => items[Math.floor(rng() * items.length) % items.length];

export const TRACKS: Record<TrackId, TrackProfile> = {
  // Bulan: pelan, lapang, pentatonik minor; pad sinus panjang dan lonceng jarang dengan gema.
  moon: {
    id: 'moon', label: 'Bulan', bpm: 54, beatsPerBar: 4, rootMidi: 45, scale: [0, 3, 5, 7, 10], progression: [0, 3, 2, 4],
    pad: { type: 'sine', octave: 0, gain: 0.16, chord: [0, 2, 4], attackSec: 2.2, releaseSec: 2.6, filterHz: 1400, detuneCents: 6 },
    lead: { type: 'sine', octave: 2, gain: 0.1, density: 0.2, strongBoost: 0.15, range: [0, 7], durBeats: 2, decaySec: 2.2, delayMix: 0.55 },
    bass: null,
  },
  // Mars: berat dan berkarat, Frigia; dengung gergaji, denyut bas, dan petikan persegi gelap.
  mars: {
    id: 'mars', label: 'Mars', bpm: 76, beatsPerBar: 4, rootMidi: 38, scale: [0, 1, 3, 5, 7, 8, 10], progression: [0, 0, 1, 0, 3, 0, 1, 4],
    pad: { type: 'sawtooth', octave: 0, gain: 0.11, chord: [0, 2, 4], attackSec: 1.4, releaseSec: 1.8, filterHz: 700, detuneCents: 12 },
    lead: { type: 'square', octave: 2, gain: 0.06, density: 0.32, strongBoost: 0.2, range: [0, 6], durBeats: 0.5, decaySec: 0.35, delayMix: 0.3 },
    bass: { type: 'sawtooth', octave: -1, gain: 0.22, pattern: [1, 0, 0, 1, 1, 0, 1, 0], filterHz: 320, durBeats: 0.4 },
  },
  // Briefing: udara terbuka, Lidia; pad lembut dengan arpeggio segitiga.
  briefing: {
    id: 'briefing', label: 'Briefing', bpm: 60, beatsPerBar: 4, rootMidi: 48, scale: [0, 2, 4, 6, 7, 9, 11], progression: [0, 4, 3, 1],
    pad: { type: 'triangle', octave: 0, gain: 0.13, chord: [0, 2, 4], attackSec: 1.8, releaseSec: 2.2, filterHz: 1800, detuneCents: 5 },
    lead: { type: 'triangle', octave: 2, gain: 0.08, density: 0.35, strongBoost: 0.1, range: [0, 9], durBeats: 1, decaySec: 1.4, delayMix: 0.5 },
    bass: null,
  },
  // Desain: tenang dan fokus, Dorian; petikan sinus ringan dengan denyut bas lembut.
  design: {
    id: 'design', label: 'Desain', bpm: 66, beatsPerBar: 4, rootMidi: 40, scale: [0, 2, 3, 5, 7, 9, 10], progression: [0, 3, 5, 3],
    pad: { type: 'sine', octave: 1, gain: 0.12, chord: [0, 2, 4], attackSec: 1.2, releaseSec: 1.6, filterHz: 1600, detuneCents: 4 },
    lead: { type: 'sine', octave: 2, gain: 0.08, density: 0.42, strongBoost: 0.2, range: [0, 8], durBeats: 0.75, decaySec: 0.9, delayMix: 0.4 },
    bass: { type: 'sine', octave: -1, gain: 0.16, pattern: [1, 0, 0, 0, 1, 0, 0, 0], filterHz: 400, durBeats: 0.8 },
  },
  // Penerbangan Bulan: tegang dan stabil, minor alami; arpeggio cepat di atas bas berdenyut.
  flight_moon: {
    id: 'flight_moon', label: 'Penerbangan ke Bulan', bpm: 96, beatsPerBar: 4, rootMidi: 43, scale: [0, 2, 3, 5, 7, 8, 10], progression: [0, 5, 3, 4],
    pad: { type: 'triangle', octave: 0, gain: 0.11, chord: [0, 2, 4], attackSec: 0.8, releaseSec: 1.0, filterHz: 1500, detuneCents: 7 },
    lead: { type: 'triangle', octave: 2, gain: 0.07, density: 0.5, strongBoost: 0.2, range: [0, 7], durBeats: 0.5, decaySec: 0.5, delayMix: 0.35 },
    bass: { type: 'sawtooth', octave: -1, gain: 0.15, pattern: [1, 0, 1, 0, 1, 0, 1, 1], filterHz: 380, durBeats: 0.4 },
  },
  // Penerbangan Mars: lebih mendesak, Frigia dominan; denyut bas rapat dan petikan persegi.
  flight_mars: {
    id: 'flight_mars', label: 'Penerbangan ke Mars', bpm: 108, beatsPerBar: 4, rootMidi: 38, scale: [0, 1, 3, 5, 7, 8, 10], progression: [0, 1, 0, 4],
    pad: { type: 'sawtooth', octave: 0, gain: 0.09, chord: [0, 2, 4], attackSec: 0.7, releaseSec: 0.9, filterHz: 800, detuneCents: 10 },
    lead: { type: 'square', octave: 2, gain: 0.055, density: 0.55, strongBoost: 0.2, range: [0, 6], durBeats: 0.5, decaySec: 0.3, delayMix: 0.25 },
    bass: { type: 'sawtooth', octave: -1, gain: 0.19, pattern: [1, 1, 0, 1, 1, 0, 1, 1], filterHz: 340, durBeats: 0.35 },
  },
};

export const TRACK_IDS = Object.keys(TRACKS) as TrackId[];

/** Lagu untuk scene dan destinasi; null = hening (Review memakai jingle sendiri). */
export function trackFor(scene: SceneId, destinationId: string): TrackId | null {
  switch (scene) {
    case 'briefing': return 'briefing';
    case 'design': return 'design';
    case 'flight': return destinationId === 'mars' ? 'flight_mars' : 'flight_moon';
    case 'surface': return destinationId === 'mars' ? 'mars' : 'moon';
    default: return null;
  }
}

/** Not satu birama: pad (akor panjang), bas berpola, dan lead acak berseed di sekitar nada akor. */
export function generateBar(profile: TrackProfile, bar: number, rng: Rng): NoteEvent[] {
  const events: NoteEvent[] = [];
  const degree = profile.progression[((bar % profile.progression.length) + profile.progression.length) % profile.progression.length];
  const at = (d: number, octave: number): number => degreeToMidi(profile.rootMidi, profile.scale, d) + 12 * octave;

  for (const step of profile.pad.chord) {
    events.push({ beat: 0, midi: at(degree + step, profile.pad.octave), dur: profile.beatsPerBar, vel: 0.8, voice: 'pad' });
  }
  if (profile.bass) {
    profile.bass.pattern.forEach((on, i) => {
      if (on) events.push({ beat: i * 0.5, midi: at(degree, profile.bass!.octave), dur: profile.bass!.durBeats, vel: i === 0 ? 1 : 0.7, voice: 'bass' });
    });
  }
  const lead = profile.lead;
  if (lead) {
    const steps = profile.beatsPerBar * 2;
    const chordTones = profile.pad.chord.map((c) => degree + c);
    for (let i = 0; i < steps; i++) {
      const strong = i % 2 === 0;
      if (rng() >= lead.density + (strong ? lead.strongBoost : 0)) continue;
      const [lo, hi] = lead.range;
      // Condong ke nada akor agar terdengar harmonis, sesekali nada lewat.
      const d = rng() < 0.65 ? pick(rng, chordTones) + (pick(rng, [0, 0, 1]) * profile.scale.length) : degree + lo + Math.floor(rng() * (hi - lo + 1));
      events.push({ beat: i * 0.5, midi: at(d, lead.octave), dur: lead.durBeats, vel: 0.5 + rng() * 0.5, voice: 'lead' });
    }
  }
  return events;
}
