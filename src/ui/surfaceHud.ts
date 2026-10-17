import { JOURNAL_UI, SURFACE_UI } from '../core/strings';
import type { ChoiceOutcome } from '../events/eventSystem';
import type { GameEvent } from '../rules/types';
import { showEventDialog } from './dialog';
import { Cinematic } from './cinematic';
import { clear, el } from './dom';

const COMPASS_HALF_RAD = Math.PI / 2;
const TOAST_MS = 3200;

export interface PoiView {
  label: string;
  /** Sudut relatif terhadap arah hadap (radian, -PI..PI). */
  bearing: number;
  distanceM: number;
  done: boolean;
  bonus: boolean;
  shown: boolean;
}

export interface ObjectiveView { title: string; required: boolean; done: boolean; instrument: string; available: boolean }

export interface SurfaceHudView {
  oxygen: number;
  suit: number;
  vehiclePct: number;
  signal01: number;
  powerOut: boolean;
  day: boolean;
  elapsedSec: number;
  remainingSec: number;
  hubBearing: number;
  hubDistanceM: number;
  pois: PoiView[];
  scannerReady: boolean;
}

interface Meter { row: HTMLElement; fill: HTMLElement; value: HTMLElement; icon: HTMLElement }

const fmt = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function statusOf(v01: number): { status: 'green' | 'yellow' | 'red'; icon: string } {
  if (v01 > 0.5) return { status: 'green', icon: '●' };
  if (v01 > 0.25) return { status: 'yellow', icon: '▲' };
  return { status: 'red', icon: '✕' };
}

/** HUD permukaan: empat meter, kompas dengan penanda objektif, jam siang-malam, daftar objektif, prompt, dan pesan. */
export class SurfaceHud {
  private readonly meters: Record<'oxygen' | 'suit' | 'vehicle' | 'signal', Meter>;
  private readonly clock = el('div', 'surface-clock');
  private readonly compass = el('div', 'compass');
  private readonly hubTick = el('div', 'compass-tick hub');
  private readonly poiTicks: HTMLElement[] = [];
  private readonly objectivePanel = el('div', 'hud-panel hud-right objective-panel');
  private readonly prompt = el('div', 'surface-prompt');
  private readonly toasts = el('div', 'toasts');
  private readonly faint = el('div', 'faint-overlay');
  private readonly dialogHost = el('div', 'modal-host');
  private readonly root = el('div', 'surface-hud');
  readonly cinematic = new Cinematic(this.root);
  private readonly scanner = el('div', 'scanner-chip');
  private readonly staticFx = el('div', 'static-fx');
  private modal = false;
  private readonly journal = el('div', 'hud-panel journal-panel');

  constructor(ui: HTMLElement, poiCount: number) {
    this.meters = {
      oxygen: this.makeMeter(SURFACE_UI.meters.oxygen),
      suit: this.makeMeter(SURFACE_UI.meters.suit),
      vehicle: this.makeMeter(SURFACE_UI.meters.vehicle),
      signal: this.makeMeter(SURFACE_UI.meters.signal),
    };
    const meterPanel = el('div', 'hud-panel meter-panel');
    for (const m of Object.values(this.meters)) meterPanel.appendChild(m.row);
    meterPanel.appendChild(this.scanner);
    this.compass.appendChild(this.hubTick);
    for (let i = 0; i < poiCount; i++) {
      const t = el('div', 'compass-tick poi', '◆');
      this.poiTicks.push(t);
      this.compass.appendChild(t);
    }
    this.faint.hidden = true;
    this.journal.hidden = true;
    this.root.append(this.journal, 
      this.staticFx, this.clock, this.compass, meterPanel, this.objectivePanel, this.prompt, this.toasts,
      el('div', 'hud-controls surface-controls', SURFACE_UI.controls), this.faint, this.dialogHost,
    );
    ui.appendChild(this.root);
  }

  private makeMeter(label: string): Meter {
    const row = el('div', 'meter');
    const icon = el('span', 'meter-icon', '●');
    const bar = el('div', 'meter-bar');
    const fill = el('div', 'meter-fill');
    bar.appendChild(fill);
    const value = el('span', 'meter-value', '100%');
    row.append(icon, el('span', 'meter-label', label), bar, value);
    return { row, fill, value, icon };
  }

  setObjectives(list: ObjectiveView[]): void {
    clear(this.objectivePanel);
    this.objectivePanel.appendChild(el('h3', '', SURFACE_UI.objectives));
    for (const o of list) {
      const row = el('div', `objective ${o.done ? 'done' : ''} ${o.available ? '' : 'unavailable'}`);
      row.append(
        el('span', 'objective-mark', o.done ? '✓' : '○'),
        el('span', 'objective-title', o.title),
        el('span', 'objective-tag', `${o.required ? SURFACE_UI.required : SURFACE_UI.bonus} · ${o.instrument}`),
      );
      this.objectivePanel.appendChild(row);
    }
  }

  private setMeter(m: Meter, v01: number, text: string): void {
    const { status, icon } = statusOf(v01);
    m.row.dataset.status = status;
    m.icon.textContent = icon;
    m.fill.style.width = `${Math.max(0, Math.min(1, v01)) * 100}%`;
    m.value.textContent = text;
  }

  update(v: SurfaceHudView): void {
    this.setMeter(this.meters.oxygen, v.oxygen / 100, `${v.oxygen.toFixed(0)}%`);
    this.setMeter(this.meters.suit, v.suit / 100, `${v.suit.toFixed(0)}%`);
    this.setMeter(this.meters.vehicle, v.vehiclePct / 100, v.powerOut ? 'HABIS' : `${v.vehiclePct.toFixed(0)}%`);
    this.setMeter(this.meters.signal, v.signal01, `${(v.signal01 * 100).toFixed(0)}%`);
    this.staticFx.classList.toggle('on', v.signal01 < 0.5);

    this.clock.textContent = `${v.day ? SURFACE_UI.day : SURFACE_UI.night} · ${fmt(v.elapsedSec)} · ${SURFACE_UI.remaining} ${fmt(v.remainingSec)}`;
    this.clock.dataset.day = String(v.day);
    this.scanner.textContent = `${SURFACE_UI.scanner}: ${v.scannerReady ? 'siap' : SURFACE_UI.scannerCooling}`;

    const place = (tick: HTMLElement, bearing: number, show: boolean): void => {
      const visible = show && Math.abs(bearing) <= COMPASS_HALF_RAD;
      tick.style.display = visible ? 'block' : 'none';
      if (visible) tick.style.left = `${50 + (bearing / COMPASS_HALF_RAD) * 50}%`;
    };
    place(this.hubTick, v.hubBearing, true);
    this.hubTick.textContent = `▲ ${SURFACE_UI.hub} ${v.hubDistanceM.toFixed(0)}m`;
    v.pois.forEach((p, i) => {
      const tick = this.poiTicks[i];
      if (!tick) return;
      tick.className = `compass-tick poi ${p.bonus ? 'bonus' : ''} ${p.done ? 'done' : ''}`;
      tick.textContent = `◆ ${p.distanceM.toFixed(0)}m`;
      tick.title = p.label;
      place(tick, p.bearing, p.shown);
    });
  }

  /** Isi jurnal misi (kartu fakta, objektif, data terkumpul). */
  setJournal(facts: [string, string][], note: string, data: [string, string][]): void {
    clear(this.journal);
    this.journal.appendChild(el('h3', '', JOURNAL_UI.title));
    this.journal.appendChild(el('h4', '', JOURNAL_UI.facts));
    const grid = el('div', 'journal-grid');
    for (const [k, v] of facts) grid.append(el('span', 'journal-k', k), el('span', 'journal-v', v));
    this.journal.append(grid, el('p', 'journal-note', note), el('h4', '', JOURNAL_UI.data));
    if (data.length === 0) this.journal.appendChild(el('p', 'journal-note', JOURNAL_UI.noData));
    const g2 = el('div', 'journal-grid');
    for (const [k, v] of data) g2.append(el('span', 'journal-k', k), el('span', 'journal-v', v));
    this.journal.append(g2, el('p', 'journal-note', JOURNAL_UI.hint));
  }

  toggleJournal(): boolean {
    this.journal.hidden = !this.journal.hidden;
    return !this.journal.hidden;
  }

  setPrompt(text: string | null): void {
    this.prompt.textContent = text ?? '';
    this.prompt.hidden = text === null;
  }

  toast(text: string): void {
    const t = el('div', 'toast', text);
    this.toasts.appendChild(t);
    window.setTimeout(() => t.remove(), TOAST_MS);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
  }

  showFaint(on: boolean): void {
    this.faint.hidden = !on;
  }

  confirmUplink(onYes: () => void, onNo: () => void): void {
    clear(this.dialogHost);
    const U = SURFACE_UI.uplink;
    const box = el('div', 'dialog modal');
    const yes = el('button', 'launch-button', U.yes);
    const no = el('button', 'choice', U.no);
    yes.type = no.type = 'button';
    this.modal = true;
    const close = (fn: () => void) => () => { clear(this.dialogHost); this.modal = false; fn(); };
    yes.addEventListener('click', close(onYes));
    no.addEventListener('click', close(onNo));
    box.append(el('div', 'dialog-name', U.title), el('p', 'dialog-text', U.body), yes, no);
    this.dialogHost.appendChild(box);
  }

  /** Dialog modal (uplink, event) membekukan permainan; overlay minigame tidak termasuk. */
  get dialogOpen(): boolean {
    return this.modal;
  }

  showEvent(
    event: GameEvent,
    resolve: (i: number, minigameScore?: number) => ChoiceOutcome,
    onClose: (o: ChoiceOutcome) => void,
    runMinigame?: (minigameId: string) => Promise<number>,
  ): void {
    this.modal = true;
    showEventDialog(this.dialogHost, event, resolve, (outcome) => { this.modal = false; onClose(outcome); }, runMinigame);
  }

  flash(): void {
    const f = el('div', 'flash-fx');
    this.root.appendChild(f);
    window.setTimeout(() => f.remove(), 800);
  }

  /** Wadah untuk overlay minigame. */
  get overlayHost(): HTMLElement {
    return this.dialogHost;
  }
}
