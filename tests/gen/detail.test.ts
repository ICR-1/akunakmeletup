import { afterAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { boxGeometry, hullMaterial, shellMaterial } from '../../src/gen/mesh';
import { DETAIL, getDetail, ico, registerDetailMaterial, seg, setDetail } from '../../src/gen/detail';

const triangles = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

describe('tingkat detail model 3D', () => {
  afterAll(() => setDetail('high'));

  it('default tinggi; setDetail mengganti tingkat', () => {
    expect(getDetail()).toBe('high');
    setDetail('low');
    expect(getDetail()).toBe('low');
    setDetail('high');
  });
  it('seg: low tidak mengubah segmen (min 3), high mengalikan dan dibatasi maksimum', () => {
    setDetail('low');
    expect(seg(8)).toBe(8);
    expect(seg(1)).toBe(3);
    setDetail('high');
    expect(seg(8)).toBe(Math.round(8 * DETAIL.segmentMul.high));
    expect(seg(1000)).toBe(DETAIL.maxSegments);
  });
  it('ico menambah subdivisi hanya pada detail tinggi', () => {
    setDetail('low');
    expect(ico(0)).toBe(0);
    setDetail('high');
    expect(ico(0)).toBe(DETAIL.icoExtra.high);
  });
  it('material terdaftar flat saat low dan mulus saat high', () => {
    const mat = registerDetailMaterial(new THREE.MeshStandardMaterial({ flatShading: true }));
    setDetail('low');
    expect(mat.flatShading).toBe(true);
    expect(hullMaterial.flatShading).toBe(true);
    expect(shellMaterial.flatShading).toBe(true);
    setDetail('high');
    expect(mat.flatShading).toBe(false);
    expect(hullMaterial.flatShading).toBe(false);
    expect(shellMaterial.flatShading).toBe(false);
  });
  it('kotak: low = 12 segitiga tajam, high = tepi membulat dengan lebih banyak segitiga dan ukuran tetap', () => {
    setDetail('low');
    const sharp = boxGeometry(2, 1, 1);
    expect(triangles(sharp)).toBe(12);
    setDetail('high');
    const round = boxGeometry(2, 1, 1);
    expect(triangles(round)).toBeGreaterThan(12);
    round.computeBoundingBox();
    expect(round.boundingBox!.max.x).toBeCloseTo(1, 5);
    expect(round.boundingBox!.max.y).toBeCloseTo(0.5, 5);
  });
});
