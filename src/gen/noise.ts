import { createRng } from '../core/rng';

const PERM_SIZE = 256;
const GRADIENTS: [number, number][] = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/** Gradient noise 2D berseed; nilai kira-kira di [-1, 1]. */
export function createNoise2D(seed: number): (x: number, y: number) => number {
  const rng = createRng(seed);
  const perm = Array.from({ length: PERM_SIZE }, (_, i) => i);
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = (i: number): number => perm[i & (PERM_SIZE - 1)];
  const grad = (ix: number, iy: number, dx: number, dy: number): number => {
    const g = GRADIENTS[p(p(ix) + iy) & 7];
    return g[0] * dx + g[1] * dy;
  };
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y);
    const dx = x - x0, dy = y - y0;
    const u = fade(dx), v = fade(dy);
    const a = grad(x0, y0, dx, dy);
    const b = grad(x0 + 1, y0, dx - 1, dy);
    const c = grad(x0, y0 + 1, dx, dy - 1);
    const d = grad(x0 + 1, y0 + 1, dx - 1, dy - 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 1.4;
  };
}

/** Fractal Brownian motion dari noise 2D. */
export function fbm(noise: (x: number, y: number) => number, x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

const GRAD3: [number, number, number][] = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0], [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

/** Gradient noise 3D berseed (dipetakan ke permukaan bola agar tekstur tanpa sambungan); nilai kira-kira di [-1, 1]. */
export function createNoise3D(seed: number): (x: number, y: number, z: number) => number {
  const rng = createRng(seed);
  const perm = Array.from({ length: PERM_SIZE }, (_, i) => i);
  for (let i = PERM_SIZE - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const p = (i: number): number => perm[i & (PERM_SIZE - 1)];
  const dot = (ix: number, iy: number, iz: number, x: number, y: number, z: number): number => {
    const g = GRAD3[p(p(p(ix) + iy) + iz) % 12];
    return g[0] * x + g[1] * y + g[2] * z;
  };
  const lerp = (t: number, a: number, b: number): number => a + t * (b - a);
  return (x, y, z) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
    const dx = x - x0, dy = y - y0, dz = z - z0;
    const u = fade(dx), v = fade(dy), w = fade(dz);
    return lerp(w,
      lerp(v, lerp(u, dot(x0, y0, z0, dx, dy, dz), dot(x0 + 1, y0, z0, dx - 1, dy, dz)),
        lerp(u, dot(x0, y0 + 1, z0, dx, dy - 1, dz), dot(x0 + 1, y0 + 1, z0, dx - 1, dy - 1, dz))),
      lerp(v, lerp(u, dot(x0, y0, z0 + 1, dx, dy, dz - 1), dot(x0 + 1, y0, z0 + 1, dx - 1, dy, dz - 1)),
        lerp(u, dot(x0, y0 + 1, z0 + 1, dx, dy - 1, dz - 1), dot(x0 + 1, y0 + 1, z0 + 1, dx - 1, dy - 1, dz - 1)))) * 1.15;
  };
}

/** fBm 3D dari noise 3D. */
export function fbm3(noise: (x: number, y: number, z: number) => number, x: number, y: number, z: number, octaves = 4, lacunarity = 2.02, gain = 0.5): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
