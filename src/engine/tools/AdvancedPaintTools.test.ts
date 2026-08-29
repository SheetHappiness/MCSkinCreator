import { describe, expect, it } from 'vitest';

import { SkinDocument, type RgbaColor } from '../document';
import { DocumentHistory } from '../history';
import {
  beginAdvancedPaintStroke,
  darkenColor,
  lightenColor,
  noiseColor,
  type AdvancedPaintColors,
  type NoiseToolOptions,
} from './AdvancedPaintTools';

const TRANSPARENT_SOURCE: RgbaColor = {
  r: 100,
  g: 100,
  b: 100,
  a: 77,
};
const COLORS: AdvancedPaintColors = {
  primary: { r: 220, g: 40, b: 20, a: 255 },
  secondary: { r: 20, g: 40, b: 220, a: 255 },
};

function createDocument(
  pixels: readonly {
    readonly x: number;
    readonly y: number;
    readonly color: RgbaColor;
  }[] = [],
): SkinDocument {
  const data = new Uint8ClampedArray(64 * 64 * 4);
  for (const { x, y, color } of pixels) {
    const offset = (y * 64 + x) * 4;
    data.set([color.r, color.g, color.b, color.a], offset);
  }
  return SkinDocument.create({
    id: 'advanced-tools',
    width: 64,
    height: 64,
    pixels: data,
  });
}

function sequenceRandom(values: readonly number[]): () => number {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('advanced paint color transforms', () => {
  it('lightens and darkens HSV value exactly while preserving alpha', () => {
    expect(lightenColor(TRANSPARENT_SOURCE, 0.5)).toEqual({
      r: 178,
      g: 178,
      b: 178,
      a: 77,
    });
    expect(darkenColor(TRANSPARENT_SOURCE, 0.5)).toEqual({
      r: 50,
      g: 50,
      b: 50,
      a: 77,
    });
  });

  it('honors strength boundaries and rejects invalid strengths', () => {
    const color = { r: 64, g: 128, b: 192, a: 63 };
    expect(lightenColor(color, 0)).toEqual(color);
    expect(darkenColor(color, 0)).toEqual(color);
    expect(lightenColor(color, 1)).toEqual({
      r: 85,
      g: 170,
      b: 255,
      a: 63,
    });
    expect(darkenColor(color, 1)).toEqual({ r: 0, g: 0, b: 0, a: 63 });
    expect(() => lightenColor(color, -0.1)).toThrow(RangeError);
    expect(() => darkenColor(color, 1.1)).toThrow(RangeError);
  });
});

describe('advanced paint strokes', () => {
  it('applies noise through an injectable deterministic RNG without touching alpha', () => {
    const options: NoiseToolOptions = { strength: 0.5, density: 1, seed: 7 };
    expect(
      noiseColor(
        { r: 100, g: 150, b: 200, a: 91 },
        options,
        sequenceRandom([0, 0.75]),
      ),
    ).toEqual({ r: 116, g: 166, b: 216, a: 91 });
    expect(
      noiseColor(
        { r: 100, g: 150, b: 200, a: 91 },
        { ...options, density: 0 },
        sequenceRandom([0]),
      ),
    ).toEqual({ r: 100, g: 150, b: 200, a: 91 });
  });

  it('keeps one noise gesture exact through undo and redo', () => {
    const source = { r: 100, g: 150, b: 200, a: 91 };
    const document = createDocument([
      { x: 4, y: 4, color: source },
      { x: 5, y: 4, color: source },
    ]);
    const history = new DocumentHistory(document);
    let randomCalls = 0;
    const random = () => {
      randomCalls += 1;
      return randomCalls % 2 === 1 ? 0 : 0.75;
    };
    const stroke = beginAdvancedPaintStroke(
      document,
      history,
      'noise',
      { strength: 0.5, density: 1, seed: 7 },
      COLORS,
      { x: 4, y: 4 },
      random,
    );
    stroke.extend({ x: 5, y: 4 });
    expect(stroke.commit()).toBeDefined();
    const changed = document.copyPixelData();
    expect(randomCalls).toBe(4);
    expect(history.canUndo).toBe(true);

    expect(history.undo()).toBe(true);
    expect(document.readPixel(4, 4)).toEqual(source);
    expect(document.readPixel(5, 4)).toEqual(source);
    expect(history.redo()).toBe(true);
    expect(document.copyPixelData()).toEqual(changed);
    expect(randomCalls).toBe(4);
  });

  it('does not create history for no-op transforms or already-applied stamps', () => {
    const source = { r: 100, g: 100, b: 100, a: 77 };
    const document = createDocument([{ x: 1, y: 1, color: source }]);
    const history = new DocumentHistory(document);
    const transform = beginAdvancedPaintStroke(
      document,
      history,
      'lighten',
      { strength: 0 },
      COLORS,
      { x: 1, y: 1 },
    );
    expect(transform.commit()).toBeUndefined();
    expect(history.canUndo).toBe(false);

    const stampDocument = createDocument([
      { x: 1, y: 1, color: COLORS.primary },
      { x: 2, y: 1, color: COLORS.secondary },
      { x: 1, y: 2, color: COLORS.secondary },
      { x: 2, y: 2, color: COLORS.primary },
    ]);
    const stampHistory = new DocumentHistory(stampDocument);
    const stamp = beginAdvancedPaintStroke(
      stampDocument,
      stampHistory,
      'stamp',
      { pattern: 'checker-2x2' },
      COLORS,
      { x: 1, y: 1 },
    );
    expect(stamp.commit()).toBeUndefined();
    expect(stampHistory.canUndo).toBe(false);
  });

  it('applies checker stamps as one clipped transaction', () => {
    const document = createDocument();
    const history = new DocumentHistory(document);
    const stroke = beginAdvancedPaintStroke(
      document,
      history,
      'stamp',
      { pattern: 'checker-2x2' },
      COLORS,
      { x: 63, y: 63 },
    );

    expect(stroke.commit()).toBeDefined();
    expect(document.readPixel(63, 63)).toEqual(COLORS.primary);
    expect(document.readPixel(62, 63)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(document.readPixel(63, 62)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(history.canUndo).toBe(true);
  });

  it('preserves stamp patterns across a drag and records one gesture', () => {
    const document = createDocument();
    const history = new DocumentHistory(document);
    const stroke = beginAdvancedPaintStroke(
      document,
      history,
      'stamp',
      { pattern: 'stripe-3x3' },
      COLORS,
      { x: 2, y: 2 },
    );
    stroke.extend({ x: 3, y: 2 });
    stroke.extend({ x: 3, y: 2 });
    stroke.commit();

    expect(document.readPixel(2, 2)).toEqual(COLORS.primary);
    expect(document.readPixel(2, 3)).toEqual(COLORS.secondary);
    expect(document.readPixel(3, 2)).toEqual(COLORS.primary);
    expect(history.canUndo).toBe(true);
    expect(history.undo()).toBe(true);
    expect(document.readPixel(2, 2)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  it('rolls back a canceled transform without a history operation', () => {
    const document = createDocument([
      { x: 8, y: 8, color: TRANSPARENT_SOURCE },
    ]);
    const history = new DocumentHistory(document);
    const stroke = beginAdvancedPaintStroke(
      document,
      history,
      'lighten',
      { strength: 0.5 },
      COLORS,
      { x: 8, y: 8 },
    );
    stroke.cancel();

    expect(document.readPixel(8, 8)).toEqual(TRANSPARENT_SOURCE);
    expect(document.isDirty).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(stroke.isActive).toBe(false);
  });
});
