import { describe, expect, it, vi } from 'vitest';

import {
  SKIN_HEIGHT,
  SKIN_WIDTH,
  SkinDocument,
  TRANSPARENT_RGBA,
  type RgbaColor,
} from '../document';
import { DocumentHistory } from '../history';
import {
  ERASER_COLOR,
  beginPixelStroke,
  fillAt,
  findFloodFillRegion,
  rasterizeLine,
  samplePixel,
} from './EditorTools';

const RED: RgbaColor = { r: 230, g: 20, b: 30, a: 255 };
const SEMI_BLUE: RgbaColor = { r: 10, g: 80, b: 220, a: 128 };

function createEditor(id = 'tools-test') {
  const document = SkinDocument.createBlank({ id });
  return { document, history: new DocumentHistory(document) };
}

describe('rasterizeLine', () => {
  it.each([
    ['same point', { x: 4, y: 7 }, { x: 4, y: 7 }, [{ x: 4, y: 7 }]],
    [
      'horizontal',
      { x: 1, y: 3 },
      { x: 5, y: 3 },
      [
        { x: 1, y: 3 },
        { x: 2, y: 3 },
        { x: 3, y: 3 },
        { x: 4, y: 3 },
        { x: 5, y: 3 },
      ],
    ],
    [
      'vertical',
      { x: 2, y: 1 },
      { x: 2, y: 4 },
      [
        { x: 2, y: 1 },
        { x: 2, y: 2 },
        { x: 2, y: 3 },
        { x: 2, y: 4 },
      ],
    ],
    [
      'shallow diagonal',
      { x: 0, y: 0 },
      { x: 6, y: 3 },
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 2 },
        { x: 4, y: 2 },
        { x: 5, y: 3 },
        { x: 6, y: 3 },
      ],
    ],
    [
      'steep diagonal',
      { x: 0, y: 0 },
      { x: 3, y: 6 },
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 3 },
        { x: 2, y: 4 },
        { x: 3, y: 5 },
        { x: 3, y: 6 },
      ],
    ],
  ] as const)(
    'rasterizes a %s with both endpoints',
    (_name, start, end, expected) => {
      expect(rasterizeLine(start, end)).toEqual(expected);
    },
  );

  it('returns the exact reverse sequence in the opposite direction', () => {
    const forward = rasterizeLine({ x: 10, y: 10 }, { x: 16, y: 13 });
    const reverse = rasterizeLine({ x: 16, y: 13 }, { x: 10, y: 10 });
    expect(reverse).toEqual([...forward].reverse());
  });

  it('keeps a representative border traversal integral and gap-free', () => {
    const points = rasterizeLine({ x: 0, y: 63 }, { x: 63, y: 63 });
    expect(points).toHaveLength(64);
    expect(points[0]).toEqual({ x: 0, y: 63 });
    expect(points.at(-1)).toEqual({ x: 63, y: 63 });
    expect(new Set(points.map(({ x, y }) => `${x},${y}`))).toHaveLength(64);
    expect(
      points.every(({ x, y }) => Number.isInteger(x) && Number.isInteger(y)),
    ).toBe(true);
  });

  it('rejects fractional coordinates', () => {
    expect(() => rasterizeLine({ x: 0.5, y: 1 }, { x: 2, y: 3 })).toThrow(
      'Texture coordinates must be integers.',
    );
  });
});

describe('Pencil strokes', () => {
  it('writes one exact selected RGBA pixel for a click', () => {
    const { document, history } = createEditor();
    const stroke = beginPixelStroke(history, SEMI_BLUE, { x: 6, y: 9 });
    stroke.commit();
    expect(document.readPixel(6, 9)).toEqual(SEMI_BLUE);
    expect(history.canUndo).toBe(true);
  });

  it('supports fully transparent selected colors without blending', () => {
    const { document, history } = createEditor();
    document.writePixel(1, 1, RED);
    document.markSaved();
    const transparentColor = { r: 12, g: 34, b: 56, a: 0 };
    beginPixelStroke(history, transparentColor, { x: 1, y: 1 }).commit();
    expect(document.readPixel(1, 1)).toEqual(transparentColor);
  });

  it('rasterizes fast movement and commits one gesture as one operation', () => {
    const { document, history } = createEditor();
    const listener = vi.fn();
    history.subscribe(listener);
    const stroke = beginPixelStroke(history, RED, { x: 10, y: 10 });
    stroke.extend({ x: 16, y: 13 });
    const operation = stroke.commit();

    expect(operation?.pixels).toHaveLength(7);
    expect(listener).toHaveBeenCalledTimes(1);
    for (const point of rasterizeLine({ x: 10, y: 10 }, { x: 16, y: 13 })) {
      expect(document.readPixel(point.x, point.y)).toEqual(RED);
    }
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(true);
    expect(document.readPixel(16, 13)).toEqual(RED);
  });

  it('collapses repeated crossings of the same texel safely', () => {
    const { history } = createEditor();
    const stroke = beginPixelStroke(history, RED, { x: 2, y: 2 });
    stroke.extend({ x: 5, y: 2 });
    stroke.extend({ x: 2, y: 2 });
    expect(stroke.commit()?.pixels).toHaveLength(4);
  });

  it('does not connect separate in-bounds segments through outside space', () => {
    const { document, history } = createEditor();
    const stroke = beginPixelStroke(history, RED, { x: 0, y: 0 });
    stroke.extend(undefined);
    stroke.extend({ x: 5, y: 0 });
    expect(stroke.commit()?.pixels).toHaveLength(2);
    expect(document.readPixel(3, 0)).toEqual(TRANSPARENT_RGBA);
  });

  it('does not add a no-op stroke to history', () => {
    const { history } = createEditor();
    const stroke = beginPixelStroke(history, TRANSPARENT_RGBA, { x: 3, y: 3 });
    expect(stroke.commit()).toBeUndefined();
    expect(history.canUndo).toBe(false);
  });

  it('rolls back an unfinished cancelled stroke', () => {
    const { document, history } = createEditor();
    const stroke = beginPixelStroke(history, RED, { x: 2, y: 2 });
    stroke.extend({ x: 8, y: 2 });
    stroke.cancel();
    expect(document.readPixel(2, 2)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(8, 2)).toEqual(TRANSPARENT_RGBA);
    expect(history.canUndo).toBe(false);
    expect(document.isDirty).toBe(false);
  });
});

describe('Eraser strokes', () => {
  it('writes deterministic transparent black and restores hidden RGBA on Undo', () => {
    const { document, history } = createEditor();
    const original = { r: 99, g: 88, b: 77, a: 4 };
    document.writePixel(4, 4, original);
    document.markSaved();

    beginPixelStroke(history, ERASER_COLOR, { x: 4, y: 4 }).commit();
    expect(document.readPixel(4, 4)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    history.undo();
    expect(document.readPixel(4, 4)).toEqual(original);
    history.redo();
    expect(document.readPixel(4, 4)).toEqual(ERASER_COLOR);
  });

  it('uses continuous one-transaction stroke semantics', () => {
    const { document, history } = createEditor();
    for (let x = 1; x <= 6; x += 1) document.writePixel(x, 8, RED);
    document.markSaved();
    const stroke = beginPixelStroke(history, ERASER_COLOR, { x: 1, y: 8 });
    stroke.extend({ x: 6, y: 8 });
    expect(stroke.commit()?.pixels).toHaveLength(6);
    history.undo();
    expect(document.readPixel(1, 8)).toEqual(RED);
    expect(document.readPixel(6, 8)).toEqual(RED);
    expect(history.undo()).toBe(false);
  });

  it('treats already-transparent-black coordinates as no-ops', () => {
    const { history } = createEditor();
    expect(
      beginPixelStroke(history, ERASER_COLOR, { x: 0, y: 0 }).commit(),
    ).toBeUndefined();
  });
});

describe('Eyedropper', () => {
  it.each([
    ['opaque', { r: 1, g: 2, b: 3, a: 255 }, { x: 0, y: 0 }],
    ['translucent', { r: 4, g: 5, b: 6, a: 100 }, { x: 31, y: 42 }],
    ['fully transparent', { r: 7, g: 8, b: 9, a: 0 }, { x: 63, y: 63 }],
  ] as const)(
    'samples an exact %s boundary-safe RGBA value',
    (_name, color, point) => {
      const { document, history } = createEditor();
      document.writePixel(point.x, point.y, color);
      document.markSaved();
      const revision = document.revision;
      const dirty = document.isDirty;

      expect(samplePixel(document, point)).toEqual(color);
      expect(document.revision).toBe(revision);
      expect(document.isDirty).toBe(dirty);
      expect(history.canUndo).toBe(false);
    },
  );
});

describe('exact contiguous Fill', () => {
  it('fills a single-pixel bounded region atomically', () => {
    const { document, history } = createEditor();
    document.writePixel(10, 10, SEMI_BLUE);
    document.markSaved();
    expect(
      fillAt(document, history, { x: 10, y: 10 }, RED)?.pixels,
    ).toHaveLength(1);
    expect(document.readPixel(10, 10)).toEqual(RED);
    history.undo();
    expect(document.readPixel(10, 10)).toEqual(SEMI_BLUE);
    history.redo();
    expect(document.readPixel(10, 10)).toEqual(RED);
  });

  it('fills the whole 64x64 texture in one history operation', () => {
    const { document, history } = createEditor();
    const operation = fillAt(document, history, { x: 63, y: 63 }, SEMI_BLUE);
    expect(operation?.pixels).toHaveLength(SKIN_WIDTH * SKIN_HEIGHT);
    expect(document.readPixel(0, 0)).toEqual(SEMI_BLUE);
    expect(document.readPixel(63, 63)).toEqual(SEMI_BLUE);
    history.undo();
    expect(document.readPixel(63, 63)).toEqual(TRANSPARENT_RGBA);
  });

  it('stays inside a bounded 4-connected region', () => {
    const { document, history } = createEditor();
    for (let x = 9; x <= 13; x += 1) {
      document.writePixel(x, 9, RED);
      document.writePixel(x, 13, RED);
    }
    for (let y = 10; y <= 12; y += 1) {
      document.writePixel(9, y, RED);
      document.writePixel(13, y, RED);
    }
    document.markSaved();
    expect(
      fillAt(document, history, { x: 10, y: 10 }, SEMI_BLUE)?.pixels,
    ).toHaveLength(9);
    expect(document.readPixel(12, 12)).toEqual(SEMI_BLUE);
    expect(document.readPixel(9, 9)).toEqual(RED);
    expect(document.readPixel(8, 8)).toEqual(TRANSPARENT_RGBA);
  });

  it('does not connect diagonal-only pixels', () => {
    const { document, history } = createEditor();
    document.writePixel(1, 1, RED);
    document.writePixel(2, 2, RED);
    document.markSaved();
    fillAt(document, history, { x: 1, y: 1 }, SEMI_BLUE);
    expect(document.readPixel(1, 1)).toEqual(SEMI_BLUE);
    expect(document.readPixel(2, 2)).toEqual(RED);
  });

  it('includes alpha in exact target equality', () => {
    const { document, history } = createEditor();
    document.writePixel(1, 1, { r: 5, g: 6, b: 7, a: 100 });
    document.writePixel(2, 1, { r: 5, g: 6, b: 7, a: 101 });
    document.markSaved();
    fillAt(document, history, { x: 1, y: 1 }, RED);
    expect(document.readPixel(1, 1)).toEqual(RED);
    expect(document.readPixel(2, 1)).toEqual({ r: 5, g: 6, b: 7, a: 101 });
  });

  it('discovers boundary regions without leaving texture bounds', () => {
    const { document } = createEditor();
    document.writePixel(0, 0, RED);
    document.writePixel(1, 0, RED);
    document.writePixel(0, 1, RED);
    expect(findFloodFillRegion(document, { x: 0, y: 0 })).toHaveLength(3);
  });

  it('does nothing when replacement exactly equals the target', () => {
    const { document, history } = createEditor();
    expect(
      fillAt(document, history, { x: 0, y: 0 }, TRANSPARENT_RGBA),
    ).toBeUndefined();
    expect(history.canUndo).toBe(false);
    expect(document.revision).toBe(0);
  });
});
