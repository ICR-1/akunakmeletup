export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  private mouseDX = 0;
  private mouseDY = 0;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F3'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    target.addEventListener('keyup', (e) => this.down.delete(e.code));
    target.addEventListener('blur', () => this.down.clear());
    target.addEventListener('mousemove', (e) => {
      // Gerakan mouse hanya dipakai saat pointer terkunci (klik pada canvas).
      if (!document.pointerLockElement) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True tepat sekali per penekanan (lalu dikonsumsi), aman walau satu frame menjalankan banyak langkah tetap. */
  consumePressed(code: string): boolean {
    return this.pressed.delete(code);
  }

  /** Akumulasi gerak mouse sejak pemanggilan terakhir, lalu direset. */
  consumeMouse(): { dx: number; dy: number } {
    const out = { dx: this.mouseDX, dy: this.mouseDY };
    this.mouseDX = 0;
    this.mouseDY = 0;
    return out;
  }

  /** Buang penekanan dan gerak mouse yang tertunda (dipanggil saat masuk scene baru). */
  clear(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
