import { getDetail, setDetail } from '../gen/detail';
import { trackFor } from './musicTheory';
import * as THREE from 'three';
import { FIXED_DT, MAX_FRAME_DT, MAX_PIXEL_RATIO, SCENE_IDS, UI, VISUAL, type SceneId } from './constants';
import { markSharedMaterialsDirty } from '../gen/mesh';
import { terrainMaterial } from '../gen/terrain';
import { Input } from './input';
import { CursorManager } from './cursor';
import { SceneManager } from './sceneManager';
import type { GameContext } from './context';
import { loadCatalog } from './data';
import { defaultMission, setDestination } from './missionBuilder';
import { audio } from './audio';
import { AdaptiveQuality } from './quality';
import { browserStorage, loadSave, writeSave } from './save';
import { createGameStore, type Store, type GameState } from './store';
import { createSettings } from '../ui/settings';
import { STRINGS } from './strings';
import { buildPreloadSteps, runPreload } from './preload';
import { LoadingScreen } from '../ui/loading';
import { createBriefingScene } from '../scenes/briefing';
import { createDesignScene } from '../scenes/design';
import { createFlightScene } from '../scenes/flight';
import { createSurfaceScene } from '../scenes/surface';
import { createReviewScene } from '../scenes/review';
import { SceneTransition } from './transition';

export class Game {
  private readonly storage = browserStorage();
  readonly store: Store<GameState> = createGameStore(defaultMission('moon'), loadSave(this.storage));
  readonly input = new Input();
  readonly scenes = new SceneManager();
  readonly cursor: CursorManager;
  private renderer: THREE.WebGLRenderer;
  private accumulator = 0;
  private last = 0;
  private quality!: AdaptiveQuality;
  private controls: { setDetail(level: 'low' | 'high'): void; open(): void } | null = null;
  private perf: HTMLElement | null = null;
  private fpsEma = 60;
  private readonly reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  private readonly transition = new SceneTransition(this.reducedMotion ? 0 : UI.sceneFadeSec);
  private readonly fadeEl = document.getElementById('scene-fade');
  private perfClock = 0;
  private perfInit = false;

  constructor(canvas: HTMLCanvasElement) {
    this.cursor = new CursorManager(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    const baseRatio = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO);
    this.renderer.setPixelRatio(baseRatio);
    // ACES Filmic menjaga warna terang tidak pecah dan bayangan tetap terbaca (VISUAL_POLISH 2).
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = VISUAL.exposure;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyShadows(this.store.get().save.shadows);
    setDetail(this.store.get().save.detail);
    this.quality = new AdaptiveQuality(baseRatio);
    const overlay = document.getElementById('overlay');
    if (!overlay) throw new Error('Elemen #overlay tidak ditemukan');
    const ctx: GameContext = {
      renderer: this.renderer, canvas, overlay, store: this.store, input: this.input,
      cursor: this.cursor, catalog: loadCatalog(), go: (id) => this.transition.request(id),
      openSettings: () => this.controls?.open(),
    };
    [createBriefingScene, createDesignScene, createFlightScene, createSurfaceScene, createReviewScene].forEach(
      (make) => this.scenes.register(make(ctx)),
    );
    this.applyDevParams();
    this.setupAudioAndSave(overlay);
    if (import.meta.env.DEV) (window as unknown as { __astra: unknown }).__astra = { renderer: this.renderer, scenes: this.scenes, store: this.store, detail: { getDetail, setDetail }, audio, cursor: this.cursor };
    this.scenes.onChange = (id) => {
      this.cursor.onSceneChange(id);
      this.input.clear();
      audio.stopLoops();
      this.store.set({ currentScene: id });
      audio.playMusic(trackFor(id, this.store.get().mission.destinationId));
      this.updateLabel(id);
    };
    window.addEventListener('resize', () => this.resize());
    this.perfInit = new URLSearchParams(window.location.search).has('perf');
    this.resize();
  }

  /**
   * Pemuatan awal (eager): semua tekstur prosedural berat dibuat dan diunggah ke GPU di balik layar memuat,
   * baru scene pertama dibuka. Dengan begitu perpindahan scene dan peluncuran tidak tersendat membangun bahan.
   */
  async start(): Promise<void> {
    const loading = new LoadingScreen();
    const errors = await runPreload(buildPreloadSteps(this.renderer), (f, label) => loading.set(f, label));
    for (const e of errors) console.error('Pemuatan awal gagal:', e);
    if (errors.length > 0) loading.warn();
    this.scenes.switchTo(this.store.get().currentScene);
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    loading.hide();
  }

  private frame(now: number): void {
    const rawDt = (now - this.last) / 1000;
    const frameDt = Math.min(rawDt, MAX_FRAME_DT);
    this.last = now;
    const ratio = this.quality.update(rawDt);
    if (ratio !== null) {
      this.renderer.setPixelRatio(ratio);
      this.resize();
    }
    // Perangkat tidak kuat walau resolusi sudah minimum: turunkan detail model otomatis (bisa dikembalikan lewat tombol Detail).
    if (this.quality.struggling && getDetail() === 'high') {
      this.quality.resetStruggle();
      this.controls?.setDetail('low');
    }
    this.updatePerf(rawDt);
    if (import.meta.env.DEV) this.handleSceneKeys();
    // Selama pudar berjalan, tombol yang ditekan tidak boleh memicu aksi di scene lama/baru.
    if (this.transition.busy) this.input.clear();
    this.accumulator += frameDt;
    while (this.accumulator >= FIXED_DT) {
      this.scenes.update(FIXED_DT);
      this.accumulator -= FIXED_DT;
    }
    // Pudar berjalan di waktu nyata (frameDt), tidak ikut langkah tetap scene.
    const fade = this.transition.update(frameDt);
    if (fade.switchTo) {
      try {
        this.scenes.switchTo(fade.switchTo);
      } catch (e) {
        // Gagal masuk scene tidak boleh mematikan loop atau menyisakan layar gelap.
        console.error('Perpindahan scene gagal:', e);
      }
    }
    if (this.fadeEl) {
      this.fadeEl.style.opacity = String(fade.opacity);
      // Blokir klik selama pudar agar scene lama tidak bisa dipicu dua kali.
      this.fadeEl.style.pointerEvents = this.transition.busy ? 'auto' : 'none';
    }
    this.scenes.render();
    requestAnimationFrame((t) => this.frame(t));
  }

  /** Muat pengaturan suara dari progres, simpan progres setiap berubah, dan buka audio pada gestur pertama. */
  private setupAudioAndSave(overlay: HTMLElement): void {
    const save = this.store.get().save;
    audio.setMuted(save.muted);
    audio.setMusicEnabled(save.music);
    audio.setVolume(save.volume);
    const unlock = (): void => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    overlay.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button:not(:disabled)') && !(e.target as HTMLElement).closest('.settings')) audio.click();
    }, true);
    this.store.subscribe((state, prev) => {
      if (state.save !== prev.save) writeSave(this.storage, state.save);
    });
    this.controls = createSettings(overlay, save, ({ muted, volume, textScale, shadows, detail, music }) => {
      this.applyShadows(shadows);
      const changed = detail !== getDetail();
      setDetail(detail);
      audio.setMusicEnabled(music);
      this.store.set({ save: { ...this.store.get().save, muted, volume, textScale, shadows, detail, music } });
      // Scene statis dibangun ulang segera; flight/surface memakai detail baru saat dimasuki berikutnya (state misi tidak direset).
      if (changed && ['briefing', 'design'].includes(this.store.get().currentScene)) this.scenes.reload();
    });
  }

  /** Hanya mode dev: ?scene=design&dest=mars langsung membuka scene tertentu. */
  private applyDevParams(): void {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    const dest = params.get('dest');
    if (dest) {
      const save = this.store.get().save;
      this.store.set({
        mission: setDestination(this.store.get().mission, dest),
        save: { ...save, unlocked: [...new Set([...save.unlocked, dest])], introSeen: true, tutorialSeen: true },
      });
    }
    const scene = params.get('scene');
    if (scene && (SCENE_IDS as readonly string[]).includes(scene)) this.store.set({ currentScene: scene as SceneId });
  }

  /** Bayangan dinamis nonaktif secara default (PRD 13); material bersama dikompilasi ulang saat berubah. */
  private applyShadows(on: boolean): void {
    if (this.renderer.shadowMap.enabled === on) return;
    this.renderer.shadowMap.enabled = on;
    markSharedMaterialsDirty();
    terrainMaterial.needsUpdate = true;
  }

  /** Overlay performa (F3 atau ?perf): FPS, rasio render, segitiga, dan draw call dari renderer.info. */
  private updatePerf(rawDt: number): void {
    const initial = this.perfInit;
    this.perfInit = false;
    if (this.input.consumePressed('F3') || initial) {
      if (this.perf) { this.perf.remove(); this.perf = null; } else { this.perf = document.createElement('div'); this.perf.id = 'perf'; document.body.appendChild(this.perf); }
    }
    if (rawDt > 0 && rawDt < 1) this.fpsEma += (1 / rawDt - this.fpsEma) * 0.05;
    this.perfClock += rawDt;
    if (this.perf && this.perfClock > 0.5) {
      this.perfClock = 0;
      const info = this.renderer.info.render;
      this.perf.textContent = `${this.fpsEma.toFixed(0)} FPS · render ${(this.quality.current).toFixed(2)}x · ${info.triangles} segitiga · ${info.calls} draw call`;
    }
  }

  private handleSceneKeys(): void {
    SCENE_IDS.forEach((id, i) => {
      if (this.input.consumePressed(`Digit${i + 1}`)) {
        this.transition.cancel(); // jangan sampai pudar tertunda mengalihkan balik
        this.scenes.switchTo(id);
      }
    });
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.scenes.resize(w, h);
  }

  private updateLabel(id: SceneId): void {
    const label = document.getElementById('scene-label');
    const hint = document.getElementById('scene-hint');
    if (label) label.textContent = `${SCENE_IDS.indexOf(id) + 1}. ${STRINGS.scenes[id]}`;
    if (hint) hint.textContent = import.meta.env.DEV ? STRINGS.hint : '';
  }
}
