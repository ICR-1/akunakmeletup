import * as THREE from 'three';
import { CAMERA_FOV } from '../core/constants';
import type { GameContext } from '../core/context';
import { setDestination } from '../core/missionBuilder';
import { STORY_UI, TITLE_UI } from '../core/strings';
import { linesFor } from '../rules/dialogs';
import { modeRules, selectableDestinationIds, suggestedDestinationIndex } from '../rules/progress';
import type { Destination, Id } from '../rules/types';
import { Orrery } from '../gen/orrery';
import { carouselFrame, focusForDestination, type OrreryFocus } from '../gen/solarSystemData';
import { showDialogSequence } from '../ui/dialog';
import { el } from '../ui/dom';
import { renderKeyHints } from '../ui/keyHints';
import { createLogo } from '../ui/logo';
import { attachTooltip } from '../ui/tooltip';
import type { GlossaryKey } from '../ui/tooltip';
import { nudgeApart, type LabelBox } from '../ui/labelLayout';
import { BaseScene } from './baseScene';

// Bingkai tampilan umum digeser ke kiri agar tata surya tampak di sebelah kanan menu.
const OVERVIEW_TARGET = new THREE.Vector3(-14, 0, 0);
const OVERVIEW_POS = new THREE.Vector3(-14, 36, 66);
const LABEL_GAP_PX = 4;
const LABEL_LIFT = 1.7;
/**
 * Karusel: planet tujuan mengisi ~34% tinggi layar (lebih kecil di layar potret agar muat lebarnya), duduk sedikit di
 * atas tengah karena nama dan tombol Mulai ada di bawahnya.
 */
const CAROUSEL = { fill: 0.34, portraitAspect: 0.75, lift: 0.14, flySec: 1.9, arc: 0.3, orbitFollow: 2 } as const;

/** Layar judul: tata surya utuh di tengah, kamera mengitari pelan. */
const TITLE_VIEW = { radius: 70, height: 30, spin: 0.035, targetY: -4 } as const;

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeInOut = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/**
 * Briefing: tata surya interaktif, intro cerita (sekali), lalu menu karusel pilih tujuan (planet besar di tengah,
 * panah kiri/kanan, tombol Mulai), dialog Dr. Sekar, dan tutorial NOVA.
 */
export class BriefingScene extends BaseScene {
  readonly id = 'briefing' as const;
  private orrery: Orrery | null = null;
  private labelLayer: HTMLElement | null = null;
  private labelNodes = new Map<string, HTMLElement>();
  /** Ukuran label (px CSS) diukur sekali, bukan tiap frame. */
  private labelSize = new Map<string, { w: number; h: number }>();
  private focus: OrreryFocus = 'overview';
  /** Penerbangan kamera antar-fokus: dari pose awal ke pose bidik, berlengkung agar tidak menembus Matahari. */
  private readonly flyFromPos = OVERVIEW_POS.clone();
  private readonly flyFromTarget = OVERVIEW_TARGET.clone();
  private flyT = 1;
  private orbitRate = 1;
  private readonly camTarget = OVERVIEW_TARGET.clone();
  private readonly tmp = new THREE.Vector3();
  private readonly wantPos = new THREE.Vector3();
  private readonly wantTarget = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private menu: HTMLElement | null = null;
  private busy = false;
  private index = 0;
  /** Layar judul hanya muncul sekali, saat Briefing pertama dibuka setelah pemuatan. */
  private titleDone = false;
  private title: HTMLElement | null = null;
  private titleAngle = 0;
  /** Tombol menu utama dan indeks yang sedang disorot (panah/hover/Tab memindahkan sorotan yang sama). */
  private titleButtons: HTMLButtonElement[] = [];
  private titleSel = 0;

  constructor(ctx: GameContext) {
    super(ctx);
    this.scene.background = new THREE.Color(0x02040a);
    this.camera.position.copy(OVERVIEW_POS);
  }

  private setFocus(focus: OrreryFocus): void {
    if (focus === this.focus) return;
    this.focus = focus;
    this.startFlight();
  }

  /** Mulai terbang dari pose kamera sekarang ke pose bidik; gerak dikurangi membuat kamera langsung berpindah. */
  private startFlight(): void {
    this.flyFromPos.copy(this.camera.position);
    this.flyFromTarget.copy(this.camTarget);
    this.flyT = reducedMotion() ? 1 : 0;
  }

  private get destinations(): Destination[] {
    return this.ctx.catalog.destinations.filter((d) => d.mvp);
  }

  protected onEnter(ui: HTMLElement): void {
    this.busy = false;
    // Label scene di kiri atas tidak dipakai di Briefing: tempatnya untuk tombol kembali ke menu utama.
    document.body.classList.add('briefing-active');
    const { save, mode } = this.ctx.store.get();
    this.focus = 'overview';
    this.flyT = 1;
    this.orbitRate = 1;
    this.camera.position.copy(OVERVIEW_POS);
    this.camTarget.copy(OVERVIEW_TARGET);
    const ids = this.destinations.map((d) => d.id);
    this.index = suggestedDestinationIndex(ids, selectableDestinationIds(save, this.ctx.catalog.destinations, mode), save.stars);
    this.orrery = new Orrery(this.ctx.store.get().mission.seed);
    this.scene.add(this.orrery.root);
    void this.orrery.load(() => this.refreshLabels());
    this.labelLayer = el('div', 'label-layer');
    ui.appendChild(this.labelLayer);
    this.ctx.input.clear();
    if (!this.titleDone) this.showTitle(ui);
    else this.continueToMenu(ui);
  }

  /** Intro cerita (sekali, mode Cerita) lalu karusel pilih tujuan. */
  private continueToMenu(ui: HTMLElement): void {
    const { save, mode } = this.ctx.store.get();
    if (!save.introSeen && modeRules(mode).storyDialogs) {
      this.busy = true;
      showDialogSequence(ui, linesFor(this.ctx.catalog.dialogs, 'intro'), () => {
        this.ctx.store.set({ save: { ...this.ctx.store.get().save, introSeen: true } });
        this.busy = false;
        this.renderMenu(ui);
      });
    } else this.renderMenu(ui);
  }

  /** Menu utama: logo ASTRA di tengah, lalu Main, Pengaturan, dan Tentang. */
  private showTitle(ui: HTMLElement): void {
    document.body.classList.add('title-active');
    const screen = el('div', 'title-screen');
    const head = el('div', 'title-head');
    head.append(createLogo(TITLE_UI.logo, !reducedMotion()), el('div', 'title-subtitle', TITLE_UI.subtitle), el('p', 'title-tagline', TITLE_UI.tagline));
    const nav = el('nav', 'title-menu');
    this.titleButtons = [];
    const item = (cls: string, label: string, onClick: () => void): HTMLButtonElement => {
      const b = el('button', `title-btn ${cls}`, label);
      b.type = 'button';
      const i = this.titleButtons.length;
      this.titleButtons.push(b);
      b.addEventListener('click', onClick);
      b.addEventListener('mouseenter', () => this.selectTitle(i));
      b.addEventListener('focus', () => this.selectTitle(i));
      nav.appendChild(b);
      return b;
    };
    item('launch-button title-play', TITLE_UI.play, () => this.leaveTitle(ui));
    item('title-secondary title-settings', TITLE_UI.settings, () => this.ctx.openSettings());
    item('title-secondary title-info', TITLE_UI.about, () => this.showAbout(screen));
    this.selectTitle(0);
    const keys = el('div', 'title-keys');
    renderKeyHints(keys, TITLE_UI.keys);
    screen.append(head, nav, keys, el('div', 'title-credit', TITLE_UI.credit));
    ui.appendChild(screen);
    this.title = screen;
  }

  private showAbout(screen: HTMLElement): void {
    if (screen.querySelector('.title-about')) return;
    const backdrop = el('div', 'title-about');
    const card = el('div', 'title-about-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', TITLE_UI.aboutTitle);
    const steps = el('div', 'about-steps');
    TITLE_UI.aboutSteps.forEach((t, i) => {
      const step = el('span', 'about-step');
      step.append(el('b', '', String(i + 1)), document.createTextNode(t));
      steps.appendChild(step);
    });
    card.append(el('div', 'panel-tab', TITLE_UI.aboutTitle), steps);
    for (const p of TITLE_UI.aboutBody) card.appendChild(el('p', '', p));
    const close = el('button', 'launch-button about-close', TITLE_UI.close);
    close.type = 'button';
    const shut = (): void => backdrop.remove();
    close.addEventListener('click', shut);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) shut(); });
    card.appendChild(close);
    backdrop.appendChild(card);
    screen.appendChild(backdrop);
    close.focus();
  }

  private leaveTitle(ui: HTMLElement): void {
    if (!this.title) return;
    this.titleDone = true;
    this.title.classList.add('leaving');
    const screen = this.title;
    this.title = null;
    document.body.classList.remove('title-active');
    window.setTimeout(() => screen.remove(), 320);
    this.startFlight();
    this.continueToMenu(ui);
  }

  /** Sorot tombol menu utama ke-`i`; bila fokus keyboard sedang di salah satu tombol, fokus ikut pindah. */
  private selectTitle(i: number): void {
    const buttons = this.titleButtons;
    if (buttons.length === 0) return;
    this.titleSel = (i + buttons.length) % buttons.length;
    buttons.forEach((b, k) => b.classList.toggle('is-selected', k === this.titleSel));
    const focused = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (focused >= 0 && focused !== this.titleSel) buttons[this.titleSel].focus();
  }

  /** Tombol layar judul: ↑/↓ atau W/S memindahkan sorotan, Enter membuka yang disorot, Esc menutup Tentang. */
  private handleTitleKeys(screen: HTMLElement): void {
    const input = this.ctx.input;
    const up = input.consumePressed('ArrowUp') || input.consumePressed('KeyW');
    const down = input.consumePressed('ArrowDown') || input.consumePressed('KeyS');
    const enter = input.consumePressed('Enter') || input.consumePressed('NumpadEnter');
    const esc = input.consumePressed('Escape');
    const about = screen.querySelector('.title-about');
    if (about) {
      if (esc) about.remove();
      return;
    }
    if (up) this.selectTitle(this.titleSel - 1);
    else if (down) this.selectTitle(this.titleSel + 1);
    // Enter pada tombol yang sedang fokus (Tab) sudah memicu klik bawaan browser.
    else if (enter && !this.titleButtons.includes(document.activeElement as HTMLButtonElement)) this.titleButtons[this.titleSel]?.click();
  }

  protected override onExit(): void {
    document.body.classList.remove('title-active', 'briefing-active');
    this.title = null;
    this.titleButtons = [];
    this.menu = null;
    this.orrery?.dispose();
    this.orrery = null;
    this.labelLayer = null;
    this.labelNodes.clear();
    this.labelSize.clear();
  }

  /** Buat label DOM untuk planet yang sudah siap (nama saja; tanpa fakta sains tambahan). */
  private refreshLabels(): void {
    const layer = this.labelLayer;
    if (!layer || !this.orrery) return;
    for (const l of this.orrery.labels) {
      if (this.labelNodes.has(l.key)) continue;
      const node = el('div', 'stage-label planet-label', l.name);
      layer.appendChild(node);
      this.labelNodes.set(l.key, node);
      const w = node.offsetWidth, h = node.offsetHeight;
      if (w > 0 && h > 0) this.labelSize.set(l.key, { w, h });
    }
  }

  private placeLabels(): void {
    if (!this.orrery) return;
    const w = window.innerWidth, h = window.innerHeight;
    const zoom = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
    this.camera.updateMatrixWorld();
    this.up.setFromMatrixColumn(this.camera.matrixWorld, 1);
    const shown: { node: HTMLElement; box: LabelBox }[] = [];
    for (const l of this.orrery.labels) {
      const node = this.labelNodes.get(l.key);
      if (!node) continue;
      l.anchor.getWorldPosition(this.tmp);
      this.tmp.addScaledVector(this.up, l.radius * LABEL_LIFT);
      this.tmp.project(this.camera);
      // Label nama planet hanya di tampilan umum; di karusel nama tujuan tampil besar di bawah planet.
      const visible = this.focus === 'overview' && !this.title && this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.1 && Math.abs(this.tmp.y) < 1.1;
      node.style.display = visible ? 'block' : 'none';
      if (!visible) continue;
      let size = this.labelSize.get(l.key);
      if (!size) {
        size = { w: node.offsetWidth, h: node.offsetHeight };
        if (size.w > 0 && size.h > 0) this.labelSize.set(l.key, size);
      }
      shown.push({
        node,
        box: { x: ((this.tmp.x * 0.5 + 0.5) * w) / zoom, y: ((-this.tmp.y * 0.5 + 0.5) * h) / zoom, w: size.w, h: size.h },
      });
    }
    const shifts = nudgeApart(shown.map((s) => s.box), LABEL_GAP_PX);
    shown.forEach((s, i) => {
      s.node.style.transform = `translate(${s.box.x}px, ${s.box.y + shifts[i]}px) translate(-50%, -100%)`;
    });
  }

  private renderMenu(ui: HTMLElement, dir: -1 | 0 | 1 = 0): void {
    this.menu?.remove();
    const { save, mode } = this.ctx.store.get();
    const rules = modeRules(mode);
    const selectable = selectableDestinationIds(save, this.ctx.catalog.destinations, mode);
    const dests = this.destinations;
    this.index = Math.min(Math.max(0, this.index), dests.length - 1);
    const dest = dests[this.index];
    const open = selectable.includes(dest.id);
    this.setFocus(focusForDestination(dest.id));
    // Enter/Space yang menutup dialog intro tidak boleh langsung memulai misi.
    this.ctx.input.clear();

    const menu = el('div', 'mission-select');
    const top = el('div', 'ms-top');
    const tabs = el('div', 'mode-tabs');
    for (const [id, label] of [['story', STORY_UI.modeStory], ['free', STORY_UI.modeFree]] as const) {
      const tab = el('button', 'mode-tab', label);
      tab.type = 'button';
      tab.dataset.mode = id;
      tab.setAttribute('aria-pressed', String(mode === id));
      tab.classList.toggle('active', mode === id);
      tab.addEventListener('click', () => {
        if (this.busy || mode === id) return;
        this.ctx.store.set({ mode: id });
        this.renderMenu(ui);
      });
      tabs.appendChild(tab);
    }
    top.append(tabs, el('p', 'mode-hint', rules.storyDialogs ? STORY_UI.modeStoryHint : STORY_UI.modeFreeHint));
    if (rules.recordsProgress) {
      const beacons = save.beacons.length > 0 ? save.beacons.map((b) => b.replace('beacon_', '')).join(', ') : STORY_UI.none;
      top.appendChild(el('div', 'progress-line', `${STORY_UI.progress}: ${STORY_UI.sciencePoints} ${save.sciencePoints} · ${STORY_UI.beacons}: ${beacons}`));
    }

    const stage = el('div', 'ms-stage');
    const arrow = (step: -1 | 1, cls: string, label: string): HTMLButtonElement => {
      const b = el('button', `ms-arrow ${cls}`);
      b.type = 'button';
      b.setAttribute('aria-label', label);
      b.title = label;
      b.disabled = !dests[this.index + step];
      b.addEventListener('click', () => this.step(ui, step));
      return b;
    };

    const info = el('div', 'ms-info');
    if (dir !== 0) info.dataset.dir = dir > 0 ? 'next' : 'prev';
    info.appendChild(el('div', 'ms-kicker', STORY_UI.chooseDestination));
    const name = el('h2', open ? 'ms-name' : 'ms-name locked', dest.name);
    info.appendChild(name);
    const stars = save.stars[dest.id] ?? 0;
    const starRow = el('div', 'dest-stars ms-stars');
    starRow.setAttribute('aria-label', `${stars}/3`);
    for (let s = 0; s < 3; s++) starRow.appendChild(el('span', s < stars ? 'dest-star on' : 'dest-star', '★'));
    info.appendChild(starRow);
    const sub = el('div', 'dest-chips ms-chips');
    if (open) {
      const chip = (cls: string, text: string, term?: GlossaryKey): void => {
        const c = el('span', `dest-chip ${cls}`, text);
        if (term) attachTooltip(c, term);
        sub.appendChild(c);
      };
      chip('chip-gravity', `${dest.gravity} m/s²`, 'gravity');
      chip('chip-budget', `${dest.budgetMusd} MUSD`, 'budget');
      const best = save.bestScore[dest.id];
      if (best !== undefined) chip('chip-best', `${STORY_UI.best} ${best}`);
    } else {
      const prev = dests[this.index - 1];
      sub.appendChild(el('span', 'ms-locked', prev ? STORY_UI.lockedAfter.replace('{prev}', prev.name) : STORY_UI.locked));
    }
    info.appendChild(sub);
    const play = el('button', 'launch-button ms-play', open ? STORY_UI.start : STORY_UI.lockedButton);
    play.type = 'button';
    play.disabled = !open;
    play.addEventListener('click', () => this.startBriefing(ui, dest.id));
    info.appendChild(play);
    const dots = el('div', 'ms-dots');
    dests.forEach((d, i) => {
      const dot = el('button', i === this.index ? 'ms-dot active' : 'ms-dot');
      dot.type = 'button';
      dot.setAttribute('aria-label', d.name);
      dot.addEventListener('click', () => this.step(ui, i - this.index));
      dots.appendChild(dot);
    });
    info.appendChild(dots);
    const keys = el('div', 'ms-keys');
    renderKeyHints(keys, STORY_UI.carouselKeys);
    info.appendChild(keys);

    stage.append(arrow(-1, 'prev', STORY_UI.prevDestination), info, arrow(1, 'next', STORY_UI.nextDestination));
    const back = el('button', 'ms-back', STORY_UI.backToTitle);
    back.type = 'button';
    back.addEventListener('click', () => this.backToTitle(ui));
    menu.append(back, top, stage);
    ui.appendChild(menu);
    this.menu = menu;
  }

  /** Kembali dari karusel ke menu utama; kamera terbang balik ke tampilan tata surya. */
  private backToTitle(ui: HTMLElement): void {
    if (this.busy || !this.menu) return;
    this.menu.remove();
    this.menu = null;
    this.focus = 'overview';
    this.startFlight();
    this.showTitle(ui);
  }

  /** Geser karusel `delta` langkah (tanpa memutar dari ujung ke ujung). */
  private step(ui: HTMLElement, delta: number): void {
    if (this.busy || !this.menu || delta === 0) return;
    const next = this.index + delta;
    if (next < 0 || next >= this.destinations.length) return;
    this.index = next;
    this.renderMenu(ui, delta > 0 ? 1 : -1);
  }

  private startBriefing(ui: HTMLElement, destinationId: Id): void {
    if (this.busy) return;
    const { save: s0, mode } = this.ctx.store.get();
    if (!selectableDestinationIds(s0, this.ctx.catalog.destinations, mode).includes(destinationId)) return;
    this.busy = true;
    this.menu?.remove();
    this.menu = null;
    this.ctx.store.set({ mission: setDestination(this.ctx.store.get().mission, destinationId), flaggedSections: [] });
    this.setFocus(focusForDestination(destinationId));
    if (!modeRules(this.ctx.store.get().mode).storyDialogs) {
      this.busy = false;
      this.ctx.go('design');
      return;
    }
    const dialogs = this.ctx.catalog.dialogs;
    const lines = [...linesFor(dialogs, `briefing_${destinationId}`)];
    const save = this.ctx.store.get().save;
    if (!save.tutorialSeen) lines.push(...linesFor(dialogs, 'tutorial'));
    showDialogSequence(ui, lines, () => {
      if (!save.tutorialSeen) this.ctx.store.set({ save: { ...this.ctx.store.get().save, tutorialSeen: true } });
      this.busy = false;
      this.ctx.go('design');
    });
  }

  /** Tombol karusel: panah/A-D ganti tujuan, Enter mulai. Penekanan selama dialog dibuang. */
  private handleKeys(): void {
    if (this.title) {
      this.handleTitleKeys(this.title);
      return;
    }
    const input = this.ctx.input;
    const left = input.consumePressed('ArrowLeft') || input.consumePressed('KeyA');
    const right = input.consumePressed('ArrowRight') || input.consumePressed('KeyD');
    const enter = input.consumePressed('Enter') || input.consumePressed('NumpadEnter');
    // Esc saat panel Pengaturan terbuka hanya menutup panel itu.
    const esc = input.consumePressed('Escape') && !document.querySelector('.settings.open');
    const ui = this.ui;
    if (this.busy || !this.menu || !ui) return;
    if (esc) this.backToTitle(ui);
    else if (left) this.step(ui, -1);
    else if (right) this.step(ui, 1);
    else if (enter) this.startBriefing(ui, this.destinations[this.index].id);
  }

  /** Pose kamera yang dituju untuk fokus sekarang (planet tujuan dibingkai besar, sisi terangnya menghadap kamera). */
  private wantPose(orrery: Orrery, pos: THREE.Vector3, target: THREE.Vector3): void {
    if (this.title) {
      pos.set(Math.sin(this.titleAngle) * TITLE_VIEW.radius, TITLE_VIEW.height, Math.cos(this.titleAngle) * TITLE_VIEW.radius);
      target.set(0, TITLE_VIEW.targetY, 0);
      return;
    }
    if (this.focus === 'overview') {
      pos.copy(OVERVIEW_POS);
      target.copy(OVERVIEW_TARGET);
      return;
    }
    const { radius } = orrery.focusPoint(this.focus, target);
    const fill = CAROUSEL.fill * Math.min(1, this.camera.aspect / CAROUSEL.portraitAspect);
    const { dist, drop } = carouselFrame(radius, CAMERA_FOV, fill, CAROUSEL.lift);
    const toSun = this.tmp.copy(target).negate().setY(0).normalize();
    const dir = this.dir.set(-toSun.z, 0, toSun.x).multiplyScalar(0.5).addScaledVector(toSun, 0.8).setY(0.28).normalize();
    pos.copy(target).addScaledVector(dir, dist);
    target.y -= drop;
  }

  update(dt: number): void {
    const orrery = this.orrery;
    this.handleKeys();
    if (!orrery) return;
    // Orbit melambat sampai diam saat sebuah planet dibingkai, agar kamera tidak tertinggal; rotasi poros tetap jalan.
    this.orbitRate += ((this.focus === 'overview' ? 1 : 0) - this.orbitRate) * (1 - Math.exp(-CAROUSEL.orbitFollow * dt));
    orrery.update(dt, this.orbitRate);
    if (this.title && !reducedMotion()) this.titleAngle += TITLE_VIEW.spin * dt;
    const { wantPos, wantTarget } = this;
    this.wantPose(orrery, wantPos, wantTarget);
    this.flyT = Math.min(1, this.flyT + dt / CAROUSEL.flySec);
    const e = easeInOut(this.flyT);
    const lift = Math.sin(Math.PI * this.flyT) * this.flyFromPos.distanceTo(wantPos) * CAROUSEL.arc;
    this.camera.position.lerpVectors(this.flyFromPos, wantPos, e).y += lift;
    this.camTarget.lerpVectors(this.flyFromTarget, wantTarget, e);
    this.camera.lookAt(this.camTarget);
    this.placeLabels();
  }
}

export function createBriefingScene(ctx: GameContext): BriefingScene {
  return new BriefingScene(ctx);
}
