import type { SceneId } from './constants';

export type CursorPredicate = () => boolean;

/**
 * Daftar kode tombol gameplay di scene 3D (penerbangan dan permukaan).
 * Menekan tombol ini saat kursor tidak sedang diwajibkan oleh dialog/modal
 * akan otomatis mengunci kembali pointer (smart auto-lock).
 */
export const GAMEPLAY_KEY_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight',
  'KeyE', 'KeyQ', 'KeyR', 'KeyF',
]);

/**
 * Memeriksa apakah target event adalah elemen UI interaktif yang membutuhkan kursor bebas.
 */
export function isInteractiveElement(target: EventTarget | null): boolean {
  if (!target) return false;
  const el = target as { closest?: (selector: string) => Element | null };
  if (typeof el.closest !== 'function') return false;
  return Boolean(
    el.closest(
      'button, input, select, textarea, a, .dialog, .result-panel, .journal-panel, .modal, .settings, [data-interactive]',
    ),
  );
}

/**
 * Smart Auto Toggle Cursor Manager:
 * - Mengunci kursor saat memasuki gameplay 3D (Penerbangan & Permukaan)
 * - Otomatis memunculkan kursor saat dibutuhkan (dialog krisis, minigame, konfirmasi uplink, panel hasil)
 * - Otomatis mengunci kembali begitu dialog/minigame selesai atau saat pemain berinteraksi dengan kontrol gerak (WASD/panah/klik layar)
 * - Mendukung toggle manual instan via tombol Alt atau klik bebas
 */
export class CursorManager {
  private enabled = false;
  private manualUnlocked = false;
  private predicate: CursorPredicate | null = null;
  private readonly canvas: HTMLCanvasElement | null = null;
  private readonly offFns: Array<() => void> = [];

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas ?? null;
    this.setupListeners();
  }

  private setupListeners(): void {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const onPointerLockChange = (): void => {
      if (!this.isLocked && this.enabled) {
        if (!this.isNeededByState()) {
          this.manualUnlocked = true;
        }
      } else if (this.isLocked) {
        this.manualUnlocked = false;
      }
    };

    document.addEventListener('pointerlockchange', onPointerLockChange);
    this.offFns.push(() => document.removeEventListener('pointerlockchange', onPointerLockChange));

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!this.enabled) return;

      // Tombol Alt: smart toggle kursor manual
      if (e.code === 'AltLeft' || e.code === 'AltRight') {
        e.preventDefault();
        this.toggle();
        return;
      }

      // Tombol gameplay: jika kursor sedang bebas tetapi tidak ada dialog/modal,
      // langsung kunci kembali saat pemain mulai bergerak atau mengemudi.
      if (GAMEPLAY_KEY_CODES.has(e.code) && !this.isNeededByState() && !this.isLocked) {
        this.manualUnlocked = false;
        this.lock();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    this.offFns.push(() => window.removeEventListener('keydown', onKeyDown));

    const onClick = (e: MouseEvent): void => {
      if (!this.enabled) return;

      // Jika klik terjadi pada tombol/panel interaktif, biarkan kursor berinteraksi dengan UI.
      if (isInteractiveElement(e.target)) return;

      // Jika klik terjadi pada canvas atau latar kosong dan tidak ada dialog aktif, langsung kunci!
      if (!this.isNeededByState() && !this.isLocked) {
        this.manualUnlocked = false;
        this.lock();
      }
    };

    window.addEventListener('click', onClick, true);
    this.offFns.push(() => window.removeEventListener('click', onClick, true));
  }

  /** Apakah kondisi state gameplay sedang mewajibkan kursor (mis. dialog, modal, minigame, panel hasil). */
  isNeededByState(): boolean {
    if (!this.enabled) return true;
    return this.predicate ? Boolean(this.predicate()) : false;
  }

  /** Apakah kursor sedang dibutuhkan saat ini (baik oleh state game maupun oleh pelepasan manual pemain). */
  isNeeded(): boolean {
    return this.isNeededByState() || this.manualUnlocked;
  }

  /** Status apakah pointer lock sedang aktif di canvas. */
  get isLocked(): boolean {
    if (typeof document === 'undefined' || !this.canvas) return false;
    return document.pointerLockElement === this.canvas;
  }

  /** Apakah manajemen kursor 3D sedang aktif (scene flight atau surface). */
  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Pasang predikat penentu kebutuhan kursor spesifik scene. */
  setPredicate(pred: CursorPredicate | null): void {
    this.predicate = pred;
    if (this.isNeededByState() && this.isLocked) {
      this.unlock();
    }
  }

  /** Aktifkan / nonaktifkan mode 3D (hanya scene flight dan surface yang aktif). */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.manualUnlocked = false;
    if (!enabled) {
      this.predicate = null;
      this.unlock();
    }
  }

  /** Kunci kursor (pointer lock) segera jika tidak sedang dihalangi dialog/modal. */
  lock(): void {
    this.manualUnlocked = false;
    if (!this.enabled || !this.canvas) return;
    if (this.isNeededByState()) return;
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && typeof (p as Promise<void>).catch === 'function') {
        (p as Promise<void>).catch(() => {
          // Menunggu aktivasi pengguna; akan dikunci pada gestur berikutnya
        });
      }
    } catch {
      // Abaikan jika browser membatasi pointer lock tanpa aktivasi pengguna
    }
  }

  /** Buka kursor (exit pointer lock). */
  unlock(manual = false): void {
    if (manual) this.manualUnlocked = true;
    if (typeof document !== 'undefined' && document.pointerLockElement) {
      try {
        document.exitPointerLock?.();
      } catch {
        // Abaikan
      }
    }
  }

  /** Toggle kursor manual (mis. tombol Alt). */
  toggle(): void {
    if (!this.enabled) return;
    if (this.isLocked) {
      this.unlock(true);
    } else {
      this.manualUnlocked = false;
      this.lock();
    }
  }

  /** Tangani perpindahan scene otomatis. */
  onSceneChange(sceneId: SceneId): void {
    const is3dScene = sceneId === 'flight' || sceneId === 'surface';
    this.setEnabled(is3dScene);
    if (is3dScene) {
      this.lock();
    }
  }

  dispose(): void {
    for (const off of this.offFns) off();
    this.offFns.length = 0;
  }
}
