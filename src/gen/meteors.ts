import * as THREE from 'three';
import { EVENT_SCENE } from '../core/constants';
import type { MeteorPlan } from '../rules/eventScene';
import { radialTexture } from './explosion';

const UP = new THREE.Vector3(0, 1, 0);
const STREAK_COLOR = 0xffd9a0;

const GLOW_STOPS: [number, string][] = [[0, 'rgba(255,250,225,1)'], [0.3, 'rgba(255,200,120,0.7)'], [1, 'rgba(255,140,60,0)']];
const SCORCH_STOPS: [number, string][] = [[0, 'rgba(18,18,22,0.85)'], [0.5, 'rgba(28,28,32,0.55)'], [1, 'rgba(34,34,38,0)']];

/** Tekstur meteor (cahaya kepala dan bekas hangus): dibuat sekali; dipakai juga oleh pemuatan awal. Butuh DOM. */
export const meteorTextures = (): THREE.CanvasTexture[] => [radialTexture('meteor-glow', GLOW_STOPS), radialTexture('meteor-scorch', SCORCH_STOPS)];

export interface MeteorImpact { pos: THREE.Vector3; size: number }

interface Meteor {
  plan: MeteorPlan;
  streak: THREE.Mesh;
  head: THREE.Sprite;
  start: THREE.Vector3;
  end: THREE.Vector3;
  dir: THREE.Vector3;
  travelSec: number;
  state: 'wait' | 'fly' | 'flash' | 'done';
  flashAge: number;
  flash: THREE.Sprite | null;
}

/**
 * Hujan meteor. Dengan `groundAt`, tiap meteor menghantam tanah (kilatan, kawah kecil, dan `MeteorImpact` yang
 * dikembalikan `update` agar pemanggil menambah debu/guncangan). Tanpa `groundAt` (luar angkasa) meteor hanya
 * melintas dekat `origin` dan tidak menghantam apa pun.
 */
export class MeteorShower {
  readonly group = new THREE.Group();
  private readonly meteors: Meteor[] = [];
  private readonly craters: THREE.Mesh[] = [];
  private readonly streakGeo = new THREE.ConeGeometry(0.24, 1, 6, 1, true);
  private readonly craterGeo = new THREE.CircleGeometry(1, 18);
  private readonly streakMat = new THREE.MeshBasicMaterial({ color: STREAK_COLOR, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  private readonly glowMat = new THREE.SpriteMaterial({ map: radialTexture('meteor-glow', GLOW_STOPS), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  private readonly craterMat = new THREE.MeshBasicMaterial({ map: radialTexture('meteor-scorch', SCORCH_STOPS), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  private readonly flashMats: THREE.SpriteMaterial[] = [];
  private t = 0;

  constructor(plan: readonly MeteorPlan[], origin: THREE.Vector3, private readonly groundAt: ((x: number, z: number) => number) | null) {
    this.group.name = 'meteor-shower';
    const M = EVENT_SCENE.meteors;
    for (const p of plan) {
      const dir = new THREE.Vector3();
      const start = new THREE.Vector3();
      const end = new THREE.Vector3();
      let travelSec = p.fallSec;
      if (groundAt) {
        const x = origin.x + p.dx, z = origin.z + p.dz;
        end.set(x, groundAt(x, z), z);
        start.set(end.x + Math.cos(p.azimuth) * M.tiltM, end.y + M.skyM, end.z + Math.sin(p.azimuth) * M.tiltM);
        dir.subVectors(end, start).normalize();
      } else {
        const F = EVENT_SCENE.flyby;
        const mid = new THREE.Vector3(origin.x + p.dx, origin.y + p.dy, origin.z + p.dz);
        dir.set(Math.cos(p.azimuth), 0.12, Math.sin(p.azimuth)).normalize();
        start.copy(mid).addScaledVector(dir, -F.spanM / 2);
        end.copy(mid).addScaledVector(dir, F.spanM / 2);
        travelSec = F.spanM / F.speedMs;
      }
      const streak = new THREE.Mesh(this.streakGeo, this.streakMat);
      streak.quaternion.setFromUnitVectors(UP, dir);
      const w = groundAt ? 1 : EVENT_SCENE.flyby.thickness;
      streak.scale.set(p.size * w, M.streakLenM * (groundAt ? 1 : EVENT_SCENE.flyby.lengthScale), p.size * w);
      streak.visible = false;
      const head = new THREE.Sprite(this.glowMat);
      head.scale.setScalar(1.6 * p.size * (groundAt ? 1 : EVENT_SCENE.flyby.thickness));
      head.visible = false;
      this.group.add(streak, head);
      this.meteors.push({ plan: p, streak, head, start, end, dir, travelSec, state: 'wait', flashAge: 0, flash: null });
    }
  }

  /** Maju `dt` detik; mengembalikan hantaman yang terjadi pada langkah ini. */
  update(dt: number): MeteorImpact[] {
    this.t += dt;
    const M = EVENT_SCENE.meteors;
    const impacts: MeteorImpact[] = [];
    for (const m of this.meteors) {
      if (m.state === 'wait' && this.t >= m.plan.delaySec) {
        m.state = 'fly';
        m.streak.visible = m.head.visible = true;
      }
      if (m.state === 'fly') {
        const k = Math.min(1, (this.t - m.plan.delaySec) / m.travelSec);
        const head = m.start.clone().lerp(m.end, k);
        const len = m.streak.scale.y;
        m.streak.position.copy(head).addScaledVector(m.dir, -len / 2);
        m.head.position.copy(head);
        if (k >= 1) {
          m.streak.visible = m.head.visible = false;
          if (this.groundAt) {
            m.state = 'flash';
            this.land(m, impacts);
          } else m.state = 'done';
        }
      } else if (m.state === 'flash' && m.flash) {
        m.flashAge += dt;
        const f = Math.min(1, m.flashAge / M.flashSec);
        const mat = m.flash.material as THREE.SpriteMaterial;
        mat.opacity = 1 - f;
        m.flash.scale.setScalar((2 + f * 6) * m.plan.size);
        if (f >= 1) { m.flash.visible = false; m.state = 'done'; }
      }
    }
    return impacts;
  }

  private land(m: Meteor, out: MeteorImpact[]): void {
    const M = EVENT_SCENE.meteors;
    out.push({ pos: m.end.clone(), size: m.plan.size });
    const mat = this.glowMat.clone();
    this.flashMats.push(mat);
    m.flash = new THREE.Sprite(mat);
    m.flash.position.copy(m.end).add(new THREE.Vector3(0, 0.5 * m.plan.size, 0));
    m.flash.scale.setScalar(2 * m.plan.size);
    this.group.add(m.flash);
    if (this.craters.length < M.craterMax) {
      const c = new THREE.Mesh(this.craterGeo, this.craterMat);
      c.rotation.x = -Math.PI / 2;
      c.position.copy(m.end);
      c.position.y += 0.04;
      c.scale.setScalar((M.craterMinM + (M.craterMaxM - M.craterMinM) * ((m.plan.size - 0.6) / 0.8)) * 1.8);
      this.group.add(c);
      this.craters.push(c);
    }
  }

  /** Semua meteor sudah selesai (termasuk kilatan). Kawah tetap tinggal sampai `dispose`. */
  get finished(): boolean {
    return this.meteors.every((m) => m.state === 'done');
  }

  get impactCount(): number {
    return this.craters.length;
  }

  dispose(): void {
    this.group.removeFromParent();
    this.streakGeo.dispose();
    this.craterGeo.dispose();
    this.streakMat.dispose();
    this.glowMat.dispose();
    this.craterMat.dispose();
    for (const m of this.flashMats) m.dispose();
  }
}
