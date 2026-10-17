import { INDICATOR_LABELS, STATUS_SYMBOL, STATUS_TEXT } from '../core/strings';
import type { Indicator, IndicatorKey } from '../rules/preflight';
import { el } from './dom';

const KEYS: IndicatorKey[] = ['budget', 'mass', 'deltaV', 'power', 'comms'];
const BAR_MIN = 0.04;

export function formatMargin(margin: number): string {
  if (!Number.isFinite(margin)) return margin > 0 ? '∞' : '-∞';
  const pct = margin * 100;
  return pct > 999 ? '>999%' : `${pct.toFixed(0)}%`;
}

/** Lebar bar dari margin: -20% kosong, 0% = 40%, 10% = 60%, 30% ke atas penuh. */
export function barFill(margin: number): number {
  if (Number.isNaN(margin)) return BAR_MIN;
  return Math.min(1, Math.max(BAR_MIN, 0.4 + margin * 2));
}

interface Row { row: HTMLElement; icon: HTMLElement; fill: HTMLElement; value: HTMLElement }

/** Lima indikator margin dengan bar animasi, warna, dan simbol bentuk (PRD 10, 12). */
export class IndicatorView {
  readonly root = el('div', 'indicators');
  private rows = {} as Record<IndicatorKey, Row>;

  constructor() {
    for (const key of KEYS) {
      const row = el('div', 'indicator');
      const icon = el('span', 'indicator-icon');
      const label = el('span', 'indicator-label', INDICATOR_LABELS[key]);
      const bar = el('div', 'indicator-bar');
      const fill = el('div', 'indicator-fill');
      bar.appendChild(fill);
      const value = el('span', 'indicator-value');
      row.append(icon, label, bar, value);
      this.root.appendChild(row);
      this.rows[key] = { row, icon, fill, value };
    }
  }

  update(indicators: Record<IndicatorKey, Indicator>): void {
    for (const key of KEYS) {
      const { margin, status } = indicators[key];
      const r = this.rows[key];
      r.row.dataset.status = status;
      r.icon.textContent = STATUS_SYMBOL[status];
      r.icon.title = STATUS_TEXT[status];
      r.fill.style.width = `${(barFill(margin) * 100).toFixed(0)}%`;
      r.value.textContent = formatMargin(margin);
    }
  }
}
