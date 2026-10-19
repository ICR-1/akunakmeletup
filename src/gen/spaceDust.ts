import * as THREE from 'three';
import { createRng, rngRange } from '../core/rng';

/**
 * Debu antariksa di sekitar wahana: titik-titik dekat yang mengalir ke arah berlawanan dengan gerak roket sehingga
 * terlihat jelas bahwa roket yang maju (bintang jauh tidak bergeser). Kotak membungkus (wrap) di sekitar pusat.
 */
export class SpaceDust {
  readonly points: THREE.Points;
  private readonly offsets: Float32Array;
  private readonly pos: Float32Array;

  constructor(seed: number, private readonly count = 260, private readonly box = 160) {
    const rng = createRng(seed ^ 0x5d57);
    this.offsets = new Float32Array(count * 3);
    for (let i = 0; i < this.offsets.length; i++) this.offsets[i] = rngRange(rng, -box / 2, box / 2);
    this.pos = new Float32Array(this.offsets);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const mat = new THREE.PointsMaterial({
      size: 2.4, sizeAttenuation: false, color: 0xcfe3ff, transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** `velocity`: kecepatan aliran debu (satuan/detik, dunia); `center`: titik yang diikuti kotak; `opacity` 0-1. */
  update(dt: number, velocity: THREE.Vector3, center: THREE.Vector3, opacity: number): void {
    const mat = this.points.material as THREE.PointsMaterial;
    mat.opacity = opacity;
    this.points.visible = opacity > 0.01;
    if (!this.points.visible) return;
    const { box, offsets, pos } = this;
    const half = box / 2;
    for (let i = 0; i < this.count; i++) {
      const o = i * 3;
      offsets[o] += velocity.x * dt;
      offsets[o + 1] += velocity.y * dt;
      offsets[o + 2] += velocity.z * dt;
      for (let a = 0; a < 3; a++) {
        let v = offsets[o + a];
        if (v > half) v -= box; else if (v < -half) v += box;
        offsets[o + a] = v;
      }
    }
    pos.set(offsets);
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    this.points.position.copy(center);
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
