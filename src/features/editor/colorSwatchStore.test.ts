import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  COLOR_RECENT_STORAGE_KEY,
  COLOR_SWATCH_STORAGE_KEY,
  MAX_RECENT_COLORS,
  addColorSwatch,
  defaultColorSwatches,
  deserializeColorSwatches,
  deserializeRecentColors,
  getColorSwatches,
  getRecentColors,
  moveColorSwatch,
  recordRecentColor,
  removeColorSwatch,
  resetColorSwatches,
  resetRecentColors,
  serializeRecentColors,
  serializeColorSwatches,
} from './colorSwatchStore';

beforeEach(() => {
  localStorage.removeItem(COLOR_SWATCH_STORAGE_KEY);
  localStorage.removeItem(COLOR_RECENT_STORAGE_KEY);
  resetColorSwatches();
  resetRecentColors();
});

afterEach(() => {
  localStorage.removeItem(COLOR_SWATCH_STORAGE_KEY);
  localStorage.removeItem(COLOR_RECENT_STORAGE_KEY);
  resetColorSwatches();
  resetRecentColors();
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

describe('recent colors', () => {
  it('keeps exact RGBA identity, promotes duplicates, and enforces the bound', () => {
    const colors = Array.from(
      { length: MAX_RECENT_COLORS + 3 },
      (_, index) => ({
        r: index,
        g: index + 20,
        b: index + 40,
        a: index + 60,
      }),
    );

    for (const color of colors) recordRecentColor(color);

    expect(getRecentColors()).toHaveLength(MAX_RECENT_COLORS);
    expect(getRecentColors()[0]).toEqual(colors.at(-1));
    expect(getRecentColors().at(-1)).toEqual(colors[3]);

    recordRecentColor({ ...colors[4]!, a: colors[4]!.a + 1 });
    expect(getRecentColors()[0]).toEqual({
      ...colors[4],
      a: colors[4]!.a + 1,
    });
    recordRecentColor(colors.at(-1)!);
    expect(getRecentColors()[0]).toEqual(colors.at(-1));
    expect(
      getRecentColors().filter(
        (color) =>
          color.r === colors.at(-1)!.r &&
          color.g === colors.at(-1)!.g &&
          color.b === colors.at(-1)!.b &&
          color.a === colors.at(-1)!.a,
      ),
    ).toHaveLength(1);
  });

  it('persists bounded recents and rejects malformed payloads', () => {
    const colors = [
      { r: 12, g: 34, b: 56, a: 78 },
      { r: 12, g: 34, b: 56, a: 79 },
    ];
    const serialized = serializeRecentColors(colors);

    expect(deserializeRecentColors(serialized)).toEqual(colors);
    expect(
      deserializeRecentColors(JSON.stringify({ version: 2, colors })),
    ).toEqual([]);
    expect(
      deserializeRecentColors(
        JSON.stringify({
          version: 1,
          colors: [{ r: 1, g: 2, b: 3, a: 256 }],
        }),
      ),
    ).toEqual([]);
  });
});
