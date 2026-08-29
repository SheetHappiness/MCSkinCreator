import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  COLOR_SWATCH_STORAGE_KEY,
  addColorSwatch,
  defaultColorSwatches,
  deserializeColorSwatches,
  getColorSwatches,
  moveColorSwatch,
  removeColorSwatch,
  resetColorSwatches,
  serializeColorSwatches,
} from './colorSwatchStore';

beforeEach(() => {
  localStorage.removeItem(COLOR_SWATCH_STORAGE_KEY);
  resetColorSwatches();
});

afterEach(() => {
  localStorage.removeItem(COLOR_SWATCH_STORAGE_KEY);
  resetColorSwatches();
});

describe('local color swatches', () => {
  it('adds exact swatches and persists a versioned representation', () => {
    const added = addColorSwatch({
      color: { r: 12, g: 34, b: 56, a: 78 },
      name: 'Test blue',
    });

    expect(added.id).not.toBe('');
    expect(getColorSwatches().at(-1)).toEqual(added);
    expect(
      deserializeColorSwatches(localStorage.getItem(COLOR_SWATCH_STORAGE_KEY)),
    ).toEqual(getColorSwatches());
  });

  it('supports remove and deterministic reorder without document state', () => {
    const first = getColorSwatches()[0]!;
    const added = addColorSwatch({
      color: { r: 12, g: 34, b: 56, a: 78 },
    });

    for (let index = 0; index < getColorSwatches().length; index += 1) {
      moveColorSwatch(added.id, -1);
    }
    expect(getColorSwatches()[0]?.id).toBe(added.id);
    removeColorSwatch(added.id);
    expect(getColorSwatches()[0]?.id).toBe(first.id);
  });

  it('deduplicates exact colors while retaining alpha as part of identity', () => {
    const color = { r: 12, g: 34, b: 56, a: 78 };
    const first = addColorSwatch({ color });
    const duplicate = addColorSwatch({ color: { ...color } });
    const differentAlpha = addColorSwatch({ color: { ...color, a: 79 } });

    expect(duplicate.id).toBe(first.id);
    expect(differentAlpha.id).not.toBe(first.id);
  });

  it('recovers invalid, version-mismatched, and duplicate persisted data', () => {
    const defaults = defaultColorSwatches();
    for (const raw of [
      '{bad json',
      JSON.stringify({ version: 2, swatches: [] }),
      JSON.stringify({
        version: 1,
        swatches: [
          {
            id: 'duplicate',
            color: { r: 0, g: 0, b: 0, a: 255 },
          },
          {
            id: 'duplicate',
            color: { r: 1, g: 1, b: 1, a: 255 },
          },
        ],
      }),
    ]) {
      expect(deserializeColorSwatches(raw)).toEqual(defaults);
    }
  });

  it('serializes an empty user palette without replacing it with defaults', () => {
    const serialized = serializeColorSwatches([]);
    expect(deserializeColorSwatches(serialized)).toEqual([]);
  });
});
