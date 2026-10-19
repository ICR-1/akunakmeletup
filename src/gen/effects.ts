import * as THREE from 'three';

/** Medan partikel ringan (satu THREE.Points, satu draw call) dengan blending aditif. */
export class ParticleField {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly vel: Float32Array;
  private readonly base: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private cursor = 0;

  constructor(private readonly count: number, size: number) {
    this.pos = new Float32Array(count * 3).fill(-1e5);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(1);
    this.life = new Float32Array(count).fill(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({
      size, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, lifeSec: number, color: THREE.Color): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.age[i] = 0;
    this.life[i] = lifeSec;
  }

  update(dt: number): void {
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const k = Math.max(0, 1 - this.age[i] / this.life[i]);
      for (let a = 0; a < 3; a++) {
        this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
        this.col[i * 3 + a] = this.base[i * 3 + a] * k;
      }
      if (k === 0) this.pos[i * 3 + 1] = -1e5;
    }
    this.points.geometry.getAttribute('position').needsUpdate = true;
    this.points.geometry.getAttribute('color').needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

/** Nyala mesin: dua kerucut bersarang (jingga dan kuning), skala mengikuti throttle. */
export function createFlame(radius: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'flame';
  const make = (r: number, color: number, opacity: number): THREE.Mesh => {
    const geo = new THREE.ConeGeometry(r, 1, 7, 1, true);
    geo.translate(0, -0.5, 0);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    return new THREE.Mesh(geo, mat);
  };
  g.add(make(radius, 0xff5a12, 0.55), make(radius * 0.5, 0xffd27a, 0.7));
  g.visible = false;
  return g;
}

const FLAME_OUTER_LOW = new THREE.Color(0xff5a12);
const FLAME_OUTER_HIGH = new THREE.Color(0xffb36b);
const FLAME_INNER_LOW = new THREE.Color(0xffd27a);
const FLAME_INNER_HIGH = new THREE.Color(0xe6f4ff);

export function setFlame(flame: THREE.Group, throttle01: number, length: number, flicker: number): void {
  const [outer, inner] = flame.children as THREE.Mesh[];
  if (outer && inner) {
    // Throttle tinggi: api lebih putih-kebiruan dan terang.
    (outer.material as THREE.MeshBasicMaterial).color.copy(FLAME_OUTER_LOW).lerp(FLAME_OUTER_HIGH, throttle01);
    (inner.material as THREE.MeshBasicMaterial).color.copy(FLAME_INNER_LOW).lerp(FLAME_INNER_HIGH, throttle01);
  }
  flame.visible = throttle01 > 0.01;
  const s = (0.35 + throttle01 * 0.65) * length * (0.9 + flicker * 0.2);
  flame.scale.set(1, s, 1);
}

export function disposeFlame(flame: THREE.Group): void {
  flame.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    (m.material as THREE.Material | undefined)?.dispose();
  });
}

/** Satu langkah partikel debu balistik: gravitasi lokal, hambatan ringan, berhenti dan menempel di tanah. Murni. */
export function stepPuff(
  p: { x: number; y: number; z: number }, v: { x: number; y: number; z: number },
  gravity: number, drag: number, groundY: number, dt: number,
): void {
  const k = Math.max(0, 1 - drag * dt);
  v.x *= k; v.z *= k;
  v.y = v.y * k - gravity * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  if (p.y <= groundY) {
    p.y = groundY;
    v.x *= 0.5; v.z *= 0.5; v.y = 0;
  }
}

/** Pemudaran 1 -> 0 sepanjang umur; mulai cepat lalu melambat (debu menipis) dan hasilnya selalu di [0, 1]. */
export const puffFade = (age: number, life: number): number => {
  const t = Math.min(1, Math.max(0, age / life));
  return (1 - t) * (1 - t * 0.5);
};

let puffTexture: THREE.CanvasTexture | null = null;
export function softPuffTexture(): THREE.CanvasTexture {
  if (puffTexture) return puffTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D tidak tersedia');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  puffTexture = new THREE.CanvasTexture(c);
  puffTexture.colorSpace = THREE.SRGBColorSpace;
  return puffTexture;
}

/**
 * Debu regolit yang terlempar langkah kaki/roda: bulatan lembut berwarna tanah (bukan kotak putih) yang terangkat
 * sedikit, melayang di gravitasi rendah, melambat, lalu menipis. Normal blending agar tampak sebagai debu.
 */
export class DustPuffs {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly vel: Float32Array;
  private readonly base: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private cursor = 0;

  constructor(private readonly count: number, size: number) {
    this.pos = new Float32Array(count * 3).fill(-1e5);
    this.col = new Float32Array(count * 4);
    this.vel = new Float32Array(count * 3);
    this.base = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(1);
    this.life = new Float32Array(count).fill(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    const mat = new THREE.PointsMaterial({
      size, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, map: softPuffTexture(), fog: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, lifeSec: number, color: THREE.Color): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.base.set([color.r, color.g, color.b], i * 3);
    this.age[i] = 0;
    this.life[i] = lifeSec;
  }

  update(dt: number, gravity: number, groundAt: (x: number, z: number) => number): void {
    const p = { x: 0, y: 0, z: 0 }, v = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      p.x = this.pos[i * 3]; p.y = this.pos[i * 3 + 1]; p.z = this.pos[i * 3 + 2];
      v.x = this.vel[i * 3]; v.y = this.vel[i * 3 + 1]; v.z = this.vel[i * 3 + 2];
      stepPuff(p, v, gravity, 0.9, groundAt(p.x, p.z) + 0.05, dt);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
      const f = puffFade(this.age[i], this.life[i]);
      this.col[i * 4] = this.base[i * 3]; this.col[i * 4 + 1] = this.base[i * 3 + 1]; this.col[i * 4 + 2] = this.base[i * 3 + 2];
      this.col[i * 4 + 3] = f * 0.55;
      if (this.age[i] >= this.life[i]) { this.pos[i * 3 + 1] = -1e5; this.col[i * 4 + 3] = 0; }
    }
    this.points.geometry.getAttribute('position').needsUpdate = true;
    this.points.geometry.getAttribute('color').needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}

let bootTexture: THREE.CanvasTexture | null = null;
function bootprintTexture(): THREE.CanvasTexture {
  if (bootTexture) return bootTexture;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D tidak tersedia');
  g.fillStyle = '#000';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#fff';
  // Telapak (depan) dan tumit (belakang) dengan alur tapak
  g.beginPath(); g.ellipse(32, 38, 22, 34, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(32, 98, 17, 21, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#000';
  for (let y = 14; y < 70; y += 9) g.fillRect(14, y, 36, 3);
  for (let y = 84; y < 116; y += 9) g.fillRect(18, y, 28, 3);
  bootTexture = new THREE.CanvasTexture(c);
  return bootTexture;
}

/** Waktu hidup dan nomor slot berikutnya pada cincin jejak kaki (murni, untuk pengujian). */
export const footprintAge01 = (age: number, life: number): number => Math.min(1, Math.max(0, age / life));
export const nextFootprintSlot = (cursor: number, count: number): number => (cursor + 1) % count;

/**
 * Bidang jejak sepatu: rata di tanah (normal +Y) dengan ujung jari (bagian atas tekstur) menghadap +Z lokal, yaitu arah
 * depan astronot saat yaw 0; tumit di -Z.
 */
export function footprintGeometry(): THREE.PlaneGeometry {
  const geo = new THREE.PlaneGeometry(0.26, 0.55);
  geo.rotateX(-Math.PI / 2);
  geo.rotateY(Math.PI);
  return geo;
}

/**
 * Jejak sepatu astronot di regolit: kolam tetap berisi `count` jejak (InstancedMesh, satu draw call) yang memudar
 * menuju warna tanah seiring waktu; jejak terlama ditimpa saat kolam penuh.
 */
export class Footprints {
  readonly mesh: THREE.InstancedMesh;
  private readonly ages: Float32Array;
  private cursor = 0;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();

  constructor(private readonly count: number, private readonly lifeSec: number, private readonly dark: THREE.Color, private readonly ground: THREE.Color) {
    const geo = footprintGeometry();
    // Bahan berpencahayaan (bukan MeshBasicMaterial) agar jejak ikut gelap saat malam dan terang oleh senter, tidak bercahaya sendiri.
    const mat = new THREE.MeshLambertMaterial({
      color: 0xffffff, alphaMap: bootprintTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.8,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.ages = new Float32Array(count).fill(Infinity);
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < count; i++) { this.mesh.setMatrixAt(i, zero); this.mesh.setColorAt(i, ground); }
  }

  /** Taruh jejak di (pos) dengan arah hadap `yaw` dan kemiringan mengikuti `normal`. */
  stamp(pos: THREE.Vector3, yaw: number, normal: THREE.Vector3): void {
    const i = this.cursor;
    this.cursor = nextFootprintSlot(this.cursor, this.count);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
    this.m.compose(new THREE.Vector3(pos.x, pos.y + 0.03, pos.z), q, new THREE.Vector3(1, 1, 1));
    this.mesh.setMatrixAt(i, this.m);
    this.ages[i] = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.count; i++) {
      if (!Number.isFinite(this.ages[i])) continue;
      this.ages[i] += dt;
      const t = footprintAge01(this.ages[i], this.lifeSec);
      if (t >= 1) { this.mesh.setMatrixAt(i, zero); this.ages[i] = Infinity; this.mesh.instanceMatrix.needsUpdate = true; continue; }
      this.mesh.setColorAt(i, this.c.copy(this.dark).lerp(this.ground, t));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
