import * as THREE from 'three';
import { VISUAL } from '../core/constants';
import { box, jitter, part, boxGeometry } from './mesh';
import { ico, registerDetailMaterial, seg } from './detail';

/** Palet mengikuti astronot.jpeg: krem, abu-cokelat gelap, aksen oranye. */
const C = {
  cream: 0xe8d8bb, creamLight: 0xf1e6cf, dark: 0x4a4440, darker: 0x2f2b28, orange: 0xe8742a, gray: 0x7d746c, visor: 0x100d0c,
};
const HIP_Y = 0.8;
const THIGH = 0.38;
const SHIN = 0.36;
const POSE_FOLLOW = 12;
/** Antena di ransel: posisi (badan lokal), panjang, kemiringan ke belakang, dan goyangan saat bergerak. */
const PACK_TOP_Y = 0.6;
const PACK_Z = -0.27;
const ANTENNA_X = -0.15;
const ANTENNA_LENGTH = 0.7;
const ANTENNA_LEAN = -0.15;
const ANTENNA_SWAY = 0.1;
const CROUCH_THIGH = 0.8;
const CROUCH_KNEE = 1.6;
const CROUCH_LEAN = 0.35;
/** Porsi sepatu yang dijaga tetap datar terhadap tanah saat berjalan (1 saat jongkok penuh). */
const FOOT_FLAT = 0.4;

const visorMaterial = registerDetailMaterial(new THREE.MeshStandardMaterial({
  color: C.visor, metalness: 0.85, roughness: 0.18, flatShading: true,
}));

export interface AstronautMotion {
  /** 0 = diam, 1 = kecepatan lari penuh. */
  speed01: number;
  run: boolean;
  airborne: boolean;
  /** Kecepatan vertikal (m/s, positif naik); menentukan fase naik/turun saat melayang. */
  velY?: number;
  /** 0-1 kedalaman jongkok: bersiap sebelum lompat dan meredam saat mendarat. */
  crouch?: number;
  /** 0-1 untuk warna lampu indikator PLSS. */
  oxygen01: number;
}

export class AstronautRig {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly kneeL = new THREE.Group();
  private readonly kneeR = new THREE.Group();
  private readonly ankleL = new THREE.Group();
  private readonly ankleR = new THREE.Group();
  private readonly antenna = new THREE.Group();
  /** Senter di sisi kanan helm (SpotLight nyata) dengan lensa bercahaya dan kerucut sorot tipis; menyala saat malam. */
  readonly flashlight: THREE.SpotLight | null;
  private readonly fillLight: THREE.PointLight | null;
  private readonly lensMat = new THREE.MeshBasicMaterial({ color: 0x3a3a3f });
  private readonly beamMat = new THREE.MeshBasicMaterial({ color: 0xfff1d2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private readonly beam: THREE.Mesh | null;
  private readonly indicator: THREE.Mesh;
  private readonly indicatorMat = new THREE.MeshBasicMaterial({ color: 0x5dff9b });
  private phase = 0;
  private clock = 0;
  private pose = { swing: 0, lean: 0, spread: 0, armUp: 0, crouch: 0, tuck: 0 };

  /** `lights`: buat SpotLight senter nyata (hanya scene yang membutuhkannya; tiap lampu menambah biaya shader). */
  constructor(lights = false) {
    this.root.name = 'astronaut';
    this.beam = lights ? new THREE.Mesh() : null;
    this.flashlight = lights ? new THREE.SpotLight(0xfff1d2, 0, VISUAL.flashlight.distance, VISUAL.flashlight.angle, VISUAL.flashlight.penumbra, VISUAL.flashlight.decay) : null;
    this.fillLight = lights ? new THREE.PointLight(0xdde6ff, 0, VISUAL.flashlight.fillDistance, 2) : null;
    this.body.position.y = HIP_Y;
    this.root.add(this.body);
    this.buildTorso();
    this.buildHead();
    const pack = this.buildBackpack();
    this.indicator = pack;
    for (const side of [-1, 1] as const) {
      this.buildArm(side === -1 ? this.armL : this.armR, side);
      this.buildLeg(side === -1 ? this.legL : this.legR, side === -1 ? this.kneeL : this.kneeR, side === -1 ? this.ankleL : this.ankleR, side);
    }
  }

  private buildTorso(): void {
    const b = this.body;
    b.add(part(jitter(boxGeometry(0.52, 0.58, 0.32), 11, 0.012), C.cream, [0, 0.33, 0]));
    b.add(box(0.15, 0.15, 0.03, C.creamLight, [0, 0.4, 0.17]));
    b.add(box(0.56, 0.09, 0.35, C.dark, [0, 0.04, 0]));
    b.add(box(0.1, 0.1, 0.06, C.gray, [0.2, 0.04, 0.2]));
    for (const x of [-0.18, 0.18]) b.add(box(0.05, 0.5, 0.03, C.dark, [x, 0.34, 0.17], [0, 0, x > 0 ? -0.08 : 0.08]));
    b.add(box(0.4, 0.05, 0.03, C.dark, [0, 0.27, 0.17]));
    b.add(part(new THREE.CylinderGeometry(0.25, 0.29, 0.07, seg(8)), C.dark, [0, 0.65, 0]));
  }

  private buildHead(): void {
    const head = new THREE.Group();
    head.position.y = 0.97;
    const helmet = part(jitter(new THREE.IcosahedronGeometry(0.3, ico(1)), 5, 0.012), C.cream);
    helmet.scale.set(1, 1.02, 1.05);
    head.add(helmet);
    const visor = part(new THREE.SphereGeometry(0.27, seg(7), seg(5)), C.visor, [0, -0.01, 0.2], [0, 0, 0], visorMaterial);
    visor.scale.set(0.95, 0.78, 0.62);
    head.add(visor);
    // Senter di sisi kanan helm menghadap ke depan: rumah, lensa bercahaya, SpotLight, dan kerucut sorot
    const lampPos: [number, number, number] = [0.22, 0.2, 0.22];
    const housing = part(new THREE.CylinderGeometry(0.06, 0.07, 0.16, seg(8)), C.dark, lampPos, [Math.PI / 2, 0, 0]);
    head.add(housing);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.052, seg(10)), this.lensMat);
    lens.position.set(lampPos[0], lampPos[1], lampPos[2] + 0.081);
    head.add(lens);
    if (this.flashlight && this.fillLight) {
      this.flashlight.position.set(lampPos[0], lampPos[1], lampPos[2] + 0.1);
      this.flashlight.target.position.set(lampPos[0], lampPos[1] - 1.2, lampPos[2] + 8);
      head.add(this.flashlight, this.flashlight.target);
      this.fillLight.position.set(0, 0.2, 0.5);
      head.add(this.fillLight);
    }
    if (this.beam) {
      const L = VISUAL.flashlight.beamLength;
      const beamGeo = new THREE.ConeGeometry(Math.tan(VISUAL.flashlight.angle) * L, L, seg(14), 1, true);
      beamGeo.translate(0, -L / 2, 0);
      beamGeo.rotateX(-Math.PI / 2 + 0.14);
      this.beam.geometry = beamGeo;
      this.beam.material = this.beamMat;
      this.beam.position.set(lampPos[0], lampPos[1], lampPos[2] + 0.1);
      this.beam.visible = false;
      head.add(this.beam);
    }
    for (const x of [-0.31, 0.31]) head.add(part(new THREE.CylinderGeometry(0.06, 0.06, 0.07, seg(6)), C.gray, [x, 0, 0], [0, 0, Math.PI / 2]));
    this.body.add(head);
  }

  private buildBackpack(): THREE.Mesh {
    const b = this.body;
    b.add(box(0.44, 0.52, 0.22, C.dark, [0, 0.34, -0.27]));
    for (const x of [-0.07, 0.07]) {
      b.add(part(new THREE.CylinderGeometry(0.045, 0.045, 0.3, seg(6)), C.gray, [x, 0.36, -0.39]));
      b.add(part(new THREE.ConeGeometry(0.045, 0.08, seg(6)), C.gray, [x, 0.2, -0.39], [Math.PI, 0, 0]));
    }
    b.add(box(0.12, 0.1, 0.02, C.darker, [-0.13, 0.5, -0.385]));
    b.add(box(0.12, 0.1, 0.02, C.darker, [0.13, 0.22, -0.385]));
    // Antena di atas ransel (bukan di helm): dudukan, tangkai ramping condong ke belakang, dan bola ujung.
    // Pivot di dudukan sehingga tangkai bisa bergoyang halus saat astronot bergerak.
    b.add(box(0.1, 0.05, 0.1, C.dark, [ANTENNA_X, PACK_TOP_Y + 0.02, PACK_Z]));
    this.antenna.position.set(ANTENNA_X, PACK_TOP_Y + 0.04, PACK_Z);
    this.antenna.rotation.x = ANTENNA_LEAN;
    this.antenna.add(part(new THREE.CylinderGeometry(0.011, 0.016, ANTENNA_LENGTH, seg(6)), C.gray, [0, ANTENNA_LENGTH / 2, 0]));
    this.antenna.add(part(new THREE.SphereGeometry(0.03, seg(6), seg(4)), C.orange, [0, ANTENNA_LENGTH, 0]));
    b.add(this.antenna);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.02), this.indicatorMat);
    lamp.position.set(0.14, 0.52, -0.385);
    b.add(lamp);
    return lamp;
  }

  private buildArm(pivot: THREE.Group, side: -1 | 1): void {
    pivot.position.set(side * 0.35, 0.58, 0);
    pivot.add(part(new THREE.CylinderGeometry(0.085, 0.075, 0.3, seg(6)), C.cream, [0, -0.15, 0]));
    pivot.add(part(new THREE.CylinderGeometry(0.09, 0.09, 0.05, seg(6)), C.orange, [0, -0.1, 0]));
    pivot.add(part(new THREE.SphereGeometry(0.095, seg(5), seg(4)), C.cream, [0, 0, 0]));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    elbow.rotation.x = -0.25;
    elbow.add(part(new THREE.CylinderGeometry(0.07, 0.06, 0.28, seg(6)), C.cream, [0, -0.14, 0]));
    elbow.add(part(new THREE.CylinderGeometry(0.075, 0.075, 0.04, seg(6)), C.gray, [0, -0.25, 0]));
    elbow.add(box(0.12, 0.14, 0.12, C.dark, [0, -0.34, 0]));
    elbow.add(box(0.04, 0.08, 0.06, C.dark, [side * -0.07, -0.32, 0.03]));
    pivot.add(elbow);
    this.body.add(pivot);
  }

  private buildLeg(pivot: THREE.Group, knee: THREE.Group, ankle: THREE.Group, side: -1 | 1): void {
    pivot.position.set(side * 0.13, HIP_Y, 0);
    pivot.add(part(new THREE.CylinderGeometry(0.11, 0.09, THIGH, seg(6)), C.cream, [0, -THIGH / 2, 0]));
    pivot.add(part(new THREE.CylinderGeometry(0.115, 0.115, 0.04, seg(6)), C.dark, [0, -0.08, 0]));
    knee.position.y = -THIGH;
    knee.add(box(0.17, 0.13, 0.08, C.orange, [0, 0.0, 0.08]));
    knee.add(part(new THREE.CylinderGeometry(0.09, 0.085, SHIN, seg(6)), C.cream, [0, -SHIN / 2, 0]));
    knee.add(part(new THREE.CylinderGeometry(0.095, 0.095, 0.04, seg(6)), C.orange, [0, -SHIN + 0.08, 0]));
    // Sepatu di sendi pergelangan sendiri agar telapak bisa tetap datar saat jongkok.
    ankle.position.y = -SHIN;
    ankle.add(box(0.17, 0.1, 0.3, C.dark, [0, 0, 0.05]));
    knee.add(ankle);
    pivot.add(knee);
    this.root.add(pivot);
  }

  /** Animasi prosedural: ayunan anggota badan mengikuti kecepatan, bobbing, condong saat lari, melayang saat melompat. */
  update(dt: number, m: AstronautMotion): void {
    this.clock += dt;
    const moving = m.speed01 > 0.02;
    if (moving && !m.airborne) this.phase += dt * (4.5 + 5.5 * m.speed01);
    const swingAmp = moving && !m.airborne ? (0.38 + (m.run ? 0.3 : 0)) * Math.min(1, m.speed01 * 2) : 0;
    const rising = m.airborne && (m.velY ?? 0) > 0.15;
    const target = {
      swing: Math.sin(this.phase) * swingAmp,
      lean: m.airborne ? 0.12 : m.run ? 0.3 : moving ? 0.08 : 0,
      spread: m.airborne && !rising ? 1 : 0,
      armUp: m.airborne ? 1 : 0,
      crouch: m.airborne ? 0 : m.crouch ?? 0,
      tuck: rising ? 1 : 0,
    };
    const k = 1 - Math.exp(-POSE_FOLLOW * dt);
    const p = this.pose;
    p.swing += (target.swing - p.swing) * k;
    p.lean += (target.lean - p.lean) * k;
    p.spread += (target.spread - p.spread) * k;
    p.armUp += (target.armUp - p.armUp) * k;
    p.crouch += (target.crouch - p.crouch) * k;
    p.tuck += (target.tuck - p.tuck) * k;

    // Jongkok: paha maju, lutut menekuk; pinggul turun agar telapak tetap menapak tanah.
    const thigh = CROUCH_THIGH * p.crouch - 0.55 * p.tuck;
    const knee = CROUCH_KNEE * p.crouch + 0.9 * p.tuck;
    const drop = (THIGH + SHIN) - (THIGH * Math.cos(CROUCH_THIGH * p.crouch) + SHIN * Math.cos(CROUCH_KNEE * p.crouch - CROUCH_THIGH * p.crouch));
    const hipY = HIP_Y - drop;
    this.legL.position.y = hipY;
    this.legR.position.y = hipY;

    const bob = moving && !m.airborne ? Math.abs(Math.sin(this.phase)) * 0.05 : Math.sin(this.clock * 2) * 0.006;
    this.body.position.y = hipY + bob;
    this.antenna.rotation.x = ANTENNA_LEAN + Math.sin(this.phase * 2) * ANTENNA_SWAY * m.speed01;
    this.antenna.rotation.z = Math.sin(this.phase + 1) * ANTENNA_SWAY * 0.5 * m.speed01;
    this.body.rotation.x = p.lean + CROUCH_LEAN * p.crouch;
    this.legL.rotation.x = p.swing - 0.4 * p.spread - thigh;
    this.legR.rotation.x = -p.swing + 0.25 * p.spread - thigh;
    this.kneeL.rotation.x = Math.max(0, -p.swing) * 0.9 + 0.5 * p.spread + knee;
    this.kneeR.rotation.x = Math.max(0, p.swing) * 0.9 + 0.2 * p.spread + knee;
    const flat = FOOT_FLAT + (1 - FOOT_FLAT) * p.crouch;
    this.ankleL.rotation.x = -(this.legL.rotation.x + this.kneeL.rotation.x) * flat;
    this.ankleR.rotation.x = -(this.legR.rotation.x + this.kneeR.rotation.x) * flat;
    this.armL.rotation.x = -p.swing * 1.1 - 0.5 * p.armUp + 0.5 * p.crouch;
    this.armR.rotation.x = p.swing * 1.1 - 0.5 * p.armUp + 0.5 * p.crouch;
    this.armL.rotation.z = -0.05 - 0.7 * p.armUp;
    this.armR.rotation.z = 0.05 + 0.7 * p.armUp;

    const blink = m.oxygen01 <= 0.25 && Math.floor(this.clock * 4) % 2 === 0;
    this.indicatorMat.color.set(m.oxygen01 > 0.5 ? 0x5dff9b : m.oxygen01 > 0.25 ? 0xffd24d : 0xff6b6b);
    this.indicator.visible = !blink;
  }

  /** Ujung antena dalam koordinat dunia (untuk pengujian dan efek). */
  antennaTip(out = new THREE.Vector3()): THREE.Vector3 {
    this.root.updateMatrixWorld(true);
    return out.set(0, ANTENNA_LENGTH, 0).applyMatrix4(this.antenna.matrixWorld);
  }

  /** Nyalakan senter (0-1): SpotLight, lensa, kerucut sorot, dan sedikit penerangan sekitar tubuh agar astronot tetap terlihat. */
  setFlashlight(level01: number): void {
    const k = Math.min(1, Math.max(0, level01));
    if (this.flashlight) this.flashlight.intensity = VISUAL.flashlight.intensity * k;
    if (this.fillLight) this.fillLight.intensity = VISUAL.flashlight.fill * k;
    this.lensMat.color.setHex(0x3a3a3f).lerp(new THREE.Color(0xfff6dd), k);
    if (this.beam) this.beam.visible = k > 0.03;
    this.beamMat.opacity = VISUAL.flashlight.beamOpacity * k;
  }

  dispose(): void {
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.indicatorMat.dispose();
    this.lensMat.dispose();
    this.beamMat.dispose();
  }
}

