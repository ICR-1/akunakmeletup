import * as THREE from 'three';
import { seg } from './detail';
import { column, part, shellMaterial } from './mesh';

/**
 * Antena parabola yang benar: cangkang lathe cekung (z = k r^2) dengan hub di belakang, tiga penyangga tipis dari tepi
 * ke feed horn di titik fokus. Sumbu parabola = +y lokal; putar grup untuk mengarahkan. Dipakai probe dan Lunar Cruiser.
 */
export interface DishColors { dish: number; strut: number; hub: number; feed: number }

export function strutBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, color: number): THREE.Mesh {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const mesh = part(new THREE.CylinderGeometry(radius, radius, len, seg(6)), color);
  mesh.position.copy(a).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return mesh;
}

export function buildDish(radius: number, depth: number, colors: DishColors): THREE.Group {
  const g = new THREE.Group();
  g.name = 'dish';
  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 12; i++) {
    const r = (i / 12) * radius;
    profile.push(new THREE.Vector2(r, (depth * r * r) / (radius * radius)));
  }
  g.add(part(new THREE.LatheGeometry(profile, seg(16)), colors.dish, [0, 0, 0], [0, 0, 0], shellMaterial));
  g.add(column(radius * 0.1, radius * 0.1, -radius * 0.15, radius * 0.15, colors.hub, 8));
  const focus = (radius * radius) / (4 * depth);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 2;
    g.add(strutBetween(
      new THREE.Vector3(Math.cos(a) * radius * 0.97, depth * 0.94, Math.sin(a) * radius * 0.97),
      new THREE.Vector3(0, focus, 0), Math.max(0.01, radius * 0.018), colors.strut,
    ));
  }
  g.add(column(radius * 0.065, radius * 0.065, focus - radius * 0.1, radius * 0.2, colors.hub, 8));
  g.add(part(new THREE.ConeGeometry(radius * 0.1, radius * 0.14, seg(8)), colors.feed, [0, focus + radius * 0.17, 0]));
  return g;
}

/** Tinggi titik fokus parabola di atas verteks (untuk pemasangan dan pengujian). */
export const dishFocus = (radius: number, depth: number): number => (radius * radius) / (4 * depth);
