import { describe, expect, it, vi } from 'vitest';
import { CursorManager, GAMEPLAY_KEY_CODES, isInteractiveElement } from '../../src/core/cursor';

describe('CursorManager & Smart Auto Toggle Cursor', () => {
  it('GAMEPLAY_KEY_CODES mencakup seluruh tombol gerak dan interaksi utama', () => {
    const expected = [
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
      'Space', 'ShiftLeft', 'ShiftRight',
      'KeyE', 'KeyQ', 'KeyR', 'KeyF',
    ];
    for (const code of expected) {
      expect(GAMEPLAY_KEY_CODES.has(code)).toBe(true);
    }
  });

  it('isInteractiveElement mengenali elemen UI yang membutuhkan interaksi kursor', () => {
    expect(isInteractiveElement(null)).toBe(false);

    // Mock objek menyerupai DOM element
    const makeEl = (matchesClass: string): HTMLElement => ({
      closest: (sel: string): Element | null => (sel.split(', ').some((s) => s.trim() === matchesClass) ? ({} as Element) : null),
    } as unknown as HTMLElement);

    expect(isInteractiveElement(makeEl('button'))).toBe(true);
    expect(isInteractiveElement(makeEl('.dialog'))).toBe(true);
    expect(isInteractiveElement(makeEl('.result-panel'))).toBe(true);
    expect(isInteractiveElement(makeEl('.audio-controls'))).toBe(true);
    expect(isInteractiveElement(makeEl('.modal'))).toBe(true);
    expect(isInteractiveElement(makeEl('.journal-panel'))).toBe(true);
    expect(isInteractiveElement(makeEl('[data-interactive]'))).toBe(true);

    const nonInteractive = {
      closest: (): Element | null => null,
    } as unknown as HTMLElement;
    expect(isInteractiveElement(nonInteractive)).toBe(false);
  });

  it('inisialisasi awal dalam kondisi nonaktif (scene 2D / UI)', () => {
    const mgr = new CursorManager();
    expect(mgr.isEnabled).toBe(false);
    expect(mgr.isNeeded()).toBe(true); // Di scene UI, kursor selalu dibutuhkan
    mgr.dispose();
  });

  it('setEnabled(true) mengaktifkan mode 3D dan memperhitungkan predicate', () => {
    const mgr = new CursorManager();
    mgr.setEnabled(true);
    expect(mgr.isEnabled).toBe(true);
    expect(mgr.isNeeded()).toBe(false);

    let modalOpen = false;
    mgr.setPredicate(() => modalOpen);

    expect(mgr.isNeeded()).toBe(false);
    modalOpen = true;
    expect(mgr.isNeeded()).toBe(true); // Kursor otomatis dibutuhkan saat modal terbuka!

    modalOpen = false;
    expect(mgr.isNeeded()).toBe(false); // Kursor tidak lagi dibutuhkan saat modal tertutup
    mgr.dispose();
  });

  it('lock() hanya memanggil requestPointerLock bila tidak terhalang dialog', () => {
    const requestLock = vi.fn();
    const mockCanvas = { requestPointerLock: requestLock } as unknown as HTMLCanvasElement;

    const mgr = new CursorManager(mockCanvas);
    mgr.setEnabled(true);

    // Tanpa modal: lock() memanggil requestPointerLock
    mgr.lock();
    expect(requestLock).toHaveBeenCalledTimes(1);

    // Dengan modal: lock() tidak memanggil requestPointerLock
    let modalOpen = true;
    mgr.setPredicate(() => modalOpen);
    mgr.lock();
    expect(requestLock).toHaveBeenCalledTimes(1);

    // Modal tertutup: lock() berhasil memanggil lagi
    modalOpen = false;
    mgr.lock();
    expect(requestLock).toHaveBeenCalledTimes(2);
    mgr.dispose();
  });

  it('toggle() dan unlock(manual) mengaktifkan manualUnlocked', () => {
    const mgr = new CursorManager();
    mgr.setEnabled(true);

    expect(mgr.isNeeded()).toBe(false);
    mgr.unlock(true);
    expect(mgr.isNeeded()).toBe(true); // Dibuka secara manual

    mgr.lock(); // Kunci kembali
    expect(mgr.isNeeded()).toBe(false);

    mgr.dispose();
  });

  it('onSceneChange mengaktifkan mode 3D di flight & surface, serta nonaktif di briefing/design/review', () => {
    const mgr = new CursorManager();

    mgr.onSceneChange('flight');
    expect(mgr.isEnabled).toBe(true);

    mgr.onSceneChange('surface');
    expect(mgr.isEnabled).toBe(true);

    mgr.onSceneChange('review');
    expect(mgr.isEnabled).toBe(false);

    mgr.onSceneChange('design');
    expect(mgr.isEnabled).toBe(false);

    mgr.onSceneChange('briefing');
    expect(mgr.isEnabled).toBe(false);

    mgr.dispose();
  });
});
