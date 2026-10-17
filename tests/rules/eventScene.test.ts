import { describe, expect, it } from 'vitest';
import eventsJson from '../../data/events.json';
import { EVENT_SCENE } from '../../src/core/constants';
import { EVENT_SCENE_UI } from '../../src/core/strings';
import { cinematicK, eventSceneFor, planMeteors } from '../../src/rules/eventScene';

const ids = (eventsJson as unknown as { events?: { id: string }[] } | { id: string }[]);
const list: { id: string }[] = Array.isArray(ids) ? ids : (ids.events ?? []);

describe('adegan animasi event', () => {
  it('setiap event di data punya adegan, lama intro wajar, dan keterangan berbahasa Indonesia', () => {
    expect(list.length).toBeGreaterThanOrEqual(9);
    for (const e of list) {
      const spec = eventSceneFor(e.id);
      expect(spec, e.id).not.toBeNull();
      expect(spec!.introSec).toBeGreaterThanOrEqual(2);
      expect(spec!.introSec).toBeLessThanOrEqual(8);
      expect(EVENT_SCENE_UI[e.id], e.id).toBeTruthy();
    }
  });

  it('event tak dikenal tidak punya adegan (dan nama prototipe objek tidak bocor)', () => {
    expect(eventSceneFor('ev_tidak_ada')).toBeNull();
    expect(eventSceneFor('toString')).toBeNull();
    expect(eventSceneFor('__proto__')).toBeNull();
  });

  it('jadwal meteor deterministik berdasarkan seed, terurut, dan dalam batas', () => {
    const M = EVENT_SCENE.meteors;
    const a = planMeteors(42, M.count, 4, M.minDistM, M.maxDistM);
    const b = planMeteors(42, M.count, 4, M.minDistM, M.maxDistM);
    expect(a).toEqual(b);
    expect(planMeteors(43, M.count, 4, M.minDistM, M.maxDistM)).not.toEqual(a);
    expect(a).toHaveLength(M.count);
    for (let i = 0; i < a.length; i++) {
      const m = a[i];
      expect(m.delaySec).toBeGreaterThanOrEqual(0);
      expect(m.delaySec).toBeLessThanOrEqual(4);
      expect(m.fallSec).toBeGreaterThanOrEqual(M.fallSecMin);
      expect(m.fallSec).toBeLessThanOrEqual(M.fallSecMax);
      const d = Math.hypot(m.dx, m.dz);
      expect(d).toBeGreaterThanOrEqual(M.minDistM - 1e-9);
      expect(d).toBeLessThanOrEqual(M.maxDistM + 1e-9);
      if (i > 0) expect(m.delaySec).toBeGreaterThanOrEqual(a[i - 1].delaySec);
    }
  });

  it('bilah sinematik masuk, penuh di tengah, lalu keluar', () => {
    expect(cinematicK(0, 5)).toBe(0);
    expect(cinematicK(5, 5)).toBe(0);
    expect(cinematicK(EVENT_SCENE.barFadeSec / 2, 5)).toBeCloseTo(0.5, 6);
    expect(cinematicK(2.5, 5)).toBe(1);
    expect(cinematicK(5 - EVENT_SCENE.barFadeSec / 2, 5)).toBeCloseTo(0.5, 6);
    expect(cinematicK(1, 0)).toBe(0);
  });
});
