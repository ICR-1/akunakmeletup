import * as THREE from 'three';
import { createRng, rngRange } from '../core/rng';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Diameter gumpalan asap sepanjang umur: mekar cepat lalu melambat (ease-out kubik). Murni. */
export function smokeSize(age: number, life: number, s0: number, s1: number): number {
  const t = clamp01(age / life);
  return s0 + (s1 - s0) * (1 - (1 - t) ** 3);
}

/** Lama gumpalan baru muncul penuh (detik); singkat agar asap pekat langsung di belakang nozzle. */
export const SMOKE_FADE_IN_SEC = 0.15;

/**
 * Opasitas asap: muncul dalam `SMOKE_FADE_IN_SEC`, tetap pekat sampai sekitar 40% umur, lalu menipis halus ke 0 di
 * akhir. Selalu di [0, 1]. Murni.
 */
export function smokeAlpha(age: number, life: number): number {
  const out = clamp01((clamp01(age / life) - 0.4) / 0.6);
  return clamp01(age / SMOKE_FADE_IN_SEC) * (1 - out * out * (3 - 2 * out));
}

/** Pendar api pada asap muda: 1 saat keluar dari nozzle, meredup cepat. Murni. */
export const smokeHeat = (age: number): number => Math.exp(-Math.max(0, age) * 2.5);

/**
 * Kekuatan awan asap di landasan (0-1): semburan menabrak parit api selama roket masih rendah, lalu berhenti
 * setelah nozzle naik lebih dari `fadeHeight` di atas landasan. Murni.
 */
export function padSmokeStrength(throttle01: number, altitudeUnits: number, fadeHeight: number): number {
  return clamp01(throttle01) * (1 - clamp01(altitudeUnits / fadeHeight)) ** 2;
}

/** Kekuatan jejak asap (0-1) menurut kemajuan langit: tebal di udara bawah, hilang saat udara menipis. Murni. */
export function trailStrength(skyT: number): number {
  const t = clamp01((skyT - 0.22) / (0.6 - 0.22));
  return 1 - t * t * (3 - 2 * t);
}

let puffTex: THREE.CanvasTexture | null = null;
/** Tekstur gumpalan asap bergelombang (beberapa bulatan lembut bertumpuk, posisi dari RNG berseed). */
export function smokePuffTexture(): THREE.CanvasTexture {
  if (puffTex) return puffTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D tidak tersedia');
  const blob = (x: number, y: number, r: number, a: number): void => {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  };
  blob(S / 2, S / 2, S * 0.42, 0.95);
  const rng = createRng(0x5307e);
  for (let i = 0; i < 9; i++) {
    const a = rngRange(rng, 0, Math.PI * 2);
    const d = rngRange(rng, 0.08, 0.22) * S;
    blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, rngRange(rng, 0.16, 0.26) * S, rngRange(rng, 0.45, 0.75));
  }
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

const SMOKE_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aHeat;
attribute float aRot;
attribute vec3 aColor;
uniform float uHalfHeight;
varying float vAlpha;
varying float vHeat;
varying float vRot;
varying vec3 vColor;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  // Diameter dalam satuan dunia -> piksel (perspektif sama seperti mesh).
  gl_PointSize = aSize * projectionMatrix[1][1] * uHalfHeight / max(-mv.z, 0.1);
  vAlpha = aAlpha;
  vHeat = aHeat;
  vRot = aRot;
  vColor = aColor;
}`;

const SMOKE_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uGlow;
uniform float uGlowAmt;
uniform float uOpacity;
varying float vAlpha;
varying float vHeat;
varying float vRot;
varying vec3 vColor;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  float a = texture2D(uMap, vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5).a;
  // Disinari dari atas (Matahari), lebih gelap di bawah; pendar api menerangi sisi bawah gumpalan muda.
  float below = gl_PointCoord.y;
  vec3 col = vColor * mix(1.08, 0.66, below) + uGlow * (uGlowAmt * vHeat * (0.35 + below));
  gl_FragColor = vec4(col, a * vAlpha * uOpacity);
  if (gl_FragColor.a < 0.004) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface SmokeOptions {
  /** Hambatan udara per detik (memperlambat gumpalan). */
  drag: number;
  /** Percepatan naik (asap panas mengapung), satuan/detik². */
  buoyancy: number;
  /** Batas bawah posisi y lokal (tanah); gumpalan tidak tembus ke bawahnya. */
  floorY?: number;
}

/**
 * Asap peluncuran: gumpalan lembut bergaya volumetrik (satu THREE.Points, satu draw call) dengan blending normal
 * agar tampak sebagai asap putih-abu tebal, bukan cahaya. Tiap gumpalan mekar, mengapung, melambat, dan menipis.
 */
export class SmokeCloud {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly heat: Float32Array;
  private readonly rot: Float32Array;
  private readonly spin: Float32Array;
  private readonly color: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly s0: Float32Array;
  private readonly s1: Float32Array;
  private readonly amp: Float32Array;
  private readonly uniforms: { uHalfHeight: { value: number }; uGlow: { value: THREE.Color }; uGlowAmt: { value: number }; uOpacity: { value: number }; uMap: { value: THREE.Texture } };
  private cursor = 0;
  private live = 0;

  constructor(private readonly count: number, private readonly opts: SmokeOptions) {
    this.pos = new Float32Array(count * 3).fill(-1e5);
    this.vel = new Float32Array(count * 3);
    this.size = new Float32Array(count);
    this.alpha = new Float32Array(count);
    this.heat = new Float32Array(count);
    this.rot = new Float32Array(count);
    this.spin = new Float32Array(count);
    this.color = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(1);
    this.life = new Float32Array(count).fill(1);
    this.s0 = new Float32Array(count);
    this.s1 = new Float32Array(count);
    this.amp = new Float32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('aHeat', new THREE.BufferAttribute(this.heat, 1));
    geo.setAttribute('aRot', new THREE.BufferAttribute(this.rot, 1));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3));
    this.uniforms = {
      uHalfHeight: { value: 400 }, uGlow: { value: new THREE.Color(0xff8a3a) }, uGlowAmt: { value: 0 }, uOpacity: { value: 1 },
      uMap: { value: smokePuffTexture() },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending, fog: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    // Digambar sebelum api (aditif) agar api tetap menyala menembus asap.
    this.points.renderOrder = -1;
    const buf = new THREE.Vector2();
    this.points.onBeforeRender = (renderer) => { this.uniforms.uHalfHeight.value = renderer.getDrawingBufferSize(buf).y / 2; };
  }

  /**
   * Lepaskan satu gumpalan di posisi lokal `p` dengan kecepatan `v`, diameter `s0` -> `s1`, putaran `rot` (laju `spin`),
   * dan ketebalan `opacity` (0-1).
   */
  emit(p: THREE.Vector3, v: THREE.Vector3, lifeSec: number, s0: number, s1: number, color: THREE.Color, rot = 0, spin = 0, opacity = 1): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.color.set([color.r, color.g, color.b], i * 3);
    this.age[i] = 0;
    this.life[i] = lifeSec;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.size[i] = s0;
    this.alpha[i] = 0;
    this.heat[i] = 1;
    this.rot[i] = rot;
    this.spin[i] = spin;
    this.amp[i] = opacity;
    this.live = this.count;
  }

  /** Pendar api yang menerangi gumpalan muda (warna dan kekuatan 0-1). */
  setGlow(amount: number, color?: THREE.Color): void {
    this.uniforms.uGlowAmt.value = amount;
    if (color) this.uniforms.uGlow.value.copy(color);
  }

  update(dt: number): void {
    if (this.live === 0) return;
    const { drag, buoyancy, floorY = -Infinity } = this.opts;
    const k = Math.max(0, 1 - drag * dt);
    let alive = 0;
    for (let i = 0; i < this.count; i++) {
      if (this.age[i] >= this.life[i]) continue;
      this.age[i] += dt;
      const o = i * 3;
      this.vel[o] *= k;
      this.vel[o + 1] = this.vel[o + 1] * k + buoyancy * dt;
      this.vel[o + 2] *= k;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] = Math.max(floorY, this.pos[o + 1] + this.vel[o + 1] * dt);
      this.pos[o + 2] += this.vel[o + 2] * dt;
      this.rot[i] += this.spin[i] * dt;
      if (this.age[i] >= this.life[i]) {
        this.alpha[i] = 0;
        this.pos[o + 1] = -1e5;
        continue;
      }
      alive++;
      this.size[i] = smokeSize(this.age[i], this.life[i], this.s0[i], this.s1[i]);
      this.alpha[i] = smokeAlpha(this.age[i], this.life[i]) * this.amp[i];
      this.heat[i] = smokeHeat(this.age[i]);
    }
    this.live = alive;
    const geo = this.points.geometry;
    for (const name of ['position', 'aSize', 'aAlpha', 'aHeat', 'aRot']) geo.getAttribute(name).needsUpdate = true;
    geo.getAttribute('aColor').needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
