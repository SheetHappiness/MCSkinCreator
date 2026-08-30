import { describe, expect, it } from 'vitest';

import { colorToHex, colorToHexRgba, parseExactHex } from './colorHex';

describe('exact hex colors', () => {
  it('formats and parses exact RGB while preserving canonical alpha', () => {
    expect(colorToHex({ r: 10, g: 187, b: 255, a: 7 })).toBe('#0ABBFF');
    expect(colorToHexRgba({ r: 10, g: 187, b: 255, a: 7 })).toBe('#0ABBFF07');
    expect(parseExactHex('#0aBBff', 7)).toEqual({
      r: 10,
      g: 187,
      b: 255,
      a: 7,
    });
    expect(parseExactHex('#0aBBff2A', 7)).toEqual({
      r: 10,
      g: 187,
      b: 255,
      a: 42,
    });
  });

  it.each(['0ABBFF', '#fff', '#GG0000', '#0000000', ''])(
    'rejects unsupported or invalid input %s',
    (value) => {
      expect(parseExactHex(value, 255)).toBeUndefined();
    },
  );
});
