import { audio } from '../core/audio';
import { TEXT_SCALES } from '../core/constants';
import { STORY_UI } from '../core/strings';
import type { DetailLevel } from '../gen/detail';
import { el } from './dom';

export function applyTextScale(index: number): void {
  const scale = TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, index))];
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}

export interface ControlsState { muted: boolean; volume: number; textScale: number; shadows: boolean; detail: DetailLevel; music: boolean }

/**
 * Tombol roda gigi di kiri bawah yang membuka panel Pengaturan (suara, musik, volume, ukuran teks, bayangan, detail).
 * `onChange` dipanggil setiap ada perubahan agar pilihan disimpan.
 */
export function createSettings(
  host: HTMLElement,
  initial: ControlsState,
  onChange: (state: ControlsState) => void,
): { setDetail(level: DetailLevel): void } {
  let textScale = initial.textScale;
  let shadows = initial.shadows;
  let detail = initial.detail;
  let music = initial.music;
  applyTextScale(textScale);
  const emit = (): void => onChange({ muted: audio.isMuted, volume: audio.currentVolume, textScale, shadows, detail, music });

  const root = el('div', 'settings');
  const toggle = el('button', 'settings-toggle');
  toggle.type = 'button';
  toggle.title = STORY_UI.settings;
  toggle.setAttribute('aria-label', STORY_UI.settings);
  toggle.setAttribute('aria-expanded', 'false');
  const panel = el('div', 'settings-panel');
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', STORY_UI.settings);

  const head = el('div', 'settings-head');
  const close = el('button', 'settings-close', '×');
  close.type = 'button';
  close.title = STORY_UI.close;
  close.setAttribute('aria-label', STORY_UI.close);
  head.append(el('h3', '', STORY_UI.settings), close);

  const row = (label: string, ...controls: HTMLElement[]): HTMLDivElement => {
    const r = el('div', 'settings-row');
    const c = el('div', 'settings-controls');
    c.append(...controls);
    r.append(el('span', 'settings-label', label), c);
    return r;
  };
  const switchButton = (onClick: () => void): HTMLButtonElement => {
    const b = el('button', 'settings-switch');
    b.type = 'button';
    b.addEventListener('click', () => { onClick(); emit(); });
    return b;
  };
  const setSwitch = (b: HTMLButtonElement, on: boolean, text: string = on ? STORY_UI.on : STORY_UI.off): void => {
    b.textContent = text;
    b.dataset.on = String(on);
    b.setAttribute('aria-pressed', String(on));
  };

  const soundButton = switchButton(() => { audio.unlock(); audio.setMuted(!audio.isMuted); refresh(); });
  const musicButton = switchButton(() => { music = !music; refresh(); });
  const slider = el('input', 'settings-volume');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(initial.volume * 100));
  slider.setAttribute('aria-label', STORY_UI.volume);
  const volumeValue = el('span', 'settings-value');
  slider.addEventListener('input', () => {
    audio.unlock();
    audio.setVolume(Number(slider.value) / 100);
    refresh();
    emit();
  });

  const textValue = el('span', 'settings-value');
  const textButton = (label: string, delta: number, title: string): HTMLButtonElement => {
    const b = el('button', 'settings-step', label);
    b.type = 'button';
    b.title = title;
    b.addEventListener('click', () => {
      textScale = Math.min(TEXT_SCALES.length - 1, Math.max(0, textScale + delta));
      applyTextScale(textScale);
      refresh();
      emit();
    });
    return b;
  };
  const shadowButton = switchButton(() => { shadows = !shadows; refresh(); });
  const detailButton = switchButton(() => { detail = detail === 'high' ? 'low' : 'high'; refresh(); });
  detailButton.title = STORY_UI.detailTitle;

  const refresh = (): void => {
    setSwitch(soundButton, !audio.isMuted);
    setSwitch(musicButton, music);
    volumeValue.textContent = `${slider.value}%`;
    slider.disabled = audio.isMuted;
    textValue.textContent = `${Math.round(TEXT_SCALES[textScale] * 100)}%`;
    setSwitch(shadowButton, shadows);
    setSwitch(detailButton, detail === 'high', detail === 'high' ? STORY_UI.detailHigh : STORY_UI.detailLow);
  };

  panel.append(
    head,
    el('h4', 'settings-section settings-section-sound', STORY_UI.sound),
    row(STORY_UI.soundEffects, soundButton),
    row(STORY_UI.music, musicButton),
    row(STORY_UI.volume, slider, volumeValue),
    el('h4', 'settings-section settings-section-display', STORY_UI.display),
    row(STORY_UI.textSize, textButton('A−', -1, STORY_UI.textSmaller), textValue, textButton('A+', 1, STORY_UI.textLarger)),
    row(STORY_UI.shadows, shadowButton),
    row(STORY_UI.detail, detailButton),
  );

  let isOpen = false;
  const setOpen = (open: boolean): void => {
    isOpen = open;
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    root.classList.toggle('open', open);
  };
  toggle.addEventListener('click', () => setOpen(!isOpen));
  close.addEventListener('click', () => setOpen(false));
  document.addEventListener('pointerdown', (e) => {
    if (isOpen && !root.contains(e.target as Node)) setOpen(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) setOpen(false);
  });
  // Tombol keyboard game (WASD, Spasi, angka) tidak boleh ikut terpicu saat slider/tombol di panel fokus.
  panel.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });

  refresh();
  root.append(panel, toggle);
  host.appendChild(root);
  return {
    setDetail(level) {
      if (level === detail) return;
      detail = level;
      refresh();
      emit();
    },
  };
}
