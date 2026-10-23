import * as THREE from 'three';
import { VISUAL } from '../core/constants';
import { DESIGN } from '../core/strings';
import type { GameContext } from '../core/context';
import { defaultMission } from '../core/missionBuilder';
import { OrbitCamera } from '../core/orbitCamera';
import { AstronautRig } from '../gen/astronaut';
import { box, column, disposeTree, enableShadows, part, shellMaterial } from '../gen/mesh';
import { buildLander } from '../gen/lander';
import { createLaunchPad, type LaunchPad } from '../gen/launchSite';
import { buildRocket, mountLander, NOZZLE_LENGTH, STAGE_ACCENTS, type RocketModel } from '../gen/rocket';
import { el } from '../ui/dom';
import { resolveAssembly } from '../rules/catalog';
import { preflight } from '../rules/preflight';
import { modeRules, selectableDestinationIds } from '../rules/progress';
import type { MissionConfig } from '../rules/types';
import { clampToZone } from '../ui/labelLayout';
import { DesignPanel } from '../ui/panels';
import { BaseScene } from './baseScene';

const ROCKET_X = -5;
const DISPLAY_GAP = 9;
const DISPLAY_RADIUS_FACTOR = 2.8;
const DISPLAY_SCALE = 1.7;
/** Tinggi permukaan landasan roket di hangar; dasar nosel roket berdiri di atasnya (sama seperti di Penerbangan). */
const PLATFORM_TOP = 0.5;
/** Tempat khusus astronot acuan skala: panggung kecil terpisah di depan panggung lander (tidak menyentuh kaki/tangga lander). */
const REF_STAGE_Z = 7.2;
const REF_STAGE_TOP = 0.55;
const REF_RULER_X = 0.95;
const GHOST_OPACITY = 0.17;
const LABEL_GAP = 0.45;
const POP_SEC = 0.35;
const POP_START = 0.8;
const TURNTABLE_SPEED = 0.5;
const BACKGROUND = 0x0a0f1e;

/** Fairing transparan di pratinjau: siluet roket utuh sambil tetap memperlihatkan lander di dalamnya. */
const ghostFairing = shellMaterial.clone();
ghostFairing.transparent = true;
ghostFairing.opacity = GHOST_OPACITY;
ghostFairing.depthWrite = false;

interface StageLabel { node: HTMLElement; anchor: THREE.Object3D; lift: number }

export class DesignScene extends BaseScene {
  readonly id = 'design' as const;
  private readonly hangar = new THREE.Group();
  /** Menara servis dan lengan umbilikal yang sama dengan di scene Penerbangan (tinggi relatif terhadap roket identik). */
  private pad: LaunchPad | null = null;
  private readonly displayStage = new THREE.Group();
  private displayX = 0;
  private lastZoom = 1;
  private labelSource: { name: string; stages: { name: string; burn: number }[] } | null = null;
  private orbit: OrbitCamera | null = null;
  private panel: DesignPanel | null = null;
  private config!: MissionConfig;
  private requireObjectives = true;
  private rocket: RocketModel | null = null;
  private mounted: THREE.Group | null = null;
  private display: THREE.Group | null = null;
  private popT = POP_SEC;
  private rocketId = '';
  private landerKey = '';
  private labelLayer: HTMLElement | null = null;
  private labels: StageLabel[] = [];
  private landerLabel: StageLabel | null = null;
  /** Astronot acuan skala di samping lander (skala sama dengan di permukaan). */
  private refAstronaut: AstronautRig | null = null;
  private astronautLabel: StageLabel | null = null;
  private refStage: THREE.Group | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly right = new THREE.Vector3();

  constructor(ctx: GameContext) {
    super(ctx);
    this.scene.background = new THREE.Color(BACKGROUND);
    this.scene.fog = new THREE.Fog(BACKGROUND, 60, 160);
    this.scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x1a1f2e, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(20, 40, 25);
    key.target.position.set(2, 6, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(VISUAL.shadowMapSize, VISUAL.shadowMapSize);
    const sc = key.shadow.camera;
    sc.left = sc.bottom = -VISUAL.shadowRange * 1.4;
    sc.right = sc.top = VISUAL.shadowRange * 1.4;
    sc.far = 120;
    key.shadow.bias = VISUAL.shadowBias;
    key.shadow.normalBias = VISUAL.shadowNormalBias;
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x4fd1ff, 1.1);
    rim.position.set(-25, 18, -20);
    this.scene.add(rim);
    this.buildHangar();
    this.scene.add(this.hangar, this.displayStage);
    this.displayX = ROCKET_X + DISPLAY_GAP;
    this.displayStage.position.x = this.displayX;
  }

  private buildHangar(): void {
    const h = this.hangar;
    const floor = column(46, 48, -0.6, 0.6, 0x141b2e, 24);
    floor.receiveShadow = true;
    h.add(floor);
    const grid = new THREE.GridHelper(88, 44, 0x4fd1ff, 0x1c2a44);
    grid.position.y = 0.02;
    h.add(grid);
    // Landasan roket dan panggung lander
    // (landasan roket dibangun ulang oleh rebuildPad; platform lama di sini ikut dibuang agar tidak bertumpuk dan berkedip)
    // Panggung lander di dalam grup sendiri agar bergeser mengikuti lebar roket.
    this.displayStage.add(column(3.4, 3.8, 0, 0.6, 0x2a3350, 12, 0, 0));
    this.displayStage.add(column(3.0, 3.0, 0.6, 0.06, 0x2c6f8a, 12, 0, 0));
    // Dinding belakang berpanel
    for (let i = -4; i <= 4; i++) {
      h.add(box(8, 30, 1, i % 2 === 0 ? 0x121a2c : 0x182238, [i * 8.4, 15, -46]));
    }
    // Lampu sorot dramatis
    for (const x of [0]) {
      h.add(part(new THREE.CylinderGeometry(0.8, 1.4, 1.2, 8), 0x9aa3b0, [x, 36, -8]));
      const spot = new THREE.SpotLight(0xdfe9ff, 2600, 0, 0.75, 0.7, 1.6);
      spot.position.set(x, 36, -8);
      spot.target.position.set(2, 0, 0);
      h.add(spot, spot.target);
    }
  }

  /** Pasang ulang landasan, menara, dan lengan umbilikal yang sama seperti di Penerbangan untuk roket yang dipilih. */
  private rebuildPad(radius: number, height: number): void {
    if (this.pad) { this.scene.remove(this.pad.group); this.pad.dispose(); }
    this.pad = createLaunchPad(radius, height);
    this.pad.group.position.set(ROCKET_X, PLATFORM_TOP, 0);
    this.scene.add(this.pad.group);
  }

  protected onEnter(ui: HTMLElement): void {
    const stored = this.ctx.store.get().mission;
    const state = this.ctx.store.get();
    const unlocked = selectableDestinationIds(state.save, this.ctx.catalog.destinations, state.mode);
    this.requireObjectives = modeRules(state.mode).requireObjectives;
    const dest = unlocked.includes(stored.destinationId) ? stored.destinationId : 'moon';
    this.config = stored.rocketId && dest === stored.destinationId ? stored : defaultMission(dest, stored.seed);
    this.rocketId = '';
    this.landerKey = '';
    this.labelLayer = el('div', 'label-layer');
    ui.appendChild(this.labelLayer);
    this.orbit = new OrbitCamera(this.ctx.canvas, 10, 90);
    // Acuan skala: astronot setinggi 2 m berdiri di samping lander (1 satuan lander = landerWorldScale meter).
    this.refAstronaut = new AstronautRig();
    this.refAstronaut.root.scale.setScalar(DISPLAY_SCALE / VISUAL.landerWorldScale);
    this.refAstronaut.root.position.y = REF_STAGE_TOP;
    this.refAstronaut.root.rotation.y = Math.PI; // menghadap lander (arah -z)
    this.refAstronaut.update(0, { speed01: 0, run: false, airborne: false, oxygen01: 1 });
    this.refStage = this.buildRefStage();
    this.refStage.add(this.refAstronaut.root);
    this.displayStage.add(this.refStage);
    this.panel = new DesignPanel(ui, this.ctx.catalog, this.config, {
      change: (fn) => this.applyConfig(fn(this.config)),
      launch: () => this.launch(),
    }, { unlocked, flagged: this.ctx.store.get().flaggedSections });
    this.refresh();
    this.orbit.update(0, this.camera);
  }

  protected override onExit(): void {
    this.orbit?.dispose();
    this.orbit = null;
    this.panel = null;
    this.labelLayer = null;
    this.labels = [];
    this.landerLabel = null;
    this.astronautLabel = null;
    if (this.refAstronaut) { this.refAstronaut.root.removeFromParent(); this.refAstronaut.dispose(); }
    this.refAstronaut = null;
    if (this.refStage) { this.displayStage.remove(this.refStage); disposeTree(this.refStage); }
    this.refStage = null;
    this.clearModels();
  }

  private clearModels(): void {
    if (this.pad) { this.scene.remove(this.pad.group); this.pad.dispose(); }
    this.pad = null;
    if (this.rocket) {
      this.scene.remove(this.rocket.root);
      disposeTree(this.rocket.root);
    }
    if (this.display) {
      this.scene.remove(this.display);
      disposeTree(this.display);
    }
    this.rocket = null;
    this.mounted = null;
    this.display = null;
    this.rocketId = '';
    this.landerKey = '';
  }

  private applyConfig(next: MissionConfig): void {
    this.config = next;
    this.ctx.store.set({ mission: next });
    this.refresh();
  }

  private launch(): void {
    const result = preflight(this.config, this.ctx.catalog, this.requireObjectives);
    if (!result.go) return;
    this.ctx.store.set({ mission: this.config, flight: null, surface: null, outcome: null, flaggedSections: [] });
    this.ctx.go('flight');
  }

  /** Sinkronkan UI, indikator, dan model 3D dengan konfigurasi saat ini. */
  private refresh(): void {
    const catalog = this.ctx.catalog;
    const result = preflight(this.config, catalog, this.requireObjectives);
    this.panel?.update(this.config, result);

    const assembly = resolveAssembly(this.config, catalog);
    if (this.rocketId !== this.config.rocketId) {
      if (this.rocket) {
        this.scene.remove(this.rocket.root);
        disposeTree(this.rocket.root);
      }
      this.rocket = buildRocket(assembly.rocket);
      this.rocket.root.position.set(ROCKET_X, PLATFORM_TOP + NOZZLE_LENGTH, 0);
      enableShadows(this.rocket.root, true, true);
      for (const half of [this.rocket.fairingLeft, this.rocket.fairingRight]) {
        half.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.material = ghostFairing; m.castShadow = false; m.receiveShadow = false; } });
      }
      this.labelSource = { name: assembly.rocket.name, stages: assembly.rocket.stages.map((st) => ({ name: st.name, burn: st.burnSec })) };
      this.buildLabels();
      this.scene.add(this.rocket.root);
      this.rocketId = this.config.rocketId;
      this.displayX = ROCKET_X + this.rocket.radius * DISPLAY_RADIUS_FACTOR + DISPLAY_GAP;
      this.displayStage.position.x = this.displayX;
      this.landerKey = '';
      this.rebuildPad(this.rocket.radius, this.rocket.totalHeight);
      this.frameCamera();
    }

    const key = `${this.config.moduleIds.join(',')}|${this.config.instrumentIds.join(',')}`;
    if (this.rocket && key !== this.landerKey) {
      if (this.mounted) {
        this.rocket.landerSlot.remove(this.mounted);
        disposeTree(this.mounted);
      }
      if (this.display) {
        this.scene.remove(this.display);
        disposeTree(this.display);
      }
      this.mounted = buildLander(assembly.modules, assembly.instruments);
      mountLander(this.rocket, this.mounted);
      this.mounted.userData.baseScale = this.mounted.scale.x;
      this.display = buildLander(assembly.modules, assembly.instruments);
      enableShadows(this.mounted, true, true);
      enableShadows(this.display, true, true);
      this.display.position.set(this.displayX, 0.68, 0);
      this.display.userData.baseScale = DISPLAY_SCALE;
      this.display.scale.setScalar(DISPLAY_SCALE);
      this.scene.add(this.display);
      this.landerKey = key;
      this.popT = 0;
    }
  }

  /** Panggung kecil khusus astronot acuan skala dengan penggaris tinggi 2 m (ditandai tiap 0,5 m) di sebelahnya. */
  private buildRefStage(): THREE.Group {
    const g = new THREE.Group();
    g.name = 'astronaut-scale-stage';
    g.position.set(0, 0, REF_STAGE_Z);
    g.add(column(1.4, 1.55, 0, 0.5, 0x2a3350, 20));
    g.add(column(1.2, 1.2, 0.5, 0.05, 0x2c6f8a, 20));
    const k = DISPLAY_SCALE / VISUAL.landerWorldScale;
    g.add(column(0.03, 0.03, REF_STAGE_TOP, 2 * k, 0xc0c8d8, 6, REF_RULER_X, 0));
    for (let m = 0; m <= 4; m++) g.add(box(m % 2 === 0 ? 0.34 : 0.22, 0.03, 0.03, m === 4 ? 0xf08a24 : 0xc0c8d8, [REF_RULER_X, REF_STAGE_TOP + (m * 0.5) * k, 0]));
    return g;
  }

  /** Label melayang: nama roket, tiap tahap (warna sama dengan daftar tahap), dan wahana. */
  private buildLabels(): void {
    const layer = this.labelLayer;
    const rocket = this.rocket;
    const src = this.labelSource;
    if (!layer || !rocket || !src) return;
    // Teks diperbesar = ruang tengah sempit: label dipersingkat tanpa durasi tahap.
    const compact = (Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1) > 1.15;
    const stageTexts = src.stages.map((st) => (compact ? st.name : `${st.name} · ${st.burn} dtk`));
    const rocketName = src.name;
    layer.replaceChildren();
    this.labels = [];
    const make = (text: string, cls: string, color?: string): HTMLElement => {
      const node = el('div', `stage-label ${cls}`, text);
      if (color) node.style.setProperty('--c', color);
      layer.appendChild(node);
      return node;
    };
    stageTexts.forEach((text, i) => {
      const ring = rocket.boundaryRings.find((r) => r.name === `boundary-${i}`);
      const color = `#${STAGE_ACCENTS[i % STAGE_ACCENTS.length].toString(16).padStart(6, '0')}`;
      // Tahap tanpa cincin (booster samping) diberi label di atas badan boosternya.
      this.labels.push({ node: make(`${i + 1} · ${text}`, '', color), anchor: ring ?? rocket.stageGroups[i], lift: ring ? 0 : 3.5 });
    });
    this.labels.push({ node: make(rocketName, 'rocket-label'), anchor: rocket.root, lift: rocket.totalHeight + 1.2 });
    this.landerLabel = { node: make('Wahana (lander)', 'lander-label'), anchor: rocket.root, lift: 0 };
    if (this.refAstronaut) this.astronautLabel = { node: make(DESIGN.astronautScale, 'lander-label'), anchor: this.refAstronaut.root, lift: 1.9 };
  }

  /** Zona bebas (px CSS) di antara panel kiri dan kanan, dengan celah --hud-gap. */
  private freeZone(zoom: number): { min: number; max: number } {
    const root = this.labelLayer?.parentElement;
    const gap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hud-gap')) || 12;
    let min = 0, max = window.innerWidth / zoom;
    const left = root?.querySelector('.panel-left')?.getBoundingClientRect();
    const right = root?.querySelector('.panel-right')?.getBoundingClientRect();
    if (left && left.width > 0) min = left.right / zoom + gap;
    if (right && right.width > 0) max = right.left / zoom - gap;
    return { min, max };
  }

  /** Proyeksikan jangkar 3D ke layar dan tempatkan label (memperhitungkan zoom UI). */
  private placeLabels(): void {
    const w = window.innerWidth, h = window.innerHeight;
    const zoom = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    this.camera.updateMatrixWorld();
    this.right.setFromMatrixColumn(this.camera.matrixWorld, 0);
    const zone = this.freeZone(zoom);
    const put = (label: StageLabel, world: THREE.Vector3): void => {
      const v = this.tmp.copy(world).project(this.camera);
      let visible = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
      let left = ((v.x * 0.5 + 0.5) * w) / zoom;
      if (visible) {
        // Label diposisikan dari tepi kiri; jepit titik tengahnya ke zona di antara panel.
        const lw = label.node.offsetWidth;
        const c = clampToZone(left + lw / 2, lw, zone.min, zone.max);
        if (c === null) visible = false;
        else left = c - lw / 2;
      }
      label.node.style.display = visible ? 'block' : 'none';
      if (visible) label.node.style.transform = `translate(${left}px, ${((-v.y * 0.5 + 0.5) * h) / zoom}px) translateY(-50%)`;
    };
    const reach = (this.rocket?.radius ?? 1) * 1.2 + LABEL_GAP;
    const base = new THREE.Vector3();
    for (const label of this.labels) {
      label.anchor.getWorldPosition(base);
      base.y += label.lift;
      base.addScaledVector(this.right, reach);
      put(label, base);
    }
    if (this.astronautLabel && this.refAstronaut) {
      this.refAstronaut.root.getWorldPosition(base);
      base.y += this.astronautLabel.lift;
      base.addScaledVector(this.right, 0.9);
      put(this.astronautLabel, base);
    }
    if (this.landerLabel && this.display) {
      base.copy(this.display.position);
      base.y += (this.display.userData.height as number) * DISPLAY_SCALE * 0.5 + 1.2;
      put(this.landerLabel, base);
    }
  }

  private frameCamera(): void {
    if (!this.rocket || !this.orbit) return;
    const h = this.rocket.totalHeight;
    // Panel melebar saat teks diperbesar, jadi ruang tengah menyempit: jauhkan kamera sebanding.
    const zoom = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    this.lastZoom = zoom;
    const spread = this.displayX - ROCKET_X + 9;
    this.orbit.target.set((ROCKET_X + this.displayX) / 2, h * 0.42, 0);
    this.orbit.distance = Math.max(25, h * 1.4, spread * 1.15) * zoom;
  }

  update(dt: number): void {
    const zoom = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    if (zoom !== this.lastZoom) {
      this.frameCamera();
      this.buildLabels();
    }
    this.orbit?.update(dt, this.camera);
    this.placeLabels();
    if (this.display) this.display.rotation.y += dt * TURNTABLE_SPEED;
    if (this.popT < POP_SEC) {
      this.popT += dt;
      const k = Math.min(1, this.popT / POP_SEC);
      const eased = POP_START + (1 - POP_START) * (1 - (1 - k) ** 3);
      for (const g of [this.mounted, this.display]) {
        if (g) g.scale.setScalar((g.userData.baseScale as number) * eased);
      }
    }
  }
}

export function createDesignScene(ctx: GameContext): DesignScene {
  return new DesignScene(ctx);
}
