import { clamp } from './margin';
import { guidePitchDeg } from './flightPhysics';
import { NO_INPUT, type FlightInput, type FlightSim } from './flightSim';

export interface AutopilotOptions {
  /** Tunda penekanan F (detik) setelah tahap habis. */
  fDelaySec?: number;
  skipPitch?: boolean;
  skipLanding?: boolean;
}

/**
 * Pilot otomatis untuk tes dan debugging (mode dev): mengikuti panduan pitch, menjaga penanda
 * prograde, menekan F, dan mendarat dengan pengendali sederhana.
 */
export function makeAutopilot(sim: FlightSim, opts: AutopilotOptions = {}): () => FlightInput {
  const delay = opts.fDelaySec ?? 0;
  let promptSince = -1;
  return (): FlightInput => {
    const input: FlightInput = { ...NO_INPUT };
    if (sim.jettisonPrompt) {
      if (promptSince < 0) promptSince = sim.elapsedSec;
      if (sim.elapsedSec - promptSince >= delay) {
        input.jettison = true;
        promptSince = -1;
      }
    } else promptSince = -1;
    switch (sim.phase) {
      case 'launch':
        input.throttle = 1;
        if (!opts.skipPitch) input.pitch = clamp(sim.pitchDeg - guidePitchDeg(sim.progress), -1, 1);
        break;
      case 'orbit':
        if (!opts.skipPitch) input.pitch = clamp(sim.pitchDeg, -1, 1);
        break;
      case 'transfer':
        input.throttle = 1;
        input.yaw = clamp(sim.markerYawDeg - sim.aimYawDeg, -1, 1);
        input.pitch = clamp(sim.aimPitchDeg - sim.markerPitchDeg, -1, 1);
        break;
      case 'landing': {
        if (opts.skipLanding || !sim.landing) break;
        const l = sim.landing;
        const mass = sim.cfg.mfKg + l.fuelKg;
        const targetVy = -(1 + 0.02 * l.altitudeM);
        const wantAccel = 2 * (targetVy - l.vy);
        const want = clamp(((wantAccel + sim.cfg.gravity) * mass) / sim.cfg.thrustN, 0, 1);
        input.throttle = clamp((want - sim.throttle) * 60, -1, 1);
        input.roll = clamp(-l.tiltDeg, -1, 1);
        break;
      }
    }
    return input;
  };
}
