import { describe, it, expect } from 'vitest';
import { parseKeyHints } from '../../src/ui/keyHints';
import { assignRows } from '../../src/ui/labelLayout';

describe('parseKeyHints', () => {
  it('token di awal', () => {
    expect(parseKeyHints('[E] Uplink data ke Bumi')).toEqual([{ key: 'E' }, { text: ' Uplink data ke Bumi' }]);
  });
  it('beberapa token', () => {
    expect(parseKeyHints('Tahan [Spasi] lalu [F]')).toEqual([{ text: 'Tahan ' }, { key: 'Spasi' }, { text: ' lalu ' }, { key: 'F' }]);
  });
  it('tanpa token', () => {
    expect(parseKeyHints('tanpa tombol')).toEqual([{ text: 'tanpa tombol' }]);
  });
});

describe('assignRows', () => {
  it('tumpukan masuk baris 1', () => {
    expect(assignRows([{ x: 0, w: 50 }, { x: 40, w: 50 }, { x: 200, w: 50 }], 4)).toEqual([0, 1, 0]);
  });
});
