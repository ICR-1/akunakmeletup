import * as THREE from 'three';
import { audio } from '../core/audio';
import { EVENT_SCENE, LAUNCH_SITE, LAUNCH_WORLD_SCALE, SHATTER, VISUAL } from '../core/constants';
import { CameraShake } from '../core/cameraShake';
import type { GameContext } from '../core/context';
import { createRng, rngRange, type Rng } from '../core/rng';
import { pickFlightEvent, rollChoice } from '../events/eventSystem';
import { createFlame, disposeFlame, ParticleField, setFlame } from '../gen/effects';
import { buildLander } from '../gen/lander';
import { disposeTree } from '../gen/mesh';
import { departureProgress, destScale, earthScale } from '../rules/journey';
import { Explosion, stepBallistic } from '../gen/explosion';
import { boosterLayout, buildRocket, isBoosterStage, launchLayout, mountLander, NOZZLE_LENGTH, PIVOT_LIFT, type RocketModel } from '../gen/rocket';
import { createPlanet, ATMOSPHERES, type PlanetObject } from '../gen/planets';
import { buildFacilityComplex } from '../gen/facilities';
import { createLaunchIsland, createLaunchPad, type LaunchIsland, type LaunchPad } from '../gen/launchSite';
import { atmosphereColor, createClouds, createStars, disposeWorld } from '../gen/sky';
import { isHigh } from '../gen/detail';
import { createTerrain, terrainStyle, type Terrain } from '../gen/terrain';
import { applyTerrainTextures } from '../gen/terrainTexture';
import { makeAutopilot } from '../rules/autopilot';
import { resolveAssembly, type Assembly } from '../rules/catalog';
import {
  createFlightSimConfig, FlightSim, NO_INPUT, type FlightEvent, type FlightInput,
} from '../rules/flightSim';
import { clamp } from '../rules/margin';
import { buildOutcome } from '../rules/outcome';
import { linesFor } from '../rules/dialogs';
import { showEventDialog, showNovaBubble } from '../ui/dialog';
import { Cinematic } from '../ui/cinematic';
import { shardVelocity, shatterObject } from '../gen/shatter';
import { MeteorShower } from '../gen/meteors';
import { cinematicK, eventSceneFor, planMeteors, type EventSceneSpec } from '../rules/eventScene';
import { EVENT_SCENE_UI } from '../core/strings';
import { FlightHud } from '../ui/flightHud';
import { BaseScene } from './baseScene';

const CAM_FOLLOW = 3;
const LEAN_FOLLOW = 6;
const MOUSE_SENS = 0.15;
const DEBRIS_LIFE_SEC = 7;
const DEBRIS_SPEED = 6;
const SCROLL_SPEED = 10;
const EARTH_RADIUS = 1400;
const EARTH_TOP_Y = -900;
const EARTH_TILT = 1.1;
const EARTH_SEGMENTS = 96;
const EARTH_SPIN = 0.012;
const DEST_SPIN = 0.03;
const DEST_SEGMENTS = 64;
const GROUND_DROP = 4000;
/** Perpindahan Bumi (x, y, z) saat transfer selesai; z negatif = menjauh dari kamera. */
const EARTH_DEPART_OFFSET: [number, number, number] = [-3200, 1300, -1800];
/** Eksponen kurva naik: kecil di awal agar lepas landas terasa berat lalu makin cepat. */
const GROUND_DROP_EXP = 1.6;
const DEST_RADIUS = 420;
const RESULT_DELAY_SEC = 1.2;
/** Setelah ledakan, panel hasil menunggu lebih lama agar ledakan sempat terlihat. */
const EXPLOSION_RESULT_DELAY_SEC = 3.4;
const DUST_ALTITUDE_M = 60;
const VISUAL_ALT_REAL_M = 120;
const LANDING_CAM_FRACTION = 0.72;
const VISUAL_ALT_COMPRESS = 0.1;
const EARTH_ORBIT_TOP_Y = -260;
const CAM_LOOKDOWN_TAN = 0.47;
const CAM_LOOKDOWN_FULL_ALT_M = 150;
const FLAME_LENGTH_ROCKET = 3.4;
const FLAME_LENGTH_LANDER = 3.2;
const SMOKE_RATE = 1;
/** Api booster sedikit lebih pendek daripada api mesin tengah. */
const BOOSTER_FLAME_SCALE = 0.8;
const LIGHT_LAUNCH = { hemi: 1.1, sun: 2.6 } as const;
const LIGHT_LANDING = { hemi: 0.55, sun: 1.7 } as const;
const DEST_BODY_POS: [number, number, number] = [560, 70, -1900];
const SHAKE_THRUST = 0.35;
const SHAKE_LANDING = 0.25;
const SHAKE_LANDING_ALT_M = 80;
const SHAKE_IMPACT = { perfect: 0.2, success: 0.4, damaged: 0.75, crash: 1 } as const;
const SHAKE_SEPARATION = 0.25;
const SHAKE_EXPLOSION = 1.6;
const EXPLOSION_GRAVITY = 9.8;
const CRASH_DEBRIS_LIFE_SEC = 20;
/** Serpihan diam sedikit di atas tanah agar tidak terbenam. */
const SHARD_GROUND_OFFSET_M = 0.15;

interface Debris {
  group: THREE.Group; vel: THREE.Vector3; spin: THREE.Vector3; age: number;
  /** Serpihan ledakan: jatuh dipercepat gravitasi dan berhenti di tanah (y dunia); umur lebih panjang. */
  gravity?: number; groundY?: number; life?: number;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export class FlightScene extends BaseScene {
  readonly id = 'flight' as const;
  private sim: FlightSim | null = null;
  private assembly: Assembly | null = null;
  private hud: FlightHud | null = null;
  private autopilot: (() => FlightInput) | null = null;
  private model: RocketModel | null = null;
  private readonly pivot = new THREE.Group();
  private mountedLander: THREE.Group | null = null;
  private landingLander: THREE.Group | null = null;
  private flame: THREE.Group | null = null;
  private landingFlame: THREE.Group | null = null;
  private flameHost = -1;
  /** Api empat booster samping (tahap booster), menggantikan api tengah selama booster menyala. */
  private boosterFlames: { flame: THREE.Group; stage: number }[] = [];
  /** Dunia peluncuran (tanah, landasan, menara, awan); diturunkan seiring roket naik. */
  private world: THREE.Group | null = null;
  private padY = 0;
  private island: LaunchIsland | null = null;
  private pad: LaunchPad | null = null;
  private earth: PlanetObject | null = null;
  private destBody: PlanetObject | null = null;
  private terrain: Terrain | null = null;
  private stars: THREE.Points | null = null;
  private smoke: ParticleField | null = null;
  private dust: ParticleField | null = null;
  private readonly debris: Debris[] = [];
  private explosions: Explosion[] = [];
  private vrng: Rng = createRng(1);
  private lean = 0;
  private padX = 0;
  private endedTimer = -1;
  private resultDelaySec = RESULT_DELAY_SEC;
  private eventOpen = false;
  /** Adegan animasi sebelum dialog event penerbangan (simulasi tetap beku selama adegan). */
  private eventIntro: { id: string; spec: EventSceneSpec; t: number; pulse: number; open: () => void } | null = null;
  private eventShower: MeteorShower | null = null;
  private cinematic: Cinematic | null = null;
  private readonly hemi = new THREE.HemisphereLight(0xdfeaff, 0x30343f, LIGHT_LAUNCH.hemi);
  private readonly sun = new THREE.DirectionalLight(0xffffff, LIGHT_LAUNCH.sun);
  private wasPrompt = false;
  private readonly shake = new CameraShake(createRng(0x5a4e));
  private readonly camTarget = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3(0, 4, 20);
  private readonly lockHandler = (): void => { void this.ctx.canvas.requestPointerLock?.(); };

  constructor(ctx: GameContext) {
    super(ctx);
    this.scene.add(this.hemi, this.sun);
    this.sun.position.set(300, 500, 200);
    this.scene.add(this.pivot);
  }

  protected onEnter(ui: HTMLElement): void {
    const cfg = this.ctx.store.get().mission;
    const catalog = this.ctx.catalog;
    this.assembly = resolveAssembly(cfg, catalog);
    this.sim = new FlightSim(createFlightSimConfig(cfg, catalog));
    this.vrng = createRng((cfg.seed ^ 0xabcdef) >>> 0);
    this.autopilot = null;
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('pilot')) this.autopilot = makeAutopilot(this.sim);

    const dest = this.assembly.destination;
    this.hemi.intensity = LIGHT_LAUNCH.hemi;
    this.sun.intensity = LIGHT_LAUNCH.sun;
    this.stars = createStars(cfg.seed);
    this.scene.add(this.stars);
    // Planet halus bertekstur prosedural; sumbu dimiringkan agar kamera melihat lintang menengah, bukan tutup es kutub.
    this.earth = createPlanet('earth', EARTH_RADIUS, { segments: EARTH_SEGMENTS, clouds: true, atmosphere: ATMOSPHERES.earth ?? null });
    this.earth.root.rotation.x = EARTH_TILT;
    this.earth.root.position.set(0, EARTH_TOP_Y - EARTH_RADIUS, 0);
    this.scene.add(this.earth.root);
    this.destBody = createPlanet(dest.id === 'mars' ? 'mars' : 'moon', DEST_RADIUS, {
      segments: DEST_SEGMENTS, atmosphere: dest.id === 'mars' ? (ATMOSPHERES.mars ?? null) : null,
    });
    this.destBody.root.rotation.x = EARTH_TILT;
    this.destBody.root.visible = false;
    this.scene.add(this.destBody.root);
    const style = terrainStyle(dest.id);
    applyTerrainTextures(dest.id === 'mars' ? 'mars' : 'moon', isHigh());
    this.terrain = createTerrain({ seed: cfg.seed, palette: dest.palette, amplitude: style.amplitude, craterCount: style.craterCount });
    this.terrain.mesh.visible = false;
    this.scene.add(this.terrain.mesh);
    this.smoke = new ParticleField(500, 0.7);
    this.dust = new ParticleField(400, 0.9);
    this.scene.add(this.smoke.points, this.dust.points);

    this.model = buildRocket(this.assembly.rocket);
    // Tanah tepat di dasar nosel; sebelumnya y = 0 sehingga seluruh roket tertanam di bawah permukaan.
    const layout = launchLayout(this.model);
    this.model.root.position.y = layout.rootY;
    this.padY = layout.padY;
    this.world = new THREE.Group();
    this.island = createLaunchIsland(cfg.seed);
    this.pad = createLaunchPad(this.model.radius, this.model.totalHeight);
    // Pulau, pepohonan, dan bangunan dibuat dalam meter nyata; roket berskala satuan model (1 satuan = 1/LAUNCH_WORLD_SCALE m),
    // jadi lingkungan dikecilkan agar roket tampak raksasa dan cukup besar untuk memuat lander dan Lunar Cruiser.
    const ground = new THREE.Group();
    ground.name = 'launch-ground';
    ground.scale.setScalar(LAUNCH_WORLD_SCALE);
    ground.add(this.island.group, buildFacilityComplex(cfg.seed));
    this.world.add(ground, this.pad.group, createClouds(cfg.seed));
    this.world.position.y = this.padY;
    this.scene.add(this.world);
    this.mountedLander = buildLander(this.assembly.modules, this.assembly.instruments);
    mountLander(this.model, this.mountedLander);
    this.pivot.add(this.model.root);
    this.pivot.visible = true;
    this.flame = createFlame(this.model.radius * 0.55);
    this.flameHost = -1;
    this.boosterFlames = [];
    this.assembly.rocket.stages.forEach((st, i) => {
      if (!isBoosterStage(st.name)) return;
      for (const b of boosterLayout(this.model!.radius)) {
        const f = createFlame(b.r * 0.6);
        f.position.set(b.x, -0.8, b.z);
        this.model!.stageGroups[i].add(f);
        this.boosterFlames.push({ flame: f, stage: i });
      }
    });
    this.lean = 0;
    this.padX = 0;
    this.endedTimer = -1;
    this.resultDelaySec = RESULT_DELAY_SEC;
    this.eventOpen = false;
    this.wasPrompt = false;

    this.hud = new FlightHud(ui, this.assembly.rocket);
    this.cinematic = new Cinematic(ui);
    this.eventIntro = null;
    this.nova(ui, 'nova_flight_start');
    this.ctx.canvas.addEventListener('click', this.lockHandler);
    this.camTarget.set(0, 0, 0);
    this.syncWorld(0);
    this.camera.position.copy(this.camPos);
  }

  protected override onExit(): void {
    this.ctx.canvas.removeEventListener('click', this.lockHandler);
    if (document.pointerLockElement) document.exitPointerLock();
    for (const d of this.debris) { this.scene.remove(d.group); disposeTree(d.group); }
    this.debris.length = 0;
    for (const e of this.explosions) e.dispose();
    this.explosions = [];
    this.eventShower?.dispose();
    this.eventShower = null;
    this.cinematic?.dispose();
    this.cinematic = null;
    this.eventIntro = null;
    if (this.model) { this.pivot.remove(this.model.root); disposeTree(this.model.root); }
    if (this.landingLander) { this.scene.remove(this.landingLander); disposeTree(this.landingLander); }
    for (const f of [this.flame, this.landingFlame, ...this.boosterFlames.map((b) => b.flame)]) if (f) { f.removeFromParent(); disposeFlame(f); }
    this.boosterFlames = [];
    if (this.world) { this.scene.remove(this.world); disposeWorld(this.world); }
    for (const p of [this.earth, this.destBody]) if (p) { this.scene.remove(p.root); p.dispose(); }
    if (this.terrain) { this.scene.remove(this.terrain.mesh); this.terrain.dispose(); }
    if (this.stars) { this.scene.remove(this.stars); this.stars.geometry.dispose(); (this.stars.material as THREE.Material).dispose(); }
    for (const p of [this.smoke, this.dust]) if (p) { this.scene.remove(p.points); p.dispose(); }
    this.model = this.mountedLander = this.landingLander = this.flame = this.landingFlame = null;
    this.world = null;
    this.island = null;
    this.pad = null;
    this.earth = this.destBody = this.stars = null;
    this.terrain = null;
    this.smoke = this.dust = null;
    this.sim = null;
    this.hud = null;
  }

  private nova(ui: HTMLElement, id: string): void {
    const line = linesFor(this.ctx.catalog.dialogs, id)[0];
    if (line) showNovaBubble(ui, line.text);
  }

  private readInput(): FlightInput {
    if (this.autopilot) return this.autopilot();
    const inp = this.ctx.input;
    const axis = (pos: string, neg: string): number => (inp.isDown(pos) ? 1 : 0) - (inp.isDown(neg) ? 1 : 0);
    const mouse = inp.consumeMouse();
    return {
      throttle: axis('KeyW', 'KeyS'),
      pitch: clamp(axis('ArrowDown', 'ArrowUp') + mouse.dy * MOUSE_SENS, -1, 1),
      yaw: clamp(axis('ArrowRight', 'ArrowLeft') + mouse.dx * MOUSE_SENS, -1, 1),
      roll: axis('KeyD', 'KeyA'),
      jettison: inp.consumePressed('KeyF'),
      boost: inp.isDown('ShiftLeft') || inp.isDown('ShiftRight'),
      precision: inp.isDown('Space'),
    };
  }

  update(dt: number): void {
    const sim = this.sim;
    if (!sim) return;
    // Dialog event krisis membekukan simulasi sampai pemain memilih.
    const input = sim.ended || this.eventOpen ? NO_INPUT : this.readInput();
    const events = this.eventOpen ? [] : sim.step(input, dt);
    for (const e of events) this.handleEvent(e);
    // Getaran mesin saat peluncuran/burn dan dekat tanah saat mendarat.
    const burning = (sim.phase === 'launch' || sim.phase === 'transfer') && sim.throttle > 0;
    if (burning) this.shake.hold(sim.throttle * SHAKE_THRUST);
    else if (sim.landing && !sim.landing.landed && sim.landing.altitudeM < SHAKE_LANDING_ALT_M && sim.throttle > 0.02) this.shake.hold(sim.throttle * SHAKE_LANDING);
    // Lengan umbilikal terlepas dan berayun menjauh saat mesin menyala penuh tenaga.
    if (this.pad && !this.pad.released && sim.phase === 'launch' && sim.throttle >= LAUNCH_SITE.armReleaseThrottle) {
      this.pad.release();
      audio.stageSeparation();
      this.shake.add(0.2);
    }
    this.updateEventIntro(dt);
    this.pad?.update(dt);
    this.island?.update(dt);
    if (sim.jettisonPrompt && !this.wasPrompt) audio.alarm();
    this.wasPrompt = sim.jettisonPrompt;
    this.syncWorld(dt);
    this.smoke?.update(dt);
    this.dust?.update(dt);
    this.updateDebris(dt);
    this.explosions = this.explosions.filter((e) => {
      const alive = e.update(dt);
      if (!alive) e.dispose();
      return alive;
    });
    if (this.endedTimer >= 0) {
      this.endedTimer += dt;
      if (this.endedTimer >= this.resultDelaySec) {
        this.endedTimer = -2;
        this.showResult();
      }
    }
  }

  override render(): void {
    if (this.sim) {
      this.hud?.update(this.sim, this.eventOpen);
      const sim = this.sim;
      const rocketBurn = (sim.phase === 'launch' || sim.phase === 'transfer') ? sim.throttle : 0;
      const landerBurn = sim.landing && !sim.landing.landed && sim.landing.fuelKg > 0 ? sim.throttle : 0;
      audio.setEngine(sim.ended ? 0 : Math.max(rocketBurn, landerBurn));
    }
    super.render();
  }

  private axisDir(): THREE.Vector3 {
    return new THREE.Vector3(0, 1, 0).applyQuaternion(this.pivot.quaternion);
  }

  private spawnDebris(group: THREE.Group, vel: THREE.Vector3, spin: number, extra: Pick<Debris, 'gravity' | 'groundY' | 'life'> = {}): void {
    if (!group.parent) return;
    this.scene.attach(group);
    const r = this.vrng;
    this.debris.push({
      group, vel,
      spin: new THREE.Vector3(rngRange(r, -spin, spin), rngRange(r, -spin, spin), rngRange(r, -spin, spin)),
      age: 0, ...extra,
    });
  }

  private handleEvent(e: FlightEvent): void {
    const sim = this.sim;
    const model = this.model;
    if (!sim || !model) return;
    const r = this.vrng;
    const launching = sim.phase === 'launch' || sim.phase === 'orbit';
    switch (e.type) {
      case 'jettison': {
        const group = model.stageGroups[e.stageIndex];
        const vel = this.axisDir().multiplyScalar(-DEBRIS_SPEED)
          .add(new THREE.Vector3(rngRange(r, -2, 2), launching ? -SCROLL_SPEED : 0, rngRange(r, -2, 2)));
        const pos = new THREE.Vector3();
        group.getWorldPosition(pos);
        for (let i = 0; i < 28; i++) {
          this.smoke?.emit(pos, new THREE.Vector3(rngRange(r, -6, 6), rngRange(r, -6, 6), rngRange(r, -6, 6)), 0.9, new THREE.Color(0xdde8ff));
        }
        this.spawnDebris(group, vel, 1.2);
        audio.stageSeparation();
        this.shake.add(SHAKE_SEPARATION);
        break;
      }
      case 'fairing': {
        audio.stageSeparation();
        const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.pivot.quaternion);
        this.spawnDebris(model.fairingLeft, side.clone().multiplyScalar(-5).add(new THREE.Vector3(0, -SCROLL_SPEED, 0)), 0.8);
        this.spawnDebris(model.fairingRight, side.clone().multiplyScalar(5).add(new THREE.Vector3(0, -SCROLL_SPEED, 0)), 0.8);
        break;
      }
      case 'phase':
        if (e.phase === 'capture') this.openFlightEvent();
        if (e.phase === 'landing') {
          this.enterLanding();
          if (this.ui) this.nova(this.ui, 'nova_landing');
        }
        break;
      case 'touchdown':
        audio.touchdown();
        this.shake.add(SHAKE_IMPACT[e.outcome]);
        if (e.outcome === 'crash') this.explodeLander();
        break;
      case 'rocket_crash':
        this.explodeRocket();
        break;
      case 'ended':
        this.endedTimer = 0;
        break;
      default:
        break;
    }
  }

  /** Roket jatuh ke landasan: bola api, gelombang kejut, asap, dan seluruh badan roket pecah menjadi serpihan yang jatuh. */
  private explodeRocket(): void {
    const model = this.model, sim = this.sim;
    if (!model || !sim) return;
    const base = new THREE.Vector3();
    model.stageGroups[0].getWorldPosition(base);
    const groundY = base.y - NOZZLE_LENGTH;
    this.addExplosion(base, 1.3 * model.radius + 0.4, groundY);
    this.scatterShards(model.root, SHATTER.rocketShards, base, groundY);
    this.pivot.visible = false;
    this.hideFlames();
  }

  /** Pendaratan hancur (kecepatan vertikal > 12 m/s): ledakan di titik sentuh dan wahana lenyap. */
  private explodeLander(): void {
    const lander = this.landingLander;
    if (!lander) return;
    const pos = new THREE.Vector3();
    lander.getWorldPosition(pos);
    this.addExplosion(pos, 1.5 * VISUAL.landerWorldScale * 0.8, pos.y);
    this.scatterShards(lander, SHATTER.landerShards, pos, pos.y);
    lander.visible = false;
    this.hideFlames();
  }

  /** Pecah `root` menjadi serpihan lambung lepas yang berhamburan dari titik ledakan, jatuh, lalu diam di tanah. */
  private scatterShards(root: THREE.Object3D, budget: number, center: THREE.Vector3, groundY: number): void {
    const seed = this.ctx.store.get().mission.seed;
    for (const shard of shatterObject(root, budget, seed, SHATTER.iterations)) {
      this.scene.add(shard.group);
      const v = shardVelocity(center, shard.group.position, this.vrng, SHATTER.speedMin, SHATTER.speedMax, SHATTER.upBias);
      this.debris.push({
        group: shard.group, vel: new THREE.Vector3(v.x, v.y, v.z), age: 0,
        spin: new THREE.Vector3(rngRange(this.vrng, -SHATTER.spin, SHATTER.spin), rngRange(this.vrng, -SHATTER.spin, SHATTER.spin), rngRange(this.vrng, -SHATTER.spin, SHATTER.spin)),
        gravity: EXPLOSION_GRAVITY, groundY: groundY + SHARD_GROUND_OFFSET_M, life: CRASH_DEBRIS_LIFE_SEC,
      });
    }
  }

  private addExplosion(pos: THREE.Vector3, scale: number, groundY: number): void {
    const ex = new Explosion(pos, scale, groundY, this.ctx.store.get().mission.seed);
    this.scene.add(ex.group);
    this.explosions.push(ex);
    audio.explosion();
    this.shake.add(SHAKE_EXPLOSION);
    this.resultDelaySec = EXPLOSION_RESULT_DELAY_SEC;
  }

  private hideFlames(): void {
    if (this.flame) this.flame.visible = false;
    if (this.landingFlame) this.landingFlame.visible = false;
    for (const b of this.boosterFlames) b.flame.visible = false;
  }

  /** Tepat satu event penerbangan dipicu antara burn dan pendaratan (PRD 14). */
  private openFlightEvent(): void {
    const sim = this.sim, ui = this.ui, assembly = this.assembly;
    if (!sim || !ui || !assembly) return;
    const seed = this.ctx.store.get().mission.seed;
    const event = pickFlightEvent(this.ctx.catalog.events, assembly.destination.id, seed);
    if (!event) return;
    this.eventOpen = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const openDialog = (): unknown => showEventDialog(
      ui, event,
      (i) => {
        const outcome = rollChoice(event, i, seed);
        if (event.id === 'ev_micrometeor') this.shake.add(0.6);
        const dv = outcome.effects.filter((ef) => ef.target === 'deltaVms').reduce((t, ef) => t + ef.delta, 0);
        if (outcome.handledWell) {
          sim.eventsHandledWell += 1;
          sim.handledEventIds.push(event.id);
        }
        for (const ev of sim.applyDvAdjust(dv)) this.handleEvent(ev);
        return outcome;
      },
      () => { this.eventOpen = false; this.ctx.input.clear(); },
    );
    const spec = eventSceneFor(event.id);
    if (!spec) { openDialog(); return; }
    audio.alarm();
    if (spec.kind === 'flyby') {
      const plan = planMeteors(seed, EVENT_SCENE.flyby.count, spec.introSec * EVENT_SCENE.flyby.windowFrac, EVENT_SCENE.flyby.minDistM, EVENT_SCENE.flyby.maxDistM);
      this.eventShower?.dispose();
      this.eventShower = new MeteorShower(plan, this.camTarget.clone(), null);
      this.scene.add(this.eventShower.group);
    }
    this.eventIntro = { id: event.id, spec, t: 0, pulse: 0, open: openDialog };
  }

  /** Adegan event: bilah sinematik, meteoroid melintas, atau getaran mesin/penjepit sebelum dialog dibuka. */
  private updateEventIntro(dt: number): void {
    this.eventShower?.update(dt);
    const sc = this.eventIntro;
    if (!sc) return;
    sc.t += dt;
    if (sc.spec.kind === 'engine' || sc.spec.kind === 'clamp' || sc.spec.kind === 'flyby') {
      sc.pulse += dt;
      if (sc.pulse >= EVENT_SCENE.pulseShakeEverySec) {
        sc.pulse = 0;
        this.shake.add(sc.spec.kind === 'flyby' ? EVENT_SCENE.impactShake : EVENT_SCENE.pulseShake);
      }
    }
    this.cinematic?.set(EVENT_SCENE_UI[sc.id] ?? '', sc.spec.tone, cinematicK(sc.t, sc.spec.introSec));
    if (sc.t >= sc.spec.introSec) {
      this.cinematic?.hide();
      this.eventIntro = null;
      this.eventShower?.dispose();
      this.eventShower = null;
      sc.open();
    }
  }

  private updateDebris(dt: number): void {
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.age += dt;
      let resting = false;
      if (d.gravity !== undefined) {
        const p = d.group.position;
        const r = stepBallistic(p, d.vel, d.gravity, d.groundY ?? -Infinity, dt);
        resting = r.landed;
      } else d.group.position.addScaledVector(d.vel, dt);
      if (!resting) {
        d.group.rotation.x += d.spin.x * dt;
        d.group.rotation.y += d.spin.y * dt;
        d.group.rotation.z += d.spin.z * dt;
      }
      if (d.age > (d.life ?? DEBRIS_LIFE_SEC)) {
        this.scene.remove(d.group);
        disposeTree(d.group);
        this.debris.splice(i, 1);
      }
    }
  }

  private enterLanding(): void {
    if (!this.assembly || !this.terrain) return;
    this.pivot.visible = false;
    this.landingLander = buildLander(this.assembly.modules, this.assembly.instruments);
    this.landingLander.scale.setScalar(VISUAL.landerWorldScale);
    this.scene.add(this.landingLander);
    this.landingFlame = createFlame(0.5);
    this.landingFlame.position.set(0, 0.35, 0);
    this.landingLander.add(this.landingFlame);
    this.terrain.mesh.visible = true;
    if (this.world) this.world.visible = false;
    for (const p of [this.earth, this.destBody]) if (p) p.root.visible = false;
    // Terrain pendaratan lebih redup agar kawah tetap berkontras setelah tone mapping.
    this.hemi.intensity = LIGHT_LANDING.hemi;
    this.sun.intensity = LIGHT_LANDING.sun;
    const dest = this.assembly.destination;
    const sky = new THREE.Color(dest.palette[1]);
    this.scene.background = dest.id === 'mars' ? sky.clone().multiplyScalar(0.7) : new THREE.Color(0x000000);
    this.scene.fog = dest.id === 'mars' ? new THREE.FogExp2(sky.clone().multiplyScalar(0.7).getHex(), 0.0009) : null;
    if (this.stars) (this.stars.material as THREE.PointsMaterial).opacity = dest.id === 'mars' ? 0 : 1;
    const camS = VISUAL.landerWorldScale * LANDING_CAM_FRACTION;
    this.camPos.set(8 * camS, 4 * camS, 18 * camS);
    this.camTarget.set(0, 2 * camS, 0);
  }

  /** Letakkan flame pada tahap terendah yang masih menempel. */
  private updateRocketFlame(): void {
    const sim = this.sim, model = this.model, flame = this.flame;
    if (!sim || !model || !flame || !this.assembly) return;
    const stages = this.assembly.rocket.stages;
    let host = -1;
    for (let i = 0; i < stages.length; i++) {
      if (sim.staging.stages[i].phase !== 'jettisoned' && !/booster/i.test(stages[i].name)) { host = i; break; }
    }
    if (host !== this.flameHost && host >= 0) {
      model.stageGroups[host].add(flame);
      flame.position.set(0, -0.8, 0);
      this.flameHost = host;
    }
    const burning = (sim.phase === 'launch' || sim.phase === 'transfer') && sim.throttle > 0;
    // Selama booster samping menyala, api keluar di empat titik booster; setelah dilepas kembali ke api tengah seperti biasa.
    const boostersBurning = this.boosterFlames.some((b) => sim.staging.stages[b.stage].phase !== 'jettisoned');
    setFlame(flame, burning && !boostersBurning ? sim.throttle : 0, FLAME_LENGTH_ROCKET * model.radius, this.vrng());
    const sources: THREE.Group[] = [];
    for (const b of this.boosterFlames) {
      const on = burning && sim.staging.stages[b.stage].phase !== 'jettisoned';
      setFlame(b.flame, on ? sim.throttle : 0, FLAME_LENGTH_ROCKET * model.radius * BOOSTER_FLAME_SCALE, this.vrng());
      if (on) sources.push(b.flame);
    }
    if (burning && !boostersBurning) sources.push(flame);
    if (this.smoke) {
      const back = this.axisDir().multiplyScalar(-(10 + sim.throttle * 8));
      const perSource = Math.max(1, Math.ceil(SMOKE_RATE / Math.max(1, sources.length)));
      const pos = new THREE.Vector3();
      for (const src of sources) {
        src.getWorldPosition(pos);
        for (let i = 0; i < perSource; i++) {
          const v = back.clone().add(new THREE.Vector3(rngRange(this.vrng, -2, 2), rngRange(this.vrng, -2, 2), rngRange(this.vrng, -2, 2)));
          this.smoke.emit(pos, v, 1.1, new THREE.Color(0xff9a4a).multiplyScalar(0.6));
        }
      }
    }
  }

  private applyShake(dt: number): void {
    const [x, y, z] = this.shake.update(dt);
    this.camera.position.add(new THREE.Vector3(x, y, z));
  }

  private syncWorld(dt: number): void {
    const sim = this.sim;
    if (!sim) return;
    if (sim.landing && this.landingLander && this.terrain) this.syncLanding(sim, dt);
    else this.syncRocket(sim, dt);
  }

  private syncRocket(sim: FlightSim, dt: number): void {
    const model = this.model;
    if (!model || !this.assembly) return;
    const leaning = sim.phase === 'launch' || sim.phase === 'orbit';
    const targetLean = leaning ? 90 - sim.pitchDeg : 90 - sim.aimPitchDeg;
    this.lean += (targetLean - this.lean) * (1 - Math.exp(-LEAN_FOLLOW * dt));
    if (dt === 0) this.lean = targetLean;
    const yaw = leaning ? 0 : sim.aimYawDeg;
    this.pivot.rotation.order = 'YXZ';
    this.pivot.rotation.set(0, THREE.MathUtils.degToRad(yaw), -THREE.MathUtils.degToRad(this.lean));
    this.pivot.updateMatrixWorld(true);

    const skyT = sim.phase === 'launch' || sim.crashed ? sim.progress : 1;
    const atm = smoothstep(0, 0.7, skyT);
    this.scene.background = atmosphereColor(atm);
    this.scene.fog = atm < 0.98 ? new THREE.FogExp2(atmosphereColor(atm).getHex(), 0.0009 * (1 - atm)) : null;
    if (this.stars) (this.stars.material as THREE.PointsMaterial).opacity = smoothstep(0.2, 0.65, skyT);
    if (this.world) {
      this.world.visible = skyT < 0.85;
      this.world.position.y = this.padY - (skyT ** GROUND_DROP_EXP) * GROUND_DROP;
      if (sim.throttle > 0) this.world.position.x -= dt * 30 * Math.sin(THREE.MathUtils.degToRad(this.lean));
    }
    const transferring = sim.phase === 'transfer' || sim.phase === 'capture';
    const lastStage = sim.staging.stages[sim.staging.stages.length - 1];
    const burned = 1 - lastStage.burnRemainingSec / this.assembly.rocket.stages[this.assembly.rocket.stages.length - 1].burnSec;
    // Perjalanan transfer: Bumi mengecil dan menjauh perlahan (tidak lenyap seketika), planet tujuan tumbuh dari titik kecil.
    const departure = departureProgress(sim.phase, burned);
    if (this.earth) {
      const shrink = earthScale(departure);
      this.earth.root.visible = !transferring || departure < 1;
      this.earth.spin(dt, EARTH_SPIN);
      const rise = smoothstep(0.55, 1, skyT);
      // Bumi menyusut sambil bergeser ke belakang-kiri-atas (jauh dari kamera) sehingga tetap terlihat mengecil
      // di belakang roket, bukan jatuh keluar layar atau lenyap.
      this.earth.root.scale.setScalar(shrink);
      this.earth.root.position.set(
        EARTH_DEPART_OFFSET[0] * departure,
        -EARTH_RADIUS + EARTH_TOP_Y + (EARTH_ORBIT_TOP_Y - EARTH_TOP_Y) * rise + EARTH_DEPART_OFFSET[1] * departure,
        EARTH_DEPART_OFFSET[2] * departure,
      );
    }
    if (this.destBody) {
      this.destBody.root.visible = transferring;
      const s = destScale(sim.phase, departure, burned);
      this.destBody.root.scale.setScalar(s);
      this.destBody.root.position.set(...DEST_BODY_POS);
      this.destBody.spin(dt, DEST_SPIN);
    }

    this.updateRocketFlame();

    // Kamera: ikuti bagian tumpukan yang tersisa; zoom-in halus saat roket memendek.
    let lowest = model.landerSlot.position.y;
    this.assembly.rocket.stages.forEach((st, i) => {
      if (sim.staging.stages[i].phase === 'jettisoned' || /booster/i.test(st.name)) return;
      lowest = Math.min(lowest, model.stageGroups[i].position.y);
    });
    const remaining = model.landerSlot.position.y + PIVOT_LIFT - lowest + 2;
    const axis = this.axisDir();
    const wantTarget = axis.clone().multiplyScalar(-(remaining / 2 - 1.5));
    const dist = clamp(remaining * 1.9, 14, 70);
    const wantPos = wantTarget.clone().add(new THREE.Vector3(0, dist * 0.12, dist));
    const k = dt === 0 ? 1 : 1 - Math.exp(-CAM_FOLLOW * dt);
    this.camTarget.lerp(wantTarget, k);
    this.camPos.lerp(wantPos, k);
    this.camera.position.copy(this.camPos);
    this.applyShake(dt);
    this.camera.lookAt(this.camTarget);
  }

  private syncLanding(sim: FlightSim, dt: number): void {
    const landing = sim.landing;
    const lander = this.landingLander, terrain = this.terrain;
    if (!landing || !lander || !terrain) return;
    this.padX = clamp(this.padX + landing.vx * dt, -300, 300);
    // Ketinggian visual dimampatkan di atas 120 m agar permukaan tampak mendekat; HUD memakai angka nyata.
    const visualAlt = landing.altitudeM <= VISUAL_ALT_REAL_M
      ? landing.altitudeM
      : VISUAL_ALT_REAL_M + (landing.altitudeM - VISUAL_ALT_REAL_M) * VISUAL_ALT_COMPRESS;
    terrain.mesh.position.set(-this.padX, -visualAlt, 0);
    lander.rotation.z = -THREE.MathUtils.degToRad(landing.tiltDeg);
    if (this.landingFlame) setFlame(this.landingFlame, landing.landed ? 0 : sim.throttle * (landing.fuelKg > 0 ? 1 : 0), FLAME_LENGTH_LANDER, this.vrng());
    const thrusting = !landing.landed && sim.throttle > 0.02 && landing.fuelKg > 0;
    if (thrusting && this.smoke) {
      const pos = new THREE.Vector3(0, 0.3, 0);
      for (let i = 0; i < SMOKE_RATE; i++) {
        this.smoke.emit(pos, new THREE.Vector3(rngRange(this.vrng, -2, 2), -12 - sim.throttle * 8, rngRange(this.vrng, -2, 2)), 0.8, new THREE.Color(0xff9a4a).multiplyScalar(0.5));
      }
    }
    if (thrusting && landing.altitudeM < DUST_ALTITUDE_M && this.dust && this.assembly) {
      const strength = 1 - landing.altitudeM / DUST_ALTITUDE_M;
      const dustColor = new THREE.Color(this.assembly.destination.palette[0]).multiplyScalar(0.55);
      const ground = new THREE.Vector3(0, -visualAlt, 0);
      for (let i = 0; i < Math.ceil(6 * strength); i++) {
        const a = rngRange(this.vrng, 0, Math.PI * 2);
        const sp = rngRange(this.vrng, 6, 14);
        this.dust.emit(ground, new THREE.Vector3(Math.cos(a) * sp, rngRange(this.vrng, 0.5, 2.5), Math.sin(a) * sp), 1.6, dustColor);
      }
    }
    const approach = clamp(landing.altitudeM / 120, 0, 1);
    const lookDown = clamp(landing.altitudeM / CAM_LOOKDOWN_FULL_ALT_M, 0, 1) * 19 * CAM_LOOKDOWN_TAN;
    // Kamera pendaratan mengikuti ukuran lander tetapi sedikit lebih dekat agar lander tetap menonjol
    const S = VISUAL.landerWorldScale * LANDING_CAM_FRACTION;
    const wantTarget = new THREE.Vector3(0, (2 - lookDown) * S, 0);
    const wantPos = new THREE.Vector3((8 + approach * 4) * S, (3.5 + approach * 2) * S, (17 + approach * 6) * S);
    const k = dt === 0 ? 1 : 1 - Math.exp(-CAM_FOLLOW * dt);
    this.camTarget.lerp(wantTarget, k);
    this.camPos.lerp(wantPos, k);
    this.camera.position.copy(this.camPos);
    this.applyShake(dt);
    this.camera.lookAt(this.camTarget);
  }

  private showResult(): void {
    const sim = this.sim;
    if (!sim || !this.hud) return;
    const flight = sim.summary();
    if (!flight) return;
    this.hud.showResult(flight, () => {
      if (flight.failed) {
        const outcome = buildOutcome({ config: this.ctx.store.get().mission, catalog: this.ctx.catalog, flight, surface: null });
        this.ctx.store.set({ flight, surface: null, outcome });
        this.ctx.go('review');
      } else {
        this.ctx.store.set({ flight, surface: null, outcome: null });
        this.ctx.go('surface');
      }
    });
  }
}

export function createFlightScene(ctx: GameContext): FlightScene {
  return new FlightScene(ctx);
}
