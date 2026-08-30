import { afterEach, describe, expect, it } from 'vitest';

import { SkinDocument } from '../../engine/document';
import { DocumentHistory } from '../../engine/history';
import {
  DEFAULT_PRIMARY_COLOR,
  DEFAULT_SECONDARY_COLOR,
  getEditorToolState,
  resetEditorColors,
  setActiveColorSlot,
  setEditorColor,
  swapEditorColors,
} from './editorToolStore';
import { getRecentColors, resetRecentColors } from './colorSwatchStore';

afterEach(() => {
  resetEditorColors();
  resetRecentColors();
});

describe('primary and secondary editor colors', () => {
  it('starts with opaque black primary and opaque white secondary defaults', () => {
    const state = getEditorToolState();

    expect(state.primaryColor).toEqual(DEFAULT_PRIMARY_COLOR);
    expect(state.secondaryColor).toEqual(DEFAULT_SECONDARY_COLOR);
    expect(state.activeColorSlot).toBe('primary');
  });

  it('updates exact RGBA slots without dirtying a document or creating history', () => {
    const skinDocument = SkinDocument.createBlank({ id: 'color-state' });
    const history = new DocumentHistory(skinDocument);
    const color = { r: 12, g: 34, b: 56, a: 78 };

    setEditorColor('secondary', color);
    setActiveColorSlot('secondary');

    expect(getEditorToolState().secondaryColor).toEqual(color);
    expect(getEditorToolState().activeColorSlot).toBe('secondary');
    expect(skinDocument.revision).toBe(0);
    expect(skinDocument.isDirty).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(getRecentColors()[0]).toEqual(color);
  });

  it('swaps colors without changing the active slot', () => {
    setEditorColor('primary', { r: 1, g: 2, b: 3, a: 4 });
    setEditorColor('secondary', { r: 5, g: 6, b: 7, a: 8 });
    setActiveColorSlot('secondary');

    swapEditorColors();

    expect(getEditorToolState()).toMatchObject({
      primaryColor: { r: 5, g: 6, b: 7, a: 8 },
      secondaryColor: { r: 1, g: 2, b: 3, a: 4 },
      activeColorSlot: 'secondary',
    });
  });

  it('resets both colors and the active slot to the documented defaults', () => {
    setEditorColor('primary', { r: 1, g: 2, b: 3, a: 4 });
    setEditorColor('secondary', { r: 5, g: 6, b: 7, a: 8 });
    setActiveColorSlot('secondary');

    resetEditorColors();

    expect(getEditorToolState()).toMatchObject({
      primaryColor: DEFAULT_PRIMARY_COLOR,
      secondaryColor: DEFAULT_SECONDARY_COLOR,
      activeColorSlot: 'primary',
    });
  });

  it('rejects non-byte color channels', () => {
    expect(() =>
      setEditorColor('primary', { r: 256, g: 0, b: 0, a: 255 }),
    ).toThrow(RangeError);
    expect(() =>
      setEditorColor('secondary', { r: 0, g: 0, b: 0, a: 1.5 }),
    ).toThrow(RangeError);
  });
});
