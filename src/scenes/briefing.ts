import * as THREE from 'three';
import type { GameContext } from '../core/context';
import { setDestination } from '../core/missionBuilder';
import { STORY_UI } from '../core/strings';
import { linesFor } from '../rules/dialogs';
import { modeRules, selectableDestinationIds } from '../rules/progress';
import type { Id } from '../rules/types';
import { Orrery } from '../gen/orrery';
import { focusForDestination, type OrreryFocus } from '../gen/solarSystemData';
import { showDialogSequence } from '../ui/dialog';
import { el } from '../ui/dom';
import { nudgeApart, type LabelBox } from '../ui/labelLayout';
import { BaseScene } from './baseScene';

// Bingkai tampilan umum digeser ke kiri agar tata surya tampak di sebelah kanan menu.
const OVERVIEW_TARGET = new THREE.Vector3(-14, 0, 0);
const OVERVIEW_POS = new THREE.Vector3(-14, 36, 66);
const CAM_FOLLOW = 2.4;
const FOCUS_DIST: Record<OrreryFocus, number> = { overview: 0, earth: 8, mars: 6.5 };
const LABEL_GAP_PX = 4;
const LABEL_LIFT = 1.7;

/** Briefing: tata surya interaktif, intro cerita (sekali), pilih tujuan yang terbuka, dialog Dr. Sekar, dan tutorial NOVA. */
export class BriefingScene extends BaseScene {
  readonly id = 'briefing' as const;
  private orrery: Orrery | null = null;
  private labelLayer: HTMLElement | null = null;
  private labelNodes = new Map<string, HTMLElement>();
  /** Ukuran label (px CSS) diukur sekali, bukan tiap frame. */
  private labelSize = new Map<string, { w: number; h: number }>();
  private focus: OrreryFocus = 'overview';
  private readonly camPos = OVERVIEW_POS.clone();
  private readonly camTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private menu: HTMLElement | null = null;
  private busy = false;

  constructor(ctx: GameContext) {
    super(ctx);
    this.scene.background = new THREE.Color(0x02040a);
    this.camera.position.copy(OVERVIEW_POS);
  }

  private setFocus(focus: OrreryFocus): void {
    this.focus = focus;
  }

  protected onEnter(ui: HTMLElement): void {
    this.busy = false;
    const { save } = this.ctx.store.get();
    this.focus = 'overview';
    this.camPos.copy(OVERVIEW_POS);
    this.camTarget.copy(OVERVIEW_TARGET);
    this.orrery = new Orrery(this.ctx.store.get().mission.seed);
    this.scene.add(this.orrery.root);
    void this.orrery.load(() => this.refreshLabels());
    this.labelLayer = el('div', 'label-layer');
    ui.appendChild(this.labelLayer);
    if (!save.introSeen && modeRules(this.ctx.store.get().mode).storyDialogs) {
      this.busy = true;
      showDialogSequence(ui, linesFor(this.ctx.catalog.dialogs, 'intro'), () => {
        this.ctx.store.set({ save: { ...this.ctx.store.get().save, introSeen: true } });
        this.busy = false;
        this.renderMenu(ui);
      });
    } else this.renderMenu(ui);
  }

  protected override onExit(): void {
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

  private labelVisible(key: string): boolean {
    if (this.focus === 'overview') return true;
    if (this.focus === 'earth') return key === 'earth' || key === 'moon';
    return key === 'mars';
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
      const visible = this.labelVisible(l.key) && this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.1 && Math.abs(this.tmp.y) < 1.1;
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

  private renderMenu(ui: HTMLElement): void {
    this.menu?.remove();
    const { save, mode } = this.ctx.store.get();
    const rules = modeRules(mode);
    const selectable = selectableDestinationIds(save, this.ctx.catalog.destinations, mode);
    const menu = el('div', 'briefing-menu');
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
    menu.append(tabs, el('p', 'mode-hint', rules.storyDialogs ? STORY_UI.modeStoryHint : STORY_UI.modeFreeHint));
    menu.appendChild(el('h2', '', STORY_UI.chooseDestination));
    const dests = this.ctx.catalog.destinations.filter((d) => d.mvp);
    dests.forEach((dest, i) => {
      const open = selectable.includes(dest.id);
      const stars = save.stars[dest.id] ?? 0;
      const best = save.bestScore[dest.id];
      const button = el('button', 'choice dest-button');
      button.type = 'button';
      button.disabled = !open;
      const name = el('span', 'choice-name', dest.name);
      const starRow = el('span', 'dest-stars');
      starRow.setAttribute('aria-label', `${stars}/3`);
      for (let s = 0; s < 3; s++) starRow.appendChild(el('span', s < stars ? 'dest-star on' : 'dest-star', '★'));
      name.appendChild(starRow);
      button.appendChild(name);
      const sub = el('span', 'choice-sub dest-chips');
      if (open) {
        const chip = (cls: string, text: string, title?: string): void => {
          const c = el('span', `dest-chip ${cls}`, text);
          if (title) c.title = title;
          sub.appendChild(c);
        };
        chip('chip-gravity', `${dest.gravity} m/s²`, STORY_UI.gravity);
        chip('chip-budget', `${dest.budgetMusd} MUSD`, STORY_UI.budget);
        if (best !== undefined) chip('chip-best', `${STORY_UI.best} ${best}`);
      } else {
        const prev = dests[i - 1];
        sub.textContent = prev ? STORY_UI.lockedAfter.replace('{prev}', prev.name) : STORY_UI.locked;
      }
      button.appendChild(sub);
      button.addEventListener('mouseenter', () => { if (open) this.setFocus(focusForDestination(dest.id)); });
      button.addEventListener('mouseleave', () => { if (!this.busy) this.setFocus('overview'); });
      button.addEventListener('click', () => this.startBriefing(ui, dest.id));
      menu.appendChild(button);
    });
    if (rules.recordsProgress) {
      const beacons = save.beacons.length > 0 ? save.beacons.map((b) => b.replace('beacon_', '')).join(', ') : STORY_UI.none;
      menu.appendChild(el('div', 'progress-line', `${STORY_UI.progress}: ${STORY_UI.sciencePoints} ${save.sciencePoints} · ${STORY_UI.beacons}: ${beacons}`));
    }
    ui.appendChild(menu);
    this.menu = menu;
  }

  private startBriefing(ui: HTMLElement, destinationId: Id): void {
    if (this.busy) return;
    this.busy = true;
    this.menu?.remove();
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

  update(dt: number): void {
    const orrery = this.orrery;
    if (!orrery) return;
    orrery.update(dt);
    // Kamera meluncur ke planet fokus (sisi yang menghadap Matahari agar terlihat terang) atau kembali ke tampilan umum.
    const radius = orrery.focusPoint(this.focus, this.tmp).radius;
    const target = this.focus === 'overview' ? OVERVIEW_TARGET.clone() : this.tmp.clone();
    let wantPos = OVERVIEW_POS.clone();
    if (this.focus !== 'overview') {
      const dist = FOCUS_DIST[this.focus];
      const toSun = target.clone().negate().setY(0).normalize();
      const side = new THREE.Vector3(-toSun.z, 0, toSun.x);
      wantPos = target.clone().addScaledVector(toSun, dist * 0.8).addScaledVector(side, dist * 0.5).add(new THREE.Vector3(0, dist * 0.28 + radius * 0.2, 0));
    }
    const k = 1 - Math.exp(-CAM_FOLLOW * dt);
    this.camPos.lerp(wantPos, k);
    this.camTarget.lerp(target, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    this.placeLabels();
  }
}

export function createBriefingScene(ctx: GameContext): BriefingScene {
  return new BriefingScene(ctx);
}
