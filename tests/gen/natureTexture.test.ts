import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { setDetail } from '../../src/gen/detail';
import { createLaunchIsland, createLaunchPad } from '../../src/gen/launchSite';
import {
  generateConcreteMap, generateGroundMap, generateWaterMap, GROUND_TILE_M, MAP_MEAN_LINEAR, natureTextures,
} from '../../src/gen/natureTexture';

const SIZE = 128;
const lin = (v: number): number => Math.pow(v / 255, 2.2);

function meanLinear(rgba: Uint8ClampedArray): number {
  let t = 0;
  for (let i = 0; i < rgba.length; i += 4) t += lin(rgba[i]);
  return t / (rgba.length / 4);
}

/** Rata-rata selisih piksel bertetangga pada baris tepi (melewati sambungan ubin) dibanding di bagian dalam. */
function seamRatio(rgba: Uint8ClampedArray, size: number): number {
  let seam = 0, inner = 0;
  for (let y = 0; y < size; y++) {
    seam += Math.abs(rgba[(y * size + 0) * 4] - rgba[(y * size + size - 1) * 4]);
    inner += Math.abs(rgba[(y * size + size / 2) * 4] - rgba[(y * size + size / 2 + 1) * 4]);
  }
  return seam / Math.max(1, inner);
}

describe('tekstur alam prosedural', () => {
  const makers: [string, (seed: number, size: number) => Uint8ClampedArray][] = [
    ['tanah', generateGroundMap], ['air', generateWaterMap], ['beton', generateConcreteMap],
  ];

  for (const [name, make] of makers) {
    it(`${name}: deterministik, ukuran benar, abu-abu opak, dan rata-rata cahaya mendekati ${MAP_MEAN_LINEAR}`, () => {
      const a = make(7, SIZE), b = make(7, SIZE);
      expect(a).toEqual(b);
      expect(make(8, SIZE)).not.toEqual(a);
      expect(a.length).toBe(SIZE * SIZE * 4);
      for (let i = 0; i < a.length; i += 4) {
        expect(a[i]).toBe(a[i + 1]);
        expect(a[i]).toBe(a[i + 2]);
        expect(a[i + 3]).toBe(255);
      }
      expect(Math.abs(meanLinear(a) - MAP_MEAN_LINEAR)).toBeLessThan(0.07);
    });
  }

  it('tanah dan air berulang tanpa sambungan di tepi ubin', () => {
    expect(seamRatio(generateGroundMap(3, SIZE), SIZE)).toBeLessThan(2.5);
    expect(seamRatio(generateWaterMap(3, SIZE), SIZE)).toBeLessThan(2.5);
  });

  it('memiliki cukup variasi (bukan polos) tetapi tidak ekstrem', () => {
    for (const [, make] of makers) {
      const a = make(5, SIZE);
      const vals: number[] = [];
      for (let i = 0; i < a.length; i += 4) vals.push(lin(a[i]));
      const mean = vals.reduce((t, v) => t + v, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((t, v) => t + (v - mean) ** 2, 0) / vals.length);
      expect(sd).toBeGreaterThan(0.03);
      expect(sd).toBeLessThan(0.3);
    }
  });

  it('tekstur three.js dibagi (cache), berulang untuk tanah/air, dan tidak butuh DOM', () => {
    const t = natureTextures();
    expect(natureTextures()).toBe(t);
    expect(t.ground.wrapS).toBe(THREE.RepeatWrapping);
    expect(t.water.wrapT).toBe(THREE.RepeatWrapping);
    expect(t.ground.colorSpace).toBe(THREE.SRGBColorSpace);
  });
});

describe('pulau peluncuran bertekstur', () => {
  afterAll(() => setDetail('high'));

  it('detail tinggi: pulau dan laut punya UV sesuai posisi dunia dan material bertekstur; detail rendah polos', () => {
    setDetail('high');
    const high = createLaunchIsland(1);
    const island = high.group.getObjectByName('island') as THREE.Mesh;
    const sea = high.group.getObjectByName('sea') as THREE.Mesh;
    const pos = island.geometry.getAttribute('position');
    const uv = island.geometry.getAttribute('uv');
    expect(uv.count).toBe(pos.count);
    for (const i of [0, Math.floor(pos.count / 2), pos.count - 1]) {
      expect(uv.getX(i)).toBeCloseTo(pos.getX(i) / GROUND_TILE_M, 5);
      expect(uv.getY(i)).toBeCloseTo(pos.getZ(i) / GROUND_TILE_M, 5);
    }
    expect((island.material as THREE.MeshLambertMaterial).map).not.toBeNull();
    expect((sea.material as THREE.MeshLambertMaterial).map).not.toBeNull();
    high.update(1);
    high.dispose();

    setDetail('low');
    const low = createLaunchIsland(1);
    const lowIsland = low.group.getObjectByName('island') as THREE.Mesh;
    expect((lowIsland.material as THREE.MeshLambertMaterial).map).toBeNull();
    expect(lowIsland.geometry.getAttribute('uv').count).toBe(lowIsland.geometry.getAttribute('position').count);
    low.dispose();
  });

  it('landasan detail tinggi punya pelat beton bertekstur di permukaannya', () => {
    setDetail('high');
    const pad = createLaunchPad(1.2, 20);
    let slab: THREE.Mesh | null = null;
    pad.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.MeshLambertMaterial).map) slab = m;
    });
    expect(slab).not.toBeNull();
    expect((slab as unknown as THREE.Mesh).position.y).toBeGreaterThan(0);
    pad.dispose();
    setDetail('low');
    const plain = createLaunchPad(1.2, 20);
    let textured = 0;
    plain.group.traverse((o) => { if (((o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.map) textured++; });
    expect(textured).toBe(0);
    plain.dispose();
  });
});
