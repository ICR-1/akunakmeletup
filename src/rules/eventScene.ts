/**
 * Adegan animasi event (murni, tanpa Three.js/DOM): jenis adegan per id event, lama intro, dan jadwal jatuhnya
 * meteor yang deterministik berdasarkan seed.
 */
import { EVENT_SCENE } from '../core/constants';
import { createRng, rngRange } from '../core/rng';

export type EventSceneKind = 'meteors' | 'flare' | 'dustPanels' | 'storm' | 'devil' | 'conjunction' | 'flyby' | 'engine' | 'clamp';

export interface EventSceneSpec { kind: EventSceneKind; introSec: number; tone: 'alert' | 'flare' | 'static' | 'dust' }

const KINDS: Record<keyof typeof EVENT_SCENE.introSec, { kind: EventSceneKind; tone: EventSceneSpec['tone'] }> = {
  ev_micrometeorite_rain: { kind: 'meteors', tone: 'alert' },
  ev_solar_flare: { kind: 'flare', tone: 'flare' },
  ev_dust_on_panels: { kind: 'dustPanels', tone: 'dust' },
  ev_dust_storm: { kind: 'storm', tone: 'dust' },
  ev_dust_devil: { kind: 'devil', tone: 'dust' },
  ev_solar_conjunction: { kind: 'conjunction', tone: 'static' },
  ev_micrometeor: { kind: 'flyby', tone: 'alert' },
  ev_engine_glitch: { kind: 'engine', tone: 'alert' },
  ev_stage_clamp: { kind: 'clamp', tone: 'alert' },
};

/** Spesifikasi adegan untuk sebuah event, atau null bila event itu tidak punya adegan. */
export function eventSceneFor(eventId: string): EventSceneSpec | null {
  if (!Object.prototype.hasOwnProperty.call(KINDS, eventId)) return null;
  const id = eventId as keyof typeof EVENT_SCENE.introSec;
  return { ...KINDS[id], introSec: EVENT_SCENE.introSec[id] };
}

export interface MeteorPlan {
  /** Detik sejak awal adegan sampai meteor mulai terlihat. */
  delaySec: number;
  /** Lama meluncur sampai titik tujuan. */
  fallSec: number;
  /** Titik tujuan relatif terhadap pusat adegan (m); dy hanya dipakai bila tidak ada tanah (luar angkasa). */
  dx: number;
  dy: number;
  dz: number;
  /** Arah datang mendatar (radian). */
  azimuth: number;
  /** Ukuran relatif 0.6-1.4 (kawah dan kilatan). */
  size: number;
}

/** Jadwal meteor deterministik: tersebar dalam `windowSec`, terurut menurut waktu, jarak tujuan dalam [minDist, maxDist]. */
export function planMeteors(seed: number, count: number, windowSec: number, minDist: number, maxDist: number): MeteorPlan[] {
  const rng = createRng((seed ^ 0x3e7e0) >>> 0);
  const list: MeteorPlan[] = [];
  for (let i = 0; i < count; i++) {
    const a = rngRange(rng, 0, Math.PI * 2);
    const d = rngRange(rng, minDist, maxDist);
    list.push({
      delaySec: rngRange(rng, 0, windowSec),
      fallSec: rngRange(rng, EVENT_SCENE.meteors.fallSecMin, EVENT_SCENE.meteors.fallSecMax),
      dx: Math.cos(a) * d,
      dy: rngRange(rng, -d * 0.3, d * 0.3),
      dz: Math.sin(a) * d,
      azimuth: rngRange(rng, 0, Math.PI * 2),
      size: rngRange(rng, 0.6, 1.4),
    });
  }
  return list.sort((x, y) => x.delaySec - y.delaySec);
}

/** Kekuatan bilah sinematik 0..1: masuk halus di awal, keluar halus di akhir. */
export function cinematicK(t: number, durSec: number, fadeSec = EVENT_SCENE.barFadeSec): number {
  if (durSec <= 0 || t <= 0 || t >= durSec) return 0;
  const fade = Math.max(1e-6, Math.min(fadeSec, durSec / 2));
  return Math.min(1, t / fade, (durSec - t) / fade);
}
