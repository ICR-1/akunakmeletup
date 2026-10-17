import { SHAKE } from './constants';
import type { Rng } from './rng';

/** Guncangan kamera "trauma": offset = trauma^2 x maks, meluruh linear; acak lewat RNG berseed. */
export class CameraShake {
  private trauma = 0;

  constructor(private readonly rng: Rng) {}

  get level(): number {
    return this.trauma;
  }

  /** Tambah guncangan sesaat (benturan, ledakan); dijaga maksimal 1. */
  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + Math.max(0, amount));
  }

  /** Tahan guncangan minimal pada level ini (mis. getaran mesin yang berkelanjutan). */
  hold(level: number): void {
    this.trauma = Math.min(1, Math.max(this.trauma, level));
  }

  /** Maju satu langkah dan kembalikan offset kamera [x, y, z] dalam meter. */
  update(dtSec: number): [number, number, number] {
    this.trauma = Math.max(0, this.trauma - SHAKE.decayPerSec * dtSec);
    const k = this.trauma * this.trauma * SHAKE.maxOffset;
    if (k === 0) return [0, 0, 0];
    return [(this.rng() * 2 - 1) * k, (this.rng() * 2 - 1) * k, (this.rng() * 2 - 1) * k * 0.5];
  }
}
