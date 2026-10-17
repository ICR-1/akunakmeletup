import * as THREE from 'three';
import { planetTexture, ringTextureData, type PlanetKey, type TextureData } from './planetTextures';

/*
 * Benda langit halus bertekstur prosedural (bukan low-poly): tekstur digambar saat runtime dari noise 3D di kanvas,
 * jadi tidak ada berkas gambar. Pengecualian yang disengaja terhadap gaya low-poly untuk benda langit saja.
 */

const textures = new Map<string, THREE.CanvasTexture>();

function toCanvasTexture(data: TextureData, srgb = true): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D tidak tersedia');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(data.data), data.width, data.height), 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Tekstur three.js untuk satu planet (dibuat sekali dan dipakai bersama). */
export function planetCanvasTexture(key: PlanetKey): THREE.CanvasTexture {
  let t = textures.get(key);
  if (!t) {
    t = toCanvasTexture(planetTexture(key));
    textures.set(key, t);
  }
  return t;
}

export function hasPlanetTexture(key: PlanetKey): boolean {
  return textures.has(key);
}

let ringTex: THREE.CanvasTexture | null = null;

/** Tekstur cincin planet (dibuat sekali; dipakai Saturnus dan pemuatan awal). */
export function ringCanvasTexture(): THREE.CanvasTexture {
  ringTex ??= toCanvasTexture(ringTextureData());
  return ringTex;
}
let glowTex: THREE.CanvasTexture | null = null;

function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (!g) throw new Error('Canvas 2D tidak tersedia');
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255,236,170,1)');
  grad.addColorStop(0.22, 'rgba(255,170,60,0.4)');
  grad.addColorStop(1, 'rgba(255,120,20,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

const ATMOSPHERE_VERT = `
  varying vec3 vN;
  void main() {
    vN = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;
const ATMOSPHERE_FRAG = `
  uniform vec3 uColor; uniform float uPower; uniform float uStrength; varying vec3 vN;
  void main() {
    float i = pow(max(0.72 - dot(vN, vec3(0.0, 0.0, 1.0)), 0.0), uPower);
    gl_FragColor = vec4(uColor, 1.0) * i * uStrength;
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

/** Cahaya atmosfer di tepi bola (cangkang sisi belakang, blending aditif). */
function atmosphereMaterial(color: number, power: number, strength: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uPower: { value: power }, uStrength: { value: strength } },
    vertexShader: ATMOSPHERE_VERT,
    fragmentShader: ATMOSPHERE_FRAG,
    side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
}

export interface PlanetOptions {
  segments?: number;
  clouds?: boolean;
  atmosphere?: { color: number; power?: number; strength?: number } | null;
  rings?: boolean;
  /** Kemiringan sumbu (radian). */
  tilt?: number;
}

export interface PlanetObject {
  root: THREE.Group;
  body: THREE.Mesh;
  /** Putar bola (dan awan sedikit lebih cepat). */
  spin(dtSec: number, rate?: number): void;
  dispose(): void;
}

const CLOUD_SCALE = 1.012;
const ATMOSPHERE_SCALE = 1.08;
const CLOUD_SPIN_FACTOR = 1.25;

export function createPlanet(key: PlanetKey, radius: number, opts: PlanetOptions = {}): PlanetObject {
  const seg = opts.segments ?? 48;
  const root = new THREE.Group();
  root.name = `planet-${key}`;
  const tilt = new THREE.Group();
  tilt.rotation.z = opts.tilt ?? 0;
  root.add(tilt);
  const disposables: { dispose(): void }[] = [];
  const geo = new THREE.SphereGeometry(radius, seg, Math.round(seg * 0.66));
  disposables.push(geo);
  const mat = new THREE.MeshStandardMaterial({ map: planetCanvasTexture(key), roughness: 1, metalness: 0 });
  disposables.push(mat);
  const body = new THREE.Mesh(geo, mat);
  tilt.add(body);

  let clouds: THREE.Mesh | null = null;
  if (opts.clouds) {
    const cm = new THREE.MeshStandardMaterial({ map: planetCanvasTexture('earthClouds'), transparent: true, depthWrite: false, roughness: 1 });
    const cg = new THREE.SphereGeometry(radius * CLOUD_SCALE, seg, Math.round(seg * 0.66));
    disposables.push(cm, cg);
    clouds = new THREE.Mesh(cg, cm);
    tilt.add(clouds);
  }
  if (opts.atmosphere) {
    const am = atmosphereMaterial(opts.atmosphere.color, opts.atmosphere.power ?? 3.2, opts.atmosphere.strength ?? 1.1);
    const ag = new THREE.SphereGeometry(radius * ATMOSPHERE_SCALE, seg, Math.round(seg * 0.66));
    disposables.push(am, ag);
    root.add(new THREE.Mesh(ag, am));
  }
  if (opts.rings) {
    const ringTex = ringCanvasTexture();
    const inner = radius * 1.35, outer = radius * 2.4;
    const rg = new THREE.RingGeometry(inner, outer, 96, 1);
    rg.rotateX(-Math.PI / 2);
    const pos = rg.getAttribute('position');
    const uv = rg.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (Math.hypot(pos.getX(i), pos.getZ(i)) - inner) / (outer - inner), 0.5);
    const rm = new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
    disposables.push(rg, rm);
    tilt.add(new THREE.Mesh(rg, rm));
  }
  return {
    root, body,
    spin: (dt, rate = 0.1) => {
      body.rotation.y += dt * rate;
      if (clouds) clouds.rotation.y += dt * rate * CLOUD_SPIN_FACTOR;
    },
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

const SUN_FRAG = `
  uniform float uTime; varying vec3 vPos; varying vec3 vN;
  float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float noise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
  void main(){
    vec3 p = normalize(vPos) * 2.4; float t = uTime * 0.06;
    float n = fbm(p + vec3(t, t*.7, -t));
    float m = fbm(p*2.6 - vec3(t*1.4) + n*1.6);
    float heat = clamp(n*.55 + m*.65, 0., 1.);
    vec3 col = mix(vec3(.78,.22,.03), vec3(1.0,.58,.1), smoothstep(.25,.6,heat));
    col = mix(col, vec3(1.0,.93,.6), smoothstep(.62,.92,heat));
    float ndv = max(dot(normalize(vN), vec3(0.,0.,1.)), 0.);
    col *= 0.62 + 0.55 * ndv;
    gl_FragColor = vec4(col * 1.35, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export interface SunObject {
  root: THREE.Group;
  update(timeSec: number): void;
  dispose(): void;
}

/** Matahari: permukaan bernoise beranimasi (shader) dan lingkar cahaya. */
export function createSun(radius: number): SunObject {
  const root = new THREE.Group();
  root.name = 'sun';
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vPos; varying vec3 vN; void main(){ vPos = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: SUN_FRAG,
  });
  const geo = new THREE.SphereGeometry(radius, 48, 32);
  root.add(new THREE.Mesh(geo, mat));
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(radius * 7.5);
  root.add(glow);
  return {
    root,
    update: (t) => { mat.uniforms.uTime.value = t; },
    dispose: () => { geo.dispose(); mat.dispose(); glowMat.dispose(); },
  };
}

/** Warna cahaya atmosfer yang cocok per planet. */
export const ATMOSPHERES: Partial<Record<PlanetKey, { color: number; power: number; strength: number }>> = {
  earth: { color: 0x5fa8ff, power: 3.2, strength: 1.2 },
  mars: { color: 0xff9a6a, power: 4.2, strength: 0.55 },
  venus: { color: 0xffd190, power: 3.4, strength: 0.9 },
  uranus: { color: 0x9fe0e6, power: 3.2, strength: 0.7 },
  neptune: { color: 0x5f86ff, power: 3.2, strength: 0.9 },
};
