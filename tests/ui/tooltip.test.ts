import { describe, expect, it } from 'vitest';
import { placeTooltip } from '../../src/ui/tooltip';
import { GLOSSARY } from '../../src/core/strings';

const vp = { w: 1000, h: 800 };
describe('placeTooltip', () => {
  it('di atas anchor, rata tengah', () => {
    expect(placeTooltip({ x: 500, y: 300, w: 40, h: 20 }, { w: 200, h: 60 }, vp)).toEqual({ x: 420, y: 232 });
  });
  it('x dijepit ke tepi kiri dan kanan', () => {
    expect(placeTooltip({ x: 2, y: 300, w: 40, h: 20 }, { w: 200, h: 60 }, vp).x).toBe(8);
    expect(placeTooltip({ x: 990, y: 300, w: 40, h: 20 }, { w: 200, h: 60 }, vp).x).toBe(792);
  });
  it('pindah ke bawah bila ruang atas kurang', () => {
    expect(placeTooltip({ x: 500, y: 10, w: 40, h: 20 }, { w: 200, h: 60 }, vp).y).toBe(38);
  });
});
describe('GLOSSARY', () => {
  it('teks tidak kosong dan <= 160 karakter', () => {
    for (const g of Object.values(GLOSSARY)) {
      expect(g.term.length).toBeGreaterThan(0);
      expect(g.text.length).toBeGreaterThan(0);
      expect(g.text.length).toBeLessThanOrEqual(160);
    }
    expect(Object.keys(GLOSSARY)).toHaveLength(11);
  });
});
