import { RELAY_ANTENNA_ID } from '../core/constants';
import {
  defaultMission, detectActivePreset, getPresetMission, isRecommendedItem, mainAntennaIds,
  moduleCount, setDestination, setExclusive, setFuelFraction, setModuleCount, setRocket,
  STUDENT_PRESETS, toggleInstrument,
} from '../core/missionBuilder';
import { DESIGN, STORY_UI, STUDENT_UI } from '../core/strings';
import type { PreflightResult } from '../rules/preflight';
import type { Catalog, Id, MissionConfig, Module } from '../rules/types';
import { clear, el } from './dom';
import { STAGE_ACCENTS } from '../gen/rocket';
import { IndicatorView } from './hud';
import { summarizeCounts, summarizeSelection } from './panelSummary';
import { novaWarnings } from './warnings';
import { paceRocket } from '../rules/staging';

interface Item { id: Id; label: string; sub?: string; disabled?: boolean }

/** Bagian yang terbuka secara default; sisanya tertutup dengan ringkasan pilihan di header. */
const DEFAULT_OPEN = new Set(['rocket', 'lander', 'engine', 'instruments']);

function section(title: string, key = ''): { root: HTMLElement; body: HTMLElement; setSummary(text: string): void } {
  // Bagian tanpa kunci (panel inspektur kanan) selalu terbuka.
  const root = el('section', `panel-section${key === '' || DEFAULT_OPEN.has(key) ? ' open' : ''}`);
  root.dataset.section = key;
  const head = el('button', 'section-head');
  head.type = 'button';
  const summary = el('span', 'section-summary');
  head.append(el('span', 'section-title', title), summary);
  head.addEventListener('click', () => root.classList.toggle('open'));
  root.appendChild(head);
  const body = el('div', 'panel-body');
  root.appendChild(body);
  return { root, body, setSummary: (t) => { summary.textContent = t; } };
}

function choiceGroup(title: string, items: Item[], onPick: (id: Id) => void, key = '', isRec?: (id: Id) => boolean) {
  const { root, body, setSummary } = section(title, key);
  const buttons = new Map<Id, HTMLButtonElement>();
  for (const item of items) {
    const b = el('button', 'choice');
    b.type = 'button';
    b.disabled = item.disabled === true;
    const nameEl = el('span', 'choice-name', item.label);
    if (isRec?.(item.id)) {
      nameEl.appendChild(el('span', 'rec-badge', STUDENT_UI.recommendedBadge));
    }
    b.appendChild(nameEl);
    if (item.sub) b.appendChild(el('span', 'choice-sub', item.sub));
    b.addEventListener('click', () => onPick(item.id));
    body.appendChild(b);
    buttons.set(item.id, b);
  }
  return {
    root,
    sync: (selected: Id | null, checkRec?: (id: Id) => boolean) => {
      buttons.forEach((b, id) => {
        b.classList.toggle('sel', id === selected);
        const nameEl = b.querySelector('.choice-name');
        const badge = b.querySelector('.rec-badge');
        const rec = checkRec?.(id) ?? false;
        if (rec && !badge && nameEl) {
          nameEl.appendChild(el('span', 'rec-badge', STUDENT_UI.recommendedBadge));
        } else if (!rec && badge) {
          badge.remove();
        }
      });
      setSummary(summarizeSelection(items, selected));
    },
  };
}

function counterGroup(title: string, items: Item[], onSet: (id: Id, n: number) => void, getCount: (id: Id) => number, key = '', isRec?: (id: Id) => boolean) {
  const { root, body, setSummary } = section(title, key);
  const values = new Map<Id, HTMLElement>();
  const rows = new Map<Id, HTMLElement>();
  for (const item of items) {
    const row = el('div', 'counter');
    const info = el('span', 'counter-info');
    const nameEl = el('span', 'choice-name', item.label);
    if (isRec?.(item.id)) {
      nameEl.appendChild(el('span', 'rec-badge', STUDENT_UI.recommendedBadge));
    }
    info.append(nameEl, el('span', 'choice-sub', item.sub ?? ''));
    const minus = el('button', 'step', '−');
    const plus = el('button', 'step', '+');
    const value = el('span', 'counter-value', '0');
    minus.type = plus.type = 'button';
    minus.addEventListener('click', () => onSet(item.id, getCount(item.id) - 1));
    plus.addEventListener('click', () => onSet(item.id, getCount(item.id) + 1));
    row.append(info, minus, value, plus);
    body.appendChild(row);
    values.set(item.id, value);
    rows.set(item.id, row);
  }
  return {
    root,
    sync: (checkRec?: (id: Id) => boolean) => {
      values.forEach((v, id) => { v.textContent = String(getCount(id)); });
      rows.forEach((row, id) => {
        const nameEl = row.querySelector('.choice-name');
        const badge = row.querySelector('.rec-badge');
        const rec = checkRec?.(id) ?? false;
        if (rec && !badge && nameEl) {
          nameEl.appendChild(el('span', 'rec-badge', STUDENT_UI.recommendedBadge));
        } else if (!rec && badge) {
          badge.remove();
        }
      });
      setSummary(summarizeCounts(items, getCount));
    },
  };
}

const info = (m: Module, extra = ''): string => `${extra}${m.massKg} kg · ${m.costMusd} MUSD`;

/** Panel katalog (kiri) dan inspektur preflight (kanan) pada scene Desain. */
export class DesignPanel {
  private config: MissionConfig;
  private readonly syncs: (() => void)[] = [];
  private readonly indicators = new IndicatorView();
  private readonly badge = el('div', 'go-badge');
  private readonly autoFix = el('button', 'autofix-button', STUDENT_UI.autoFixButton);
  private readonly metrics = el('div', 'metrics');
  private readonly objectives = el('ul', 'objective-list');
  private readonly stageList = el('ol', 'stage-list');
  private readonly nova = el('div', 'nova-box');
  private readonly launch = el('button', 'launch-button', DESIGN.launch);
  private readonly fuel = el('input', 'fuel-slider');
  private readonly fuelValue = el('span', 'fuel-value');

  constructor(
    ui: HTMLElement,
    private readonly catalog: Catalog,
    initial: MissionConfig,
    private readonly handlers: { change(update: (c: MissionConfig) => MissionConfig): void; launch(): void },
    private readonly options: { unlocked: Id[]; flagged: string[] } = { unlocked: ['moon', 'mars'], flagged: [] },
  ) {
    this.config = initial;
    ui.append(this.buildCatalog(), this.buildInspector());
    ui.querySelectorAll<HTMLElement>('.panel-section').forEach((sec) => {
      const flagged = this.options.flagged.includes(sec.dataset.section ?? '');
      sec.classList.toggle('flagged', flagged);
      if (flagged) sec.classList.add('open');
    });
  }

  private kind(kind: Module['kind']): Module[] {
    return this.catalog.modules.filter((m) => m.kind === kind);
  }

  private buildCatalog(): HTMLElement {
    const cat = this.catalog;
    const root = el('aside', 'panel panel-left');
    root.appendChild(el('h2', '', DESIGN.title));

    // Pemilihan Destinasi
    const dest = choiceGroup(DESIGN.destination, cat.destinations.filter((d) => d.mvp).map((d) => {
      const locked = !this.options.unlocked.includes(d.id);
      return {
        id: d.id, label: locked ? `🔒 ${d.name}` : d.name, disabled: locked,
        sub: locked ? STORY_UI.locked : `g ${d.gravity} m/s² · budget ${d.budgetMusd} MUSD · Δv ${d.deltaVKmS} km/s`,
      };
    }), (id) => this.handlers.change((c) => setDestination(c, id)), 'destination');
    this.syncs.push(() => dest.sync(this.config.destinationId));

    // Pilihan Cepat / Preset Desain Siswa
    const presetsBox = el('div', 'student-presets');
    presetsBox.append(
      el('div', 'student-presets-title', STUDENT_UI.presetsTitle),
      el('p', 'student-presets-sub', STUDENT_UI.presetsSubtitle),
    );
    const presetsGrid = el('div', 'student-presets-grid');
    const destId = () => this.config.destinationId;

    const btnStd = el('button', 'preset-btn');
    btnStd.type = 'button';
    btnStd.append(
      el('span', 'preset-btn-name', STUDENT_UI.presetStandard),
      el('span', 'preset-btn-desc', STUDENT_PRESETS[destId()]?.standard.desc ?? ''),
    );
    btnStd.addEventListener('click', () => {
      this.handlers.change((c) => getPresetMission(c.destinationId, 'standard', c.seed));
    });

    const btnCruiser = el('button', 'preset-btn');
    btnCruiser.type = 'button';
    btnCruiser.append(
      el('span', 'preset-btn-name', STUDENT_UI.presetCruiser),
      el('span', 'preset-btn-desc', STUDENT_PRESETS[destId()]?.cruiser.desc ?? ''),
    );
    btnCruiser.addEventListener('click', () => {
      this.handlers.change((c) => getPresetMission(c.destinationId, 'cruiser', c.seed));
    });

    const btnReset = el('button', 'preset-reset-btn', STUDENT_UI.reset);
    btnReset.type = 'button';
    btnReset.addEventListener('click', () => {
      this.handlers.change((c) => defaultMission(c.destinationId, c.seed));
    });

    presetsGrid.append(btnStd, btnCruiser, btnReset);
    presetsBox.appendChild(presetsGrid);

    this.syncs.push(() => {
      const active = detectActivePreset(this.config);
      btnStd.classList.toggle('active', active === 'standard');
      btnCruiser.classList.toggle('active', active === 'cruiser');
      const d = destId();
      const pStd = STUDENT_PRESETS[d]?.standard;
      const pCruiser = STUDENT_PRESETS[d]?.cruiser;
      const descStd = btnStd.querySelector('.preset-btn-desc');
      const descCruiser = btnCruiser.querySelector('.preset-btn-desc');
      if (descStd && pStd) descStd.textContent = pStd.desc;
      if (descCruiser && pCruiser) descCruiser.textContent = pCruiser.desc;
    });

    const isRec = (id: Id) => isRecommendedItem(this.config.destinationId, id);

    const rocket = choiceGroup(DESIGN.rocket, cat.rockets.map((r) => ({
      id: r.id, label: r.name,
      sub: `${DESIGN.payload} ${r.payloadToLeoKg} kg · ${r.stages.length} ${DESIGN.stages} · ${r.costMusd} MUSD`,
    })), (id) => this.handlers.change((c) => setRocket(c, id)), 'rocket', isRec);
    this.syncs.push(() => rocket.sync(this.config.rocketId, isRec));

    const exclusive = (title: string, mods: Module[], extra: (m: Module) => string, key: string) => {
      const ids = mods.map((m) => m.id);
      const g = choiceGroup(title, mods.map((m) => ({ id: m.id, label: m.name, sub: info(m, extra(m)) })),
        (id) => this.handlers.change((c) => setExclusive(c, cat, ids, id)), key, isRec);
      this.syncs.push(() => g.sync(ids.find((id) => moduleCount(this.config, id) > 0) ?? null, isRec));
      return g.root;
    };
    const counter = (title: string, mods: Module[], key: string) => {
      const g = counterGroup(title, mods.map((m) => ({ id: m.id, label: m.name, sub: info(m) })),
        (id, n) => this.handlers.change((c) => setModuleCount(c, cat, id, n)), (id) => moduleCount(this.config, id), key, isRec);
      this.syncs.push(() => g.sync(isRec));
      return g.root;
    };

    const antennas = mainAntennaIds(cat).map((id) => cat.modules.find((m) => m.id === id)!);
    const relay = cat.modules.filter((m) => m.id === RELAY_ANTENNA_ID);

    const instruments = counterGroup(DESIGN.instruments, cat.instruments.map((i) => ({
      id: i.id, label: i.name, sub: `${i.massKg} kg · ${i.powerW} W · ${i.costMusd} MUSD`,
    })), (id) => this.handlers.change((c) => toggleInstrument(c, cat, id)), (id) => (this.config.instrumentIds.includes(id) ? 1 : 0), 'instruments', isRec);
    this.syncs.push(() => instruments.sync(isRec));

    const fuelSection = section(DESIGN.fuel, 'fuel');
    fuelSection.body.classList.add('fuel-body');
    this.fuel.type = 'range';
    this.fuel.min = '0';
    this.fuel.max = '100';
    this.fuel.step = '5';
    this.fuel.addEventListener('input', () => this.handlers.change((c) => setFuelFraction(c, Number(this.fuel.value) / 100)));
    fuelSection.body.append(this.fuel, this.fuelValue);
    this.syncs.push(() => {
      const pct = Math.round((this.config.fuelFraction ?? 1) * 100);
      this.fuel.value = String(pct);
      this.fuelValue.textContent = `${pct}%`;
      fuelSection.setSummary(`${pct}%`);
    });

    root.append(
      dest.root,
      presetsBox,
      el('div', 'panel-category-header', STUDENT_UI.categoryCore),
      rocket.root,
      exclusive(DESIGN.lander, this.kind('lander'), (m) => `slot ${m.stats.instrumentSlots} · `, 'lander'),
      exclusive(DESIGN.engine, this.kind('engine'), (m) => `Isp ${m.stats.ispS} s · `, 'engine'),
      counter(DESIGN.tanks, this.kind('tank'), 'tanks'),
      counter(DESIGN.solar, this.kind('solar'), 'solar'),
      counter(DESIGN.battery, this.kind('battery'), 'battery'),
      exclusive(DESIGN.antenna, antennas, (m) => `rate ${m.stats.rate} · `, 'antenna'),
      instruments.root,
      fuelSection.root,
      el('div', 'panel-category-header', STUDENT_UI.categoryOptional),
      counter(DESIGN.rtg, this.kind('rtg'), 'rtg'),
      counter(DESIGN.relay, relay, 'relay'),
      counter(DESIGN.rover, this.kind('rover'), 'rover'),
    );
    return root;
  }

  private buildInspector(): HTMLElement {
    const root = el('aside', 'panel panel-right');
    root.appendChild(this.badge);
    this.autoFix.type = 'button';
    this.autoFix.addEventListener('click', () => {
      this.handlers.change((c) => getPresetMission(c.destinationId, 'standard', c.seed));
    });
    root.appendChild(this.autoFix);

    const ind = section(DESIGN.indicators);
    ind.body.append(this.indicators.root, this.metrics);
    const obj = section(DESIGN.objectives);
    obj.body.appendChild(this.objectives);
    const stages = section(DESIGN.stageList);
    stages.body.appendChild(this.stageList);
    const nova = section(DESIGN.nova);
    nova.body.appendChild(this.nova);
    this.launch.type = 'button';
    this.launch.addEventListener('click', () => { if (!this.launch.disabled) this.handlers.launch(); });
    root.append(ind.root, obj.root, stages.root, nova.root, this.launch, el('p', 'hint', DESIGN.hint));
    return root;
  }

  /** Perbarui seluruh panel agar sesuai dengan konfigurasi dan hasil preflight terbaru. */
  update(config: MissionConfig, result: PreflightResult): void {
    this.config = config;
    this.syncs.forEach((s) => s());
    this.indicators.update(result.indicators);
    this.badge.textContent = result.go ? DESIGN.go : DESIGN.noGo;
    this.badge.dataset.go = String(result.go);
    this.autoFix.hidden = result.go;
    this.launch.disabled = !result.go;
    this.launch.textContent = result.go ? DESIGN.launch : DESIGN.launchBlocked;

    const m = result.metrics;
    clear(this.metrics);
    const metric = (k: string, v: string) => this.metrics.append(el('span', 'metric-k', k), el('span', 'metric-v', v));
    metric(DESIGN.metrics.dry, `${m.dryMassKg.toFixed(0)} kg`);
    metric(DESIGN.metrics.m0, `${m.m0Kg.toFixed(0)} kg`);
    metric(DESIGN.metrics.dv, `${m.dvAvailableMs.toFixed(0)} / ${m.dvRequiredMs.toFixed(0)} m/s`);
    metric(DESIGN.metrics.cost, `${m.totalCostMusd.toFixed(0)} MUSD`);

    const dest = this.catalog.destinations.find((d) => d.id === config.destinationId);
    clear(this.objectives);
    for (const o of dest?.objectives.filter((x) => x.required) ?? []) {
      const ok = !result.missingObjectives.includes(o.id);
      const instrument = this.catalog.instruments.find((i) => i.id === o.instrumentId);
      const li = el('li', ok ? 'ok' : 'bad', `${ok ? '✓' : '✕'} ${o.title} (${instrument?.name ?? '-'}: ${ok ? DESIGN.installed : DESIGN.missing})`);
      this.objectives.appendChild(li);
    }

    const base = this.catalog.rockets.find((r) => r.id === config.rocketId);
    const rocket = base ? paceRocket(base) : undefined;
    clear(this.stageList);
    rocket?.stages.forEach((s, i) => {
      const li = el('li', 'stage-item');
      const dot = el('span', 'stage-dot');
      dot.style.background = `#${STAGE_ACCENTS[i % STAGE_ACCENTS.length].toString(16).padStart(6, '0')}`;
      li.append(dot, el('span', '', `${s.name} (${s.burnSec} dtk)`));
      this.stageList.appendChild(li);
    });

    const warnings = novaWarnings(result, config, this.catalog);
    clear(this.nova);
    if (warnings.length === 0) {
      this.nova.appendChild(el('p', 'nova-ok', 'Semua indikator aman. Siap diluncurkan, Arka!'));
    } else {
      warnings.forEach((w) => this.nova.appendChild(el('p', 'nova-warn', w)));
      this.nova.appendChild(el('div', 'nova-student-tip', `${STUDENT_UI.studentTipTitle} ${STUDENT_UI.studentTipHelp}`));
    }
  }
}
