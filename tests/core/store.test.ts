import { describe, expect, it, vi } from 'vitest';
import { createGameStore, createStore } from '../../src/core/store';

describe('store', () => {
  it('set menggabungkan patch dan memberi tahu subscriber', () => {
    const s = createStore({ a: 1, b: 2 });
    const fn = vi.fn();
    s.subscribe(fn);
    s.set({ a: 5 });
    expect(s.get()).toEqual({ a: 5, b: 2 });
    expect(fn).toHaveBeenCalledWith({ a: 5, b: 2 }, { a: 1, b: 2 });
  });
  it('unsubscribe menghentikan notifikasi', () => {
    const s = createStore({ a: 1 });
    const fn = vi.fn();
    s.subscribe(fn)();
    s.set({ a: 2 });
    expect(fn).not.toHaveBeenCalled();
  });
  it('game store dimulai di briefing dengan MissionConfig berseed', () => {
    const g = createGameStore().get();
    expect(g.currentScene).toBe('briefing');
    expect(g.mission.seed).toBeTypeOf('number');
  });
  it('mode permainan default adalah Cerita dan bisa diganti', () => {
    const s = createGameStore();
    expect(s.get().mode).toBe('story');
    s.set({ mode: 'free' });
    expect(s.get().mode).toBe('free');
  });
});
