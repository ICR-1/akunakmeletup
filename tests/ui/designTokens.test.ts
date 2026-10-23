import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raw = readFileSync(resolve(__dirname, '../../src/ui/styles.css'), 'utf8');
// Buang blok :root pertama (tempat token didefinisikan).
const css = raw.replace(/:root\s*\{[\s\S]*?\n\}/, '');

const ALLOWED = /^(var\(--r-[a-z0-9]+\)|var\(--radius-[a-z]+\)|inherit|50%|0|1px|2px)$/;

describe('token desain CSS', () => {
  it('tidak ada font-size px mentah', () => {
    expect(css.match(/font-size:\s*[\d.]+px/g)).toBeNull();
  });
  it('border-radius hanya token, 50%, 0, atau ≤2px', () => {
    const decls = [...css.matchAll(/border-radius:\s*([^;}]+)/g)].map((m) => m[1].trim());
    const bad = decls.filter((v) => !v.replace(/\s*!important$/, '').split(/\s+/).every((p) => ALLOWED.test(p)));
    expect(bad).toEqual([]);
  });
  it('aturan [hidden] global ada', () => {
    expect(css).toMatch(/^\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/m);
  });
  it('scrollbar standar diset', () => {
    expect(css).toMatch(/scrollbar-color:/);
    expect(css).toMatch(/scrollbar-width:\s*thin/);
  });
  it('gerak dikurangi menghormati preferensi', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
  });
});
