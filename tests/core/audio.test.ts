import { describe, expect, it } from 'vitest';
import { AudioEngine } from '../../src/core/audio';

class FakeParam {
  value = 0;
  calls: string[] = [];
  setValueAtTime(v: number): void { this.value = v; this.calls.push('set'); }
  exponentialRampToValueAtTime(): void { this.calls.push('ramp'); }
  setTargetAtTime(v: number): void { this.value = v; this.calls.push('target'); }
  cancelScheduledValues(): void { this.calls.push('cancel'); }
}
class FakeNode {
  connect<T>(n: T): T { return n; }
  disconnect(): void { /* kosong */ }
}
class FakeGain extends FakeNode { gain = new FakeParam(); }
class FakeOsc extends FakeNode {
  frequency = new FakeParam(); type = 'sine'; started = false; stopped = false;
  start(): void { this.started = true; }
  stop(): void { this.stopped = true; }
}
class FakeFilter extends FakeNode { frequency = new FakeParam(); type = 'lowpass'; }
class FakeSource extends FakeNode { buffer: unknown = null; loop = false; started = false; stopped = false; start(): void { this.started = true; } stop(): void { this.stopped = true; } }

class FakeContext {
  currentTime = 0; sampleRate = 8000; state = 'running'; destination = new FakeNode();
  gains: FakeGain[] = []; oscs: FakeOsc[] = []; sources: FakeSource[] = [];
  createGain(): FakeGain { const g = new FakeGain(); this.gains.push(g); return g; }
  createOscillator(): FakeOsc { const o = new FakeOsc(); this.oscs.push(o); return o; }
  createBiquadFilter(): FakeFilter { return new FakeFilter(); }
  createBufferSource(): FakeSource { const s = new FakeSource(); this.sources.push(s); return s; }
  createBuffer(_c: number, length: number): { getChannelData: () => Float32Array } { const d = new Float32Array(length); return { getChannelData: () => d }; }
  resume(): Promise<void> { return Promise.resolve(); }
}

const make = () => {
  const ctx = new FakeContext();
  const engine = new AudioEngine(() => ctx as unknown as AudioContext);
  return { ctx, engine };
};

describe('AudioEngine', () => {
  it('aman dipanggil sebelum unlock: semua metode tidak melempar', () => {
    const e = new AudioEngine(() => null);
    expect(() => {
      e.click(); e.blip(); e.beep(); e.ping(); e.alarm(); e.stageSeparation(); e.touchdown(); e.footstep(); e.jingle(true); e.jingle(false);
      e.setEngine(0.5); e.setRover(0.5); e.roverDoor(true); e.explosion(); e.setAmbient('mars', 0.5); e.setStatic(0.5); e.stopLoops(); e.setMuted(true); e.setVolume(0.2); e.unlock();
    }).not.toThrow();
    expect(e.ready).toBe(false);
  });
  it('unlock membuat konteks dan master gain bervolume awal', () => {
    const { ctx, engine } = make();
    engine.unlock();
    expect(engine.ready).toBe(true);
    expect(ctx.gains[0].gain.value).toBeCloseTo(0.7, 10);
  });
  it('mute berlaku seketika dan unmute memulihkan volume', () => {
    const { ctx, engine } = make();
    engine.unlock();
    engine.setVolume(0.5);
    engine.setMuted(true);
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(engine.isMuted).toBe(true);
    engine.setMuted(false);
    expect(ctx.gains[0].gain.value).toBeCloseTo(0.5, 10);
  });
  it('mute atau volume yang diatur sebelum unlock tetap berlaku setelah unlock', () => {
    const { ctx, engine } = make();
    engine.setMuted(true);
    engine.setVolume(0.3);
    engine.unlock();
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(engine.currentVolume).toBeCloseTo(0.3, 10);
  });
  it('volume dijaga 0-1', () => {
    const { engine } = make();
    engine.setVolume(5);
    expect(engine.currentVolume).toBe(1);
    engine.setVolume(-1);
    expect(engine.currentVolume).toBe(0);
  });
  it('efek singkat membuat dan menjalankan osilator', () => {
    const { ctx, engine } = make();
    engine.unlock();
    engine.click();
    engine.jingle(true);
    expect(ctx.oscs.length).toBe(1 + 4);
    expect(ctx.oscs.every((o) => o.started && o.stopped)).toBe(true);
  });
  it('suara mesin: menyala saat throttle > 0, berhenti saat 0, dan satu loop dipakai ulang', () => {
    const { ctx, engine } = make();
    engine.unlock();
    engine.setEngine(0.4);
    engine.setEngine(0.9);
    const loops = ctx.sources.filter((s) => s.loop);
    expect(loops).toHaveLength(1);
    expect(loops[0].started).toBe(true);
    engine.setEngine(0);
    expect(loops[0].stopped).toBe(true);
  });
  it('suara Lunar Cruiser: menyala saat mengemudi, mengikuti kecepatan, berhenti saat null atau stopLoops', () => {
    const { ctx, engine } = make();
    engine.unlock();
    engine.setRover(0);
    engine.setRover(1);
    const loops = ctx.sources.filter((s) => s.loop);
    expect(loops).toHaveLength(1);
    expect(ctx.oscs).toHaveLength(1);
    expect(ctx.oscs[0].started).toBe(true);
    engine.setRover(null);
    expect(loops[0].stopped).toBe(true);
    expect(ctx.oscs[0].stopped).toBe(true);
    engine.setRover(0.5);
    expect(ctx.sources.filter((s) => s.loop)).toHaveLength(2);
    engine.stopLoops();
    expect(ctx.sources.filter((s) => s.loop)[1].stopped).toBe(true);
  });
  it('pintu Lunar Cruiser membuat bunyi singkat (masuk dan keluar) dan aman sebelum unlock', () => {
    expect(() => new AudioEngine(() => null).roverDoor(true)).not.toThrow();
    const { ctx, engine } = make();
    engine.unlock();
    engine.roverDoor(true);
    engine.roverDoor(false);
    expect(ctx.oscs.length).toBe(4);
    expect(ctx.oscs.every((o) => o.started && o.stopped)).toBe(true);
  });
  it('ledakan membuat nada rendah dan semburan noise tanpa melempar', () => {
    const { ctx, engine } = make();
    engine.unlock();
    engine.explosion();
    expect(ctx.oscs.length).toBe(2);
    expect(ctx.oscs.every((o) => o.started && o.stopped)).toBe(true);
  });
  it('ambient berganti per destinasi dan dihentikan oleh stopLoops', () => {
    const { ctx, engine } = make();
    engine.unlock();
    engine.setAmbient('moon');
    engine.setAmbient('mars', 0.4);
    const loops = ctx.sources.filter((s) => s.loop);
    expect(loops).toHaveLength(2);
    expect(loops[0].stopped).toBe(true);
    engine.stopLoops();
    expect(loops[1].stopped).toBe(true);
    expect(ctx.oscs.every((o) => o.stopped)).toBe(true);
  });
  it('statik radio hanya saat sinyal lemah', () => {
    const { ctx, engine } = make();
    engine.unlock();
    engine.setStatic(0.5);
    const loop = ctx.sources.find((s) => s.loop)!;
    engine.setStatic(0);
    expect(loop.stopped).toBe(true);
  });
});
