import { EVENT_UI } from '../core/strings';
import type { Effect, EventChoice } from '../rules/types';

const MINUS = '−';

/** Teks satu efek, mis. "Waktu +45 dtk", "Daya wahana −5%", "Sinyal −40% selama 60 dtk". */
export function formatEffect(e: Effect): string {
  const sign = e.delta > 0 ? '+' : MINUS;
  const abs = Math.abs(e.delta);
  const label = EVENT_UI.labels[e.target];
  switch (e.target) {
    case 'vehiclePower': return `${label} ${sign}${abs}%`;
    case 'signal': return `${label} ${sign}${Math.round(abs * 100)}% ${EVENT_UI.signalFor}`;
    case 'timeSec': return `${label} ${sign}${abs} dtk`;
    case 'deltaVms': return `${label} ${sign}${abs} m/s`;
    default: return `${label} ${sign}${abs}`;
  }
}

export function formatEffects(list: Effect[]): string {
  return list.length === 0 ? EVENT_UI.noImpact : list.map(formatEffect).join(', ');
}

/** Label konsekuensi dan risiko sebuah pilihan untuk ditampilkan sebelum memilih. */
export function describeChoice(choice: EventChoice): { consequence: string; risk: string | null; failImpact: string | null } {
  const risky = choice.failChance > 0;
  return {
    consequence: formatEffects(choice.effects),
    risk: risky ? EVENT_UI.risk.replace('{p}', String(Math.round(choice.failChance * 100))) : null,
    failImpact: risky ? formatEffects(choice.failEffects) : null,
  };
}
