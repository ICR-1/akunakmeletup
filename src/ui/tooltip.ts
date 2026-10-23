import { GLOSSARY } from '../core/strings';
import type { GlossaryKey } from '../core/strings';

export type { GlossaryKey };

interface Box { x: number; y: number; w: number; h: number }

/** Posisi tooltip: di atas anchor, rata tengah; pindah ke bawah bila ruang atas kurang. */
export function placeTooltip(
  anchor: Box,
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  margin = 8,
): { x: number; y: number } {
  const maxX = Math.max(margin, viewport.w - size.w - margin);
  const x = Math.min(maxX, Math.max(margin, anchor.x + anchor.w / 2 - size.w / 2));
  const above = anchor.y - size.h - margin;
  const y = above >= margin ? above : anchor.y + anchor.h + margin;
  return { x, y };
}

let shared: HTMLDivElement | null = null;
let current: HTMLElement | null = null;
const TIP_ID = 'astra-tooltip';

function node(): HTMLDivElement {
  if (!shared) {
    shared = document.createElement('div');
    shared.className = 'tooltip';
    shared.id = TIP_ID;
    shared.setAttribute('role', 'tooltip');
    shared.hidden = true;
    document.body.appendChild(shared);
  }
  return shared;
}

function hide(target?: HTMLElement): void {
  if (target && current !== target) return;
  current?.removeAttribute('aria-describedby');
  current = null;
  if (shared) shared.hidden = true;
}

function show(target: HTMLElement, key: GlossaryKey): void {
  if (!target.isConnected) {
    hide();
    return;
  }
  const g = GLOSSARY[key];
  const tip = node();
  tip.replaceChildren();
  const term = document.createElement('strong');
  term.textContent = g.term;
  tip.append(term, document.createTextNode(g.text));
  tip.hidden = false;
  current?.removeAttribute('aria-describedby');
  current = target;
  target.setAttribute('aria-describedby', TIP_ID);
  // Tooltip ada di body (di luar zoom #overlay) dan memakai zoom sendiri; hitung dalam ruang CSS ber-zoom.
  const zoom = Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
  tip.style.left = '0px';
  tip.style.top = '0px';
  const r = target.getBoundingClientRect();
  const pos = placeTooltip(
    { x: r.left / zoom, y: r.top / zoom, w: r.width / zoom, h: r.height / zoom },
    { w: tip.offsetWidth, h: tip.offsetHeight },
    { w: window.innerWidth / zoom, h: window.innerHeight / zoom },
  );
  tip.style.left = `${pos.x}px`;
  tip.style.top = `${pos.y}px`;
  // Jika target dilepas dari DOM saat tooltip tampil (scene berganti), sembunyikan.
  const guard = (): void => {
    if (current !== target) return;
    if (!target.isConnected) hide();
    else requestAnimationFrame(guard);
  };
  requestAnimationFrame(guard);
}

/** Pasang tooltip istilah sains pada elemen; muncul saat hover atau fokus. */
export function attachTooltip(target: HTMLElement, key: GlossaryKey): void {
  target.tabIndex = 0;
  target.classList.add('has-tooltip');
  target.addEventListener('pointerenter', () => show(target, key));
  target.addEventListener('focus', () => show(target, key));
  target.addEventListener('pointerleave', () => hide(target));
  target.addEventListener('blur', () => hide(target));
}
