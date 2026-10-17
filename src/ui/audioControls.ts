import { audio } from '../core/audio';
import { TEXT_SCALES } from '../core/constants';
import { STORY_UI } from '../core/strings';
import type { DetailLevel } from '../gen/detail';
import { el } from './dom';

/** Tombol mute dan slider volume (selalu tampak). `onChange` dipanggil agar pilihan disimpan. */
export function applyTextScale(index: number): void {
  const scale = TEXT_SCALES[Math.min(TEXT_SCALES.length - 1, Math.max(0, index))];
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}

export interface ControlsState { muted: boolean; volume: number; textScale: number; shadows: boolean; detail: DetailLevel; music: boolean }

export function createAudioControls(
  host: HTMLElement,
  initial: ControlsState,
  onChange: (state: ControlsState) => void,
): { setDetail(level: DetailLevel): void } {
  let textScale = initial.textScale;
  let shadows = initial.shadows;
  let detail = initial.detail;
  let music = initial.music;
  applyTextScale(textScale);
  const box = el('div', 'audio-controls');
  const mute = el('button', 'audio-mute');
  mute.type = 'button';
  const slider = el('input', 'audio-volume');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(initial.volume * 100));
  slider.title = STORY_UI.sound;
  const refresh = (): void => {
    mute.textContent = audio.isMuted ? `🔇 ${STORY_UI.mute}` : `🔊 ${STORY_UI.sound}`;
    mute.dataset.muted = String(audio.isMuted);
  };
  mute.addEventListener('click', () => {
    audio.unlock();
    audio.setMuted(!audio.isMuted);
    refresh();
    onChange({ muted: audio.isMuted, volume: audio.currentVolume, textScale, shadows, detail, music });
  });
  slider.addEventListener('input', () => {
    audio.unlock();
    audio.setVolume(Number(slider.value) / 100);
    onChange({ muted: audio.isMuted, volume: audio.currentVolume, textScale, shadows, detail, music });
  });
  const textButton = (label: string, delta: number, title: string): HTMLButtonElement => {
    const b = el('button', 'audio-mute', label);
    b.type = 'button';
    b.title = title;
    b.addEventListener('click', () => {
      textScale = Math.min(TEXT_SCALES.length - 1, Math.max(0, textScale + delta));
      applyTextScale(textScale);
      onChange({ muted: audio.isMuted, volume: audio.currentVolume, textScale, shadows, detail, music });
    });
    return b;
  };
  const shadowButton = el('button', 'audio-mute');
  shadowButton.type = 'button';
  const refreshShadow = (): void => {
    shadowButton.textContent = `${STORY_UI.shadows}: ${shadows ? STORY_UI.on : STORY_UI.off}`;
  };
  shadowButton.addEventListener('click', () => {
    shadows = !shadows;
    refreshShadow();
    onChange({ muted: audio.isMuted, volume: audio.currentVolume, textScale, shadows, detail, music });
  });
  const detailButton = el('button', 'audio-mute');
  detailButton.type = 'button';
  detailButton.title = STORY_UI.detailTitle;
  const refreshDetail = (): void => {
    detailButton.textContent = `${STORY_UI.detail}: ${detail === 'high' ? STORY_UI.detailHigh : STORY_UI.detailLow}`;
  };
  detailButton.addEventListener('click', () => {
    detail = detail === 'high' ? 'low' : 'high';
    refreshDetail();
    onChange({ muted: audio.isMuted, volume: audio.currentVolume, textScale, shadows, detail, music });
  });
  const musicButton = el('button', 'audio-mute');
  musicButton.type = 'button';
  const refreshMusic = (): void => {
    musicButton.textContent = `🎵 ${STORY_UI.music}: ${music ? STORY_UI.on : STORY_UI.off}`;
  };
  musicButton.addEventListener('click', () => {
    music = !music;
    refreshMusic();
    onChange({ muted: audio.isMuted, volume: audio.currentVolume, textScale, shadows, detail, music });
  });
  refresh();
  refreshShadow();
  refreshDetail();
  refreshMusic();
  box.append(musicButton, detailButton, shadowButton, textButton('A−', -1, STORY_UI.textSmaller), textButton('A+', 1, STORY_UI.textLarger), mute, slider);
  host.appendChild(box);
  return {
    setDetail(level) {
      if (level === detail) return;
      detail = level;
      refreshDetail();
      onChange({ muted: audio.isMuted, volume: audio.currentVolume, textScale, shadows, detail, music });
    },
  };
}
