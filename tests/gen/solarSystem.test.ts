import { describe, expect, it } from 'vitest';
import {
  carouselFrame, focusForDestination, MOON_SPEC, orbitalSpeed, orbitPosition, SOLAR_SYSTEM, SUN_RADIUS,
} from '../../src/gen/solarSystemData';
import { PLANET_KEYS } from '../../src/gen/planetTextures';

describe('data orrery (visual)', () => {
  it('delapan planet dari Merkurius sampai Neptunus, orbit makin jauh', () => {
    expect(SOLAR_SYSTEM.map((p) => p.name)).toEqual(['Merkurius', 'Venus', 'Bumi', 'Mars', 'Jupiter', 'Saturnus', 'Uranus', 'Neptunus']);
    for (let i = 1; i < SOLAR_SYSTEM.length; i++) expect(SOLAR_SYSTEM[i].orbit).toBeGreaterThan(SOLAR_SYSTEM[i - 1].orbit);
  });
  it('setiap planet punya resep tekstur; hanya Bumi berawan dan hanya Saturnus bercincin', () => {
    for (const p of SOLAR_SYSTEM) expect(PLANET_KEYS).toContain(p.key);
    expect(SOLAR_SYSTEM.filter((p) => p.clouds).map((p) => p.key)).toEqual(['earth']);
    expect(SOLAR_SYSTEM.filter((p) => p.rings).map((p) => p.key)).toEqual(['saturn']);
    expect(PLANET_KEYS).toContain('moon');
  });
  it('tidak ada tumpang tindih: Matahari dan planet tidak menyentuh orbit tetangga', () => {
    expect(SOLAR_SYSTEM[0].orbit * (1 - SOLAR_SYSTEM[0].ecc) - SOLAR_SYSTEM[0].radius).toBeGreaterThan(SUN_RADIUS);
    for (let i = 1; i < SOLAR_SYSTEM.length; i++) {
      const a = SOLAR_SYSTEM[i - 1], b = SOLAR_SYSTEM[i];
      expect(b.orbit * (1 - b.ecc) - a.orbit * (1 + a.ecc)).toBeGreaterThan(-0.01);
      expect(b.orbit - a.orbit).toBeGreaterThan(a.radius + b.radius);
    }
  });
  it('orbit Bulan cukup lebar dari Bumi dan lebih kecil dari jarak ke Venus/Mars', () => {
    const earth = SOLAR_SYSTEM.find((p) => p.key === 'earth')!;
    expect(MOON_SPEC.orbit).toBeGreaterThan(earth.radius + MOON_SPEC.radius);
    expect(MOON_SPEC.orbit).toBeLessThan(5);
  });
  it('kecepatan orbit turun seiring jarak dan selalu positif', () => {
    const speeds = SOLAR_SYSTEM.map((p) => orbitalSpeed(p.orbit));
    for (let i = 1; i < speeds.length; i++) expect(speeds[i]).toBeLessThan(speeds[i - 1]);
    expect(Math.min(...speeds)).toBeGreaterThan(0);
  });
  it('posisi orbit elips: Matahari di fokus, kembali ke titik awal setelah satu putaran', () => {
    const [x0, z0] = orbitPosition(10, 0.2, 0);
    expect(x0).toBeCloseTo(10 * (1 - 0.2), 10);
    expect(z0).toBeCloseTo(0, 10);
    const [xp, zp] = orbitPosition(10, 0.2, Math.PI);
    expect(xp).toBeCloseTo(-10 * (1 + 0.2), 10);
    expect(zp).toBeCloseTo(0, 6);
    const [x2, z2] = orbitPosition(10, 0.2, Math.PI * 2);
    expect(x2).toBeCloseTo(x0, 10);
    expect(z2).toBeCloseTo(z0, 6);
    const [cx, cz] = orbitPosition(10, 0, 1.3);
    expect(Math.hypot(cx, cz)).toBeCloseTo(10, 10);
  });
  it('destinasi game dipetakan ke fokus kamera', () => {
    expect(focusForDestination('moon')).toBe('moon');
    expect(focusForDestination('mars')).toBe('mars');
    expect(focusForDestination('apa-saja')).toBe('moon');
  });
  it('bingkai karusel: diameter planet mengisi bagian layar yang diminta, lebih jauh untuk planet besar', () => {
    const { dist, drop } = carouselFrame(0.3, 60, 0.36, 0.2);
    const half = dist * Math.tan(Math.PI / 6);
    expect((2 * 0.3) / (2 * half)).toBeCloseTo(0.36, 10);
    expect(drop / half).toBeCloseTo(0.2, 10);
    expect(carouselFrame(0.7, 60, 0.36, 0.2).dist).toBeGreaterThan(dist);
  });
});
