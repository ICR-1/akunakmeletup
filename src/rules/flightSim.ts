import { FLIGHT, LAUNCH_FAIL_QUALITY, STAGING } from '../core/constants';
import { createRng, type Rng } from '../core/rng';
import { resolveAssembly } from './catalog';
import { dryMassKg, initialMassKg } from './mass';
import { dvRequiredMs, engineIsp, engineThrustN } from './deltav';
import {
  altitudeKmAt, angleQuality, classifyTouchdown, createLanding, guidePitchDeg, headingDeviation01,
  resolveTransfer, rollInstrumentLoss, stepLanding, type LandingParams, type LandingState,
  type TransferResult,
} from './flightPhysics';
import { clamp } from './margin';
import type { FlightSummary, ReviewCode, TouchdownOutcome } from './missionResult';
import { preflight } from './preflight';
import {
  accelFactor, activeStageIndex, createStaging, errorFraction, flightQuality, handlingEff,
  oldestDepletedIndex, stepStaging, type StagingEvent, type StagingState,
} from './staging';
import type { Catalog, Id, MissionConfig, Rocket } from './types';

export type FlightPhase = 'launch' | 'orbit' | 'transfer' | 'capture' | 'landing' | 'ended';

export interface FlightInput {
  /** Laju perubahan throttle: +1 (W) naik, -1 (S) turun. */
  throttle: number;
  /** +1 = hidung turun ke cakrawala. */
  pitch: number;
  yaw: number;
  /** -1 (A) kiri, +1 (D) kanan. */
  roll: number;
  /** Tombol F (satu kali per penekanan). */
  jettison: boolean;
  boost: boolean;
  precision: boolean;
}

export const NO_INPUT: FlightInput = { throttle: 0, pitch: 0, yaw: 0, roll: 0, jettison: false, boost: false, precision: false };

export type FlightEvent =
  | StagingEvent
  | { type: 'fairing' }
  | { type: 'phase'; phase: FlightPhase }
  | { type: 'burn_complete'; result: TransferResult }
  | { type: 'touchdown'; outcome: TouchdownOutcome }
  | { type: 'rocket_crash'; altitudeKm: number }
  | { type: 'ended'; failed: boolean };

export interface FlightSimConfig {
  rocket: Rocket;
  m0Kg: number;
  mfKg: number;
  ispS: number;
  thrustN: number;
  dvRequiredMs: number;
  gravity: number;
  instrumentIds: Id[];
  tightMargin: boolean;
  seed: number;
}

export function createFlightSimConfig(config: MissionConfig, catalog: Catalog): FlightSimConfig {
  const a = resolveAssembly(config, catalog);
  return {
    rocket: a.rocket, m0Kg: initialMassKg(a), mfKg: dryMassKg(a), ispS: engineIsp(a), thrustN: engineThrustN(a),
    dvRequiredMs: dvRequiredMs(a), gravity: a.destination.gravity, instrumentIds: [...config.instrumentIds],
    tightMargin: preflight(config, catalog).tightMargin, seed: config.seed,
  };
}

const SEED_SALT = 0x9e3779b9;

/** Simulasi penerbangan murni: peluncuran, orbit parkir, burn transfer, pelepasan tahap terakhir, pendaratan. */
export class FlightSim {
  phase: FlightPhase = 'launch';
  phaseTimeSec = 0;
  elapsedSec = 0;
  throttle = 0;
  staging: StagingState;
  pitchDeg: number = FLIGHT.launchStartPitchDeg;
  progress = 0;
  altitudeKm = 0;
  fairingSeparated = false;
  aimYawDeg = 0;
  aimPitchDeg = 0;
  markerYawDeg = 0;
  markerPitchDeg = 0;
  deviationDeg = 0;
  flightQuality = 1;
  errorFraction = 0;
  transfer: TransferResult | null = null;
  landing: LandingState | null = null;
  touchdown: { outcome: TouchdownOutcome; factor: number } | null = null;
  instrumentsLost: Id[] = [];
  failCodes: ReviewCode[] = [];
  /** Penyesuaian delta-v dari event penerbangan (m/s). */
  dvAdjustMs = 0;
  eventsHandledWell = 0;
  handledEventIds: Id[] = [];

  private readonly rng: Rng;
  /** Kecepatan jatuh roket saat mesin mati di udara (porsi lintasan peluncuran per detik). */
  fallSpeed01 = 0;
  /** Roket jatuh dan menghantam landasan saat peluncuran (misi gagal). */
  crashed = false;
  private errSum = 0;
  private errTime = 0;
  private devSum = 0;
  private thrustTime = 0;
  private driftVel = 0;
  private markerVelYaw = 0;
  private markerVelPitch = 0;
  private readonly lastStage: number;
  private readonly nonLastBurnTotal: number;

  constructor(readonly cfg: FlightSimConfig) {
    this.rng = createRng((cfg.seed ^ SEED_SALT) >>> 0);
    this.staging = createStaging(cfg.rocket.stages.map((s) => s.burnSec));
    this.lastStage = cfg.rocket.stages.length - 1;
    this.nonLastBurnTotal = cfg.rocket.stages.slice(0, this.lastStage).reduce((s, st) => s + st.burnSec, 0);
  }

  get handling(): number {
    return handlingEff(this.cfg.rocket.handling, this.staging.jettisoned);
  }

  get ended(): boolean {
    return this.phase === 'ended';
  }

  get failed(): boolean {
    return this.failCodes.some((c) => c === 'LAUNCH_FAIL' || c === 'LOW_FUEL' || c === 'CRASH_LANDING');
  }

  /** Roket sedang jatuh: sudah lepas landas tetapi thrust di bawah ambang (W tidak ditahan) atau masih meluncur turun. */
  get falling(): boolean {
    return this.phase === 'launch' && this.progress > 0 && (this.throttle < FLIGHT.fall.holdThrottle || this.fallSpeed01 > 0);
  }

  /** Ada tahap habis yang belum dilepas (prompt [F] JETTISON STAGE). */
  get jettisonPrompt(): boolean {
    return oldestDepletedIndex(this.staging) >= 0;
  }

  /**
   * Bahan bakar wahana (kg) yang ditampilkan: penuh selama peluncuran dan orbit (digerakkan roket, PRD 14),
   * turun sebanding kemajuan burn transfer menuju perkiraan sisa, lalu sisa akhir setelah burn.
   * Murni tampilan; hasil misi tetap dari `resolveTransfer`.
   */
  get fuelDisplayKg(): number {
    const full = Math.max(0, this.cfg.m0Kg - this.cfg.mfKg);
    if (this.transfer) return this.transfer.fuelRemainingKg;
    if (this.phase !== 'transfer') return full;
    const last = this.staging.stages[this.lastStage];
    const burned = clamp(1 - last.burnRemainingSec / this.cfg.rocket.stages[this.lastStage].burnSec, 0, 1);
    const dev01 = this.thrustTime > 0 ? headingDeviation01(this.devSum / this.thrustTime) : 0;
    const preview = resolveTransfer(
      { m0Kg: this.cfg.m0Kg, mfKg: this.cfg.mfKg, ispS: this.cfg.ispS, dvRequiredMs: this.cfg.dvRequiredMs, dvAdjustMs: this.dvAdjustMs },
      errorFraction(dev01, this.staging.lateStageCount),
    );
    const target = preview.sufficient ? preview.fuelRemainingKg : 0;
    return full - (full - Math.min(full, target)) * burned;
  }

  get landingParams(): LandingParams {
    return { thrustN: this.cfg.thrustN, ispS: this.cfg.ispS, dryMassKg: this.cfg.mfKg, gravity: this.cfg.gravity };
  }

  private setPhase(phase: FlightPhase, events: FlightEvent[]): void {
    this.phase = phase;
    this.phaseTimeSec = 0;
    events.push({ type: 'phase', phase });
  }

  private end(events: FlightEvent[]): void {
    this.phase = 'ended';
    events.push({ type: 'ended', failed: this.failed });
  }

  private rotationRate(input: FlightInput): number {
    return FLIGHT.rotationRateDegS * this.handling * (input.precision ? FLIGHT.precisionFactor : 1);
  }

  private updateThrottle(input: FlightInput, dt: number): void {
    const rate = FLIGHT.throttleRatePerSec * (input.precision ? FLIGHT.precisionFactor : 1);
    if (input.throttle !== 0) this.throttle = clamp(this.throttle + input.throttle * rate * dt, 0, 1);
    // Peluncuran dan transfer: mesin harus terus didorong (W ditahan); dilepas = throttle turun sendiri.
    else if (this.phase === 'launch' || this.phase === 'transfer') this.throttle = clamp(this.throttle - FLIGHT.throttleDecayPerSec * dt, 0, 1);
  }

  /** Maju satu langkah (dt tetap 1/60). Mengembalikan peristiwa yang terjadi pada langkah ini. */
  step(input: FlightInput, dt: number): FlightEvent[] {
    const events: FlightEvent[] = [];
    if (this.ended) return events;
    this.elapsedSec += dt;
    this.phaseTimeSec += dt;
    this.updateThrottle(input, dt);

    if (this.phase === 'landing') {
      this.stepLandingPhase(input, dt, events);
      return events;
    }

    // Tahap terakhir hanya menyala saat burn transfer; sebelumnya terkunci.
    const active = activeStageIndex(this.staging);
    const burning = this.phase === 'launch' || this.phase === 'transfer';
    const lockedLast = active === this.lastStage && this.phase !== 'transfer';
    // Di bawah ambang angkat saat peluncuran, mesin belum cukup kuat sehingga bar tahap tidak terpakai.
    const underLift = this.phase === 'launch' && this.throttle < FLIGHT.fall.holdThrottle;
    const stagingThrottle = burning && !lockedLast && !underLift ? this.throttle * accelFactor(this.staging) : 0;
    const res = stepStaging(this.staging, dt, stagingThrottle, input.jettison);
    this.staging = res.state;
    events.push(...res.events);

    switch (this.phase) {
      case 'launch': this.stepLaunch(input, dt, events); break;
      case 'orbit': this.stepOrbit(input, dt, events); break;
      case 'transfer': this.stepTransfer(input, dt, events, res.events); break;
      case 'capture': this.stepCapture(res.events, events); break;
    }
    return events;
  }

  private consumedNonLast(): number {
    return this.staging.stages.slice(0, this.lastStage).reduce((s, st, i) => s + this.cfg.rocket.stages[i].burnSec - st.burnRemainingSec, 0);
  }

  private stepLaunch(input: FlightInput, dt: number, events: FlightEvent[]): void {
    // Roket tegak dan terkunci selama masih di landasan/dekat tanah; pitch baru bisa diatur setelah lepas landas.
    if (this.progress >= FLIGHT.pitchUnlockProgress) {
      this.pitchDeg = clamp(this.pitchDeg - input.pitch * this.rotationRate(input) * dt, 0, FLIGHT.maxPitchDeg);
    }
    const burnProgress = this.nonLastBurnTotal > 0 ? clamp(this.consumedNonLast() / this.nonLastBurnTotal, 0, 1) : 1;
    if (this.stepAltitude(burnProgress, dt)) {
      this.failCodes.push('LAUNCH_FAIL');
      this.crashed = true;
      events.push({ type: 'rocket_crash', altitudeKm: 0 });
      this.throttle = 0;
      this.end(events);
      return;
    }
    this.altitudeKm = altitudeKmAt(this.progress);
    this.errSum += Math.abs(this.pitchDeg - guidePitchDeg(this.progress)) * dt;
    this.errTime += dt;
    if (!this.fairingSeparated && this.altitudeKm >= STAGING.fairingSeparationAltitudeKm) {
      this.fairingSeparated = true;
      events.push({ type: 'fairing' });
    }
    if (this.progress >= 1) {
      this.throttle = 0;
      this.setPhase('orbit', events);
    }
  }

  /**
   * Ketinggian peluncuran: mengikuti bahan bakar tahap yang terpakai selama thrust di atas ambang; di bawah ambang
   * roket jatuh makin cepat, dan menyentuh tanah (setelah sempat lepas landas) berarti jatuh. Mengembalikan true saat jatuh.
   */
  private stepAltitude(burnProgress: number, dt: number): boolean {
    const F = FLIGHT.fall;
    if (this.throttle >= F.holdThrottle) {
      this.fallSpeed01 = Math.max(0, this.fallSpeed01 - F.recoverPerSec * dt);
      if (this.fallSpeed01 > 0) this.progress = Math.max(0, this.progress - this.fallSpeed01 * dt);
      else this.progress += Math.min(Math.max(0, burnProgress - this.progress), Math.max(F.climbPerSec * dt, 0));
      // Tanpa defisit (penerbangan normal) ketinggian mengikuti kemajuan bahan bakar persis
      if (this.fallSpeed01 === 0 && burnProgress - this.progress < F.climbPerSec * dt) this.progress = Math.max(this.progress, burnProgress);
      return false;
    }
    if (this.progress <= 0) {
      this.fallSpeed01 = 0;
      return false;
    }
    this.fallSpeed01 += F.accel * dt;
    this.progress = Math.max(0, this.progress - this.fallSpeed01 * dt);
    return this.progress <= 0;
  }

  private stepOrbit(input: FlightInput, dt: number, events: FlightEvent[]): void {
    this.driftVel = clamp(
      this.driftVel + (this.rng() - 0.5) * 2 * FLIGHT.orbitDriftAccel * dt,
      -FLIGHT.orbitDriftMaxSpeed, FLIGHT.orbitDriftMaxSpeed,
    );
    this.pitchDeg = clamp(this.pitchDeg + this.driftVel * dt - input.pitch * this.rotationRate(input) * dt, 0, FLIGHT.maxPitchDeg);
    this.errSum += Math.abs(this.pitchDeg - guidePitchDeg(1)) * dt;
    this.errTime += dt;
    if (this.phaseTimeSec < FLIGHT.orbitParkSec) return;

    const meanErr = this.errTime > 0 ? this.errSum / this.errTime : 0;
    this.flightQuality = flightQuality(angleQuality(meanErr), this.staging.lateStageCount);
    if (this.flightQuality < LAUNCH_FAIL_QUALITY) {
      this.failCodes.push('LAUNCH_FAIL');
      this.end(events);
      return;
    }
    this.throttle = 0;
    this.setPhase('transfer', events);
  }

  /** Kecepatan acak penanda prograde, ditarik pelan ke tengah agar tidak menempel di batas. */
  private driftMarker(vel: number, pos: number, dt: number): number {
    const noise = (this.rng() - 0.5) * 2 * FLIGHT.markerAccel;
    return clamp(vel + (noise - FLIGHT.markerRestoring * pos) * dt, -FLIGHT.markerMaxSpeed, FLIGHT.markerMaxSpeed);
  }

  private moveMarker(pos: number, vel: number, dt: number, axis: 'yaw' | 'pitch'): number {
    const next = pos + vel * dt;
    const limit = FLIGHT.markerMaxDeg;
    if (Math.abs(next) <= limit) return next;
    if (axis === 'yaw') this.markerVelYaw = 0;
    else this.markerVelPitch = 0;
    return clamp(next, -limit, limit);
  }

  private stepTransfer(input: FlightInput, dt: number, events: FlightEvent[], stagingEvents: StagingEvent[]): void {
    const rate = this.rotationRate(input);
    this.aimYawDeg += input.yaw * rate * dt;
    this.aimPitchDeg -= input.pitch * rate * dt;
    this.markerVelYaw = this.driftMarker(this.markerVelYaw, this.markerYawDeg, dt);
    this.markerVelPitch = this.driftMarker(this.markerVelPitch, this.markerPitchDeg, dt);
    this.markerYawDeg = this.moveMarker(this.markerYawDeg, this.markerVelYaw, dt, 'yaw');
    this.markerPitchDeg = this.moveMarker(this.markerPitchDeg, this.markerVelPitch, dt, 'pitch');
    this.deviationDeg = Math.hypot(this.aimYawDeg - this.markerYawDeg, this.aimPitchDeg - this.markerPitchDeg);
    this.devSum += this.deviationDeg * this.throttle * dt;
    this.thrustTime += this.throttle * dt;

    if (!stagingEvents.some((e) => e.type === 'depleted' && e.stageIndex === this.lastStage)) return;
    const dev01 = this.thrustTime > 0 ? headingDeviation01(this.devSum / this.thrustTime) : 0;
    this.errorFraction = errorFraction(dev01, this.staging.lateStageCount);
    this.transfer = resolveTransfer(
      { m0Kg: this.cfg.m0Kg, mfKg: this.cfg.mfKg, ispS: this.cfg.ispS, dvRequiredMs: this.cfg.dvRequiredMs, dvAdjustMs: this.dvAdjustMs },
      this.errorFraction,
    );
    this.throttle = 0;
    events.push({ type: 'burn_complete', result: this.transfer });
    if (!this.transfer.sufficient) {
      this.failCodes.push('LOW_FUEL');
      this.end(events);
      return;
    }
    this.setPhase('capture', events);
  }

  private stepCapture(stagingEvents: StagingEvent[], events: FlightEvent[]): void {
    if (!stagingEvents.some((e) => e.type === 'jettison' && e.stageIndex === this.lastStage)) return;
    this.landing = createLanding(this.transfer?.fuelRemainingKg ?? 0);
    this.throttle = 0;
    this.setPhase('landing', events);
  }

  private stepLandingPhase(input: FlightInput, dt: number, events: FlightEvent[]): void {
    if (!this.landing) return;
    this.landing = stepLanding(this.landing, {
      throttle01: this.throttle, rotate: input.roll, boost: input.boost, precision: input.precision,
    }, this.landingParams, dt);
    if (!this.landing.landed) return;

    this.touchdown = classifyTouchdown(this.landing.vy, this.landing.tiltDeg);
    events.push({ type: 'touchdown', outcome: this.touchdown.outcome });
    if (this.touchdown.outcome === 'crash') this.failCodes.push('CRASH_LANDING');
    if (this.touchdown.outcome === 'damaged') {
      this.failCodes.push('DAMAGED_LANDING');
      this.instrumentsLost = rollInstrumentLoss(this.cfg.instrumentIds, this.rng);
    }
    if (this.landing.fuelOut && !this.failCodes.includes('LOW_FUEL')) this.failCodes.push('LOW_FUEL');
    this.end(events);
  }

  /**
   * Terapkan perubahan delta-v dari event penerbangan. Setelah burn selesai, hasil transfer dihitung
   * ulang; jika delta-v tersedia kini kurang dari biaya burn, misi gagal (LOW_FUEL).
   */
  applyDvAdjust(deltaMs: number): FlightEvent[] {
    this.dvAdjustMs += deltaMs;
    const events: FlightEvent[] = [];
    if (this.phase !== 'capture' || !this.transfer) return events;
    this.transfer = resolveTransfer(
      { m0Kg: this.cfg.m0Kg, mfKg: this.cfg.mfKg, ispS: this.cfg.ispS, dvRequiredMs: this.cfg.dvRequiredMs, dvAdjustMs: this.dvAdjustMs },
      this.errorFraction,
    );
    if (!this.transfer.sufficient) {
      this.failCodes.push('LOW_FUEL');
      this.end(events);
    }
    return events;
  }

  /** Ringkasan hasil penerbangan; null jika belum selesai. */
  summary(): FlightSummary | null {
    if (!this.ended) return null;
    const codes = [...this.failCodes];
    if (this.staging.lateStageCount > 0) codes.push('LATE_STAGING');
    if (this.cfg.tightMargin) codes.push('OVER_MARGIN_TIGHT');
    return {
      failed: this.failed,
      failCodes: codes,
      flightQuality: this.flightQuality,
      errorFraction: this.errorFraction,
      lateStageCount: this.staging.lateStageCount,
      touchdown: this.touchdown?.outcome ?? null,
      touchdownFactor: this.touchdown?.factor ?? 0,
      instrumentsLost: this.instrumentsLost,
      fuelRemainingKg: this.landing?.fuelKg ?? this.transfer?.fuelRemainingKg ?? 0,
      eventsHandledWell: this.eventsHandledWell,
      handledEventIds: [...this.handledEventIds],
    };
  }
}
