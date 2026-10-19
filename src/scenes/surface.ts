import * as THREE from 'three';
import { COLLISION, DAY_SEC, EARTH_SPIN_HOURS, EVENT_SCENE, GAME_HOUR_SEC, EVENTS, MINIGAME, NIGHT_SEC, ROVER, SURFACE, SURFACE_TIME_LIMIT_SEC, UPLINK_RADIUS_M, VISUAL } from '../core/constants';
import { CameraShake } from '../core/cameraShake';
import { audio } from '../core/audio';
import type { GameContext } from '../core/context';
import { createRng, hashString, rngRange } from '../core/rng';
import { MINIGAME_NAMES, SURFACE_UI } from '../core/strings';
import { AstronautRig } from '../gen/astronaut';
import { CruiserRig } from '../gen/cruiser';
import { clampToDisc, distanceToBoundary } from '../rules/bounds';
import { ladderColliders, resolveCircles, type Circle, type LadderSpec } from '../rules/collision';
import { rightOf, rightOfYaw, stepHeading } from '../rules/rover';
import { buildLander } from '../gen/lander';
import { disposeTree, enableShadows } from '../gen/mesh';
import { LensFlare } from '../ui/lensFlare';
import { flareEdgeFade, sunOccludedByTerrain } from '../rules/sun';
import { buildBeaconProbe, createGroundRing, createHubFloodlights, type HubFloodlights, createMarker, disposeMesh, rockColliders, scatterRocks, type BeaconProbe, type Marker } from '../gen/props';
import { createPlanet, createSun, ATMOSPHERES, type PlanetObject, type SunObject } from '../gen/planets';
import { createStars } from '../gen/sky';
import { isHigh } from '../gen/detail';
import { createTerrain, terrainStyle, type Terrain } from '../gen/terrain';
import { applyRockTexture, applyTerrainTextures } from '../gen/terrainTexture';
import { cinematicK, eventSceneFor, planMeteors, type EventSceneSpec } from '../rules/eventScene';
import { MeteorShower } from '../gen/meteors';
import { EVENT_SCENE_UI } from '../core/strings';
import { planSurfaceEvents, rollChoice, type ScheduledEvent } from '../events/eventSystem';
import { DustPuffs, Footprints, ParticleField } from '../gen/effects';
import { createMinigame, hasMinigame } from '../minigames';
import { availableInstrumentIds } from '../rules/minigameAccess';
import type { Minigame } from '../minigames/types';
import { resolveAssembly, type Assembly } from '../rules/catalog';
import { rateTotal, uplinkDataD, uplinkFactor } from '../rules/comms';
import { clamp } from '../rules/margin';
import type { FlightSummary, SurfaceSummary } from '../rules/missionResult';
import { placeObjectives, type Placement } from '../rules/objectives';
import { buildOutcome } from '../rules/outcome';
import { isDaytime } from '../rules/power';
import {
  applyEffects, canUplink, createSurfaceState, currentSignal, roverSpeedMs, spendSuitBattery, stepSurface, tryScan,
  type Movement, type SurfaceState,
} from '../rules/surface';
import type { Id, Objective } from '../rules/types';
import { linesFor } from '../rules/dialogs';
import { showNovaBubble } from '../ui/dialog';
import { JOURNAL_NOTE, journalFacts } from '../ui/journalFacts';
import { SurfaceHud, type ObjectiveView } from '../ui/surfaceHud';
import { BaseScene } from './baseScene';

const CAM_DISTANCE = 7;
const CAM_HEIGHT = 1.5;
const CAM_FOLLOW = 10;
const CAM_MIN_ABOVE_GROUND = 0.8;
const MOUSE_LOOK = 0.0025;
const KEY_LOOK = 1.8;
const PITCH_MIN = -0.05;
const PITCH_MAX = 1.15;
const TURN_FOLLOW = 12;
const FAINT_SEC = 2.2;
const SCAN_SEC = 1.3;
const SCAN_MAX_RADIUS = 120;
const END_DELAY_SEC = 2.4;
const ROCK_COUNT = 420;
const HUB_ROCK_CLEAR_M = 14;
const DUSK_SEC = 25;
const EARTH_SKY_RADIUS = 90;
/** Arah Bumi di langit Bulan (terkunci pasang surut, hampir tidak bergerak): offset dari kamera, seperti bintang. */
const EARTH_SKY_OFFSET = new THREE.Vector3(-700, 330, -1200);
const EARTH_SPIN_RATE = (Math.PI * 2) / (EARTH_SPIN_HOURS * GAME_HOUR_SEC);
const DAWN_SEC = 10;
const SUN_MIN_ELEV = 0.17;
const SUN_ELEV_RANGE = 1.05;
const HEMI_NIGHT = 0.12;
const HEMI_DAY_GAIN = 0.95;
const COLOR_REQUIRED = 0xffd24d;
const COLOR_BONUS = 0x4fd1ff;
const COLOR_DONE = 0x6b7280;
const SPAWN_OFFSET = new THREE.Vector3(5, 0, 7);

const DEFAULT_FLIGHT: FlightSummary = {
  failed: false, failCodes: [], flightQuality: 1, errorFraction: 0, lateStageCount: 0,
  touchdown: 'success', touchdownFactor: 0.7, instrumentsLost: [], fuelRemainingKg: 0, eventsHandledWell: 0, handledEventIds: [],
};

interface Poi { placement: Placement; objective: Objective; marker: Marker; done: boolean }
interface ScanFx { ring: THREE.Mesh; age: number }
interface WeatherFx { kind: 'storm' | 'devil'; t: number; dur: number; center: THREE.Vector3; drift: THREE.Vector3 }

const STORM_FADE_SEC = 4;
const STORM_FOG_GAIN = 0.024;
const STORM_BASE_FOG = 0.0032;
const STORM_PARTICLES_PER_STEP = 9;
const DEVIL_PARTICLES_PER_STEP = 10;

const wrapPi = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class SurfaceScene extends BaseScene {
  readonly id = 'surface' as const;
  private assembly: Assembly | null = null;
  private flight: FlightSummary = DEFAULT_FLIGHT;
  private state!: SurfaceState;
  private hud: SurfaceHud | null = null;
  private terrain: Terrain | null = null;
  private rocks: THREE.InstancedMesh | null = null;
  private hubLander: THREE.Group | null = null;
  private hubRing: THREE.Mesh | null = null;
  private hubLights: HubFloodlights | null = null;
  private readonly hubLight = new THREE.PointLight(0xffe9c0, 0, VISUAL.hubLights.distance, VISUAL.hubLights.decay);
  private hubLightLevel = 0;
  private beacon: THREE.Mesh | null = null;
  private astronaut: AstronautRig | null = null;
  private stars: THREE.Points | null = null;
  private earth: PlanetObject | null = null;
  private earthSpinT = 0;
  private pois: Poi[] = [];
  private scanFx: ScanFx[] = [];
  private readonly hemi = new THREE.HemisphereLight(0xbcd2ff, 0x2a2d36, 1);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.8);
  private flashLevel = 0;
  private readonly pos = new THREE.Vector3();
  /** Penghalang diam: batu, wahana, probe (kendaraan terparkir dihitung dinamis). */
  private colliders: Circle[] = [];
  private bumpCooldown = 0;
  private cruiser: CruiserRig | null = null;
  private readonly cruiserPos = new THREE.Vector3();
  private cruiserHeading = 0;
  private cruiserSpeed = 0;
  private cruiserSteer = 0;
  private driving = false;
  private camScale = 1;
  private velY = 0;
  private onGround = true;
  private facing = 0;
  private camYaw = 0;
  private camPitch = 0.35;
  private readonly camPos = new THREE.Vector3();
  private readonly camLook = new THREE.Vector3();
  private movement: Movement = 'idle';
  private speed01 = 0;
  private clock = 0;
  private scannedUntil = -1;
  private faintTimer = -1;
  private endTimer = -1;
  private minigame: { game: Minigame; objective: Objective | null; instrumentId: Id | null; onDone?: (score01: number) => void } | null = null;
  private attempt = 0;
  private readonly collected = new Map<Id, number>();
  private readonly completed = new Set<Id>();
  private lowTimeWarned = false;
  private ended = false;
  private timeUpUplinkPossible = false;
  private plan: ScheduledEvent[] = [];
  private nextEvent = 0;
  private eventsHandledWell = 0;
  private handledEventIds: Id[] = [];
  private weather: WeatherFx[] = [];
  /** Adegan animasi yang diputar sebelum dialog event; waktu misi dibekukan selama adegan. */
  private eventScene: { id: string; spec: EventSceneSpec; t: number; sparkAcc: number; open: () => void } | null = null;
  private meteors: MeteorShower | null = null;
  private boundaryToastCooldown = 0;
  private dust: ParticleField | null = null;
  private stormK = 0;
  private stepClock = 0;
  /** Debu regolit bulat yang melayang di gravitasi lokal dan jejak sepatu yang memudar (pengganti kotak putih). */
  private puffs: DustPuffs | null = null;
  private footprints: Footprints | null = null;
  private stepSide = 1;
  private probe: BeaconProbe | null = null;
  private sunObj: SunObject | null = null;
  private flare: LensFlare | null = null;
  private flareStrength = 0;
  private sunDay = 1;
  private wasAirborne = false;
  private jumpWindup = 0;
  private landRecover = 0;
  private landDepth = 0;
  private fallSpeed = 0;
  private readonly shake = new CameraShake(createRng(0x5ac4));
  private skyDay = new THREE.Color(0x000000);
  private skyNight = new THREE.Color(0x000000);
  private readonly lockHandler = (): void => { if (!this.minigame) void this.ctx.canvas.requestPointerLock?.(); };

  constructor(ctx: GameContext) {
    super(ctx);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    // Bayangan hanya aktif jika pemain menyalakannya (renderer.shadowMap.enabled); kamera bayangan mengikuti pemain.
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(VISUAL.shadowMapSize, VISUAL.shadowMapSize);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -VISUAL.shadowRange;
    cam.right = cam.top = VISUAL.shadowRange;
    cam.far = 900;
    this.sun.shadow.bias = VISUAL.shadowBias;
    this.sun.shadow.normalBias = VISUAL.shadowNormalBias;
  }

  private get instrumentsAvailable(): Id[] {
    return availableInstrumentIds(this.ctx.store.get().mission, this.flight.instrumentsLost);
  }

  protected onEnter(ui: HTMLElement): void {
    const cfg = this.ctx.store.get().mission;
    const catalog = this.ctx.catalog;
    this.assembly = resolveAssembly(cfg, catalog);
    this.flight = this.ctx.store.get().flight ?? DEFAULT_FLIGHT;
    this.state = createSurfaceState(this.assembly);
    const dest = this.assembly.destination;
    const params = new URLSearchParams(import.meta.env.DEV ? window.location.search : '');
    const startT = Number(params.get('time'));
    if (startT > 0) this.state = { ...this.state, timeSec: startT };
    this.earthSpinT = this.state.timeSec;

    const style = terrainStyle(dest.id);
    applyTerrainTextures(dest.id === 'mars' ? 'mars' : 'moon', isHigh());
    this.terrain = createTerrain({ seed: cfg.seed, palette: dest.palette, amplitude: style.amplitude, craterCount: style.craterCount });
    this.scene.add(this.terrain.mesh);
    this.pois = placeObjectives(dest, cfg.seed).map((placement) => {
      const objective = dest.objectives.find((o) => o.id === placement.objectiveId)!;
      const marker = createMarker(objective.bonus ? COLOR_BONUS : COLOR_REQUIRED);
      marker.group.position.set(placement.x, this.terrain!.heightAt(placement.x, placement.z), placement.z);
      this.scene.add(marker.group);
      return { placement, objective, marker, done: false };
    });
    this.rocks = scatterRocks(this.terrain, cfg.seed, dest.palette[0], ROCK_COUNT, [
      { x: 0, z: 0, r: HUB_ROCK_CLEAR_M },
      ...this.pois.map((p) => ({ x: p.placement.x, z: p.placement.z, r: 6 })),
    ]);
    applyRockTexture(this.rocks, dest.id === 'mars' ? 'mars' : 'moon', isHigh());
    this.scene.add(this.rocks);

    const remainingInstruments = this.assembly.instruments.filter((i) => !this.flight.instrumentsLost.includes(i.id));
    this.hubLander = buildLander(this.assembly.modules, remainingInstruments, false);
    // Wahana berukuran wajar terhadap astronot (tinggi 2 m); pintu dan tangga menghadap titik muncul pemain
    this.hubLander.scale.setScalar(VISUAL.landerWorldScale);
    this.hubLander.rotation.y = Math.atan2(SPAWN_OFFSET.x, SPAWN_OFFSET.z);
    this.hubLander.position.set(0, this.terrain.heightAt(0, 0), 0);
    this.scene.add(this.hubLander);
    // Lampu sorot area wahana (menyala malam hari selama wahana punya daya)
    const HL = VISUAL.hubLights;
    this.hubLights = createHubFloodlights(HL.postRadiusM, HL.posts, HL.postHeightM, (x, z) => this.terrain!.heightAt(x, z));
    this.scene.add(this.hubLights.group, this.hubLight);
    this.hubLight.position.set(0, this.terrain.heightAt(0, 0) + (this.hubLander.userData.height as number) * VISUAL.landerWorldScale + 3, 0);
    this.hubLightLevel = 0;
    this.hubRing = createGroundRing(UPLINK_RADIUS_M, 0.25, 0x5dff9b, 0.35);
    this.hubRing.position.y = this.terrain.heightAt(0, 0) + 0.12;
    this.scene.add(this.hubRing);
    this.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff4b4b }));
    this.beacon.position.set(0, this.terrain.heightAt(0, 0) + (this.hubLander.userData.height as number) * VISUAL.landerWorldScale, 0);
    this.scene.add(this.beacon);

    this.astronaut = new AstronautRig(true);
    this.scene.add(this.astronaut.root);
    enableShadows(this.astronaut.root, true, true);
    enableShadows(this.hubLander, true, true);
    this.rocks.castShadow = true;
    this.rocks.receiveShadow = true;
    this.placeProbe(cfg.seed);
    this.buildColliders();
    this.driving = false;
    this.camScale = 1;
    this.cruiserSpeed = this.cruiserSteer = 0;
    if (roverSpeedMs(this.assembly) > 0) {
      this.cruiser = new CruiserRig(true);
      this.scene.add(this.cruiser.root);
      enableShadows(this.cruiser.root, true, true);
      this.cruiserHeading = ROVER.spawnHeading;
      this.cruiserPos.set(ROVER.spawnX, this.terrain.heightAt(ROVER.spawnX, ROVER.spawnZ), ROVER.spawnZ);
      this.orientCruiser(0);
    }
    this.flashLevel = 0;
    this.pos.copy(SPAWN_OFFSET);
    this.pos.y = this.terrain.heightAt(this.pos.x, this.pos.z);
    this.velY = 0;
    this.jumpWindup = this.landRecover = 0;
    this.onGround = true;
    this.facing = 0;
    this.camYaw = 0;
    this.camPitch = 0.35;
    this.scannedUntil = -1;
    this.faintTimer = this.endTimer = -1;
    this.attempt = 0;
    this.collected.clear();
    this.completed.clear();
    this.lowTimeWarned = false;
    this.ended = false;
    this.clock = 0;
    this.plan = planSurfaceEvents(catalog.events, dest.id, cfg.seed);
    this.nextEvent = 0;
    this.eventsHandledWell = 0;
    this.handledEventIds = [];
    this.weather = [];
    this.stormK = 0;
    this.dust = new ParticleField(1400, 0.28);
    this.scene.add(this.dust.points);
    const ground = new THREE.Color(dest.palette[0]).multiplyScalar(0.62);
    this.puffs = new DustPuffs(VISUAL.puffs.count, VISUAL.puffs.size);
    this.scene.add(this.puffs.points);
    this.footprints = new Footprints(VISUAL.footprints.count, VISUAL.footprints.lifeSec, ground.clone().multiplyScalar(0.45), ground);
    this.scene.add(this.footprints.mesh);

    this.stars = createStars(cfg.seed ^ 5);
    this.scene.add(this.stars);
    if (dest.id !== 'mars') {
      this.earth = createPlanet('earth', EARTH_SKY_RADIUS, { segments: 32, atmosphere: ATMOSPHERES.earth ?? null });
      this.earth.root.position.copy(EARTH_SKY_OFFSET);
      this.scene.add(this.earth.root);
    }
    this.setupSky(dest.id, dest.palette);
    // Matahari seperti di Briefing: permukaan bernoise beranimasi dengan lingkar cahaya (bukan cakram putih polos).
    this.sunObj = createSun(VISUAL.sunDiscRadius[dest.id] ?? VISUAL.sunDiscRadius.moon);
    this.scene.add(this.sunObj.root);
    this.wasAirborne = false;
    this.fallSpeed = 0;

    this.hud = new SurfaceHud(ui, this.pois.length);
    this.flare = new LensFlare(ui);
    this.flareStrength = 0;
    this.refreshObjectives();
    const nova = linesFor(this.ctx.catalog.dialogs, `nova_surface_${dest.id}`)[0];
    if (nova) showNovaBubble(ui, nova.text);
    this.ctx.canvas.addEventListener('click', this.lockHandler);
    if (this.cruiser) this.hud.toast(SURFACE_UI.messages.roverReady);
    this.syncVisuals(0);
  }

  /** Probe Beacon sebagai penanda dunia: jauh dari wahana dan titik objektif, deterministik dari seed. */
  private placeProbe(seed: number): void {
    const terrain = this.terrain;
    if (!terrain) return;
    const rng = createRng((seed ^ 0xbeac07) >>> 0);
    let x = VISUAL.beaconMinM, z = 0;
    for (let i = 0; i < 40; i++) {
      const d = rngRange(rng, VISUAL.beaconMinM, VISUAL.beaconMaxM);
      const a = rngRange(rng, 0, Math.PI * 2);
      x = Math.cos(a) * d;
      z = Math.sin(a) * d;
      if (this.pois.every((p) => Math.hypot(p.placement.x - x, p.placement.z - z) > 40)) break;
    }
    this.probe = buildBeaconProbe();
    this.probe.group.position.set(x, terrain.heightAt(x, z), z);
    this.probe.group.rotation.y = rngRange(rng, 0, Math.PI * 2);
    enableShadows(this.probe.group, true, true);
    this.scene.add(this.probe.group);
  }

  private setupSky(destId: string, palette: string[]): void {
    const mars = destId === 'mars';
    this.hemi.color.set(mars ? 0xf0c0a8 : 0xbcd2ff);
    this.hemi.groundColor.set(mars ? 0x5a2a18 : 0x2a2d36);
    this.skyDay = new THREE.Color(mars ? palette[1] : 0x000000).lerp(new THREE.Color(0xffffff), mars ? 0.12 : 0);
    this.skyNight = new THREE.Color(mars ? 0x140d12 : 0x000000);
    this.scene.fog = mars ? new THREE.FogExp2(this.skyDay.getHex(), 0.0032) : null;
    if (this.stars) (this.stars.material as THREE.PointsMaterial).opacity = mars ? 0 : 1;
  }

  protected override onExit(): void {
    this.ctx.canvas.removeEventListener('click', this.lockHandler);
    if (document.pointerLockElement) document.exitPointerLock();
    this.closeMinigame();
    for (const fx of this.scanFx) { this.scene.remove(fx.ring); disposeMesh(fx.ring); }
    this.scanFx = [];
    for (const p of this.pois) { this.scene.remove(p.marker.group); p.marker.dispose(); }
    this.pois = [];
    if (this.terrain) { this.scene.remove(this.terrain.mesh); this.terrain.dispose(); }
    if (this.rocks) { this.scene.remove(this.rocks); this.rocks.geometry.dispose(); this.rocks.dispose(); }
    if (this.hubLander) { this.scene.remove(this.hubLander); disposeTree(this.hubLander); }
    for (const m of [this.hubRing, this.beacon]) if (m) { this.scene.remove(m); disposeMesh(m); }
    if (this.hubLights) { this.scene.remove(this.hubLights.group, this.hubLight); this.hubLights.dispose(); }
    this.hubLights = null;
    if (this.earth) { this.scene.remove(this.earth.root); this.earth.dispose(); }
    if (this.cruiser) { this.scene.remove(this.cruiser.root); this.cruiser.dispose(); }
    this.cruiser = null;
    this.colliders = [];
    this.driving = false;
    if (this.astronaut) { this.scene.remove(this.astronaut.root); this.astronaut.dispose(); }
    if (this.stars) { this.scene.remove(this.stars); this.stars.geometry.dispose(); (this.stars.material as THREE.Material).dispose(); }
    if (this.probe) { this.scene.remove(this.probe.group); this.probe.dispose(); }
    this.probe = null;
    if (this.sunObj) { this.scene.remove(this.sunObj.root); this.sunObj.dispose(); }
    this.sunObj = null;
    this.flare?.dispose();
    this.flare = null;
    if (this.dust) { this.scene.remove(this.dust.points); this.dust.dispose(); }
    this.dust = null;
    if (this.puffs) { this.scene.remove(this.puffs.points); this.puffs.dispose(); }
    this.puffs = null;
    if (this.footprints) { this.scene.remove(this.footprints.mesh); this.footprints.dispose(); }
    this.footprints = null;
    this.meteors?.dispose();
    this.meteors = null;
    this.eventScene = null;
    this.terrain = null; this.rocks = null; this.hubLander = null; this.hubRing = null; this.beacon = null;
    this.astronaut = null; this.stars = null; this.earth = null; this.hud = null; this.assembly = null;
  }

  private refreshObjectives(): void {
    if (!this.assembly || !this.hud) return;
    const catalog = this.ctx.catalog;
    const list: ObjectiveView[] = this.pois.map((p) => {
      const inst = catalog.instruments.find((i) => i.id === p.objective.instrumentId);
      return {
        title: p.objective.title, required: p.objective.required, done: p.done,
        instrument: inst?.name ?? '-', available: !p.objective.instrumentId || this.instrumentsAvailable.includes(p.objective.instrumentId),
      };
    });
    this.hud.setObjectives(list);
  }

  private distanceFromHub(): number {
    return Math.hypot(this.pos.x, this.pos.z);
  }

  private axis(pos: string, neg: string): number {
    const i = this.ctx.input;
    return (i.isDown(pos) ? 1 : 0) - (i.isDown(neg) ? 1 : 0);
  }

  update(dt: number): void {
    if (!this.assembly || !this.terrain || !this.hud) return;
    this.clock += dt;
    const frozen = this.faintTimer >= 0 || this.endTimer >= 0 || this.minigame !== null || this.hud.dialogOpen || this.eventScene !== null || this.ended;

    if (this.minigame) this.updateMinigame(dt);
    this.lookAround(dt, !this.minigame && !this.hud.dialogOpen);
    if (!frozen) this.movePlayer(dt);
    else {
      this.movement = 'idle';
      this.speed01 = 0;
      this.cruiserSpeed = 0;
    }

    // Dialog modal (event, uplink) membekukan waktu dan sumber daya; minigame tidak.
    if (this.hud.dialogOpen) this.hud.setPrompt(null);
    if (!this.hud.dialogOpen && !this.eventScene) {
      const res = stepSurface(this.state, { movement: this.movement, distanceFromHubM: this.distanceFromHub() }, this.assembly, dt);
      this.state = res.state;
      for (const e of res.events) this.handleEvent(e.type, e);
      this.checkEvents();
    }

    this.warnBoundary(dt);
    if (!frozen) this.handleActions();
    if (this.faintTimer >= 0) {
      this.faintTimer += dt;
      if (this.faintTimer >= FAINT_SEC) this.respawn();
    }
    if (this.endTimer >= 0) {
      this.endTimer += dt;
      if (this.endTimer >= END_DELAY_SEC) this.finish(this.timeUpUplinkPossible);
    }
    this.updateScanFx(dt);
    this.updateEventScene(dt);
    this.updateWeather(dt);
    if (this.puffs && this.terrain && this.assembly) this.puffs.update(dt, this.assembly.destination.gravity, (x, z) => this.terrain!.heightAt(x, z));
    this.footprints?.update(dt);
    this.syncVisuals(dt);
  }


  private handleEvent(type: string, e: { type: string; day?: boolean }): void {
    const M = SURFACE_UI.messages;
    switch (type) {
      case 'faint':
        this.hud?.toast(M.faint);
        this.faintTimer = 0;
        this.hud?.showFaint(true);
        break;
      case 'power_out': this.hud?.toast(M.powerOut); break;
      case 'daynight': this.hud?.toast(e.day ? M.day : M.night); break;
      case 'time_up':
        this.hud?.toast(M.timeUp);
        this.timeUpUplinkPossible = canUplink(this.state, this.distanceFromHub());
        this.endTimer = 0;
        break;
      default: break;
    }
  }

  private lookAround(dt: number, enabled: boolean): void {
    const mouse = this.ctx.input.consumeMouse();
    if (!enabled) return;
    this.camYaw -= mouse.dx * MOUSE_LOOK + this.axis('ArrowRight', 'ArrowLeft') * KEY_LOOK * dt;
    this.camPitch = clamp(this.camPitch + mouse.dy * MOUSE_LOOK + this.axis('ArrowDown', 'ArrowUp') * KEY_LOOK * dt * 0.6, PITCH_MIN, PITCH_MAX);
  }

  private movePlayer(dt: number): void {
    const terrain = this.terrain;
    if (!terrain || !this.assembly) return;
    if (this.driving) { this.driveCruiser(dt); return; }
    const input = this.ctx.input;
    const forward = this.axis('KeyW', 'KeyS');
    const right = this.axis('KeyD', 'KeyA');
    const dir = new THREE.Vector3(
      -Math.sin(this.camYaw) * forward + Math.cos(this.camYaw) * right, 0,
      -Math.cos(this.camYaw) * forward - Math.sin(this.camYaw) * right,
    );
    const moving = dir.lengthSq() > 0;
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    this.movement = !moving ? 'idle' : running ? 'run' : 'walk';
    const speed = running ? SURFACE.runSpeed : SURFACE.walkSpeed;
    this.speed01 = moving ? speed / SURFACE.runSpeed : 0;
    if (moving) {
      dir.normalize();
      const moved = clampToDisc(this.pos.x + dir.x * speed * dt, this.pos.z + dir.z * speed * dt, SURFACE.boundaryM);
      this.pos.x = moved.x;
      this.pos.z = moved.z;
      const target = Math.atan2(dir.x, dir.z);
      this.facing += wrapPi(target - this.facing) * (1 - Math.exp(-TURN_FOLLOW * dt));
    }
    this.collideWalker();
    // Lompat: tinggi = v^2 / (2 g) dengan gravitasi destinasi (PRD 14).
    const g = this.assembly.destination.gravity;
    if (this.onGround && this.jumpWindup <= 0 && this.landRecover <= 0 && input.isDown('Space')) this.jumpWindup = SURFACE.jumpWindupSec;
    if (this.jumpWindup > 0) {
      this.jumpWindup -= dt;
      if (this.jumpWindup <= 0) {
        this.velY = SURFACE.jumpSpeed;
        this.onGround = false;
      }
    }
    if (this.landRecover > 0) this.landRecover = Math.max(0, this.landRecover - dt);
    this.velY -= g * dt;
    this.pos.y += this.velY * dt;
    const ground = terrain.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y <= ground) {
      if (!this.onGround) {
        this.fallSpeed = Math.abs(this.velY);
        this.landRecover = SURFACE.landRecoverSec;
        this.landDepth = Math.min(1, 0.4 + this.fallSpeed / SURFACE.jumpSpeed * 0.6);
      }
      this.pos.y = ground;
      this.velY = 0;
      this.onGround = true;
    } else if (this.pos.y > ground + 0.05) this.onGround = false;
  }

  /** Kedalaman jongkok: naik halus saat bersiap lompat, turun perlahan setelah mendarat. */
  private crouchAmount(): number {
    if (this.jumpWindup > 0) return 1 - this.jumpWindup / SURFACE.jumpWindupSec;
    return this.landDepth * (this.landRecover / SURFACE.landRecoverSec);
  }

  /** Penghalang diam: batu (dari matriks instance), wahana, dan probe Beacon. */
  private buildColliders(): void {
    const list: Circle[] = [];
    if (this.rocks) list.push(...rockColliders(this.rocks));
    const lander = this.hubLander;
    if (lander) {
      list.push({
        x: lander.position.x, z: lander.position.z, r: (lander.userData.footRadius as number) * lander.scale.x + COLLISION.landerMarginM,
        top: lander.position.y + (lander.userData.height as number) * lander.scale.x,
      });
    }
    if (lander) {
      const ladder = lander.userData.ladder as LadderSpec | undefined;
      if (ladder) {
        list.push(...ladderColliders(ladder, lander.position.x, lander.position.y, lander.position.z, lander.scale.x, lander.rotation.y, COLLISION.ladderCircles));
      }
    }
    for (const p of this.hubLights?.posts ?? []) {
      list.push({ x: p.x, z: p.z, r: COLLISION.floodPostRadiusM, top: p.y + VISUAL.hubLights.postHeightM });
    }
    const probe = this.probe?.group.position;
    if (probe) list.push({ x: probe.x, z: probe.z, r: COLLISION.probeRadiusM, top: probe.y + COLLISION.probeTopM });
    this.colliders = list;
  }

  /** Lunar Cruiser terparkir menghalangi pejalan kaki (dua lingkaran: depan dan belakang). */
  private roverCircles(): Circle[] {
    if (!this.cruiser) return [];
    const h = this.cruiserHeading;
    const top = this.cruiserPos.y + 2.6;
    return [1, -1].map((side) => ({
      x: this.cruiserPos.x + Math.sin(h) * COLLISION.roverCircleOffsetM * side,
      z: this.cruiserPos.z + Math.cos(h) * COLLISION.roverCircleOffsetM * side,
      r: COLLISION.roverRadiusM, top,
    }));
  }

  /** Dorong pejalan kaki keluar dari penghalang; batas peta dijaga setelahnya. */
  private collideWalker(): void {
    const circles = this.driving || !this.cruiser ? this.colliders : [...this.colliders, ...this.roverCircles()];
    const r = resolveCircles(this.pos.x, this.pos.z, COLLISION.playerRadiusM, this.pos.y, circles);
    const inside = clampToDisc(r.x, r.z, SURFACE.boundaryM);
    this.pos.x = inside.x;
    this.pos.z = inside.z;
  }

  /** Dorong kendaraan keluar dari penghalang (dua lingkaran); mengembalikan jarak total yang terdorong. */
  private collideRover(): number {
    let moved = 0;
    const h = this.cruiserHeading;
    for (const side of [1, -1]) {
      const ox = Math.sin(h) * COLLISION.roverCircleOffsetM * side;
      const oz = Math.cos(h) * COLLISION.roverCircleOffsetM * side;
      const r = resolveCircles(
        this.cruiserPos.x + ox, this.cruiserPos.z + oz, COLLISION.roverRadiusM, this.cruiserPos.y, this.colliders, COLLISION.roverStepM,
      );
      moved += Math.hypot(r.x - (this.cruiserPos.x + ox), r.z - (this.cruiserPos.z + oz));
      const inside = clampToDisc(r.x - ox, r.z - oz, SURFACE.boundaryM);
      this.cruiserPos.x = inside.x;
      this.cruiserPos.z = inside.z;
    }
    return moved;
  }

  /** Naik/turun Lunar Cruiser (R): naik hanya dekat kendaraan, turun hanya saat sudah hampir berhenti. */
  private toggleDrive(): void {
    const cruiser = this.cruiser, terrain = this.terrain, astro = this.astronaut, hud = this.hud;
    if (!cruiser || !terrain || !astro || !hud) return;
    if (this.driving) {
      if (Math.abs(this.cruiserSpeed) > ROVER.dismountMaxSpeedMs) { hud.toast(SURFACE_UI.prompts.stopFirst); return; }
      const h = this.cruiserHeading;
      const right = rightOf(h);
      this.pos.set(this.cruiserPos.x + right.x * ROVER.exitOffsetM, 0, this.cruiserPos.z + right.z * ROVER.exitOffsetM);
      this.pos.y = terrain.heightAt(this.pos.x, this.pos.z);
      this.collideWalker();
      this.pos.y = terrain.heightAt(this.pos.x, this.pos.z);
      this.facing = h;
      this.velY = 0;
      this.onGround = true;
      this.driving = false;
      this.cruiserSpeed = 0;
      astro.root.visible = true;
      audio.roverDoor(false);
    } else if (this.onGround && Math.hypot(this.pos.x - this.cruiserPos.x, this.pos.z - this.cruiserPos.z) <= ROVER.mountRadiusM) {
      this.driving = true;
      this.cruiserSpeed = 0;
      this.pos.copy(this.cruiserPos);
      astro.root.visible = false;
      audio.roverDoor(true);
    }
  }

  /** Kemudi arcade: W/S gas dan rem, A/D belok (efektif hanya saat bergerak), ikuti kontur medan. */
  private driveCruiser(dt: number): void {
    const terrain = this.terrain, assembly = this.assembly;
    if (!terrain || !assembly) return;
    const vmax = roverSpeedMs(assembly);
    const throttle = this.state.powerOut ? 0 : this.axis('KeyW', 'KeyS');
    const steerIn = this.axis('KeyD', 'KeyA');
    const target = throttle > 0 ? vmax : throttle < 0 ? -vmax * ROVER.reverseFactor : 0;
    const speeding = target !== 0 && (this.cruiserSpeed === 0 || Math.sign(target) === Math.sign(this.cruiserSpeed));
    const rate = target === 0 ? ROVER.drag : speeding ? ROVER.accel : ROVER.brake;
    this.cruiserSpeed += clamp(target - this.cruiserSpeed, -rate * dt, rate * dt);
    this.cruiserSteer += (steerIn - this.cruiserSteer) * (1 - Math.exp(-8 * dt));
    this.cruiserHeading = stepHeading(this.cruiserHeading, this.cruiserSteer, this.cruiserSpeed, vmax, ROVER.turnRate, dt);
    const h = this.cruiserHeading;
    const next = clampToDisc(this.cruiserPos.x + Math.sin(h) * this.cruiserSpeed * dt, this.cruiserPos.z + Math.cos(h) * this.cruiserSpeed * dt, SURFACE.boundaryM);
    this.cruiserPos.x = next.x;
    this.cruiserPos.z = next.z;
    this.cruiserPos.y = terrain.heightAt(this.cruiserPos.x, this.cruiserPos.z);
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    if (this.collideRover() > 0.01 && this.bumpCooldown <= 0 && Math.abs(this.cruiserSpeed) > 1) {
      this.bumpCooldown = COLLISION.bumpCooldownSec;
      this.cruiserSpeed *= COLLISION.bumpSpeedFactor;
      this.shake.add(COLLISION.bumpShake);
      audio.tone(90, 0.12, 'square', 0.15, 50);
    }
    this.cruiserPos.y = terrain.heightAt(this.cruiserPos.x, this.cruiserPos.z);
    this.pos.copy(this.cruiserPos);
    this.movement = Math.abs(this.cruiserSpeed) > 0.3 ? 'drive' : 'idle';
    this.speed01 = 0;
    if (Math.abs(this.cruiserSpeed) > 1) this.camYaw += wrapPi(h + Math.PI - this.camYaw) * (1 - Math.exp(-ROVER.camAlignRate * dt));
  }

  /** Posisi, arah, dan kemiringan kendaraan mengikuti normal medan (dengan interpolasi halus). */
  private orientCruiser(dt: number): void {
    const cruiser = this.cruiser, terrain = this.terrain;
    if (!cruiser || !terrain) return;
    const d = ROVER.slopeSampleM;
    const { x, z } = this.cruiserPos;
    const normal = new THREE.Vector3(
      terrain.heightAt(x - d, z) - terrain.heightAt(x + d, z), 2 * d, terrain.heightAt(x, z - d) - terrain.heightAt(x, z + d),
    ).normalize();
    const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.cruiserHeading);
    const want = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal).multiply(yaw);
    if (dt === 0) cruiser.root.quaternion.copy(want);
    else cruiser.root.quaternion.slerp(want, 1 - Math.exp(-ROVER.tiltFollow * dt));
    cruiser.root.position.copy(this.cruiserPos);
    cruiser.update(dt, { speedMs: this.cruiserSpeed, steer: this.cruiserSteer });
  }

  private emitCruiserDust(): void {
    const puffs = this.puffs, assembly = this.assembly;
    if (!puffs || !assembly || !this.driving || Math.abs(this.cruiserSpeed) < ROVER.dustMinSpeedMs) return;
    const color = this.regolithColor();
    const h = this.cruiserHeading;
    const back = this.cruiserSpeed > 0 ? -1 : 1;
    for (const side of [-1, 1]) {
      const wheel = new THREE.Vector3(
        this.cruiserPos.x + Math.sin(h) * 2.2 * back + Math.cos(h) * side * 1.5, this.cruiserPos.y + 0.12, this.cruiserPos.z + Math.cos(h) * 2.2 * back - Math.sin(h) * side * 1.5,
      );
      const kick = Math.min(1, Math.abs(this.cruiserSpeed) / 10);
      puffs.emit(
        wheel,
        new THREE.Vector3(-Math.sin(h) * back * -1.2 * kick + rngRange(this.fxRng, -0.5, 0.5), rngRange(this.fxRng, 0.4, 1.2), -Math.cos(h) * back * -1.2 * kick + rngRange(this.fxRng, -0.5, 0.5)),
        rngRange(this.fxRng, 1.2, 2.2), color,
      );
    }
  }

  private nearestPoi(): Poi | null {
    let best: Poi | null = null;
    let bestD: number = SURFACE.interactRadiusM;
    for (const p of this.pois) {
      const d = Math.hypot(p.placement.x - this.pos.x, p.placement.z - this.pos.z);
      if (d <= bestD) { best = p; bestD = d; }
    }
    return best;
  }

  private handleActions(): void {
    const hud = this.hud;
    if (!hud || !this.assembly) return;
    const input = this.ctx.input;
    const M = SURFACE_UI.messages, P = SURFACE_UI.prompts;

    if (input.consumePressed('Tab')) {
      const dest = this.assembly.destination;
      const data: [string, string][] = [...this.collected.entries()].map(([id, score]) => [
        this.ctx.catalog.instruments.find((i) => i.id === id)?.name ?? id, `${Math.round(score * 100)}%`,
      ]);
      hud.setJournal(journalFacts(dest), JOURNAL_NOTE, data);
      hud.toggleJournal();
    }

    if (input.consumePressed('KeyQ')) {
      const r = tryScan(this.state);
      if (r.ok) {
        this.state = r.state;
        this.scannedUntil = this.state.timeSec + SURFACE.scanRevealSec;
        this.spawnScanRing();
        audio.ping();
        hud.toast(M.scan);
      } else hud.toast(M.scanFail);
    }

    const poi = this.nearestPoi();
    const inHub = this.distanceFromHub() <= UPLINK_RADIUS_M;
    let prompt: string | null = null;
    let action: (() => void) | null = null;
    if (poi) {
      const instId = poi.objective.instrumentId;
      const inst = this.ctx.catalog.instruments.find((i) => i.id === instId);
      const name = MINIGAME_NAMES[inst?.minigameId ?? ''] ?? inst?.name ?? '-';
      if (poi.done) prompt = P.alreadyDone;
      else if (!instId || !this.instrumentsAvailable.includes(instId)) prompt = P.noInstrument.replace('{name}', inst?.name ?? '-');
      else if (this.state.powerOut) prompt = P.powerOut;
      else {
        prompt = P.minigame.replace('{name}', name);
        action = () => this.startObjective(poi);
      }
    } else if (inHub) {
      if (this.state.powerOut) prompt = P.powerOut;
      else {
        prompt = P.uplink;
        action = () => this.askUplink();
      }
    }
    if (input.consumePressed('KeyR')) this.toggleDrive();
    if (this.cruiser && !prompt) {
      if (this.driving) prompt = P.dismount;
      else if (this.onGround && Math.hypot(this.pos.x - this.cruiserPos.x, this.pos.z - this.cruiserPos.z) <= ROVER.mountRadiusM) prompt = P.mount;
    }
    hud.setPrompt(prompt);
    if (action && input.consumePressed('KeyE')) action();
    else input.consumePressed('KeyE');
  }

  private askUplink(): void {
    if (document.pointerLockElement) document.exitPointerLock();
    this.hud?.confirmUplink(() => this.finish(true), () => undefined);
  }

  private startObjective(poi: Poi): void {
    const hud = this.hud;
    const instId = poi.objective.instrumentId;
    const inst = this.ctx.catalog.instruments.find((i) => i.id === instId);
    if (!hud || !instId || !inst || !hasMinigame(inst.minigameId)) return;
    const paid = spendSuitBattery(this.state, SURFACE.minigameCost);
    if (!paid.ok) { hud.toast(SURFACE_UI.prompts.lowBattery); return; }
    this.state = paid.state;
    const game = createMinigame(inst.minigameId);
    if (!game) return;
    if (document.pointerLockElement) document.exitPointerLock();
    this.attempt += 1;
    const seed = this.ctx.store.get().mission.seed;
    let h = 0;
    for (const ch of `${poi.objective.id}:${this.attempt}`) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    const difficulty = MINIGAME.difficulty[this.assembly?.destination.id ?? ''] ?? MINIGAME.defaultDifficulty;
    game.start({ rng: createRng((seed ^ h) >>> 0), difficulty, container: hud.overlayHost });
    audio.beep(990);
    this.minigame = { game, objective: poi.objective, instrumentId: instId };
    hud.setPrompt(null);
  }

  private updateMinigame(dt: number): void {
    const mg = this.minigame;
    if (!mg || !this.hud) return;
    mg.game.update(dt);
    const result = mg.game.result();
    if (!result) return;
    if (mg.onDone) {
      this.closeMinigame();
      mg.onDone(result.score01);
      return;
    }
    if (!mg.objective || !mg.instrumentId) return;
    const poi = this.pois.find((p) => p.objective.id === mg.objective?.id);
    const prev = this.collected.get(mg.instrumentId) ?? 0;
    this.collected.set(mg.instrumentId, Math.max(prev, result.score01));
    this.closeMinigame();
    if (poi && result.score01 >= MINIGAME.passScore) {
      poi.done = true;
      this.completed.add(poi.objective.id);
      poi.marker.setColor(COLOR_DONE);
      this.hud.toast(SURFACE_UI.messages.objectiveDone.replace('{title}', poi.objective.title));
      audio.jingle(true);
      this.refreshObjectives();
    } else {
      this.hud.toast(SURFACE_UI.messages.objectiveFail);
      audio.tone(220, 0.3, 'sawtooth', 0.1);
    }
  }

  private closeMinigame(): void {
    if (!this.minigame) return;
    this.minigame.game.dispose();
    this.minigame = null;
    this.ctx.input.clear();
  }

  private spawnScanRing(): void {
    const ring = createGroundRing(1, 0.06, 0x4fd1ff, 0.8);
    ring.position.set(this.pos.x, this.pos.y + 0.2, this.pos.z);
    this.scene.add(ring);
    this.scanFx.push({ ring, age: 0 });
  }

  private updateScanFx(dt: number): void {
    for (let i = this.scanFx.length - 1; i >= 0; i--) {
      const fx = this.scanFx[i];
      fx.age += dt;
      const k = fx.age / SCAN_SEC;
      fx.ring.scale.setScalar(1 + k * SCAN_MAX_RADIUS);
      (fx.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
      if (k >= 1) { this.scene.remove(fx.ring); disposeMesh(fx.ring); this.scanFx.splice(i, 1); }
    }
  }

  /** Peringatan bila astronot/kendaraan mendekati lingkar batas area jelajah (cakram bulat), diulang berkala. */
  private warnBoundary(dt: number): void {
    this.boundaryToastCooldown = Math.max(0, this.boundaryToastCooldown - dt);
    const x = this.driving ? this.cruiserPos.x : this.pos.x;
    const z = this.driving ? this.cruiserPos.z : this.pos.z;
    if (this.boundaryToastCooldown > 0 || distanceToBoundary(x, z, SURFACE.boundaryM) > SURFACE.boundaryWarnM) return;
    this.hud?.toast(SURFACE_UI.messages.boundary);
    this.boundaryToastCooldown = SURFACE.boundaryToastSec;
  }

  /** Picu event terjadwal saat waktunya tiba dan permainan sedang bebas (bukan minigame/pingsan/akhir). */
  private checkEvents(): void {
    const next = this.plan[this.nextEvent];
    const hud = this.hud;
    if (!next || !hud || this.minigame || this.eventScene || this.faintTimer >= 0 || this.endTimer >= 0 || this.ended) return;
    if (this.state.timeSec < next.triggerSec) return;
    this.nextEvent += 1;
    if (document.pointerLockElement) document.exitPointerLock();
    audio.alarm();
    const seed = this.ctx.store.get().mission.seed;
    const openDialog = (): void => hud.showEvent(
      next.event,
      (i, minigameScore) => {
        const outcome = rollChoice(next.event, i, seed, minigameScore);
        this.state = applyEffects(this.state, outcome.effects);
        if (outcome.handledWell) {
          this.eventsHandledWell += 1;
          this.handledEventIds.push(next.event.id);
        }
        return outcome;
      },
      () => this.ctx.input.clear(),
      (minigameId) => new Promise<number>((done) => this.startEventMinigame(minigameId, done)),
    );
    this.startEventFx(next.event.id);
    const spec = eventSceneFor(next.event.id);
    if (!spec) { openDialog(); return; }
    this.eventScene = { id: next.event.id, spec, t: 0, sparkAcc: 0, open: openDialog };
    this.ctx.input.clear();
  }

  /** Minigame dari pilihan event (mis. Bersihkan Panel): tanpa objektif dan tanpa biaya baterai. */
  private startEventMinigame(minigameId: string, onDone: (score01: number) => void): void {
    const hud = this.hud;
    const game = createMinigame(minigameId);
    if (!hud || !game) { onDone(0); return; }
    this.attempt += 1;
    const seed = this.ctx.store.get().mission.seed;
    const difficulty = MINIGAME.difficulty[this.assembly?.destination.id ?? ''] ?? MINIGAME.defaultDifficulty;
    game.start({ rng: createRng((seed ^ hashString(`${minigameId}:${this.attempt}`)) >>> 0), difficulty, container: hud.overlayHost });
    audio.beep(990);
    this.minigame = { game, objective: null, instrumentId: null, onDone };
  }

  /** Putar adegan event: bilah sinematik, efek per jenis, lalu buka dialog saat adegan selesai. */
  private updateEventScene(dt: number): void {
    if (this.meteors) {
      for (const hit of this.meteors.update(dt)) this.meteorImpact(hit.pos, hit.size);
    }
    const sc = this.eventScene;
    const hud = this.hud;
    if (!sc || !hud) return;
    sc.t += dt;
    const E = EVENT_SCENE;
    const lander = this.hubLander;
    if (sc.spec.kind === 'flare' && lander && this.puffs) {
      sc.sparkAcc += E.flareSparksPerSec * dt;
      const top = new THREE.Vector3(lander.position.x, lander.position.y + (lander.userData.height as number) * lander.scale.x, lander.position.z);
      const spark = new THREE.Color(1, 0.86, 0.4);
      for (; sc.sparkAcc >= 1; sc.sparkAcc -= 1) {
        const a = rngRange(this.fxRng, 0, Math.PI * 2);
        const sp = rngRange(this.fxRng, 1, 4);
        this.puffs.emit(top.clone().add(new THREE.Vector3(rngRange(this.fxRng, -1.2, 1.2), rngRange(this.fxRng, -1.5, 0), rngRange(this.fxRng, -1.2, 1.2))),
          new THREE.Vector3(Math.cos(a) * sp, rngRange(this.fxRng, 2, 6), Math.sin(a) * sp), rngRange(this.fxRng, 0.5, 1.1), spark);
      }
    } else if (sc.spec.kind === 'dustPanels' && lander && this.puffs) {
      sc.sparkAcc += E.panelDustPerSec * dt;
      const color = this.regolithColor();
      for (; sc.sparkAcc >= 1; sc.sparkAcc -= 1) {
        const p = new THREE.Vector3(
          lander.position.x - 14 + rngRange(this.fxRng, -2, 2), lander.position.y + rngRange(this.fxRng, 0.3, 5), lander.position.z + rngRange(this.fxRng, -5, 5),
        );
        this.puffs.emit(p, new THREE.Vector3(rngRange(this.fxRng, 7, 11), rngRange(this.fxRng, 0, 1.2), rngRange(this.fxRng, -1, 1)), rngRange(this.fxRng, 1.6, 2.6), color);
      }
    }
    hud.cinematic.set(EVENT_SCENE_UI[sc.id] ?? '', sc.spec.tone, cinematicK(sc.t, sc.spec.introSec));
    if (sc.t >= sc.spec.introSec) {
      hud.cinematic.hide();
      this.eventScene = null;
      sc.open();
    }
  }

  /** Hantaman meteor: debu terlempar, guncangan, dan suara. */
  private meteorImpact(pos: THREE.Vector3, size: number): void {
    const puffs = this.puffs;
    if (puffs) {
      const color = this.regolithColor();
      for (let i = 0; i < 9; i++) {
        const a = rngRange(this.fxRng, 0, Math.PI * 2);
        const sp = rngRange(this.fxRng, 2, 6) * size;
        puffs.emit(pos.clone().add(new THREE.Vector3(0, 0.15, 0)), new THREE.Vector3(Math.cos(a) * sp, rngRange(this.fxRng, 1.5, 5), Math.sin(a) * sp), rngRange(this.fxRng, 1.2, 2.4), color);
      }
    }
    const dist = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    this.shake.add(EVENT_SCENE.impactShake * size * Math.max(0.3, 1 - dist / EVENT_SCENE.meteors.maxDistM));
    audio.beep(120 + 60 * size);
  }

  private startEventFx(eventId: string): void {
    const around = new THREE.Vector3(this.pos.x, this.pos.y, this.pos.z);
    if (eventId === 'ev_dust_storm') {
      this.weather.push({ kind: 'storm', t: 0, dur: EVENTS.fxStormSec, center: around, drift: new THREE.Vector3() });
    } else if (eventId === 'ev_dust_devil') {
      const start = around.clone().add(new THREE.Vector3(16, 0, -14));
      this.weather.push({ kind: 'devil', t: 0, dur: EVENTS.fxDevilSec, center: start, drift: new THREE.Vector3(-1.4, 0, 1.0) });
    } else if (eventId === 'ev_micrometeorite_rain' && this.terrain) {
      this.meteors?.dispose();
      const M = EVENT_SCENE.meteors;
      const forward = new THREE.Vector3(Math.sin(this.camYaw + Math.PI), 0, Math.cos(this.camYaw + Math.PI)).multiplyScalar(M.minDistM * 1.4);
      const center = around.clone().add(forward);
      const seed = this.ctx.store.get().mission.seed;
      const plan = planMeteors(seed ^ this.nextEvent, M.count, EVENT_SCENE.introSec.ev_micrometeorite_rain * M.windowFrac, M.minDistM, M.maxDistM);
      const terrain = this.terrain;
      this.meteors = new MeteorShower(plan, center, (x, z) => terrain.heightAt(x, z));
      this.scene.add(this.meteors.group);
    } else if (eventId === 'ev_solar_flare') {
      this.hud?.flash();
    }
  }

  /** Kepulan debu kecil di kaki saat berjalan/berlari dan saat mendarat dari lompatan. */
  /** Warna debu regolit: warna tanah destinasi sedikit lebih terang agar terbaca di atas permukaan. */
  private regolithColor(): THREE.Color {
    return new THREE.Color(this.assembly?.destination.palette[0] ?? '#9a9a9a').multiplyScalar(0.82);
  }

  /** Debu mendarat dari lompatan: cincin bulatan lembut yang menyebar rendah lalu mengendap. */
  private emitFootDust(): void {
    const puffs = this.puffs;
    if (!puffs || !this.assembly) return;
    const color = this.regolithColor();
    const feet = new THREE.Vector3(this.pos.x, this.pos.y + 0.1, this.pos.z);
    if (this.onGround && this.wasAirborne && this.fallSpeed > VISUAL.landingDustSpeed) {
      for (let i = 0; i < VISUAL.puffs.landingCount; i++) {
        const a = rngRange(this.fxRng, 0, Math.PI * 2);
        const sp = rngRange(this.fxRng, 1.2, 3);
        puffs.emit(feet, new THREE.Vector3(Math.cos(a) * sp, rngRange(this.fxRng, 0.2, 0.9), Math.sin(a) * sp), rngRange(this.fxRng, 1.8, 2.8), color);
      }
      this.shake.add(0.12 + this.fallSpeed * 0.08);
    }
    this.wasAirborne = !this.onGround;
    if (this.onGround) this.fallSpeed = 0;
  }

  /** Langkah kaki: jejak sepatu bergantian kiri-kanan dan sedikit debu terangkat dari tapak. */
  private stepEffects(): void {
    const terrain = this.terrain, puffs = this.puffs, prints = this.footprints;
    if (!terrain || !puffs || !prints) return;
    this.stepSide = -this.stepSide;
    const right = rightOfYaw(this.facing);
    const foot = new THREE.Vector3(
      this.pos.x + right.x * VISUAL.footprints.spreadM * this.stepSide, 0, this.pos.z + right.z * VISUAL.footprints.spreadM * this.stepSide,
    );
    foot.y = terrain.heightAt(foot.x, foot.z);
    const d = 0.8;
    const normal = new THREE.Vector3(
      terrain.heightAt(foot.x - d, foot.z) - terrain.heightAt(foot.x + d, foot.z), 2 * d, terrain.heightAt(foot.x, foot.z - d) - terrain.heightAt(foot.x, foot.z + d),
    ).normalize();
    prints.stamp(foot, this.facing, normal);
    const color = this.regolithColor();
    const run = this.movement === 'run';
    for (let i = 0; i < (run ? 4 : 2); i++) {
      puffs.emit(
        foot.clone().add(new THREE.Vector3(0, 0.1, 0)),
        new THREE.Vector3(rngRange(this.fxRng, -0.5, 0.5) - Math.sin(this.facing) * (run ? 0.8 : 0.3), rngRange(this.fxRng, 0.3, 0.8), rngRange(this.fxRng, -0.5, 0.5) - Math.cos(this.facing) * (run ? 0.8 : 0.3)),
        rngRange(this.fxRng, 1.2, 2), color,
      );
    }
  }

  /** Efek visual cuaca: badai debu (kabut + debu menyapu layar) dan dust devil (pusaran vertikal). */
  private updateWeather(dt: number): void {
    const dust = this.dust, terrain = this.terrain;
    if (!dust || !terrain) return;
    const dustColor = new THREE.Color(this.assembly?.destination.palette[0] ?? '#c1440e').multiplyScalar(0.7);
    let storm = 0;
    for (let i = this.weather.length - 1; i >= 0; i--) {
      const w = this.weather[i];
      w.t += dt;
      if (w.t >= w.dur) { this.weather.splice(i, 1); continue; }
      if (w.kind === 'storm') {
        const k = Math.min(1, w.t / STORM_FADE_SEC, (w.dur - w.t) / STORM_FADE_SEC);
        storm = Math.max(storm, k);
        for (let n = 0; n < STORM_PARTICLES_PER_STEP; n++) {
          const p = new THREE.Vector3(
            this.camPos.x + rngRange(this.fxRng, -28, 28), this.camPos.y + rngRange(this.fxRng, -4, 12), this.camPos.z + rngRange(this.fxRng, -28, 28),
          );
          dust.emit(p, new THREE.Vector3(-26 - rngRange(this.fxRng, 0, 8), rngRange(this.fxRng, -1, 2), 6), 1.3, dustColor.clone().multiplyScalar(k));
        }
      } else {
        w.center.addScaledVector(w.drift, dt);
        const base = terrain.heightAt(w.center.x, w.center.z);
        for (let n = 0; n < DEVIL_PARTICLES_PER_STEP; n++) {
          const h = rngRange(this.fxRng, 0, 9);
          const a = this.clock * 7 + h * 1.3 + n;
          const r = 0.5 + h * 0.28;
          dust.emit(
            new THREE.Vector3(w.center.x + Math.cos(a) * r, base + h, w.center.z + Math.sin(a) * r),
            new THREE.Vector3(Math.cos(a + 1.57) * 3, 1.2, Math.sin(a + 1.57) * 3), 1.0, dustColor.clone().multiplyScalar(1.4),
          );
        }
      }
    }
    this.stormK = storm;
    dust.update(dt);
  }

  private readonly fxRng = createRng(0x51a7);
  private readonly sunDir = new THREE.Vector3(0, 1, 0);
  private sunVisible = true;

  private respawn(): void {
    if (!this.terrain) return;
    this.pos.set(SPAWN_OFFSET.x, 0, SPAWN_OFFSET.z);
    this.pos.y = this.terrain.heightAt(this.pos.x, this.pos.z);
    this.velY = 0;
    this.jumpWindup = this.landRecover = 0;
    this.driving = false;
    this.cruiserSpeed = 0;
    if (this.astronaut) this.astronaut.root.visible = true;
    this.faintTimer = -1;
    this.hud?.showFaint(false);
  }

  /** Akhiri misi: hitung faktor uplink, susun ringkasan, hitung skor, lanjut ke review. */
  private finish(uplinkSent: boolean): void {
    if (this.ended || !this.assembly) return;
    this.ended = true;
    const a = this.assembly;
    const collected = [...this.collected.entries()].map(([id, score01]) => ({
      dataUnits: a.instruments.find((i) => i.id === id)?.dataUnits ?? 0, score01,
    }));
    const D = uplinkDataD(collected);
    const quality = currentSignal(this.state, this.distanceFromHub());
    const U = uplinkSent ? uplinkFactor(D, rateTotal(a), quality) : 0;
    const surface: SurfaceSummary = {
      completedObjectives: [...this.completed],
      minigameScores: Object.fromEntries(this.collected),
      faintCount: this.state.faintCount,
      nightPowerOut: this.state.nightPowerOut,
      uplinkU: U,
      eventsHandledWell: this.eventsHandledWell,
      handledEventIds: [...this.handledEventIds],
      scoreAdjust: this.state.scoreDelta,
      timeSec: this.state.timeSec,
    };
    const config = this.ctx.store.get().mission;
    const outcome = buildOutcome({ config, catalog: this.ctx.catalog, flight: this.flight, surface });
    this.hud?.toast(D > 0 ? SURFACE_UI.messages.uplinkSent : SURFACE_UI.messages.noData);
    this.ctx.store.set({ surface, outcome });
    this.ctx.go('review');
  }

  /** Sinkronkan model, kamera, pencahayaan, dan HUD dengan keadaan saat ini. */
  private syncVisuals(dt: number): void {
    const terrain = this.terrain, astro = this.astronaut, hud = this.hud;
    if (!terrain || !astro || !hud || !this.assembly) return;
    astro.root.position.copy(this.pos);
    astro.root.rotation.y = this.facing;
    astro.root.visible = !this.driving;
    this.orientCruiser(dt);
    this.emitCruiserDust();
    audio.setRover(this.driving ? Math.min(1, Math.abs(this.cruiserSpeed) / Math.max(1, roverSpeedMs(this.assembly))) : null);
    this.camScale += ((this.driving ? ROVER.camDistanceMul : 1) - this.camScale) * (dt === 0 ? 1 : 1 - Math.exp(-3 * dt));
    // Langkah kaki: lebih cepat saat lari, hanya di tanah.
    if (this.onGround && this.speed01 > 0.02) {
      this.stepClock += dt * (1.6 + this.speed01 * 2.4);
      if (this.stepClock >= 1) {
        this.stepClock = 0;
        audio.footstep();
        this.stepEffects();
      }
    } else this.stepClock = 0.6;
    astro.update(dt, { speed01: this.speed01, run: this.movement === 'run', airborne: !this.onGround, velY: this.velY, crouch: this.crouchAmount(), oxygen01: this.state.oxygen / SURFACE.meterMax });
    this.astronaut?.root.updateMatrixWorld(true);

    // Kamera orang ketiga dengan interpolasi halus.
    this.emitFootDust();
    const target = new THREE.Vector3(this.pos.x, this.pos.y + CAM_HEIGHT * (1 + (ROVER.camHeightMul - 1) * (this.camScale - 1) / (ROVER.camDistanceMul - 1)), this.pos.z);
    const offset = new THREE.Vector3(
      Math.sin(this.camYaw) * Math.cos(this.camPitch), Math.sin(this.camPitch), Math.cos(this.camYaw) * Math.cos(this.camPitch),
    ).multiplyScalar(CAM_DISTANCE * this.camScale);
    const wantPos = target.clone().add(offset);
    wantPos.y = Math.max(wantPos.y, terrain.heightAt(wantPos.x, wantPos.z) + CAM_MIN_ABOVE_GROUND);
    const k = dt === 0 ? 1 : 1 - Math.exp(-CAM_FOLLOW * dt);
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(target, k);
    this.camera.position.copy(this.camPos);
    const [sx, sy, sz] = this.shake.update(dt);
    this.camera.position.add(new THREE.Vector3(sx, sy, sz));
    this.camera.lookAt(this.camLook);

    this.updateLighting();
    this.probe?.update(this.clock);
    for (const p of this.pois) {
      p.marker.update(this.clock);
      p.marker.group.visible = true;
    }
    if (this.beacon) this.beacon.visible = Math.floor(this.clock * 1.5) % 2 === 0;
    if (this.stars) this.stars.position.copy(this.camPos);
    if (this.sunObj) {
      this.sunObj.root.position.copy(this.camPos).addScaledVector(this.sunDir, VISUAL.sunDiscDistance);
      this.sunObj.root.visible = this.sunVisible;
      this.sunObj.update(this.clock);
      this.updateFlare(dt);
    }
    if (this.earth) {
      // Bumi tetap di arah yang sama di langit (jauh sekali, jadi ikut kamera) dan berputar mengikuti waktu permukaan,
      // sehingga berhenti saat waktu berhenti dan selaras dengan siklus Matahari.
      this.earth.root.position.copy(this.camPos).add(EARTH_SKY_OFFSET);
      this.earth.spin(this.state.timeSec - this.earthSpinT, EARTH_SPIN_RATE);
      this.earthSpinT = this.state.timeSec;
    }

    const dist = this.distanceFromHub();
    const signal = currentSignal(this.state, dist);
    audio.setAmbient(this.assembly.destination.id, this.stormK);
    audio.setStatic(signal < 0.5 ? (0.5 - signal) * 2 : 0);
    const heading = (x: number, z: number): number => -wrapPi(Math.atan2(-x, -z) - this.camYaw);
    const scanned = this.state.timeSec < this.scannedUntil;
    hud.update({
      oxygen: this.state.oxygen, suit: this.state.suitBattery,
      vehiclePct: this.state.vehicleCapacityWh > 0 ? (this.state.vehicleWh / this.state.vehicleCapacityWh) * 100 : 0,
      signal01: signal, powerOut: this.state.powerOut,
      day: isDaytime(this.state.timeSec), elapsedSec: this.state.timeSec,
      remainingSec: SURFACE_TIME_LIMIT_SEC - this.state.timeSec,
      hubBearing: heading(-this.pos.x, -this.pos.z), hubDistanceM: dist,
      scannerReady: this.state.scannerCooldownSec <= 0,
      pois: this.pois.map((p) => ({
        label: p.objective.title, done: p.done, bonus: p.objective.bonus === true, shown: scanned && !p.done,
        bearing: heading(p.placement.x - this.pos.x, p.placement.z - this.pos.z),
        distanceM: Math.hypot(p.placement.x - this.pos.x, p.placement.z - this.pos.z),
      })),
    });
    if (!this.lowTimeWarned && SURFACE_TIME_LIMIT_SEC - this.state.timeSec <= SURFACE.lowTimeWarnSec) {
      this.lowTimeWarned = true;
      hud.toast(SURFACE_UI.messages.timeLow);
    }
    if (this.minigame === null && !hud.dialogOpen && this.faintTimer < 0 && this.endTimer < 0 && dt === 0) hud.setPrompt(null);
  }

  /** Matahari tertutup medan bila sinar dari kamera ke arah Matahari menabrak permukaan. */
  private sunOccluded(): boolean {
    const terrain = this.terrain;
    if (!terrain) return false;
    return sunOccludedByTerrain(
      (x, z) => terrain.heightAt(x, z), this.camera.position, this.sunDir, VISUAL.flareOcclusionRangeM, VISUAL.flareOcclusionStepM, terrain.size / 2,
    );
  }

  /** Lens flare: kuat saat Matahari ada di bingkai dan tidak tertutup horizon; memudar halus di tepi layar. */
  private updateFlare(dt: number): void {
    const flare = this.flare, sun = this.sunObj;
    if (!flare || !sun) return;
    this.camera.updateMatrixWorld(true);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const v = sun.root.position.clone().project(this.camera);
    const inFront = forward.dot(this.sunDir) > 0.05 && this.sunVisible;
    const edge = flareEdgeFade(v.x, v.y);
    const want = inFront && !this.sunOccluded() ? edge * this.sunDay : 0;
    this.flareStrength += (want - this.flareStrength) * (dt === 0 ? 1 : 1 - Math.exp(-VISUAL.flareFollow * dt));
    const zoom = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    const w = window.innerWidth / zoom, h = window.innerHeight / zoom;
    flare.update(
      { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h }, { x: w / 2, y: h / 2 }, this.flareStrength, this.clock,
    );
  }

  /** Arah dan intensitas Matahari mengikuti waktu permukaan; transisi halus ke malam. */
  private updateLighting(): void {
    const cycle = DAY_SEC + NIGHT_SEC;
    const t = this.state.timeSec % cycle;
    // Siang penuh sejak detik 0; senja memudar di akhir siang, fajar naik pelan pada siklus berikutnya.
    let day = t < DAY_SEC ? clamp((DAY_SEC - t) / DUSK_SEC, 0, 1) : 0;
    if (this.state.timeSec >= cycle) day *= clamp(t / DAWN_SEC, 0, 1);
    const progress = t < DAY_SEC ? t / DAY_SEC : 1;
    const elev = SUN_MIN_ELEV + Math.sin(Math.PI * Math.min(1, progress)) * SUN_ELEV_RANGE;
    const az = THREE.MathUtils.lerp(-1.0, 1.0, Math.min(1, progress)) + Math.PI;
    this.sun.position.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev)).multiplyScalar(400).add(this.pos);
    this.sunDir.set(Math.sin(az) * Math.cos(elev), Math.sin(elev), Math.cos(az) * Math.cos(elev));
    this.sunVisible = day > 0.03;
    this.sunDay = day;
    this.sun.target.position.copy(this.pos);
    this.sun.intensity = 2.8 * day;
    this.hemi.intensity = HEMI_NIGHT + HEMI_DAY_GAIN * day;
    // Senter astronot menyala saat malam selama baterai suit masih ada (menyala/padam halus)
    const wantFlash = (1 - day) * (this.state.suitBattery > 0 ? 1 : 0);
    this.flashLevel += (wantFlash - this.flashLevel) * (1 - Math.exp(-VISUAL.flashlight.follow * (1 / 60)));
    this.astronaut?.setFlashlight(this.flashLevel);
    this.cruiser?.setHeadlights(this.driving && !this.state.powerOut ? 1 - day : 0);
    // Area wahana diterangi saat malam selama daya wahana masih ada; menyala/padam halus
    const wantHub = (1 - day) * (this.state.powerOut ? 0 : 1);
    this.hubLightLevel += (wantHub - this.hubLightLevel) * (1 - Math.exp(-VISUAL.hubLights.follow * (1 / 60)));
    this.hubLight.intensity = VISUAL.hubLights.intensity * this.hubLightLevel;
    this.hubLights?.setLevel(this.hubLightLevel);
    if (this.hubRing) (this.hubRing.material as THREE.MeshBasicMaterial).opacity = 0.35 + VISUAL.hubLights.ringBoost * this.hubLightLevel;
    const sky = this.skyNight.clone().lerp(this.skyDay, day);
    this.scene.background = sky;
    if (this.scene.fog) {
      const fog = this.scene.fog as THREE.FogExp2;
      fog.color.copy(sky);
      fog.density = STORM_BASE_FOG + STORM_FOG_GAIN * this.stormK;
    }
  }
}

export function createSurfaceScene(ctx: GameContext): SurfaceScene {
  return new SurfaceScene(ctx);
}
