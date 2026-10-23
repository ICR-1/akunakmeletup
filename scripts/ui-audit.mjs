// Audit visual UI: screenshot + temuan tata letak per scene dan ukuran viewport.
// Pakai: AUDIT_URL=http://localhost:5173/ npm run ui:audit
import { mkdirSync, writeFileSync } from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUT = 'ui-audit';
const PAGE_URL = process.env.AUDIT_URL ?? 'http://localhost:5173/';
const FIREFOX = process.env.FIREFOX_BIN ?? '/usr/bin/firefox';
const SIZES = [[1366, 768], [1024, 700]];
const SCENES = ['briefing', 'design', 'flight', 'surface', 'review'];
const SCENE_WAIT_MS = 3500;
const LOAD_WAIT_MS = 6000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Dijalankan di dalam halaman.
function collectIssues() {
  const issues = [];
  const vw = innerWidth;
  const vh = innerHeight;
  const name = (e) =>
    e.tagName.toLowerCase() +
    (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  const vis = (e) => {
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.closest('[hidden]');
  };
  // Isi yang terpotong leluhur ber-overflow (panel gulir, strip kompas) memang disengaja: dilewati.
  // Hanya leluhur pemotong itu sendiri yang diperiksa terhadap viewport.
  const hasClipAncestor = (e) => {
    for (let p = e.parentElement; p && p !== document.body && p.id !== 'overlay'; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') return true;
    }
    return false;
  };
  // Lapisan layar penuh (>= 80% viewport) bukan peserta OVERLAP.
  const fullScreen = (r) => r.width * r.height >= 0.8 * vw * vh;
  const all = [...document.querySelectorAll('#overlay *')].filter(vis);
  for (const e of all) {
    const r = e.getBoundingClientRect();
    const cs = getComputedStyle(e);
    const out = !hasClipAncestor(e) && (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1);
    if (out) {
      issues.push(`OFFSCREEN ${name(e)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)}x${Math.round(r.height)}]`);
    }
    if (e.scrollWidth > e.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && e.clientWidth > 0) {
      issues.push(`HOVERFLOW ${name(e)} scroll=${e.scrollWidth} client=${e.clientWidth} text="${(e.textContent || '').slice(0, 50)}"`);
    }
    const p = e.parentElement;
    if (p && p.id !== 'overlay') {
      const pr = p.getBoundingClientRect();
      const pcs = getComputedStyle(p);
      if (cs.position !== 'absolute' && cs.position !== 'fixed' && (r.right > pr.right + 2 || r.left < pr.left - 2) && pcs.overflow === 'visible') {
        issues.push(`ESCAPES ${name(e)} from ${name(p)} by ${Math.round(Math.max(r.right - pr.right, pr.left - r.left))}px`);
      }
    }
  }
  // Tumpang tindih antar-kotak absolute/fixed (termasuk pointer-events:none).
  const boxes = all.filter((e) => {
    const cs = getComputedStyle(e);
    if (cs.position !== 'absolute' && cs.position !== 'fixed') return false;
    const r = e.getBoundingClientRect();
    return r.width > 40 && !fullScreen(r) && !e.closest('.label-layer');
  });
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 4 && oy > 4) issues.push(`OVERLAP ${name(a)} x ${name(b)} (${Math.round(ox)}x${Math.round(oy)})`);
    }
  }
  return [...new Set(issues)].slice(0, 60);
}

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ browser: 'firefox', executablePath: FIREFOX, headless: true });
const logs = [];
const report = {};
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (['error', 'warn'].includes(m.type())) logs.push(`${m.type()}: ${m.text()}`); });
  let currentKey = 'load';
  page.on('pageerror', (e) => {
    logs.push(`pageerror: ${e.message}`);
    (report[currentKey] ??= []).push(`PAGEERROR ${e.message}`);
  });
  const rounds = [...SIZES.map(([w, h]) => [w, h, 1]), [1024, 700, 1.2]];
  for (const [w, h, scale] of rounds) {
    const suffix = scale === 1 ? '' : `-x${scale}`;
    await page.setViewport({ width: w, height: h });
    await page.goto(PAGE_URL, { waitUntil: 'load' });
    await sleep(LOAD_WAIT_MS);
    if (scale !== 1) await page.evaluate((s) => document.documentElement.style.setProperty('--ui-scale', String(s)), scale);
    for (const s of SCENES) {
      const key = `${s}-${w}${suffix}`;
      currentKey = key;
      report[key] ??= [];
      try {
        await page.evaluate((id) => window.__astra.scenes.switchTo(id), s);
      } catch (e) {
        report[key].push(`SWITCH_FAILED ${e.message}`);
        continue;
      }
      await sleep(SCENE_WAIT_MS);
      await page.screenshot({ path: `${OUT}/${key}.png` });
      report[key].push(...(await page.evaluate(collectIssues)));
    }
  }
} finally {
  await browser.close();
}
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
let failed = false;
for (const [key, list] of Object.entries(report)) {
  if (list.length) console.log(`${key}: ${list.length}`);
  for (const l of list) if (/^(OVERLAP|ESCAPES|OFFSCREEN|SWITCH_FAILED|PAGEERROR)/.test(l)) { failed = true; console.log(`  ${l}`); }
}
if (logs.length) console.log('LOGS\n' + [...new Set(logs)].slice(0, 30).join('\n'));
console.log(failed ? 'AUDIT: ada temuan' : 'AUDIT: bersih');
process.exit(failed ? 1 : 0);
