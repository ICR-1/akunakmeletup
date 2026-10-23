/** Petunjuk tombol: token [X] di teks menjadi chip kbd.key. parseKeyHints murni; renderKeyHints menyentuh DOM. */

export type HintPart = { key: string } | { text: string };

export function parseKeyHints(s: string): HintPart[] {
  const parts: HintPart[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0;
  for (let m = re.exec(s); m !== null; m = re.exec(s)) {
    if (m.index > last) parts.push({ text: s.slice(last, m.index) });
    parts.push({ key: m[1] });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ text: s.slice(last) });
  return parts;
}

export function renderKeyHints(target: HTMLElement, s: string): void {
  if (target.dataset.hint === s) return; // dipanggil tiap frame: lewati bila tidak berubah
  target.dataset.hint = s;
  target.replaceChildren();
  for (const p of parseKeyHints(s)) {
    if ('key' in p) {
      const k = document.createElement('kbd');
      k.className = 'key';
      k.textContent = p.key;
      target.appendChild(k);
    } else {
      target.appendChild(document.createTextNode(p.text));
    }
  }
}
