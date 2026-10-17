import * as THREE from 'three';
import { createRng, rngRange } from '../core/rng';

/**
 * Efek ledakan prosedural (tanpa berkas gambar): kilatan, bola api, kepulan asap, gelombang kejut di tanah, dan
 * (serpihan padat dibuat terpisah oleh gen/shatter.ts dari model yang hancur, bukan kotak generik). Dipakai saat roket jatuh dan saat pendaratan hancur.
 */
export const EXPLOSION = {
  flashSec: 0.35,
  fireSec: 1.6,
  smokeSec: 4.5,
  shockSec: 1.1,
  chunkCount: 0,
  chunkSpeedMin: 6,
  chunkSpeedMax: 20,
  gravity: 9.8,
  smokePuffs: 7,
} as const;

/** Satu langkah gerak balistik serpihan: gravitasi, lalu berhenti dan meredam saat menyentuh tanah. Murni. */
export function stepBallistic(
  pos: { x: number; y: number; z: number }, vel: { x: number; y: number; z: number },
  gravity: number, groundY: number, dt: number,
): { landed: boolean } {
  vel.y -= gravity * dt;
  pos.x += vel.x * dt;
  pos.y += vel.y * dt;
  pos.z += vel.z * dt;
  if (pos.y <= groundY) {
    pos.y = groundY;
    // Pantulan kecil sekali, lalu tergelincir berhenti
    if (Math.abs(vel.y) > 2.5) {
      vel.y = -vel.y * 0.3;
      vel.x *= 0.6;
      vel.z *= 0.6;
      return { landed: false };
    }
    vel.x = vel.y = vel.z = 0;
    return { landed: true };
  }
  return { landed: false };
}

const textures = new Map<string, THREE.CanvasTexture>();

export function radialTexture(key: string, stops: [number, string][]): THREE.CanvasTexture {
  const cached = textures.get(key);
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D tidak tersedia');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [at, color] of stops) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, t);
  return t;
}

const fireTexture = (): THREE.CanvasTexture => radialTexture('fire', [[0, 'rgba(255,245,200,1)'], [0.25, 'rgba(255,170,60,0.85)'], [0.6, 'rgba(220,70,20,0.35)'], [1, 'rgba(160,30,10,0)']]);
const smokeTexture = (): THREE.CanvasTexture => radialTexture('smoke', [[0, 'rgba(70,70,74,0.9)'], [0.55, 'rgba(60,60,64,0.5)'], [1, 'rgba(50,50,54,0)']]);

/** Tekstur ledakan (api dan asap): dibuat sekali; dipakai juga oleh pemuatan awal. Butuh DOM. */
export const explosionTextures = (): THREE.CanvasTexture[] => [fireTexture(), smokeTexture()];

interface Sprite { s: THREE.Sprite; mat: THREE.SpriteMaterial; delay: number; life: number; size0: number; size1: number; rise: number; peak: number }
interface Chunk { mesh: THREE.Mesh; vel: THREE.Vector3; spin: THREE.Vector3; landed: boolean }

export class Explosion {
  readonly group = new THREE.Group();
  private age = 0;
  private readonly sprites: Sprite[] = [];
  private readonly chunks: Chunk[] = [];
  private readonly ring: THREE.Mesh;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly disposables: { dispose(): void }[] = [];

  /** `scale` ~ ukuran objek yang meledak (roket 1, lander ~1,5); `groundY` tinggi tanah untuk gelombang kejut dan serpihan. */
  constructor(position: THREE.Vector3, scale: number, private readonly groundY: number, seed = 1) {
    const rng = createRng(seed);
    this.group.name = 'explosion';
    this.group.position.copy(position);
    const add = (size0: number, size1: number, life: number, delay: number, rise: number, peak: number, tex: THREE.Texture, additive: boolean, off: THREE.Vector3): void => {
      const mat = new THREE.SpriteMaterial({
        map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      const s = new THREE.Sprite(mat);
      s.position.copy(off);
      this.group.add(s);
      this.sprites.push({ s, mat, delay, life, size0, size1, rise, peak });
      this.disposables.push(mat);
    };
    add(3 * scale, 16 * scale, EXPLOSION.flashSec, 0, 0, 1, fireTexture(), true, new THREE.Vector3(0, 1.5 * scale, 0));
    for (let i = 0; i < 4; i++) {
      add(2 * scale, rngRange(rng, 9, 14) * scale, EXPLOSION.fireSec, i * 0.08, rngRange(rng, 1, 3) * scale, 0.9, fireTexture(), true,
        new THREE.Vector3(rngRange(rng, -2, 2) * scale, (1 + i * 0.8) * scale, rngRange(rng, -2, 2) * scale));
    }
    for (let i = 0; i < EXPLOSION.smokePuffs; i++) {
      add(3 * scale, rngRange(rng, 9, 15) * scale, EXPLOSION.smokeSec, 0.15 + i * 0.12, rngRange(rng, 4, 8) * scale, 0.55, smokeTexture(), false,
        new THREE.Vector3(rngRange(rng, -3, 3) * scale, 2 * scale, rngRange(rng, -3, 3) * scale));
    }
    // Gelombang kejut di tanah
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48);
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.set(0, groundY - position.y + 0.15, 0);
    this.group.add(this.ring);
    this.disposables.push(ringGeo, this.ringMat);
    // Serpihan padat
    const colors = [0xe9edf3, 0xb7bcc6, 0x4a4f5c, 0xf08a24, 0x2c2f38];
    for (let i = 0; i < EXPLOSION.chunkCount; i++) {
      const w = rngRange(rng, 0.25, 0.9) * scale;
      const geo = new THREE.BoxGeometry(w, rngRange(rng, 0.15, 0.7) * scale, rngRange(rng, 0.25, 0.9) * scale);
      const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.8, metalness: 0.2 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(rngRange(rng, -1, 1) * scale, scale, rngRange(rng, -1, 1) * scale);
      const a = rngRange(rng, 0, Math.PI * 2);
      const sp = rngRange(rng, EXPLOSION.chunkSpeedMin, EXPLOSION.chunkSpeedMax);
      this.chunks.push({
        mesh, landed: false,
        vel: new THREE.Vector3(Math.cos(a) * sp, rngRange(rng, 6, 18), Math.sin(a) * sp),
        spin: new THREE.Vector3(rngRange(rng, -6, 6), rngRange(rng, -6, 6), rngRange(rng, -6, 6)),
      });
      this.group.add(mesh);
      this.disposables.push(geo, mat);
    }
  }

  /** Maju satu langkah; mengembalikan false setelah ledakan selesai total (asap hilang). */
  update(dt: number): boolean {
    this.age += dt;
    for (const sp of this.sprites) {
      const t = (this.age - sp.delay) / sp.life;
      if (t < 0 || t > 1) { sp.s.visible = t < 0 ? false : false; sp.mat.opacity = 0; continue; }
      sp.s.visible = true;
      const k = 1 - (1 - t) * (1 - t);
      sp.s.scale.setScalar(sp.size0 + (sp.size1 - sp.size0) * k);
      sp.mat.opacity = sp.peak * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
      sp.s.position.y += (sp.rise * dt) / sp.life;
    }
    const rt = this.age / EXPLOSION.shockSec;
    this.ring.visible = rt < 1;
    this.ring.scale.setScalar(1 + rt * 22);
    this.ringMat.opacity = rt < 1 ? 0.7 * (1 - rt) : 0;
    for (const c of this.chunks) {
      if (c.landed) continue;
      const p = { x: c.mesh.position.x, y: c.mesh.position.y + this.group.position.y, z: c.mesh.position.z };
      const r = stepBallistic(p, c.vel, EXPLOSION.gravity, this.groundY, dt);
      c.mesh.position.set(p.x, p.y - this.group.position.y, p.z);
      c.landed = r.landed;
      if (!c.landed) { c.mesh.rotation.x += c.spin.x * dt; c.mesh.rotation.y += c.spin.y * dt; c.mesh.rotation.z += c.spin.z * dt; }
    }
    return this.age < EXPLOSION.smokeSec + 0.15 + EXPLOSION.smokePuffs * 0.12;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const d of this.disposables) d.dispose();
  }
}
