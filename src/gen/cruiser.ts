import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VISUAL } from '../core/constants';
import { isHigh, registerDetailMaterial, seg } from './detail';
import { buildDish } from './dish';
import { boxGeometry, hullMaterial, jitter, part } from './mesh';

/** Lunar Cruiser: kendaraan jelajah bertekanan beroda enam. Titik asal di tanah di bawah pusat, depan = +z. */
export const CRUISER = {
  length: 5.2,
  width: 3.0,
  height: 2.6,
  wheelRadius: 0.58,
  /** Tinggi mata kamera/pusat badan di atas tanah. */
  centerHeight: 1.5,
  /** Skala dalam satuan model lander saat dibawa menempel: satu satuan lander = `landerWorldScale` meter, jadi panjang Cruiser tetap 5,2 m. */
  carriedScale: 1 / VISUAL.landerWorldScale,
  steerMaxRad: 0.55,
} as const;

const C = {
  body: 0xe6e3dc, bodyDark: 0xb5b3ad, stripe: 0xe8742a, trim: 0x3a3d45, tire: 0x1d1f24, hub: 0x8c9099,
  panel: 0x1b2a5e, panelFrame: 0xc0c4cc, steel: 0x7d8490, lampWarm: 0xfff3c2, lampRed: 0xff4040,
};

/** Permukaan atas atap kabin (pusat y 2,48 + setengah tebal 0,05). */
const ROOF_TOP = 2.53;

/**
 * Kap mesin: profil samping (z, y) berupa baji. Dasarnya di puncak bak (y 1,43); sisi belakangnya menempel pada dinding depan
 * kabin (z 1,85) dan permukaan atasnya melandai turun ke depan sampai ujung bak.
 */
const HOOD = { zBack: 1.8, zFront: 2.5, yBase: 1.43, yBackTop: 1.78, yFrontTop: 1.58, width: 2.3, slope: -0.2857 } as const;
/** Tinggi permukaan atas kap pada kedalaman z (dipakai untuk menempatkan ventilasi dan garis). */
const hoodY = (z: number): number => HOOD.yBackTop + HOOD.slope * (z - HOOD.zBack);

function hoodGeometry(): THREE.BufferGeometry {
  // Bentuk dibuat di bidang (sx, sy) dengan sx = -z, lalu diekstrusi selebar kap dan diputar agar z dunia = -sx.
  const shape = new THREE.Shape();
  shape.moveTo(-HOOD.zBack, HOOD.yBase);
  shape.lineTo(-HOOD.zBack, HOOD.yBackTop);
  shape.lineTo(-HOOD.zFront, HOOD.yFrontTop);
  shape.lineTo(-HOOD.zFront - 0.04, HOOD.yBase + 0.08);
  shape.lineTo(-HOOD.zFront, HOOD.yBase);
  const bevel = isHigh() ? 0.035 : 0;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: HOOD.width - bevel * 2, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, steps: 1,
  });
  geo.translate(0, 0, -(HOOD.width - bevel * 2) / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

const glassMaterial = registerDetailMaterial(new THREE.MeshStandardMaterial({
  color: 0x0d1a2c, metalness: 0.85, roughness: 0.12, flatShading: true,
}));
const lampMaterial = new THREE.MeshBasicMaterial({ color: C.lampWarm });
const tailMaterial = new THREE.MeshBasicMaterial({ color: C.lampRed });

type V3 = [number, number, number];

function bx(w: number, h: number, d: number, color: number, pos: V3, rot: V3 = [0, 0, 0]): THREE.Mesh {
  return part(boxGeometry(w, h, d), color, pos, rot);
}

function cyl(rt: number, rb: number, h: number, color: number, pos: V3, rot: V3 = [0, 0, 0], segments = 10): THREE.Mesh {
  return part(new THREE.CylinderGeometry(rt, rb, h, seg(segments)), color, pos, rot);
}

/** Satukan semua mesh ber-hullMaterial menjadi satu mesh (kurangi draw call); mesh lain dibiarkan. */
function mergeStatic(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.material === hullMaterial) meshes.push(m);
  });
  const geos = meshes.map((m) => {
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.deleteAttribute('uv');
    g.applyMatrix4(group.matrixWorld.clone().invert().multiply(m.matrixWorld));
    return g;
  });
  const merged = mergeGeometries(geos);
  geos.forEach((g) => g.dispose());
  for (const m of meshes) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  if (merged) group.add(new THREE.Mesh(merged, hullMaterial));
}

export interface CruiserMotion {
  /** Kecepatan maju (m/s, negatif = mundur). */
  speedMs: number;
  /** -1 (kiri) .. 1 (kanan), dilihat pengemudi menghadap ke depan. */
  steer: number;
}

export class CruiserRig {
  readonly root = new THREE.Group();
  private readonly spin: THREE.Group[] = [];
  private readonly steerPivots: THREE.Group[] = [];
  private readonly headlights: THREE.Mesh[] = [];
  private steerNow = 0;
  private readonly headSpots: THREE.SpotLight[] = [];
  private readonly headBeams: THREE.Mesh[] = [];
  private readonly headBeamMat = new THREE.MeshBasicMaterial({ color: 0xfff1d2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

  /** `headlights`: buat SpotLight lampu depan nyata (hanya saat dikemudikan di permukaan; tiap lampu menambah biaya shader). */
  constructor(headlights = false) {
    this.root.name = 'cruiser';
    const body = new THREE.Group();
    this.root.add(body);
    this.buildChassis(body);
    this.buildCab(body);
    this.buildRoof(body);
    mergeStatic(body);
    this.buildGlassAndLamps(body);
    this.buildWheels();
    if (headlights) this.buildHeadlights();
  }

  private buildChassis(g: THREE.Group): void {
    // Bak utama, bumper, tameng bawah, dan rak kargo belakang
    g.add(part(jitter(boxGeometry(2.5, 0.62, 4.9), 41, 0.006), C.body, [0, 1.12, 0]));
    g.add(bx(2.62, 0.2, 5.0, C.stripe, [0, 0.9, 0]));
    g.add(bx(2.2, 0.16, 4.5, C.trim, [0, 0.72, 0]));
    g.add(bx(2.4, 0.34, 0.34, C.trim, [0, 0.95, 2.62]));
    g.add(bx(2.4, 0.34, 0.34, C.trim, [0, 0.95, -2.62]));
    g.add(bx(2.1, 0.5, 1.15, C.bodyDark, [0, 1.62, -1.85]));
    g.add(bx(2.2, 0.06, 1.25, C.trim, [0, 1.9, -1.85]));
    for (const x of [-1.0, 1.0]) g.add(bx(0.08, 0.34, 1.05, C.steel, [x, 2.1, -1.85]));
    // Suspensi: lengan melintang dan pegas per roda
    for (const z of [-1.75, 0, 1.75]) {
      for (const sx of [-1, 1]) {
        g.add(bx(0.9, 0.12, 0.2, C.steel, [sx * 1.0, 0.82, z], [0, 0, sx * 0.12]));
        g.add(cyl(0.07, 0.07, 0.5, C.hub, [sx * 1.3, 0.85, z], [0, 0, 0], 8));
      }
    }
  }

  private buildCab(g: THREE.Group): void {
    g.add(part(jitter(boxGeometry(2.3, 0.95, 2.6), 43, 0.006), C.body, [0, 1.95, 0.55]));
    g.add(bx(2.34, 0.14, 2.64, C.stripe, [0, 1.52, 0.55]));
    // Kap mesin: baji yang duduk di atas bak, rata dengan dinding depan kabin lalu melandai ke depan (tanpa celah di bawahnya)
    g.add(part(hoodGeometry(), C.body));
    for (const x of [-0.45, 0.45]) {
      for (let k = 0; k < 3; k++) g.add(bx(0.5, 0.025, 0.06, C.trim, [x, hoodY(2.0 + k * 0.17) + 0.012, 2.0 + k * 0.17], [-Math.atan(HOOD.slope), 0, 0]));
    }
    g.add(bx(0.5, 0.02, 0.72, C.stripe, [0, hoodY(2.2) + 0.01, 2.2], [-Math.atan(HOOD.slope), 0, 0]));
    // Atap dan tepi atap
    g.add(bx(2.4, 0.1, 2.7, C.bodyDark, [0, 2.48, 0.55]));
    // Pintu, pegangan, dan panel samping
    for (const sx of [-1, 1]) {
      g.add(bx(0.06, 0.72, 1.0, C.bodyDark, [sx * 1.17, 1.9, 0.5]));
      g.add(bx(0.05, 0.06, 0.28, C.steel, [sx * 1.2, 1.92, 0.15]));
      g.add(bx(0.08, 0.3, 1.2, C.stripe, [sx * 1.27, 1.2, 0.2]));
    }
    // Fender roda
    for (const z of [-1.75, 0, 1.75]) {
      for (const sx of [-1, 1]) g.add(bx(0.62, 0.14, 1.0, C.bodyDark, [sx * 1.4, 1.38, z]));
    }
  }

  private buildRoof(g: THREE.Group): void {
    // Panel surya atap (rangka + sel), antena dish, tiang kamera, dan lampu sorot
    g.add(bx(2.0, 0.05, 1.6, C.panelFrame, [0, 2.6, 0.7]));
    g.add(bx(1.88, 0.06, 1.48, C.panel, [0, 2.63, 0.7]));
    for (let k = -2; k <= 2; k++) g.add(bx(0.02, 0.07, 1.48, C.panelFrame, [k * 0.37, 2.64, 0.7]));
    // Parabola sungguhan pada tiang yang berdiri di atas atap (atap cab: z -0.8..1.9, puncak 2.53), diarahkan miring ke depan-atas
    const dishAt = new THREE.Vector3(0.7, 3.2, -0.45);
    const mastBase = ROOF_TOP - 0.02;
    g.add(bx(0.22, 0.06, 0.22, C.trim, [dishAt.x, ROOF_TOP + 0.01, dishAt.z]));
    g.add(cyl(0.05, 0.05, dishAt.y - mastBase, C.steel, [dishAt.x, (dishAt.y + mastBase) / 2, dishAt.z], [0, 0, 0], 8));
    g.add(part(new THREE.SphereGeometry(0.1, seg(8), seg(6)), C.trim, [dishAt.x, dishAt.y, dishAt.z]));
    const dish = buildDish(0.46, 0.18, { dish: C.body, strut: C.steel, hub: C.trim, feed: C.stripe });
    dish.position.copy(dishAt);
    dish.rotation.set(Math.PI / 2 - 0.85, 0, 0);
    g.add(dish);
    g.add(cyl(0.025, 0.025, 3.7 - ROOF_TOP, C.steel, [-0.85, (3.7 + ROOF_TOP) / 2, -0.45], [0, 0, 0], 6));
    g.add(cyl(0.04, 0.04, 0.6, C.steel, [-0.7, 2.9, 1.3], [0, 0, 0], 8));
    g.add(bx(0.26, 0.2, 0.2, C.trim, [-0.7, 3.25, 1.3]));
    g.add(bx(1.6, 0.1, 0.12, C.trim, [0, 2.58, 1.9]));
  }

  private buildGlassAndLamps(g: THREE.Group): void {
    const wind = new THREE.Mesh(boxGeometry(2.0, 0.62, 0.06), glassMaterial);
    wind.position.set(0, 2.0, 1.88);
    wind.rotation.x = -0.28;
    g.add(wind);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(boxGeometry(0.05, 0.5, 1.5), glassMaterial);
      side.position.set(sx * 1.18, 2.0, 0.6);
      g.add(side);
    }
    const rear = new THREE.Mesh(boxGeometry(1.7, 0.4, 0.05), glassMaterial);
    rear.position.set(0, 2.0, -0.77);
    g.add(rear);
    for (const sx of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.1, seg(10)), lampMaterial);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(sx * 0.85, 1.32, 2.52);
      g.add(lamp);
      this.headlights.push(lamp);
      const tail = new THREE.Mesh(boxGeometry(0.34, 0.14, 0.06), tailMaterial);
      tail.position.set(sx * 1.0, 1.25, -2.5);
      g.add(tail);
    }
  }

  private buildWheels(): void {
    const R = CRUISER.wheelRadius;
    for (const z of [1.75, 0, -1.75]) {
      for (const sx of [-1, 1]) {
        const steer = new THREE.Group();
        steer.position.set(sx * 1.5, R + 0.07, z);
        const spin = new THREE.Group();
        const tire = part(new THREE.CylinderGeometry(R, R, 0.5, seg(20)), C.tire, [0, 0, 0], [0, 0, Math.PI / 2]);
        const rim = part(new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.54, seg(14)), C.hub, [0, 0, 0], [0, 0, Math.PI / 2]);
        const cap = part(new THREE.CylinderGeometry(R * 0.2, R * 0.2, 0.6, seg(8)), C.stripe, [0, 0, 0], [0, 0, Math.PI / 2]);
        const parts = [tire, rim, cap];
        // Tapak ban: gerigi di sekeliling agar putaran terlihat
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          parts.push(part(boxGeometry(0.52, 0.1, 0.16), C.trim, [0, Math.sin(a) * R, Math.cos(a) * R], [-a, 0, 0]));
        }
        parts.forEach((p) => spin.add(p));
        mergeSpin(spin);
        steer.add(spin);
        this.root.add(steer);
        this.spin.push(spin);
        if (z > 0) this.steerPivots.push(steer);
      }
    }
  }

  /** Roda berputar mengikuti kecepatan dan roda depan membelok mengikuti arah setir. */
  update(dt: number, m: CruiserMotion): void {
    const k = 1 - Math.exp(-10 * dt);
    // Rotasi +y memutar dari +z ke +x (ke kiri pengemudi), jadi setir kanan = rotasi negatif.
    this.steerNow += (-m.steer * CRUISER.steerMaxRad - this.steerNow) * k;
    for (const p of this.steerPivots) p.rotation.y = this.steerNow;
    const dAngle = (m.speedMs / CRUISER.wheelRadius) * dt;
    for (const s of this.spin) s.rotation.x += dAngle;
  }

  /** Dua lampu depan (SpotLight) dengan kerucut sorot tipis; level 0-1 (malam dan sedang dikemudikan). */
  private buildHeadlights(): void {
    const H = VISUAL.headlights;
    const L = H.beamLength;
    for (const sx of [-1, 1]) {
      const spot = new THREE.SpotLight(0xfff1d2, 0, H.distance, H.angle, H.penumbra, H.decay);
      spot.position.set(sx * 0.85, 1.32, 2.6);
      spot.target.position.set(sx * 0.85, 0.3, 16);
      this.root.add(spot, spot.target);
      this.headSpots.push(spot);
      const geo = new THREE.ConeGeometry(Math.tan(H.angle) * L * 0.55, L, seg(12), 1, true);
      geo.translate(0, -L / 2, 0);
      geo.rotateX(-Math.PI / 2 + 0.08);
      const beam = new THREE.Mesh(geo, this.headBeamMat);
      beam.position.copy(spot.position);
      beam.visible = false;
      this.root.add(beam);
      this.headBeams.push(beam);
    }
  }

  setHeadlights(level01: number): void {
    const k = Math.min(1, Math.max(0, level01));
    for (const s of this.headSpots) s.intensity = VISUAL.headlights.intensity * k;
    for (const b of this.headBeams) b.visible = k > 0.03;
    this.headBeamMat.opacity = 0.06 * k;
    lampMaterial.color.set(0x8d8a78).lerp(new THREE.Color(C.lampWarm), k);
  }

  setLights(on: boolean): void {
    lampMaterial.color.set(on ? C.lampWarm : 0x8d8a78);
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.headBeamMat.dispose();
  }
}

/** Satukan bagian roda (ban, pelek, gerigi) menjadi satu mesh agar tiap roda hanya satu draw call. */
function mergeSpin(spin: THREE.Group): void {
  mergeStatic(spin);
}
