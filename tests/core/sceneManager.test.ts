import { describe, expect, it, vi, type Mock } from 'vitest';
import { SCENE_IDS, type SceneId } from '../../src/core/constants';
import { SceneManager, type GameScene } from '../../src/core/sceneManager';

function fake(id: SceneId): GameScene & { enter: Mock; exit: Mock } {
  return { id, enter: vi.fn(), exit: vi.fn(), update: vi.fn(), render: vi.fn(), resize: vi.fn() };
}

describe('SceneManager', () => {
  it('berpindah di antara lima scene dan memanggil enter/exit berurutan', () => {
    const m = new SceneManager();
    const scenes = SCENE_IDS.map(fake);
    scenes.forEach((s) => m.register(s));
    const seen: SceneId[] = [];
    m.onChange = (id) => seen.push(id);
    SCENE_IDS.forEach((id) => m.switchTo(id));
    expect(seen).toEqual([...SCENE_IDS]);
    expect(scenes[0].exit).toHaveBeenCalledTimes(1);
    expect(scenes[4].exit).not.toHaveBeenCalled();
    expect(m.current).toBe('review');
  });
  it('hanya scene aktif yang di-update', () => {
    const m = new SceneManager();
    const a = fake('briefing');
    const b = fake('design');
    m.register(a);
    m.register(b);
    m.switchTo('design');
    m.update(1 / 60);
    expect(b.update).toHaveBeenCalledWith(1 / 60);
    expect(a.update).not.toHaveBeenCalled();
  });
  it('scene tak terdaftar menghasilkan error jelas', () => {
    expect(() => new SceneManager().switchTo('flight')).toThrow(/tidak terdaftar/);
  });
});
