import { afterEach, describe, expect, it, vi } from 'vitest';

import { SkinDocument, type RgbaColor } from '../../engine/document';
import { DocumentHistory } from '../../engine/history';
import type { SkinPickResult } from '../../renderers/three';
import {
  getEditorToolState,
  resetEditorColors,
} from '../editor/editorToolStore';
import { ThreeDToolInteraction } from './threeDToolInteraction';

const PAINT_COLOR: RgbaColor = { r: 220, g: 80, b: 40, a: 255 };

function pick(
  x: number,
  y: number,
  overrides: Partial<SkinPickResult> = {},
): SkinPickResult {
  return {
    model: 'classic',
    bodyPart: 'torso',
    layer: 'base',
    face: 'front',
    x,
    y,
    uv: { u: x / 64, v: y / 64 },
    point: { x: 0, y: 0, z: 0 },
    distance: 1,
    triangle: 0,
    ...overrides,
  };
}

describe('direct 3D tool interaction', () => {
  afterEach(() => {
    resetEditorColors();
  });

  it('paints a continuous same-face stroke as one undoable operation', () => {
    const document = SkinDocument.createBlank({ id: '3d-pencil' });
    const history = new DocumentHistory(document);
    const interaction = new ThreeDToolInteraction(document, history, vi.fn());

    expect(
      interaction.pointerDown(1, 0, pick(2, 3), 'pencil', PAINT_COLOR),
    ).toBe(true);
    interaction.pointerMove(1, pick(6, 3));
    interaction.pointerUp(1);

    for (let x = 2; x <= 6; x += 1) {
      expect(document.readPixel(x, 3)).toEqual(PAINT_COLOR);
    }
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe(true);
    for (let x = 2; x <= 6; x += 1) {
      expect(document.readPixel(x, 3)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    }
    expect(history.redo()).toBe(true);
    expect(document.readPixel(6, 3)).toEqual(PAINT_COLOR);
  });

  it('breaks interpolation across faces, layers, parts, and raycast misses', () => {
    const document = SkinDocument.createBlank({ id: '3d-breaks' });
    const history = new DocumentHistory(document);
    const interaction = new ThreeDToolInteraction(document, history, vi.fn());

    interaction.pointerDown(7, 0, pick(2, 3), 'pencil', PAINT_COLOR);
    interaction.pointerMove(7, pick(10, 3, { face: 'back', bodyPart: 'head' }));
    interaction.pointerMove(7, undefined);
    interaction.pointerMove(7, pick(14, 3, { layer: 'outer', model: 'slim' }));
    interaction.pointerUp(7);

    expect(document.readPixel(2, 3)).toEqual(PAINT_COLOR);
    expect(document.readPixel(10, 3)).toEqual(PAINT_COLOR);
    expect(document.readPixel(14, 3)).toEqual(PAINT_COLOR);
    expect(document.readPixel(3, 3)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(document.readPixel(9, 3)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(history.canUndo).toBe(true);
  });

  it('uses exact 3D seeds for fill and eraser while retaining one history entry', () => {
    const document = SkinDocument.createBlank({ id: '3d-fill-erase' });
    const fillColor: RgbaColor = { r: 20, g: 40, b: 60, a: 255 };
    for (const x of [5, 6, 7]) document.writePixel(x, 5, fillColor);
    document.markSaved();
    const history = new DocumentHistory(document);
    const interaction = new ThreeDToolInteraction(document, history, vi.fn());

    expect(interaction.pointerDown(1, 0, pick(6, 5), 'fill', PAINT_COLOR)).toBe(
      true,
    );
    expect(document.readPixel(5, 5)).toEqual(PAINT_COLOR);
    expect(document.readPixel(7, 5)).toEqual(PAINT_COLOR);
    expect(history.canUndo).toBe(true);
    expect(document.isDirty).toBe(true);

    expect(
      interaction.pointerDown(2, 0, pick(6, 5), 'eraser', PAINT_COLOR),
    ).toBe(true);
    interaction.pointerUp(2);
    expect(document.readPixel(6, 5)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

  it('samples exact RGBA with the eyedropper without revision or history changes', () => {
    const document = SkinDocument.createBlank({ id: '3d-eyedropper' });
    const sampled: RgbaColor = { r: 1, g: 2, b: 3, a: 127 };
    document.writePixel(9, 11, sampled);
    document.markSaved();
    const history = new DocumentHistory(document);
    const setColor = vi.fn();
    const interaction = new ThreeDToolInteraction(document, history, setColor);
    const revision = document.revision;

    expect(
      interaction.pointerDown(1, 0, pick(9, 11), 'eyedropper', PAINT_COLOR),
    ).toBe(true);
    expect(setColor).toHaveBeenCalledWith('primary', sampled);
    expect(document.revision).toBe(revision);
    expect(document.isDirty).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it('paints and samples the secondary slot through the secondary action', () => {
    const document = SkinDocument.createBlank({ id: '3d-secondary' });
    const history = new DocumentHistory(document);
    const setColor = vi.fn();
    const interaction = new ThreeDToolInteraction(document, history, setColor);
    const secondaryColor: RgbaColor = { r: 9, g: 19, b: 29, a: 39 };

    expect(
      interaction.pointerDown(
        1,
        0,
        pick(12, 13),
        'pencil',
        secondaryColor,
        'secondary',
      ),
    ).toBe(true);
    interaction.pointerUp(1);
    expect(document.readPixel(12, 13)).toEqual(secondaryColor);

    document.writePixel(14, 15, { r: 101, g: 102, b: 103, a: 104 });
    const revision = document.revision;
    expect(
      interaction.pointerDown(
        2,
        0,
        pick(14, 15),
        'eyedropper',
        secondaryColor,
        'secondary',
      ),
    ).toBe(true);
    expect(setColor).toHaveBeenCalledWith('secondary', {
      r: 101,
      g: 102,
      b: 103,
      a: 104,
    });
    expect(document.revision).toBe(revision);
    expect(getEditorToolState().activeColorSlot).toBe('primary');
  });

  it('uses the secondary color for a secondary fill action', () => {
    const document = SkinDocument.createBlank({ id: '3d-secondary-fill' });
    const history = new DocumentHistory(document);
    const interaction = new ThreeDToolInteraction(document, history, vi.fn());
    const sourceColor: RgbaColor = { r: 30, g: 40, b: 50, a: 255 };
    const secondaryColor: RgbaColor = { r: 60, g: 70, b: 80, a: 90 };

    for (const x of [5, 6, 7]) document.writePixel(x, 5, sourceColor);
    document.markSaved();

    expect(
      interaction.pointerDown(
        1,
        0,
        pick(6, 5),
        'fill',
        secondaryColor,
        'secondary',
      ),
    ).toBe(true);
    for (const x of [5, 6, 7]) {
      expect(document.readPixel(x, 5)).toEqual(secondaryColor);
    }
    expect(document.isDirty).toBe(true);
    expect(history.canUndo).toBe(true);
  });

  it('rolls back a canceled stroke and ignores non-primary buttons', () => {
    const document = SkinDocument.createBlank({ id: '3d-cancel' });
    const history = new DocumentHistory(document);
    const interaction = new ThreeDToolInteraction(document, history, vi.fn());

    expect(
      interaction.pointerDown(3, 2, pick(2, 2), 'pencil', PAINT_COLOR),
    ).toBe(false);
    expect(
      interaction.pointerDown(3, 0, pick(2, 2), 'pencil', PAINT_COLOR),
    ).toBe(true);
    interaction.pointerMove(3, pick(4, 2));
    interaction.cancel(3);

    for (let x = 2; x <= 4; x += 1) {
      expect(document.readPixel(x, 2)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    }
    expect(document.isDirty).toBe(false);
    expect(history.canUndo).toBe(false);
    expect(interaction.isActive).toBe(false);
  });
});
