import * as THREE from 'three';
import { LOADING_UI } from './strings';
import { EARTH_TEXTURE, earthMasks } from '../gen/earthMap';
import { explosionTextures } from '../gen/explosion';
import { softPuffTexture } from '../gen/effects';
import { meteorTextures } from '../gen/meteors';
import { planetCanvasTexture, ringCanvasTexture } from '../gen/planets';
import { PLANET_KEYS, type PlanetKey } from '../gen/planetTextures';
import { natureTextures } from '../gen/natureTexture';
import { surfaceTextures } from '../gen/terrainTexture';

/** Satu langkah pemuatan awal: `weight` menentukan porsi bar progres. */
export interface PreloadStep { label: string; weight: number; run: () => void }

export type ProgressFn = (fraction01: number, label: string) => void;

/** Beri kesempatan browser menggambar bilah progres di antara langkah berat. */
export const nextFrame = (): Promise<void> => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
  else setTimeout(resolve, 0);
});

/**
 * Jalankan langkah berurutan; kegagalan satu langkah tidak menghentikan yang lain (dikembalikan sebagai daftar galat).
 * Murni terhadap DOM: `yieldFrame` dapat diganti pada pengujian.
 */
export async function runPreload(steps: readonly PreloadStep[], onProgress: ProgressFn, yieldFrame: () => Promise<void> = nextFrame): Promise<Error[]> {
  const total = steps.reduce((t, s) => t + s.weight, 0) || 1;
  const errors: Error[] = [];
  let done = 0;
  onProgress(0, steps[0]?.label ?? LOADING_UI.done);
  await yieldFrame();
  for (const step of steps) {
    onProgress(done / total, step.label);
    await yieldFrame();
    try {
      step.run();
    } catch (e) {
      errors.push(e instanceof Error ? e : new Error(String(e)));
    }
    done += step.weight;
  }
  onProgress(1, LOADING_UI.done);
  await yieldFrame();
  return errors;
}

/** Unggah tekstur ke GPU sekarang (bukan saat frame pertama yang memakainya) agar scene tidak tersendat. */
function upload(renderer: THREE.WebGLRenderer, textures: readonly THREE.Texture[]): void {
  for (const t of textures) renderer.initTexture(t);
}

/**
 * Daftar pemuatan awal: semua tekstur prosedural yang berat (peta Bumi dari data geografi, planet, permukaan
 * Bulan/Mars, efek) dibuat dan diunggah ke GPU. Shader dikompilasi saat scene pertama memakainya (program bergantung
 * pada jumlah lampu per scene, jadi tidak dipanaskan di sini).
 */
export function buildPreloadSteps(renderer: THREE.WebGLRenderer): PreloadStep[] {
  const steps: PreloadStep[] = [
    { label: LOADING_UI.steps.earthMap, weight: 3, run: () => { earthMasks(EARTH_TEXTURE.width, EARTH_TEXTURE.height); } },
  ];
  for (const key of PLANET_KEYS) {
    steps.push({
      label: `${LOADING_UI.planetLabel}: ${LOADING_UI.planets[key] ?? key}`,
      weight: key === 'earth' ? 3 : 1,
      run: () => upload(renderer, [planetCanvasTexture(key as PlanetKey)]),
    });
  }
  steps.push(
    { label: LOADING_UI.steps.ring, weight: 1, run: () => upload(renderer, [ringCanvasTexture()]) },
    { label: LOADING_UI.steps.nature, weight: 2, run: () => { const t = natureTextures(); upload(renderer, [t.ground, t.water, t.concrete]); } },
    { label: LOADING_UI.steps.moonSurface, weight: 2, run: () => { const t = surfaceTextures('moon'); upload(renderer, [t.map, t.bump]); } },
    { label: LOADING_UI.steps.marsSurface, weight: 2, run: () => { const t = surfaceTextures('mars'); upload(renderer, [t.map, t.bump]); } },
    {
      label: LOADING_UI.steps.fx,
      weight: 1,
      run: () => upload(renderer, [...explosionTextures(), ...meteorTextures(), softPuffTexture()]),
    },
  );
  return steps;
}
