import type { PlanetKey } from './planetTextures';

/** Data visual orrery (bukan data game): ukuran dan jarak diperbesar/dimampatkan agar semua planet terlihat. */
export interface PlanetSpec {
  key: Exclude<PlanetKey, 'earthClouds' | 'moon'>;
  name: string;
  radius: number;
  /** Jari-jari orbit (satuan scene). */
  orbit: number;
  /** Eksentrisitas visual. */
  ecc: number;
  /** Kemiringan sumbu (radian). */
  tilt: number;
  /** Putaran sumbu (rad/detik). */
  spin: number;
  rings?: boolean;
  clouds?: boolean;
}

export const SUN_RADIUS = 3.6;

export const SOLAR_SYSTEM: PlanetSpec[] = [
  { key: 'mercury', name: 'Merkurius', radius: 0.5, orbit: 7, ecc: 0.2, tilt: 0.03, spin: 0.35 },
  { key: 'venus', name: 'Venus', radius: 0.9, orbit: 10.5, ecc: 0.02, tilt: 0.05, spin: 0.2 },
  { key: 'earth', name: 'Bumi', radius: 1, orbit: 14.5, ecc: 0.03, tilt: 0.41, spin: 0.5, clouds: true },
  { key: 'mars', name: 'Mars', radius: 0.7, orbit: 19, ecc: 0.09, tilt: 0.44, spin: 0.48 },
  { key: 'jupiter', name: 'Jupiter', radius: 2.6, orbit: 27, ecc: 0.05, tilt: 0.05, spin: 0.9 },
  { key: 'saturn', name: 'Saturnus', radius: 2.1, orbit: 35, ecc: 0.06, tilt: 0.47, spin: 0.8, rings: true },
  { key: 'uranus', name: 'Uranus', radius: 1.4, orbit: 42, ecc: 0.04, tilt: 1.7, spin: 0.6 },
  { key: 'neptune', name: 'Neptunus', radius: 1.4, orbit: 48.5, ecc: 0.01, tilt: 0.5, spin: 0.6 },
];

export const MOON_SPEC = { name: 'Bulan', radius: 0.3, orbit: 2.4, speed: 0.55 } as const;

/** Konstanta kecepatan orbit visual: makin jauh makin lambat, dipercepat agar gerakan terlihat. */
const ORBIT_SPEED_K = 3.6;

export function orbitalSpeed(orbit: number): number {
  return ORBIT_SPEED_K / orbit ** 1.5;
}

/** Posisi (x, z) pada orbit elips dengan Matahari di salah satu fokus. */
export function orbitPosition(orbit: number, ecc: number, angle: number): [number, number] {
  const b = orbit * Math.sqrt(1 - ecc * ecc);
  return [orbit * Math.cos(angle) - orbit * ecc, b * Math.sin(angle)];
}

export type OrreryFocus = 'overview' | 'earth' | 'mars';

/** Planet yang dipusatkan kamera untuk tiap fokus (destinasi: Bulan di dekat Bumi, Mars). */
export const FOCUS_PLANET: Record<OrreryFocus, PlanetSpec['key'] | null> = { overview: null, earth: 'earth', mars: 'mars' };

/** Peta destinasi game ke fokus orrery. */
export function focusForDestination(destinationId: string): OrreryFocus {
  return destinationId === 'mars' ? 'mars' : 'earth';
}
