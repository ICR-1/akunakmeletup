import * as THREE from 'three';
import { createRng, rngRange } from '../core/rng';
import { createPlanet, createSun, ATMOSPHERES, type PlanetObject, type SunObject } from './planets';
import {
  FOCUS_PLANET, MOON_SPEC, orbitalSpeed, orbitPosition, SOLAR_SYSTEM, SUN_RADIUS, type OrreryFocus, type PlanetSpec,
} from './solarSystemData';
import { createStars } from './sky';

const ORBIT_SEGMENTS = 160;
const ORBIT_COLOR = 0x5b7bb0;
const ORBIT_OPACITY = 0.28;
const ORBIT_MIN_FADE = 0.3;
const MOON_ANGLE_START = 1.2;
const MOON_SPIN = 0.18;

interface Body { spec: PlanetSpec; obj: PlanetObject; angle: number; holder: THREE.Group; orbitLine: THREE.LineLoop }

export interface OrreryLabel { name: string; anchor: THREE.Object3D; radius: number; key: string }

/** Tata surya visual untuk Briefing: Matahari, 8 planet bertekstur di orbit elips, dan Bulan mengitari Bumi. */
export class Orrery {
  readonly root = new THREE.Group();
  readonly labels: OrreryLabel[] = [];
  private readonly bodies: Body[] = [];
  private sun: SunObject | null = null;
  private moon: { obj: PlanetObject; pivot: THREE.Group; angle: number } | null = null;
  private stars: THREE.Points | null = null;
  private disposed = false;
  private clock = 0;

  constructor(private readonly seed: number) {
    this.root.name = 'orrery';
    this.stars = createStars(seed, 2200, 900);
    this.root.add(this.stars);
    const light = new THREE.PointLight(0xfff1d6, 4.2, 0, 0);
    this.root.add(light, new THREE.AmbientLight(0x6f7fa8, 0.45));
    this.sun = createSun(SUN_RADIUS);
    this.root.add(this.sun.root);
    this.labels.push({ name: 'Matahari', anchor: this.sun.root, radius: SUN_RADIUS, key: 'sun' });
  }

  /**
   * Bangun planet satu per satu, memberi jeda antar planet agar tekstur prosedural (puluhan ribu piksel noise)
   * tidak membekukan layar. `onReady` dipanggil setiap planet siap.
   */
  async load(onReady?: (key: string) => void): Promise<void> {
    const rng = createRng(this.seed ^ 0x501a7);
    const order = [...SOLAR_SYSTEM].sort((a, b) => (a.key === 'earth' ? -1 : b.key === 'earth' ? 1 : 0) || (a.key === 'mars' ? -1 : b.key === 'mars' ? 1 : 0));
    for (const spec of order) {
      await new Promise((r) => setTimeout(r, 0));
      if (this.disposed) return;
      this.addPlanet(spec, rngRange(rng, 0, Math.PI * 2));
      onReady?.(spec.key);
    }
  }

  private addPlanet(spec: PlanetSpec, startAngle: number): void {
    const obj = createPlanet(spec.key, spec.radius, {
      segments: spec.radius > 1.2 ? 52 : 40, clouds: spec.clouds, rings: spec.rings, tilt: spec.tilt,
      atmosphere: ATMOSPHERES[spec.key] ?? null,
    });
    const holder = new THREE.Group();
    holder.add(obj.root);
    this.root.add(holder);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < ORBIT_SEGMENTS; i++) {
      const [x, z] = orbitPosition(spec.orbit, spec.ecc, (i / ORBIT_SEGMENTS) * Math.PI * 2);
      pts.push(new THREE.Vector3(x, 0, z));
    }
    const line = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: ORBIT_COLOR, transparent: true, opacity: ORBIT_OPACITY }),
    );
    this.root.add(line);
    this.bodies.push({ spec, obj, angle: startAngle, holder, orbitLine: line });
    this.labels.push({ name: spec.name, anchor: holder, radius: spec.radius, key: spec.key });
    if (spec.key === 'earth') this.addMoon(obj);
    this.place(this.bodies[this.bodies.length - 1]);
  }

  private addMoon(earth: PlanetObject): void {
    const obj = createPlanet('moon', MOON_SPEC.radius, { segments: 32 });
    const pivot = new THREE.Group();
    obj.root.position.x = MOON_SPEC.orbit;
    pivot.add(obj.root);
    earth.root.parent?.add(pivot);
    this.moon = { obj, pivot, angle: MOON_ANGLE_START };
    this.labels.push({ name: MOON_SPEC.name, anchor: obj.root, radius: MOON_SPEC.radius, key: 'moon' });
  }

  private place(b: Body): void {
    const [x, z] = orbitPosition(b.spec.orbit, b.spec.ecc, b.angle);
    b.holder.position.set(x, 0, z);
  }

  /**
   * Maju waktu: planet mengorbit dan berputar, Matahari berdenyut. `orbitRate` (0-1) memperlambat gerak orbit saja,
   * agar planet yang sedang dibingkai kamera diam di tempat tapi tetap berputar pada porosnya.
   */
  update(dtSec: number, orbitRate = 1): void {
    this.clock += dtSec;
    this.sun?.update(this.clock);
    // Garis orbit memudar saat orbit dihentikan (planet sedang dibingkai) agar tidak memotong latar.
    const orbitOpacity = ORBIT_OPACITY * Math.max(ORBIT_MIN_FADE, orbitRate);
    for (const b of this.bodies) {
      (b.orbitLine.material as THREE.LineBasicMaterial).opacity = orbitOpacity;
      b.angle += orbitalSpeed(b.spec.orbit) * dtSec * orbitRate;
      this.place(b);
      b.obj.spin(dtSec, b.spec.spin);
    }
    if (this.moon) {
      this.moon.angle += MOON_SPEC.speed * dtSec * orbitRate;
      this.moon.pivot.rotation.y = this.moon.angle;
      this.moon.obj.spin(dtSec, MOON_SPIN);
    }
  }

  /** Posisi dunia planet fokus (atau pusat tata surya untuk overview) dan jari-jarinya. */
  focusPoint(focus: OrreryFocus, out: THREE.Vector3): { radius: number } {
    if (focus === 'moon' && this.moon) {
      this.moon.obj.root.getWorldPosition(out);
      return { radius: MOON_SPEC.radius };
    }
    const key = FOCUS_PLANET[focus];
    const b = key ? this.bodies.find((x) => x.spec.key === key) : null;
    if (!b) {
      out.set(0, 0, 0);
      return { radius: SUN_RADIUS };
    }
    b.holder.getWorldPosition(out);
    return { radius: b.spec.radius };
  }

  get loaded(): number {
    return this.bodies.length;
  }

  dispose(): void {
    this.disposed = true;
    for (const b of this.bodies) {
      b.obj.dispose();
      b.orbitLine.geometry.dispose();
      (b.orbitLine.material as THREE.Material).dispose();
    }
    this.moon?.obj.dispose();
    this.sun?.dispose();
    if (this.stars) {
      this.stars.geometry.dispose();
      (this.stars.material as THREE.Material).dispose();
    }
    this.root.removeFromParent();
  }
}
