import { describe, expect, it } from 'vitest';
import { FIXED_DT, G0 } from '../../src/core/constants';
import { createRng } from '../../src/core/rng';
import {
  altitudeKmAt, angleQuality, classifyTouchdown, createLanding, guidePitchDeg, resolveTransfer,
  rollInstrumentLoss, rotationRateDegS, stepLanding, type LandingInput, type LandingParams,
} from '../../src/rules/flightPhysics';
import { fuelRemainingKg, transferBurnCostMs, tsiolkovskyDv } from '../../src/rules/deltav';

const hold = (throttle01: number): LandingInput => ({ throttle01, rotate: 0, boost: false, precision: false });
const moonParams: LandingParams = { thrustN: 40000, ispS: 450, dryMassKg: 1048, gravity: 1.62 };

function run(throttle: number, seconds: number, params = moonParams, fuel = 600) {
  let s = createLanding(fuel);
  const steps = Math.round(seconds / FIXED_DT);
  for (let i = 0; i < steps && !s.landed; i++) s = stepLanding(s, hold(throttle), params, FIXED_DT);
  return s;
}

describe('pendaratan dengan throttle konstan', () => {
  it('mulai dari 2000 m dengan vy -60 m/s', () => {
    const s = createLanding(100);
    expect(s.altitudeM).toBe(2000);
    expect(s.vy).toBe(-60);
  });
  it('tanpa thrust: jatuh bebas sesuai gravitasi (vy = -60 - g t)', () => {
    const s = run(0, 5);
    expect(s.vy).toBeCloseTo(-60 - 1.62 * 5, 1);
    expect(s.altitudeM).toBeCloseTo(2000 - 60 * 5 - 0.5 * 1.62 * 25, 0);
    expect(s.fuelKg).toBe(600);
  });
  it('thrust konstan: percepatan = thrust x throttle / massa - gravitasi', () => {
    const heavy: LandingParams = { thrustN: 40000, ispS: 450, dryMassKg: 100000, gravity: 1.62 };
    const s = run(0.5, 4, heavy, 1000);
    const accel = (40000 * 0.5) / (100000 + 1000) - 1.62;
    expect(s.vy).toBeCloseTo(-60 + accel * 4, 1);
  });
  it('massa lebih besar memberi respons lebih lambat (percepatan dan rotasi)', () => {
    const light = run(0.5, 3, { ...moonParams, dryMassKg: 800 }, 100);
    const heavy = run(0.5, 3, { ...moonParams, dryMassKg: 3000 }, 100);
    expect(light.vy).toBeGreaterThan(heavy.vy);
    expect(rotationRateDegS(800)).toBeGreaterThan(rotationRateDegS(3000));
    expect(rotationRateDegS(100)).toBeCloseTo(60 * 1.5, 10);
    expect(rotationRateDegS(1e6)).toBeCloseTo(60 * 0.5, 10);
    expect(rotationRateDegS(2000)).toBeCloseTo(60, 10);
  });
  it('laju bahan bakar = thrust x throttle / (Isp g0) kg per detik', () => {
    const s = run(0.5, 2);
    expect(600 - s.fuelKg).toBeCloseTo(((40000 * 0.5) / (450 * G0)) * 2, 1);
  });
  it('bahan bakar habis: thrust mati, fuelOut menyala, jatuh bebas', () => {
    const s = run(1, 600, moonParams, 1);
    expect(s.fuelOut).toBe(true);
    expect(s.fuelKg).toBe(0);
    expect(s.landed).toBe(true);
    expect(Math.abs(s.vy)).toBeGreaterThan(12);
  });
  it('tanpa thrust mendarat dengan crash; kecepatan sentuh mengikuti fisika', () => {
    const s = run(0, 600);
    expect(s.landed).toBe(true);
    expect(s.altitudeM).toBe(0);
    expect(classifyTouchdown(s.vy, s.tiltDeg).outcome).toBe('crash');
  });
  it('deterministik: input sama menghasilkan keadaan sama', () => {
    expect(run(0.3, 20)).toEqual(run(0.3, 20));
  });
  it('rotasi: A/D mengubah kemiringan, mode presisi lebih halus, dibatasi 90 derajat', () => {
    const turn = (precision: boolean, sec: number) => {
      let s = createLanding(100);
      for (let i = 0; i < Math.round(sec / FIXED_DT); i++) s = stepLanding(s, { throttle01: 0, rotate: 1, boost: false, precision }, moonParams, FIXED_DT);
      return s.tiltDeg;
    };
    expect(turn(false, 0.5)).toBeGreaterThan(turn(true, 0.5));
    expect(turn(false, 100)).toBe(90);
  });
  it('boost samping boros bahan bakar dan menggeser kecepatan horizontal', () => {
    let s = createLanding(100);
    s = stepLanding(s, { throttle01: 0, rotate: 1, boost: false, precision: false }, moonParams, 0.5);
    const base = s;
    const boosted = stepLanding(base, { throttle01: 0, rotate: 0, boost: true, precision: false }, moonParams, 1);
    expect(boosted.fuelKg).toBeLessThan(base.fuelKg);
    expect(boosted.vx).toBeGreaterThan(base.vx);
  });
});

describe('hasil touchdown (PRD 14)', () => {
  it.each([
    [1.9, 10, 'perfect', 1],
    [2, 15, 'perfect', 1],
    [2.1, 10, 'success', 0.7],
    [5, 15, 'success', 0.7],
    [5.1, 10, 'damaged', 0.3],
    [12, 10, 'damaged', 0.3],
    [3, 16, 'damaged', 0.3],
    [1, 40, 'damaged', 0.3],
    [12.01, 0, 'crash', 0],
    [-30, 0, 'crash', 0],
    [-4, -5, 'success', 0.7],
  ] as const)('vy %f tilt %f -> %s', (vy, tilt, outcome, factor) => {
    expect(classifyTouchdown(vy, tilt)).toEqual({ outcome, factor });
  });
  it('instrumen hilang berdasarkan RNG berseed (deterministik)', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    expect(rollInstrumentLoss(ids, createRng(5))).toEqual(rollInstrumentLoss(ids, createRng(5)));
    const lost = rollInstrumentLoss(ids, createRng(5));
    expect(lost.length).toBeLessThan(ids.length);
    let total = 0;
    for (let seed = 0; seed < 400; seed++) total += rollInstrumentLoss(ids, createRng(seed)).length;
    expect(total / (400 * ids.length)).toBeGreaterThan(0.33);
    expect(total / (400 * ids.length)).toBeLessThan(0.47);
  });
});

describe('panduan peluncuran dan burn transfer', () => {
  it('pitch panduan 90 -> 0 dan altitude 0 -> orbit', () => {
    expect(guidePitchDeg(0)).toBe(90);
    expect(guidePitchDeg(1)).toBe(0);
    expect(guidePitchDeg(0.5)).toBeLessThan(90);
    expect(altitudeKmAt(0)).toBe(0);
    expect(altitudeKmAt(1)).toBe(200);
  });
  it('kualitas sudut', () => {
    expect(angleQuality(0)).toBe(1);
    expect(angleQuality(15)).toBeCloseTo(0.5, 10);
    expect(angleQuality(60)).toBe(0);
  });
  it('resolveTransfer sama dengan rumus PRD saat tanpa penyesuaian', () => {
    const p = { m0Kg: 3673, mfKg: 1048, ispS: 450, dvRequiredMs: 5000 };
    const r = resolveTransfer(p, 0.2);
    expect(r.burnCostMs).toBeCloseTo(transferBurnCostMs(5000, 0.2), 10);
    expect(r.sufficient).toBe(true);
    expect(r.fuelRemainingKg).toBeCloseTo(fuelRemainingKg(3673, 1048, r.burnCostMs, 450), 6);
    expect(r.dvAvailableMs).toBeCloseTo(tsiolkovskyDv(450, 3673, 1048), 6);
  });
  it('delta-v kurang menghasilkan sufficient false, penyesuaian event mengurangi sisa', () => {
    const p = { m0Kg: 2098, mfKg: 1048, ispS: 450, dvRequiredMs: 5000 };
    expect(resolveTransfer(p, 0).sufficient).toBe(false);
    const ok = { m0Kg: 3673, mfKg: 1048, ispS: 450, dvRequiredMs: 5000 };
    expect(resolveTransfer({ ...ok, dvAdjustMs: -90 }, 0).fuelRemainingKg).toBeLessThan(resolveTransfer(ok, 0).fuelRemainingKg);
  });
});
