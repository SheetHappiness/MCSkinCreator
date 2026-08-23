import { describe, expect, it } from 'vitest';

import {
  SKIN_HEIGHT,
  SKIN_PIXEL_BUFFER_LENGTH,
  SKIN_WIDTH,
  SkinDocument,
  TRANSPARENT_RGBA,
  type RgbaColor,
} from './SkinDocument';

const DOCUMENT_ID = 'test-document';

function createBlank(model: 'classic' | 'slim' = 'classic'): SkinDocument {
  return SkinDocument.createBlank({ id: DOCUMENT_ID, model });
}

describe('SkinDocument creation', () => {
  it('creates an exact 64x64 modern skin document', () => {
    const document = createBlank();

    expect(document.width).toBe(64);
    expect(document.height).toBe(64);
    expect(document.width).toBe(SKIN_WIDTH);
    expect(document.height).toBe(SKIN_HEIGHT);
  });

  it('uses an exact 64x64x4 RGBA buffer', () => {
    const document = createBlank();

    expect(document.copyPixelData()).toHaveLength(64 * 64 * 4);
    expect(document.copyPixelData()).toHaveLength(SKIN_PIXEL_BUFFER_LENGTH);
  });

  it('initializes every blank pixel as transparent black', () => {
    const document = createBlank();
    const pixels = document.copyPixelData();

    expect(document.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(63, 63)).toEqual(TRANSPARENT_RGBA);
    expect([...pixels].every((channel) => channel === 0)).toBe(true);
  });

  it.each([
    [64, 32],
    [128, 128],
    [63, 64],
    [64, 65],
  ])('rejects unsupported dimensions %ix%i', (width, height) => {
    expect(() =>
      SkinDocument.create({
        id: DOCUMENT_ID,
        width,
        height,
        pixels: new Uint8ClampedArray(SKIN_PIXEL_BUFFER_LENGTH),
      }),
    ).toThrow(RangeError);
  });

  it('rejects a buffer whose channel count is not exactly 64x64x4', () => {
    expect(() =>
      SkinDocument.create({
        id: DOCUMENT_ID,
        width: 64,
        height: 64,
        pixels: new Uint8ClampedArray(SKIN_PIXEL_BUFFER_LENGTH - 1),
      }),
    ).toThrow(RangeError);
  });

  it('copies caller-owned pixel data during creation', () => {
    const source = new Uint8ClampedArray(SKIN_PIXEL_BUFFER_LENGTH);
    const document = SkinDocument.create({
      id: DOCUMENT_ID,
      width: 64,
      height: 64,
      pixels: source,
    });

    source[0] = 255;

    expect(document.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
  });

  it('rejects an empty document identity', () => {
    expect(() => SkinDocument.createBlank({ id: '   ' })).toThrow(TypeError);
  });
});

describe('SkinDocument pixel semantics', () => {
  it('writes and reads one exact RGBA pixel', () => {
    const document = createBlank();
    const color: RgbaColor = { r: 12, g: 34, b: 56, a: 78 };

    expect(document.writePixel(17, 29, color)).toBe(true);
    expect(document.readPixel(17, 29)).toEqual(color);
  });

  it('writes the first pixel', () => {
    const document = createBlank();
    const color: RgbaColor = { r: 1, g: 2, b: 3, a: 4 };

    document.writePixel(0, 0, color);

    expect(document.readPixel(0, 0)).toEqual(color);
  });

  it('writes the last pixel', () => {
    const document = createBlank();
    const color: RgbaColor = { r: 252, g: 253, b: 254, a: 255 };

    document.writePixel(63, 63, color);

    expect(document.readPixel(63, 63)).toEqual(color);
  });

  it.each([
    [-1, 0],
    [0, -1],
    [-1, -1],
    [64, 0],
    [0, 64],
    [64, 64],
    [1.5, 0],
    [0, 2.5],
  ])('rejects invalid coordinate (%s, %s)', (x, y) => {
    const document = createBlank();

    expect(() => document.readPixel(x, y)).toThrow(RangeError);
    expect(() => document.writePixel(x, y, { r: 1, g: 2, b: 3, a: 4 })).toThrow(
      RangeError,
    );
  });

  it.each([
    ['r', -1],
    ['g', 256],
    ['b', 1.5],
    ['a', Number.NaN],
  ] as const)('rejects invalid %s channel value %s', (channel, value) => {
    const document = createBlank();
    const color: RgbaColor = {
      r: 10,
      g: 20,
      b: 30,
      a: 40,
      [channel]: value,
    };

    expect(() => document.writePixel(5, 5, color)).toThrow(RangeError);
    expect(document.readPixel(5, 5)).toEqual(TRANSPARENT_RGBA);
    expect(document.revision).toBe(0);
  });

  it('preserves alpha independently from RGB channels', () => {
    const document = createBlank();

    document.writePixel(8, 9, { r: 200, g: 150, b: 100, a: 37 });

    expect(document.readPixel(8, 9)).toEqual({
      r: 200,
      g: 150,
      b: 100,
      a: 37,
    });
  });

  it('does not modify unrelated pixels', () => {
    const document = createBlank();

    document.writePixel(10, 10, { r: 9, g: 8, b: 7, a: 6 });

    expect(document.readPixel(9, 10)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(11, 10)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(10, 9)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(10, 11)).toEqual(TRANSPARENT_RGBA);
  });

  it('returns a defensive copy of pixel storage', () => {
    const document = createBlank();
    const copy = document.copyPixelData();

    copy[0] = 255;
    copy[1] = 255;
    copy[2] = 255;
    copy[3] = 255;

    expect(document.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
  });
});

describe('SkinDocument cloning and metadata', () => {
  it('clones without sharing current or saved mutable pixel storage', () => {
    const original = createBlank();
    original.writePixel(3, 4, { r: 10, g: 20, b: 30, a: 40 });
    original.markSaved();

    const clone = original.clone({ id: 'cloned-document' });
    clone.writePixel(3, 4, { r: 50, g: 60, b: 70, a: 80 });
    original.writePixel(7, 8, { r: 90, g: 100, b: 110, a: 120 });

    expect(original.readPixel(3, 4)).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 40,
    });
    expect(clone.readPixel(7, 8)).toEqual(TRANSPARENT_RGBA);

    clone.writePixel(3, 4, { r: 10, g: 20, b: 30, a: 40 });
    expect(clone.isDirty).toBe(false);
    expect(original.isDirty).toBe(true);
  });

  it('retains logical identity by default and supports explicit new identity', () => {
    const original = createBlank();

    expect(original.clone().id).toBe(DOCUMENT_ID);
    expect(original.clone({ id: 'copy-document' }).id).toBe('copy-document');
  });

  it.each(['classic', 'slim'] as const)(
    'supports %s model metadata',
    (model) => {
      const document = createBlank(model);

      expect(document.model).toBe(model);
    },
  );

  it('tracks model changes as document mutations', () => {
    const document = createBlank('classic');

    expect(document.setModel('slim')).toBe(true);
    expect(document.model).toBe('slim');
    expect(document.revision).toBe(1);
    expect(document.isDirty).toBe(true);
  });
});

describe('SkinDocument saved-state foundation', () => {
  it('starts clean at revision zero', () => {
    const document = createBlank();

    expect(document.revision).toBe(0);
    expect(document.savedRevision).toBe(0);
    expect(document.isDirty).toBe(false);
  });

  it('increments revision only for effective mutations', () => {
    const document = createBlank();
    const color: RgbaColor = { r: 1, g: 2, b: 3, a: 4 };

    expect(document.writePixel(1, 1, color)).toBe(true);
    expect(document.revision).toBe(1);
    expect(document.writePixel(1, 1, color)).toBe(false);
    expect(document.setModel('classic')).toBe(false);
    expect(document.revision).toBe(1);
  });

  it('notifies narrow render subscribers only for effective mutations', () => {
    const document = createBlank();
    let notifications = 0;
    const unsubscribe = document.subscribeToMutations(() => {
      notifications += 1;
    });

    document.writePixel(1, 1, { r: 1, g: 2, b: 3, a: 4 });
    document.writePixel(1, 1, { r: 1, g: 2, b: 3, a: 4 });
    document.setModel('slim');
    expect(notifications).toBe(2);

    unsubscribe();
    document.writePixel(2, 2, { r: 5, g: 6, b: 7, a: 8 });
    expect(notifications).toBe(2);
  });

  it('marks the exact current content as saved', () => {
    const document = createBlank();

    document.writePixel(2, 3, { r: 4, g: 5, b: 6, a: 7 });
    expect(document.isDirty).toBe(true);

    document.markSaved();

    expect(document.revision).toBe(1);
    expect(document.savedRevision).toBe(1);
    expect(document.isDirty).toBe(false);
  });

  it('recognizes exact pixel restoration to saved content as clean', () => {
    const document = createBlank();
    const savedColor: RgbaColor = { r: 11, g: 22, b: 33, a: 44 };

    document.writePixel(12, 13, savedColor);
    document.markSaved();
    document.writePixel(12, 13, { r: 55, g: 66, b: 77, a: 88 });
    expect(document.isDirty).toBe(true);

    document.writePixel(12, 13, savedColor);

    expect(document.revision).toBe(3);
    expect(document.savedRevision).toBe(1);
    expect(document.isDirty).toBe(false);
  });

  it('recognizes exact model restoration to saved metadata as clean', () => {
    const document = createBlank('classic');

    document.setModel('slim');
    document.markSaved();
    document.setModel('classic');
    expect(document.isDirty).toBe(true);

    document.setModel('slim');

    expect(document.isDirty).toBe(false);
  });
});
