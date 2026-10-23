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

  constructor(private readonly count: number, size: number, soft = false) {
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
      blending: THREE.AdditiveBlending, fog: false, map: soft ? softPuffTexture() : null,
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

const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
varying float vFacing;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  vFacing = abs(dot(n, normalize(-mv.xyz)));
  gl_Position = projectionMatrix * mv;
}`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uThrottle;
uniform float uIntensity;
uniform float uDiamonds;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uTip;
varying vec2 vUv;
varying float vFacing;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float t = vUv.y;
  // Turbulensi mengalir menjauhi nozzle; makin ke ujung makin acak.
  float n = noise(vec2(vUv.x * 9.0, t * 7.0 - uTime * 9.0)) * 0.6 + noise(vec2(vUv.x * 21.0, t * 15.0 - uTime * 17.0)) * 0.4;
  float along = pow(1.0 - t, 1.4) * smoothstep(0.0, 0.04, t);
  float edge = pow(vFacing, 1.6);
  float body = along * edge * mix(1.0, n * 1.6, t * 0.85);
  // Shock diamond: cincin terang berulang di dekat nozzle saat throttle tinggi.
  float dia = pow(abs(sin(t * 3.14159 * 6.0)), 10.0) * (1.0 - smoothstep(0.1, 0.6, t)) * uDiamonds * uThrottle;
  vec3 col = mix(uHot, uMid, smoothstep(0.0, 0.35, t));
  col = mix(col, uTip, smoothstep(0.35, 1.0, t));
  col += uHot * dia * 1.5;
  gl_FragColor = vec4(col * (body + dia * edge) * uIntensity, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Profil nyala: menggembung sedikit setelah nozzle lalu meruncing ke ujung (uv.y 0 = nozzle, 1 = ujung). */
function flameGeometry(radius: number, segments: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 14;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = radius * (0.85 + 0.35 * Math.sin(Math.min(1, t * 2.2) * Math.PI * 0.5)) * Math.pow(1 - t, 0.75);
    pts.push(new THREE.Vector2(Math.max(r, radius * 0.01), -t));
  }
  return new THREE.LatheGeometry(pts, segments);
}

function flameMaterial(hot: number, mid: number, tip: number, intensity: number, diamonds: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uThrottle: { value: 0 }, uIntensity: { value: intensity }, uDiamonds: { value: diamonds },
      uHot: { value: new THREE.Color(hot) }, uMid: { value: new THREE.Color(mid) }, uTip: { value: new THREE.Color(tip) },
    },
    vertexShader: FLAME_VERT, fragmentShader: FLAME_FRAG,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
}

/**
 * Nyala mesin: selubung luar jingga yang bergolak, inti putih-biru dengan shock diamond, dan pendar bulat di nozzle.
 * Grup tidak diskalakan; tiap anak diskalakan sendiri agar pendar (sprite) tidak ikut memanjang.
 */
export function createFlame(radius: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'flame';
  const outer = new THREE.Mesh(flameGeometry(radius, 16), flameMaterial(0xffc27a, 0xff6a1a, 0x8a1c04, 1.1, 0));
  const core = new THREE.Mesh(flameGeometry(radius * 0.45, 12), flameMaterial(0xf2f8ff, 0xffe2a0, 0xff8a2a, 1.6, 1));
  core.renderOrder = 1;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: softPuffTexture(), color: 0xffa04a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  glow.position.y = -radius * 0.3;
  glow.userData.base = radius * 5;
  g.add(outer, core, glow);
  g.userData.time = 0;
  g.visible = false;
  return g;
}

const FLAME_OUTER_MID_LOW = new THREE.Color(0xff5a12);
const FLAME_OUTER_MID_HIGH = new THREE.Color(0xff8a3a);
const FLAME_CORE_HOT_LOW = new THREE.Color(0xffe6a8);
const FLAME_CORE_HOT_HIGH = new THREE.Color(0xe6f4ff);
const FLAME_STEP = 1 / 60;

export function setFlame(flame: THREE.Group, throttle01: number, length: number, flicker: number): void {
  flame.visible = throttle01 > 0.01;
  if (!flame.visible) return;
  const [outer, core, glow] = flame.children as [THREE.Mesh, THREE.Mesh, THREE.Sprite];
  flame.userData.time += FLAME_STEP;
  const time = flame.userData.time as number;
  const s = (0.35 + throttle01 * 0.65) * length * (0.92 + flicker * 0.16);
  const w = 0.8 + throttle01 * 0.3 + flicker * 0.05;
  outer.scale.set(w, s, w);
  core.scale.set(w, s * 0.55, w);
  for (const m of [outer, core]) {
    const u = (m.material as THREE.ShaderMaterial).uniforms;
    u.uTime.value = time;
    u.uThrottle.value = throttle01;
  }
  // Throttle tinggi: api lebih putih-kebiruan dan terang.
  const ou = (outer.material as THREE.ShaderMaterial).uniforms;
  (ou.uMid.value as THREE.Color).copy(FLAME_OUTER_MID_LOW).lerp(FLAME_OUTER_MID_HIGH, throttle01);
  const cu = (core.material as THREE.ShaderMaterial).uniforms;
  (cu.uHot.value as THREE.Color).copy(FLAME_CORE_HOT_LOW).lerp(FLAME_CORE_HOT_HIGH, throttle01);
  const gs = (glow.userData.base as number) * (0.6 + throttle01 * 0.5) * (0.9 + flicker * 0.2);
  glow.scale.set(gs, gs, 1);
  (glow.material as THREE.SpriteMaterial).opacity = 0.35 + throttle01 * 0.45;
}

export function disposeFlame(flame: THREE.Group): void {
  flame.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(o instanceof THREE.Sprite)) m.geometry?.dispose();
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
