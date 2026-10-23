import { FLIGHT } from '../core/constants';
import { FLIGHT_UI } from '../core/strings';
import { guidePitchDeg } from '../rules/flightPhysics';
import type { FlightSim } from '../rules/flightSim';
import type { FlightSummary } from '../rules/missionResult';
import type { Rocket } from '../rules/types';
import { clear, el } from './dom';
import { renderKeyHints } from './keyHints';
import { attachTooltip } from './tooltip';
import type { GlossaryKey } from './tooltip';

const RETICLE_HALF_PX = 62;
const SPEED_BAR_MAX = 20;

interface StageRow { row: HTMLElement; fill: HTMLElement }

/** HUD kokpit minimalis: diagram tahap, telemetri, prompt F, dan panduan per fase. */
export class FlightHud {
  private readonly stageRows: StageRow[] = [];
  private readonly message = el('div', 'hud-message');
  private readonly phase = el('div', 'hud-phase');
  private readonly prompt = el('div', 'hud-prompt');
  private readonly values: Record<string, HTMLElement> = {};
  private readonly throttleFill = el('div', 'bar-fill');
  private readonly pitchGauge = el('div', 'gauge gauge-pitch');
  private readonly pitchNow = el('div', 'gauge-now');
  private readonly pitchGuide = el('div', 'gauge-guide');
  private readonly reticle = el('div', 'gauge gauge-reticle');
  private readonly reticleMarker = el('div', 'reticle-marker');
  private readonly reticleAim = el('div', 'reticle-aim');
  private readonly speedGauge = el('div', 'gauge gauge-speed');
  private readonly speedPointer = el('div', 'speed-pointer');
  private readonly cushionBadge = el('div', 'cushion-badge', 'BANTUAN PENDARATAN AKTIF (< 2 m/s)');
  private readonly result = el('div', 'result-panel');
  private lastFuelStart = 0;

  constructor(ui: HTMLElement, private readonly rocket: Rocket) {
    const root = el('div', 'flight-hud');
    root.append(this.buildTop(), this.buildStages(), this.buildTelemetry(), this.buildBottom(), this.result);
    ui.appendChild(root);
    this.result.hidden = true;
  }

  private buildTop(): HTMLElement {
    const top = el('div', 'hud-top');
    top.append(this.phase, this.message);
    return top;
  }

  private buildStages(): HTMLElement {
    const panel = el('div', 'hud-panel hud-left');
    const lander = el('div', 'stage-row lander-row');
    lander.append(el('span', 'stage-name', FLIGHT_UI.lander));
    panel.appendChild(lander);
    for (let i = this.rocket.stages.length - 1; i >= 0; i--) {
      const row = el('div', 'stage-row');
      row.append(el('span', 'stage-name', `${FLIGHT_UI.stage} ${i + 1}`), el('span', 'stage-sub', this.rocket.stages[i].name));
      const bar = el('div', 'bar');
      const fill = el('div', 'bar-fill');
      bar.appendChild(fill);
      row.appendChild(bar);
      panel.appendChild(row);
      this.stageRows[i] = { row, fill };
    }
    return panel;
  }

  private line(panel: HTMLElement, key: string, label: string, term?: GlossaryKey): void {
    const row = el('div', 'tele-row');
    const value = el('span', 'tele-value', '-');
    const lab = el('span', 'tele-label', label);
    if (term) attachTooltip(lab, term);
    row.append(lab, value);
    panel.appendChild(row);
    this.values[key] = value;
  }

  private buildTelemetry(): HTMLElement {
    const panel = el('div', 'hud-panel hud-right');
    const t = FLIGHT_UI.telemetry;
    this.line(panel, 'alt', t.altitude);
    this.line(panel, 'vy', t.vy);
    this.line(panel, 'vx', t.vx);
    this.line(panel, 'tilt', t.tilt);
    const thr = el('div', 'tele-row');
    const bar = el('div', 'bar');
    bar.appendChild(this.throttleFill);
    this.values.throttle = el('span', 'tele-value', '0%');
    thr.append(el('span', 'tele-label', t.throttle), bar, this.values.throttle);
    panel.appendChild(thr);
    this.line(panel, 'fuel', t.fuel);
    this.line(panel, 'handling', t.handling, 'handling');
    this.line(panel, 'power', t.power);
    this.line(panel, 'signal', t.signal, 'signal');
    this.values.power.textContent = t.powerOk;
    this.values.signal.textContent = t.signalOk;
    return panel;
  }

  private buildBottom(): HTMLElement {
    const bottom = el('div', 'hud-bottom');
    this.pitchGauge.append(el('span', 'gauge-label', FLIGHT_UI.telemetry.pitch), this.pitchGuide, this.pitchNow);
    this.reticle.append(el('div', 'reticle-h'), el('div', 'reticle-v'), this.reticleMarker, this.reticleAim);
    const z1 = el('div', 'speed-zone z1');
    z1.title = 'Zona Sempurna: 0 - 2 m/s';
    const z2 = el('div', 'speed-zone z2');
    z2.title = 'Zona Sukses: 2 - 5 m/s';
    const z3 = el('div', 'speed-zone z3');
    z3.title = 'Zona Kerusakan: 5 - 12 m/s';
    const z4 = el('div', 'speed-zone z4');
    z4.title = 'Zona Hancur: > 12 m/s';
    this.speedGauge.append(z1, z2, z3, z4, this.speedPointer);
    renderKeyHints(this.prompt, FLIGHT_UI.prompt);
    this.prompt.hidden = true;
    this.cushionBadge.hidden = true;
    bottom.append(this.prompt, this.pitchGauge, this.reticle, this.cushionBadge, this.speedGauge);
    return bottom;
  }

  private messageFor(sim: FlightSim): string {
    const m = FLIGHT_UI.messages;
    if (sim.falling) return m.falling;
    if (sim.jettisonPrompt) return m.stageDepleted;
    switch (sim.phase) {
      case 'launch': return sim.throttle <= 0 && sim.progress <= 0 ? m.launchIdle : m.launch;
      case 'orbit': return m.orbit;
      case 'transfer': return m.transfer;
      case 'capture': return m.capture;
      case 'landing': return sim.landingCushionActive ? m.cushionActive : m.landing;
      default: return '';
    }
  }

  /** Sinkronkan seluruh HUD dengan keadaan simulasi (dipanggil sekali per frame). */
  update(sim: FlightSim, suspended = false): void {
    this.phase.textContent = FLIGHT_UI.phases[sim.phase];
    // Saat dialog event terbuka simulasi dibekukan: sembunyikan prompt F agar tidak menyesatkan.
    const msg = suspended ? FLIGHT_UI.messages.eventPending : this.messageFor(sim);
    renderKeyHints(this.message, msg);
    this.message.classList.toggle('alert', (sim.jettisonPrompt || sim.falling) && !suspended);
    this.prompt.hidden = !sim.jettisonPrompt || suspended;

    this.rocket.stages.forEach((s, i) => {
      const st = sim.staging.stages[i];
      const r = this.stageRows[i];
      r.fill.style.width = `${(Math.max(0, st.burnRemainingSec) / s.burnSec) * 100}%`;
      r.row.dataset.state = st.phase;
    });

    this.values.throttle.textContent = `${Math.round(sim.throttle * 100)}%`;
    this.throttleFill.style.width = `${sim.throttle * 100}%`;
    this.values.handling.textContent = sim.handling.toFixed(2);

    const landing = sim.landing;
    const inLanding = sim.phase === 'landing' || (sim.phase === 'ended' && landing);
    if (inLanding && landing) {
      this.values.alt.textContent = `${landing.altitudeM.toFixed(0)} m`;
      this.values.vy.textContent = `${landing.vy.toFixed(1)} m/s`;
      this.values.vx.textContent = `${landing.vx.toFixed(1)} m/s`;
      this.values.tilt.textContent = `${landing.tiltDeg.toFixed(0)}°`;
      this.values.tilt.classList.toggle('bad', Math.abs(landing.tiltDeg) > FLIGHT.touchdown.maxTiltDeg);
      if (this.lastFuelStart === 0) this.lastFuelStart = Math.max(landing.fuelKg, 1);
      this.values.fuel.textContent = `${landing.fuelKg.toFixed(0)} kg`;
      const speed = Math.abs(landing.vy);
      this.values.vy.dataset.zone = speed <= FLIGHT.touchdown.perfectVy ? 'a' : speed <= FLIGHT.touchdown.successVy ? 'b' : speed <= FLIGHT.touchdown.crashVy ? 'c' : 'd';
      this.speedPointer.style.left = `${Math.min(1, speed / SPEED_BAR_MAX) * 100}%`;
    } else {
      this.values.alt.textContent = `${sim.altitudeKm.toFixed(0)} km`;
      this.values.vy.textContent = '-';
      this.values.vx.textContent = '-';
      this.values.tilt.textContent = `${(FLIGHT.launchStartPitchDeg - sim.pitchDeg).toFixed(0)}°`;
      this.values.fuel.textContent = `${sim.fuelDisplayKg.toFixed(0)} kg`;
    }

    const showPitch = sim.phase === 'launch' || sim.phase === 'orbit';
    this.pitchGauge.hidden = !showPitch;
    this.reticle.hidden = sim.phase !== 'transfer';
    this.speedGauge.hidden = !inLanding;
    this.cushionBadge.hidden = !sim.landingCushionActive;
    if (showPitch) {
      const guide = sim.phase === 'orbit' ? guidePitchDeg(1) : guidePitchDeg(sim.progress);
      this.pitchNow.style.left = `${(sim.pitchDeg / FLIGHT.maxPitchDeg) * 100}%`;
      this.pitchGuide.style.left = `${(guide / FLIGHT.maxPitchDeg) * 100}%`;
    }
    if (sim.phase === 'transfer') {
      const px = (deg: number): number => (deg / FLIGHT.markerMaxDeg) * RETICLE_HALF_PX;
      this.reticleMarker.style.transform = `translate(${px(sim.markerYawDeg)}px, ${-px(sim.markerPitchDeg)}px)`;
      this.reticleAim.style.transform = `translate(${px(sim.aimYawDeg)}px, ${-px(sim.aimPitchDeg)}px)`;
      this.values.alt.textContent = `${FLIGHT_UI.telemetry.deviation} ${sim.deviationDeg.toFixed(0)}°`;
    }
  }

  /** Panel hasil di akhir penerbangan; mengembalikan tombol lanjut. */
  showResult(summary: FlightSummary, onContinue: () => void): void {
    clear(this.result);
    const R = FLIGHT_UI.result;
    const title = summary.failed ? R.failed : summary.touchdown ? R[summary.touchdown] : R.failed;
    this.result.dataset.failed = String(summary.failed);
    this.result.appendChild(el('h2', '', title));
    for (const code of summary.failCodes) this.result.appendChild(el('p', 'result-code', FLIGHT_UI.codes[code]));
    if (summary.touchdown) {
      this.result.appendChild(el('p', '', `${R.lost}: ${summary.instrumentsLost.length > 0 ? summary.instrumentsLost.join(', ') : R.none}`));
    }
    const button = el('button', 'launch-button', summary.failed ? R.toReview : R.toSurface);
    button.type = 'button';
    button.addEventListener('click', onContinue);
    this.result.appendChild(button);
    this.result.hidden = false;
  }
}

