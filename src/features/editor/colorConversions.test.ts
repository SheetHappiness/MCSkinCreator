import { describe, expect, it } from 'vitest';

import { canonicalizeRgba, hsvToRgba, rgbaToHsv } from './colorConversions';

describe('exact color conversions', () => {
  it.each([
    [
      { r: 255, g: 0, b: 0, a: 17 },
      { h: 0, s: 100, v: 100 },
    ],
    [
      { r: 0, g: 255, b: 0, a: 18 },
      { h: 120, s: 100, v: 100 },
    ],
    [
      { r: 0, g: 0, b: 255, a: 19 },
      { h: 240, s: 100, v: 100 },
    ],
    [
      { r: 128, g: 128, b: 128, a: 20 },
      { h: 0, s: 0, v: (128 / 255) * 100 },
    ],
  ] as const)('converts RGB %o to HSV %o', (rgba, expected) => {
    expect(rgbaToHsv(rgba)).toEqual(expected);
  });

  it('converts representative HSV values to exact RGBA bytes', () => {
    expect(hsvToRgba({ h: 210, s: 75, v: 80 }, 63)).toEqual({
      r: 51,
      g: 128,
      b: 204,
      a: 63,
    });
    expect(hsvToRgba({ h: -120, s: 100, v: 100 }, 255)).toEqual({
      r: 0,
      g: 0,
      b: 255,
      a: 255,
    });
    expect(hsvToRgba({ h: 360, s: 100, v: 100 }, 255)).toEqual({
      r: 255,
      g: 0,
      b: 0,
      a: 255,
    });
    expect(hsvToRgba({ h: 480, s: 100, v: 100 }, 255)).toEqual({
      r: 0,
      g: 255,
      b: 0,
      a: 255,
    });
  });

  it('round-trips representative exact RGBA colors without losing alpha', () => {
    for (const color of [
      { r: 12, g: 34, b: 56, a: 78 },
      { r: 201, g: 77, b: 143, a: 0 },
      { r: 255, g: 1, b: 254, a: 255 },
    ]) {
      expect(hsvToRgba(rgbaToHsv(color), color.a)).toEqual(color);
    }
  });

  it('canonicalizes fractional and out-of-range UI values to exact bytes', () => {
    expect(canonicalizeRgba({ r: -1, g: 1.49, b: 254.6, a: 300 })).toEqual({
      r: 0,
      g: 1,
      b: 255,
      a: 255,
    });
  });
});
