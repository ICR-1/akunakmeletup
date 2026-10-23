import { audio } from '../core/audio';
import { EVENT_UI, SPEAKER_NAMES, STORY_UI } from '../core/strings';
import type { ChoiceOutcome } from '../events/eventSystem';
import type { DialogLine, DialogSpeaker, GameEvent } from '../rules/types';
import { el } from './dom';
import { describeChoice, formatEffects } from './effectText';

export interface EventDialog {
  close(): void;
}

/**
 * Dialog modal event krisis: menampilkan tiap pilihan dengan konsekuensi dan peluang gagal, lalu hasilnya.
 * `resolve` melempar dadu dan menerapkan efek; `onClose` dipanggil setelah pemain menekan Lanjut.
 */
export function showEventDialog(
  host: HTMLElement,
  event: GameEvent,
  resolve: (choiceIndex: number, minigameScore?: number) => ChoiceOutcome,
  onClose: (outcome: ChoiceOutcome) => void,
  /** Menjalankan minigame untuk pilihan bertipe minigame; mengembalikan skor 0-1. */
  runMinigame?: (minigameId: string) => Promise<number>,
): EventDialog {
  const card = el('div', 'dialog modal event-dialog');
  host.appendChild(card);

  const showResult = (outcome: ChoiceOutcome): void => {
    card.replaceChildren();
    card.dataset.failed = String(outcome.failed);
    card.append(
      el('div', 'dialog-name', `${EVENT_UI.header}: ${event.title}`),
      el('h3', 'event-result', outcome.failed ? EVENT_UI.failure : EVENT_UI.success),
      el('p', 'dialog-text', `${EVENT_UI.impact}: ${formatEffects(outcome.effects)}`),
    );
    const next = el('button', 'launch-button', EVENT_UI.next);
    next.type = 'button';
    next.addEventListener('click', () => {
      card.remove();
      onClose(outcome);
    });
    card.appendChild(next);
    next.focus();
  };

  card.append(el('div', 'dialog-name', `${EVENT_UI.header}: ${event.title}`), el('p', 'dialog-text', event.description));
  event.choices.forEach((choice, i) => {
    const d = describeChoice(choice);
    const button = el('button', 'choice event-choice');
    button.type = 'button';
    button.appendChild(el('span', 'choice-name', choice.label));
    button.appendChild(el('span', 'choice-sub', `${EVENT_UI.consequence}: ${d.consequence}`));
    if (d.risk) button.appendChild(el('span', 'choice-sub risk', `${d.risk} (${EVENT_UI.ifFail}: ${d.failImpact})`));
    button.addEventListener('click', () => {
      if (choice.minigameId && runMinigame) {
        card.hidden = true;
        void runMinigame(choice.minigameId).then((score) => {
          card.hidden = false;
          showResult(resolve(i, score));
        });
      } else showResult(resolve(i));
    });
    card.appendChild(button);
  });
  (card.querySelector('button.event-choice') as HTMLButtonElement | null)?.focus();
  return { close: () => card.remove() };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const TYPE_MS = 24;
const BLIP_EVERY = 3;
const BUBBLE_MS = 6500;

function svgEl(tag: string, attrs: Record<string, string>): SVGElement {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e as SVGElement;
}

const poly = (points: string, fill: string): SVGElement => svgEl('polygon', { points, fill, stroke: '#0b1020', 'stroke-width': '1' });

/** Potret low-poly bergaya vektor untuk tiap pembicara (tanpa gambar eksternal). */
export function createPortrait(speaker: DialogSpeaker): SVGElement {
  const svg = svgEl('svg', { viewBox: '0 0 80 80', class: `portrait portrait-${speaker}`, width: '72', height: '72' });
  svg.appendChild(svgEl('rect', { x: '0', y: '0', width: '80', height: '80', fill: '#0d1426' }));
  switch (speaker) {
    case 'nova':
      svg.append(
        poly('40,6 68,22 68,58 40,74 12,58 12,22', '#12304a'),
        poly('40,16 60,28 60,52 40,64 20,52 20,28', '#1d5d8a'),
        svgEl('circle', { cx: '40', cy: '40', r: '9', fill: '#4fd1ff', class: 'portrait-core' }),
      );
      break;
    case 'sekar':
      svg.append(
        poly('14,80 20,58 60,58 66,80', '#b6443c'),
        poly('30,50 50,50 48,62 32,62', '#d9a07a'),
        poly('26,30 40,12 54,30 52,50 28,50', '#e0b08a'),
        poly('24,34 40,8 56,34 50,24 30,24', '#2a1d1a'),
        poly('33,36 37,36 37,39 33,39', '#2a1d1a'),
        poly('43,36 47,36 47,39 43,39', '#2a1d1a'),
      );
      break;
    case 'ground':
      svg.append(
        poly('18,80 24,56 56,56 62,80', '#3a4a66'),
        poly('28,30 40,14 52,30 50,50 30,50', '#c9a07a'),
        poly('22,36 26,28 26,44 22,44', '#4a4f5c'),
        poly('54,28 58,36 58,44 54,44', '#4a4f5c'),
        poly('26,46 40,52 38,56 28,50', '#4a4f5c'),
      );
      break;
    default:
      svg.append(
        poly('38,70 42,70 41,28 39,28', '#9aa3b0'),
        svgEl('circle', { cx: '40', cy: '24', r: '5', fill: '#ffd24d' }),
        svgEl('path', { d: 'M24 24 A16 16 0 0 1 56 24', fill: 'none', stroke: '#ffd24d', 'stroke-width': '2' }),
        svgEl('path', { d: 'M14 24 A26 26 0 0 1 66 24', fill: 'none', stroke: '#ffd24d', 'stroke-width': '1.5', opacity: '0.6' }),
      );
  }
  return svg;
}

export interface DialogSequence { skip(): void }

/**
 * Panel dialog cerita: potret, nama pembicara, teks mengetik dengan bunyi bip. Klik Lanjut (atau Enter/Spasi)
 * menyelesaikan baris lalu maju; setelah baris terakhir `onDone` dipanggil.
 */
export function showDialogSequence(host: HTMLElement, lines: DialogLine[], onDone: () => void): DialogSequence {
  if (lines.length === 0) {
    onDone();
    return { skip: () => undefined };
  }
  const card = el('div', 'dialog story-dialog');
  const portraitBox = el('div', 'portrait-box');
  const body = el('div', 'story-body');
  const name = el('div', 'dialog-name');
  const text = el('p', 'dialog-text story-text');
  const next = el('button', 'dialog-next', STORY_UI.next);
  const skip = el('button', 'choice story-skip', STORY_UI.skip);
  next.type = skip.type = 'button';
  body.append(name, text, next);
  card.append(portraitBox, body, skip);
  host.appendChild(card);

  let index = 0;
  let typed = 0;
  let timer = 0;
  let finished = false;

  const stopTyping = (): void => { window.clearInterval(timer); timer = 0; };
  const finish = (): void => {
    if (finished) return;
    finished = true;
    stopTyping();
    window.removeEventListener('keydown', onKey);
    card.remove();
    onDone();
  };
  const showLine = (): void => {
    const line = lines[index];
    portraitBox.replaceChildren(createPortrait(line.speaker));
    portraitBox.dataset.speaking = 'true';
    name.textContent = SPEAKER_NAMES[line.speaker];
    text.textContent = '';
    typed = 0;
    stopTyping();
    timer = window.setInterval(() => {
      typed += 1;
      text.textContent = line.text.slice(0, typed);
      if (typed % BLIP_EVERY === 0) audio.blip();
      if (typed >= line.text.length) {
        stopTyping();
        portraitBox.dataset.speaking = 'false';
      }
    }, TYPE_MS);
    next.textContent = index === lines.length - 1 ? STORY_UI.next : `${STORY_UI.next} ▶`;
    next.focus();
  };
  const advance = (): void => {
    const line = lines[index];
    if (typed < line.text.length) {
      stopTyping();
      typed = line.text.length;
      text.textContent = line.text;
      portraitBox.dataset.speaking = 'false';
      return;
    }
    index += 1;
    if (index >= lines.length) finish();
    else showLine();
  };
  function onKey(e: KeyboardEvent): void {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      advance();
    }
  }
  next.addEventListener('click', advance);
  skip.addEventListener('click', finish);
  window.addEventListener('keydown', onKey);
  showLine();
  return { skip: finish };
}

/** Gelembung NOVA non-blokir yang hilang sendiri. */
export function showNovaBubble(host: HTMLElement, text: string, ms = BUBBLE_MS): void {
  const bubble = el('div', 'nova-bubble');
  bubble.append(createPortrait('nova'), el('div', 'nova-bubble-text', `${SPEAKER_NAMES.nova}: ${text}`));
  host.appendChild(bubble);
  audio.blip();
  window.setTimeout(() => bubble.remove(), ms);
}
