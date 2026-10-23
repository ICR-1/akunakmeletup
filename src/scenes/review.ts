import * as THREE from 'three';
import { audio } from '../core/audio';
import type { GameContext } from '../core/context';
import { defaultMission } from '../core/missionBuilder';
import { FLIGHT_UI, REVIEW_UI } from '../core/strings';
import { linesFor } from '../rules/dialogs';
import type { MissionOutcome } from '../rules/missionResult';
import type { MissionConfig } from '../rules/types';
import { missionSucceeded, modeRules, nextDestinationId, recordMission, type MissionRecord } from '../rules/progress';
import { preflight } from '../rules/preflight';
import { suggestChanges, weakestIndicator, type Suggestion } from '../rules/whatIf';
import { earnedMedals, explainScore, MEDALS, mainCauses, sectionsForCodes } from '../rules/review';
import { SCORE } from '../core/constants';
import { showDialogSequence } from '../ui/dialog';
import { el } from '../ui/dom';
import { BaseScene } from './baseScene';

const SPIN = 0.5;
const pct = (v: number): string => (Number.isFinite(v) ? (v * 100).toFixed(0) : '∞');
const fmt = (n: number): string => n.toFixed(1).replace('.', ',');

/** Layar Mission Review: skor transparan, bintang, penyebab utama, medali, Beacon, dan alur lanjut/perbaiki. */
export class ReviewScene extends BaseScene {
  readonly id = 'review' as const;
  private readonly gem: THREE.Mesh;
  private recorded: MissionOutcome | null = null;
  private record: MissionRecord | null = null;

  constructor(ctx: GameContext) {
    super(ctx);
    this.scene.background = new THREE.Color(0x0a1a16);
    this.scene.add(new THREE.HemisphereLight(0xdde8ff, 0x0a1a16, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(5, 8, 4);
    this.scene.add(sun);
    this.gem = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 0), new THREE.MeshStandardMaterial({ color: 0x6bff9e, flatShading: true }));
    this.gem.position.set(-4.2, 0.4, 0);
    this.scene.add(this.gem);
    this.camera.position.set(0, 1, 9);
  }

  protected onEnter(ui: HTMLElement): void {
    const state = this.ctx.store.get();
    const outcome = state.outcome;
    this.gem.visible = outcome !== null && outcome !== undefined;
    if (!outcome) {
      const empty = el('div', 'briefing-menu centered review-empty');
      const go = el('button', 'launch-button', REVIEW_UI.toDesign);
      go.type = 'button';
      go.addEventListener('click', () => this.ctx.go('design'));
      empty.append(el('h2', '', REVIEW_UI.emptyTitle), el('p', '', REVIEW_UI.emptyBody), go);
      ui.appendChild(empty);
      return;
    }
    const config = state.mission;
    const catalog = this.ctx.catalog;
    const rules = modeRules(state.mode);
    const pre = preflight(config, catalog, rules.requireObjectives);
    const flight = state.flight;
    const surface = state.surface;
    const success = missionSucceeded(outcome);
    (this.gem.material as THREE.MeshStandardMaterial).color.set(success ? 0x6bff9e : 0xff6b6b);

    // Catat progres sekali per hasil misi (bukan setiap kali scene dibuka).
    if (this.recorded !== outcome && flight && rules.recordsProgress) {
      const medals = earnedMedals({ outcome, flight, surface, budgetMargin: pre.indicators.budget.margin });
      this.record = recordMission(state.save, catalog.destinations, config.destinationId, outcome, medals);
      this.recorded = outcome;
      this.ctx.store.set({ save: this.record.save });
    }
    const record = this.record;
    audio.jingle(success);

    const dest = catalog.destinations.find((d) => d.id === config.destinationId);
    const required = dest?.objectives.filter((o) => o.required) ?? [];
    const doneIds = new Set(surface?.completedObjectives ?? []);
    const explain = flight ? explainScore({
      uplinkU: surface?.uplinkU ?? 0,
      requiredDone: required.filter((o) => doneIds.has(o.id)).length,
      requiredTotal: required.length,
      minigameScores: Object.values(surface?.minigameScores ?? {}),
      budgetMargin: pre.indicators.budget.margin, massMargin: pre.indicators.mass.margin, powerMargin: pre.indicators.power.margin,
      flight, faintCount: surface?.faintCount ?? 0,
      bonusDone: (dest?.objectives.filter((o) => o.bonus && doneIds.has(o.id)).length ?? 0),
      goodEvents: (surface?.eventsHandledWell ?? 0) + flight.eventsHandledWell,
    }) : null;

    const grid = el('div', 'review-grid');
    const left = el('div', 'review-card');
    left.dataset.ok = String(success);
    const s = outcome.score;
    left.appendChild(el('h2', '', success ? REVIEW_UI.success : REVIEW_UI.failure));
    const stars = el('div', 'stars');
    for (let i = 0; i < 3; i++) stars.appendChild(el('span', i < s.stars ? '' : 'off', '★'));
    left.append(stars, el('div', 'score-big', `${REVIEW_UI.score} ${s.total.toFixed(0)} / 100`));

    const E = REVIEW_UI.explain;
    const rows: { label: string; value: number; max: number; text: string }[] = [
      { label: REVIEW_UI.science, value: s.science, max: SCORE.scienceMax, text: explain ? E.science
        .replace('{u}', fmt(explain.science.uplinkU)).replace('{done}', String(explain.science.requiredDone))
        .replace('{total}', String(explain.science.requiredTotal)).replace('{avg}', fmt(explain.science.minigameAvg)) : '' },
      { label: REVIEW_UI.efficiency, value: s.efficiency, max: SCORE.efficiencyMax, text: explain ? E.efficiency
        .replace('{b}', pct(explain.efficiency.budget)).replace('{m}', pct(explain.efficiency.mass)).replace('{p}', pct(explain.efficiency.power)) : '' },
      { label: REVIEW_UI.safety, value: s.safety, max: SCORE.safetyMax, text: explain ? E.safety
        .replace('{f}', fmt(explain.safety.touchdownFactor)).replace('{faints}', String(explain.safety.faints))
        .replace('{lost}', String(explain.safety.lost)).replace('{late}', String(explain.safety.late)) : '' },
      { label: REVIEW_UI.bonus, value: s.bonus, max: SCORE.bonusMax, text: explain ? E.bonus
        .replace('{o}', String(explain.bonus.objectives)).replace('{e}', String(explain.bonus.goodEvents)) : '' },
    ];
    for (const r of rows) {
      const row = el('div', 'score-row');
      const head = el('div', 'score-row-head');
      head.append(el('span', '', r.label), el('span', '', `${fmt(r.value)} / ${r.max}`));
      const bar = el('div', 'score-bar');
      const fill = el('div', 'score-fill');
      bar.appendChild(fill);
      row.append(head, bar, el('div', 'score-explain', r.text));
      left.appendChild(row);
      window.setTimeout(() => { fill.style.width = `${(r.value / r.max) * 100}%`; }, 50);
    }

    left.appendChild(el('h3', '', REVIEW_UI.causes));
    const causes = mainCauses(outcome.codes);
    if (causes.length === 0) left.appendChild(el('p', '', REVIEW_UI.noCauses));
    for (const c of causes) left.appendChild(el('p', 'cause', `${c}: ${FLIGHT_UI.codes[c]}`));
    if (flight?.touchdown) left.appendChild(el('div', 'score-explain', `${REVIEW_UI.details}: pendaratan ${REVIEW_UI.touchdown[flight.touchdown]}`));
    left.appendChild(this.buildWhatIf(config, rules.requireObjectives));

    const right = el('div', 'review-card');
    if (rules.recordsProgress) {
      right.appendChild(el('h3', '', REVIEW_UI.pointsEarned));
      right.appendChild(el('div', 'score-big', `+${record?.pointsEarned ?? 0}`));
      if (record?.newlyUnlocked) {
        const name = catalog.destinations.find((d) => d.id === record.newlyUnlocked)?.name ?? record.newlyUnlocked;
        right.append(el('h3', '', REVIEW_UI.unlocked), el('p', 'medal', name));
      }
      right.appendChild(el('h3', '', REVIEW_UI.medals));
      const got = this.ctx.store.get().save.achievements;
      const medalBox = el('div');
      const names = Object.values(MEDALS).filter((m) => got.includes(m.id));
      if (names.length === 0) medalBox.textContent = REVIEW_UI.noMedals;
      names.forEach((m) => medalBox.appendChild(el('span', 'medal', m.name)));
      right.appendChild(medalBox);

    } else right.appendChild(el('p', 'score-explain', REVIEW_UI.freeNote));

    const actions = el('div', 'review-actions');
    const fix = el('button', 'choice', REVIEW_UI.fixDesign);
    fix.type = 'button';
    fix.addEventListener('click', () => {
      this.ctx.store.set({ flaggedSections: sectionsForCodes(outcome.codes) });
      this.ctx.go('design');
    });
    const next = el('button', 'launch-button', REVIEW_UI.next);
    next.type = 'button';
    next.disabled = rules.recordsProgress && !success;
    next.textContent = rules.recordsProgress ? REVIEW_UI.next : REVIEW_UI.freeNext;
    next.addEventListener('click', () => (rules.recordsProgress ? this.advance(ui) : this.backToMenu()));
    actions.append(next, fix);
    if (!success && rules.recordsProgress) actions.appendChild(el('p', 'score-explain', REVIEW_UI.continueHint));
    right.appendChild(actions);
    grid.append(left, right);
    ui.appendChild(grid);

    if (rules.storyDialogs && record?.newBeacon) {
      const lines = linesFor(catalog.dialogs, record.newBeacon);
      showDialogSequence(ui, lines, () => undefined);
    }
  }

  /** Panel "Bagaimana jika": saran satu langkah dengan perubahan margin kelima indikator (dihitung dari rakitan yang diterbangkan). */
  private buildWhatIf(config: MissionConfig, requireObjectives: boolean): HTMLElement {
    const W = REVIEW_UI.whatIf;
    const catalog = this.ctx.catalog;
    const box = el('div', 'whatif');
    box.appendChild(el('h3', '', W.title));
    const base = preflight(config, catalog, requireObjectives);
    const weakest = weakestIndicator(config, catalog, requireObjectives);
    box.appendChild(el('p', 'score-explain', W.weakest.replace('{k}', W.indicators[weakest]).replace('{v}', pct(base.indicators[weakest].margin))));
    const list = suggestChanges(config, catalog, requireObjectives);
    if (list.length === 0) {
      box.appendChild(el('p', 'score-explain', W.none));
      return box;
    }
    box.appendChild(el('p', 'score-explain', W.intro));
    for (const s of list) {
      const item = el('div', 'whatif-item');
      item.appendChild(el('div', 'whatif-title', this.suggestionLabel(s)));
      const detail = s.changes.map((c) => `${W.indicators[c.key]} ${pct(c.from)}% → ${pct(c.to)}%`).join(' · ');
      item.appendChild(el('div', 'score-explain', `${detail}${detail ? ' · ' : ''}${W.cost.replace('{d}', `${s.costDeltaMusd >= 0 ? '+' : ''}${s.costDeltaMusd}`)} · ${s.go ? W.go : W.noGo}`));
      box.appendChild(item);
    }
    return box;
  }

  private suggestionLabel(s: Suggestion): string {
    const W = REVIEW_UI.whatIf;
    const p = (v: number | undefined): string => String(Math.round((v ?? 0) * 100));
    switch (s.kind) {
      case 'fuel_up': return W.fuelUp.replace('{a}', p(s.fuelFrom)).replace('{b}', p(s.fuelTo));
      case 'fuel_down': return W.fuelDown.replace('{a}', p(s.fuelFrom)).replace('{b}', p(s.fuelTo));
      case 'add_module': return W.add.replace('{name}', s.moduleName ?? '');
      default: return W.swap.replace('{name}', s.moduleName ?? '');
    }
  }

  /** Free Design: kembali memilih misi tanpa melanjutkan cerita. */
  private backToMenu(): void {
    const { mission } = this.ctx.store.get();
    this.ctx.store.set({ mission: defaultMission(mission.destinationId, mission.seed), flight: null, surface: null, outcome: null, flaggedSections: [] });
    this.ctx.go('briefing');
  }

  /** Lanjut cerita: destinasi berikutnya, atau penutup "Bersambung" setelah Beacon terakhir MVP. */
  private advance(ui: HTMLElement): void {
    const { mission } = this.ctx.store.get();
    const next = nextDestinationId(this.ctx.catalog.destinations, mission.destinationId);
    if (next) {
      this.ctx.store.set({ mission: defaultMission(next, mission.seed), flight: null, surface: null, outcome: null, flaggedSections: [] });
      this.ctx.go('briefing');
      return;
    }
    showDialogSequence(ui, linesFor(this.ctx.catalog.dialogs, 'end'), () => {
      const card = el('div', 'briefing-menu centered');
      card.appendChild(el('h2', '', REVIEW_UI.ending));
      const back = el('button', 'launch-button', REVIEW_UI.backToBriefing);
      back.type = 'button';
      back.addEventListener('click', () => {
        this.ctx.store.set({ mission: defaultMission('moon', mission.seed), flight: null, surface: null, outcome: null });
        this.ctx.go('briefing');
      });
      card.appendChild(back);
      ui.appendChild(card);
    });
  }

  update(dt: number): void {
    this.gem.rotation.y += dt * SPIN;
    this.gem.rotation.x += dt * SPIN * 0.4;
  }
}

export function createReviewScene(ctx: GameContext): ReviewScene {
  return new ReviewScene(ctx);
}
