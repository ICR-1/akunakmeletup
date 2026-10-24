/**
 * Logo judul ASTRA: SVG inline yang digambar dari kode (bukan berkas gambar). Huruf dibentuk sebagai garis tebal
 * membulat agar tidak bergantung font sistem, lalu ditumpuk: bayangan tebal, garis tepi gelap, tepi terang, isi
 * gradien, dan kilap. Cincin orbit melingkari kata (separuh di belakang, separuh di depan) dengan roket kecil.
 */

/** Huruf A-S-T-R-A di kotak tinggi 110, total lebar ~518 satuan. */
const WORD_PATH = [
  'M0 110 L45 0 L90 110 M22 70 H68',
  'M188 18 C170 -4 124 -2 124 30 C124 60 192 50 192 82 C192 116 138 118 120 94',
  'M222 0 H302 M262 0 V110',
  'M332 110 V0 H368 C406 0 406 58 368 58 H332 M368 58 L402 110',
  'M428 110 L473 0 L518 110 M450 70 H496',
].join(' ');

const CX = 360;
const CY = 136;
const ORBIT = { rx: 330, ry: 64, tilt: -9 } as const;

/** Bintang empat sudut berkelip di sekitar kata. */
const SPARKS: [number, number, number][] = [[118, 60, 1], [612, 74, 0.8], [96, 214, 0.6], [640, 206, 0.7], [402, 36, 0.55]];

function spark(x: number, y: number, s: number, i: number): string {
  const r = 16 * s, w = 3.2 * s;
  const d = `M${x} ${y - r} Q${x + w} ${y - w} ${x + r} ${y} Q${x + w} ${y + w} ${x} ${y + r} Q${x - w} ${y + w} ${x - r} ${y} Q${x - w} ${y - w} ${x} ${y - r}Z`;
  return `<path class="logo-spark" style="animation-delay:${(i * 0.7).toFixed(1)}s" d="${d}" fill="#fef9c3"/>`;
}

export function createLogo(label: string, animate: boolean): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'title-logo';
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', label);
  const { rx, ry, tilt } = ORBIT;
  const back = `M${CX + rx} ${CY} A${rx} ${ry} 0 0 0 ${CX - rx} ${CY}`;
  const front = `M${CX - rx} ${CY} A${rx} ${ry} 0 0 0 ${CX + rx} ${CY}`;
  const loop = `${front} A${rx} ${ry} 0 0 0 ${CX - rx} ${CY}`;
  const extrude = Array.from({ length: 7 }, (_, i) => `<use href="#astra-word" transform="translate(0 ${14 - i * 2})" stroke="${i === 0 ? '#050816' : '#3730a3'}" stroke-width="42"/>`).join('');
  // Gerak dikurangi: roket diam di titik terdepan orbit (bawah tengah), menghadap arah terbangnya.
  const rocketPlace = animate ? '' : ` transform="translate(${CX} ${CY + ry})"`;
  const rocket = `<g class="logo-rocket"${rocketPlace}>
      <path d="M-14 -7 L-24 0 L-14 7 Z" fill="#fb923c"/><path d="M-12 -4 L-19 0 L-12 4 Z" fill="#fde68a"/>
      <path d="M-14 -6 H6 Q18 -6 22 0 Q18 6 6 6 H-14 Z" fill="#f8fafc" stroke="#0b1437" stroke-width="2.5"/>
      <circle cx="5" cy="0" r="3" fill="#38bdf8" stroke="#0b1437" stroke-width="1.5"/>
      <path d="M-10 -6 L-16 -12 L-4 -6 Z M-10 6 L-16 12 L-4 6 Z" fill="#f87171" stroke="#0b1437" stroke-width="2"/>
      ${animate ? `<animateMotion dur="10s" repeatCount="indefinite" rotate="auto" path="${loop}"/>` : ''}
    </g>`;
  wrap.innerHTML = `
<svg viewBox="0 0 720 270" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <path id="astra-word" d="${WORD_PATH}" transform="translate(101 ${CY - 55})" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <linearGradient id="astra-fill" gradientUnits="userSpaceOnUse" x1="0" y1="${CY - 62}" x2="0" y2="${CY + 62}">
      <stop offset="0" stop-color="#a5f3fc"/><stop offset="0.3" stop-color="#38bdf8"/>
      <stop offset="0.7" stop-color="#4f46e5"/><stop offset="1" stop-color="#9333ea"/>
    </linearGradient>
    <linearGradient id="astra-ring" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fb923c" stop-opacity="0"/><stop offset="0.25" stop-color="#facc15"/>
      <stop offset="0.75" stop-color="#fde68a"/><stop offset="1" stop-color="#fb923c" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="astra-glow"><stop offset="0" stop-color="#38bdf8" stop-opacity="0.45"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/></radialGradient>
  </defs>
  <ellipse cx="${CX}" cy="${CY}" rx="300" ry="120" fill="url(#astra-glow)"/>
  <g transform="rotate(${tilt} ${CX} ${CY})">
    <path d="${back}" fill="none" stroke="#0b1437" stroke-width="12" stroke-linecap="round"/>
    <path d="${back}" fill="none" stroke="url(#astra-ring)" stroke-width="6" stroke-linecap="round" opacity="0.75"/>
  </g>
  ${extrude}
  <use href="#astra-word" stroke="#0b1437" stroke-width="42"/>
  <use href="#astra-word" stroke="#e0f2fe" stroke-width="31"/>
  <use href="#astra-word" stroke="url(#astra-fill)" stroke-width="25"/>
  <use href="#astra-word" transform="translate(-2 -5)" stroke="#ffffff" stroke-opacity="0.5" stroke-width="5"/>
  <g transform="rotate(${tilt} ${CX} ${CY})">
    <path d="${front}" fill="none" stroke="#0b1437" stroke-width="12" stroke-linecap="round"/>
    <path d="${front}" fill="none" stroke="url(#astra-ring)" stroke-width="6" stroke-linecap="round"/>
    ${rocket}
  </g>
  ${SPARKS.map(([x, y, s], i) => spark(x, y, s, i)).join('')}
</svg>`;
  return wrap;
}
