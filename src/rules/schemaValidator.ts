import {
  DIALOG_SPEAKERS, EFFECT_TARGETS, EVENT_MINIGAMES, MODULE_KINDS,
  type Catalog, type ModuleKind,
} from './types';

export class DataValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(`Data tidak valid (${issues.length} masalah):\n- ${issues.join('\n- ')}`);
    this.name = 'DataValidationError';
  }
}

const REQUIRED_STATS: Record<ModuleKind, string[]> = {
  lander: ['instrumentSlots', 'baseLoadW'],
  tank: ['fuelKg'],
  engine: ['ispS', 'thrustKn'],
  solar: ['areaM2', 'efficiency'],
  battery: ['capacityWh'],
  rtg: ['powerW'],
  antenna: ['rate'],
  rover: ['speedMs', 'driveW'],
};
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ANY = 'any';

type Rec = Record<string, unknown>;

class Checker {
  readonly issues: string[] = [];
  fail(path: string, msg: string): void { this.issues.push(`${path}: ${msg}`); }

  obj(path: string, v: unknown): Rec | null {
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) return v as Rec;
    this.fail(path, 'harus berupa objek');
    return null;
  }
  arr(path: string, v: unknown, minLen = 0): unknown[] {
    if (!Array.isArray(v)) { this.fail(path, 'harus berupa array'); return []; }
    if (v.length < minLen) this.fail(path, `minimal ${minLen} elemen`);
    return v;
  }
  str(path: string, v: unknown): string {
    if (typeof v === 'string' && v.length > 0) return v;
    this.fail(path, 'harus berupa string tidak kosong');
    return '';
  }
  num(path: string, v: unknown, min = -Infinity, max = Infinity): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) { this.fail(path, 'harus berupa angka'); return NaN; }
    if (v < min || v > max) this.fail(path, `harus di rentang [${min}, ${max}], nilai: ${v}`);
    return v;
  }
  bool(path: string, v: unknown): boolean {
    if (typeof v === 'boolean') return v;
    this.fail(path, 'harus berupa boolean');
    return false;
  }
  oneOf<T extends string>(path: string, v: unknown, allowed: readonly T[]): T | null {
    if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
    this.fail(path, `harus salah satu dari ${allowed.join(', ')}`);
    return null;
  }
  uniqueIds(path: string, list: Rec[]): Set<string> {
    const seen = new Set<string>();
    list.forEach((item, i) => {
      const id = item.id;
      if (typeof id !== 'string') return;
      if (seen.has(id)) this.fail(`${path}[${i}].id`, `duplikat "${id}"`);
      seen.add(id);
    });
    return seen;
  }
}

function checkEffects(c: Checker, path: string, v: unknown): void {
  c.arr(path, v).forEach((e, i) => {
    const o = c.obj(`${path}[${i}]`, e);
    if (!o) return;
    c.oneOf(`${path}[${i}].target`, o.target, EFFECT_TARGETS);
    c.num(`${path}[${i}].delta`, o.delta);
  });
}

/** Memvalidasi seluruh data mentah JSON; melempar DataValidationError dengan semua masalah sekaligus. */
export function validateCatalog(raw: Record<keyof Catalog, unknown>): Catalog {
  const c = new Checker();
  const list = (name: keyof Catalog, minLen = 1): Rec[] =>
    c.arr(name, raw[name], minLen).map((x, i) => c.obj(`${name}[${i}]`, x) ?? {});

  const rockets = list('rockets');
  rockets.forEach((r, i) => {
    const p = `rockets[${i}]`;
    c.str(`${p}.id`, r.id); c.str(`${p}.name`, r.name);
    c.num(`${p}.payloadToLeoKg`, r.payloadToLeoKg, 1);
    c.num(`${p}.costMusd`, r.costMusd, 0);
    c.num(`${p}.handling`, r.handling, 0.01);
    const stageIds = new Set<string>();
    c.arr(`${p}.stages`, r.stages, 1).forEach((s, j) => {
      const so = c.obj(`${p}.stages[${j}]`, s);
      if (!so) return;
      const id = c.str(`${p}.stages[${j}].id`, so.id);
      if (stageIds.has(id)) c.fail(`${p}.stages[${j}].id`, `duplikat "${id}"`);
      stageIds.add(id);
      c.str(`${p}.stages[${j}].name`, so.name);
      c.num(`${p}.stages[${j}].burnSec`, so.burnSec, 0.001);
    });
  });
  c.uniqueIds('rockets', rockets);

  const modules = list('modules');
  modules.forEach((m, i) => {
    const p = `modules[${i}]`;
    c.str(`${p}.id`, m.id); c.str(`${p}.name`, m.name);
    c.num(`${p}.massKg`, m.massKg, 0); c.num(`${p}.costMusd`, m.costMusd, 0);
    const kind = c.oneOf(`${p}.kind`, m.kind, MODULE_KINDS);
    const stats = c.obj(`${p}.stats`, m.stats);
    if (kind && stats) {
      for (const key of REQUIRED_STATS[kind]) c.num(`${p}.stats.${key}`, stats[key], 0);
    }
  });
  c.uniqueIds('modules', modules);

  const instruments = list('instruments');
  instruments.forEach((x, i) => {
    const p = `instruments[${i}]`;
    c.str(`${p}.id`, x.id); c.str(`${p}.name`, x.name);
    c.num(`${p}.massKg`, x.massKg, 0); c.num(`${p}.powerW`, x.powerW, 0);
    c.num(`${p}.costMusd`, x.costMusd, 0); c.num(`${p}.dataUnits`, x.dataUnits, 0);
    c.str(`${p}.minigameId`, x.minigameId);
  });
  const instrumentIds = c.uniqueIds('instruments', instruments);
  const minigameIds = new Set(instruments.map((x) => x.minigameId).filter((v): v is string => typeof v === 'string'));

  const events = list('events');
  events.forEach((e, i) => {
    const p = `events[${i}]`;
    c.str(`${p}.id`, e.id); c.str(`${p}.title`, e.title); c.str(`${p}.description`, e.description);
    c.str(`${p}.destinationId`, e.destinationId);
    c.oneOf(`${p}.phase`, e.phase, ['flight', 'surface'] as const);
    c.num(`${p}.weight`, e.weight, 0.001);
    c.arr(`${p}.choices`, e.choices, 1).forEach((ch, j) => {
      const co = c.obj(`${p}.choices[${j}]`, ch);
      if (!co) return;
      c.str(`${p}.choices[${j}].label`, co.label);
      c.num(`${p}.choices[${j}].failChance`, co.failChance, 0, 1);
      checkEffects(c, `${p}.choices[${j}].effects`, co.effects);
      checkEffects(c, `${p}.choices[${j}].failEffects`, co.failEffects);
      if (co.minigameId !== undefined) {
        c.str(`${p}.choices[${j}].minigameId`, co.minigameId);
        if (typeof co.minigameId === 'string' && !EVENT_MINIGAMES.includes(co.minigameId)) {
          c.fail(`${p}.choices[${j}].minigameId`, `minigame event "${co.minigameId}" tidak dikenal`);
        }
      }
    });
  });
  const eventIds = c.uniqueIds('events', events);

  const destinations = list('destinations');
  const destinationIds = c.uniqueIds('destinations', destinations);
  destinations.forEach((d, i) => {
    const p = `destinations[${i}]`;
    c.str(`${p}.id`, d.id); c.str(`${p}.name`, d.name); c.bool(`${p}.mvp`, d.mvp);
    c.num(`${p}.gravity`, d.gravity, 0.01); c.num(`${p}.solarIrradianceWm2`, d.solarIrradianceWm2, 0);
    c.num(`${p}.deltaVKmS`, d.deltaVKmS, 0.001); c.num(`${p}.budgetMusd`, d.budgetMusd, 1);
    c.arr(`${p}.palette`, d.palette, 2).forEach((col, j) => {
      if (typeof col !== 'string' || !HEX_COLOR.test(col)) c.fail(`${p}.palette[${j}]`, 'harus warna hex #rrggbb');
    });
    const objIds = new Set<string>();
    c.arr(`${p}.objectives`, d.objectives, 1).forEach((o, j) => {
      const oo = c.obj(`${p}.objectives[${j}]`, o);
      if (!oo) return;
      const id = c.str(`${p}.objectives[${j}].id`, oo.id);
      if (objIds.has(id)) c.fail(`${p}.objectives[${j}].id`, `duplikat "${id}"`);
      objIds.add(id);
      c.str(`${p}.objectives[${j}].title`, oo.title);
      c.bool(`${p}.objectives[${j}].required`, oo.required);
      if (oo.instrumentId !== undefined && !instrumentIds.has(oo.instrumentId as string)) {
        c.fail(`${p}.objectives[${j}].instrumentId`, `instrumen "${String(oo.instrumentId)}" tidak ada di instruments.json`);
      }
    });
    c.arr(`${p}.eventIds`, d.eventIds).forEach((id, j) => {
      const ev = events.find((e) => e.id === id);
      if (!eventIds.has(id as string) || !ev) c.fail(`${p}.eventIds[${j}]`, `event "${String(id)}" tidak ada di events.json`);
      else if (ev.destinationId !== ANY && ev.destinationId !== d.id) c.fail(`${p}.eventIds[${j}]`, `event "${String(id)}" milik destinasi lain`);
    });
    c.arr(`${p}.minigameIds`, d.minigameIds).forEach((id, j) => {
      if (!minigameIds.has(id as string)) c.fail(`${p}.minigameIds[${j}]`, `minigame "${String(id)}" tidak dipakai instrumen mana pun`);
    });
  });
  events.forEach((e, i) => {
    if (e.destinationId !== ANY && typeof e.destinationId === 'string' && !destinationIds.has(e.destinationId)) {
      c.fail(`events[${i}].destinationId`, `destinasi "${e.destinationId}" tidak ada di destinations.json`);
    }
  });

  const dialogs = list('dialogs');
  dialogs.forEach((d, i) => {
    c.str(`dialogs[${i}].id`, d.id); c.str(`dialogs[${i}].text`, d.text);
    c.oneOf(`dialogs[${i}].speaker`, d.speaker, DIALOG_SPEAKERS);
  });
  c.uniqueIds('dialogs', dialogs);

  if (c.issues.length > 0) throw new DataValidationError(c.issues);
  return { rockets, modules, instruments, destinations, events, dialogs } as unknown as Catalog;
}
