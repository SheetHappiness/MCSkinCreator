import { describe, expect, it } from 'vitest';

import { exportGplPalette, parseGplPalette } from './gplPalette';

describe('GIMP palette exchange', () => {
  it('parses metadata, comments, names, and exact RGB channels', () => {
    expect(
      parseGplPalette(
        '\uFEFFGIMP Palette\r\nName: Test\r\nColumns: 2\r\n# comment\r\n12 34 56 Deep blue\r\n255 0 1\r\n',
      ),
    ).toEqual([
      { color: { r: 12, g: 34, b: 56, a: 255 }, name: 'Deep blue' },
      { color: { r: 255, g: 0, b: 1, a: 255 } },
    ]);
  });

  it('round-trips exported rows and documents GPL alpha behavior', () => {
    const source = [
      { color: { r: 1, g: 2, b: 3, a: 4 }, name: 'Low alpha' },
      { color: { r: 250, g: 240, b: 230, a: 255 } },
    ] as const;
    const exported = exportGplPalette(source, 'Test palette');

    expect(exported).toContain('GIMP Palette');
    expect(exported).toContain('Alpha is not represented by GPL');
    expect(parseGplPalette(exported)).toEqual([
      { color: { r: 1, g: 2, b: 3, a: 255 }, name: 'Low alpha' },
      { color: { r: 250, g: 240, b: 230, a: 255 } },
    ]);
  });

  it.each([
    'not a palette',
    'GIMP Palette\n# no colors',
    'GIMP Palette\n256 0 0 Too red',
    'GIMP Palette\n1 2 nope Bad row',
  ])('rejects malformed GPL input: %s', (value) => {
    expect(() => parseGplPalette(value)).toThrow();
  });
});
