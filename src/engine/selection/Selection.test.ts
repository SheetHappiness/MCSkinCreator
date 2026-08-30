import { describe, expect, it } from 'vitest';

import { SkinDocument, TRANSPARENT_RGBA, type RgbaColor } from '../document';
import { DocumentHistory } from '../history';
import {
  SelectionClipboard,
  SelectionController,
  clipPixelRegion,
  copySelection,
  cutSelection,
  deleteSelection,
  moveSelection,
  normalizeSelectionRect,
  pasteClipboard,
} from './Selection';

const RED: RgbaColor = { r: 0xa1, g: 0xb2, b: 0xc3, a: 0x40 };
const GREEN: RgbaColor = { r: 0x11, g: 0x22, b: 0x33, a: 0xff };
const BLUE: RgbaColor = { r: 0x44, g: 0x55, b: 0x66, a: 0x80 };
const HIDDEN_TRANSPARENT: RgbaColor = { r: 7, g: 8, b: 9, a: 0 };

function documentWithPixels(): SkinDocument {
  const document = SkinDocument.createBlank({ id: 'selection-test' });
  document.writePixel(0, 0, RED);
  document.writePixel(1, 0, GREEN);
  document.writePixel(0, 1, BLUE);
  document.writePixel(1, 1, HIDDEN_TRANSPARENT);
  return document;
}

function operationLabels(history: DocumentHistory): string[] {
  return history
    .getTimelineState()
    .entries.filter((entry) => entry.kind === 'operation')
    .map((entry) => entry.label);
}

describe('selection geometry', () => {
  it.each([
    [
      { x: 2, y: 3 },
      { x: 5, y: 7 },
      { x: 2, y: 3, width: 4, height: 5 },
    ],
    [
      { x: 5, y: 7 },
      { x: 2, y: 3 },
      { x: 2, y: 3, width: 4, height: 5 },
    ],
    [
      { x: 5, y: 3 },
      { x: 2, y: 7 },
      { x: 2, y: 3, width: 4, height: 5 },
    ],
    [
      { x: 2, y: 7 },
      { x: 5, y: 3 },
      { x: 2, y: 3, width: 4, height: 5 },
    ],
  ] as const)('normalizes drag direction %o → %o', (start, end, expected) => {
    expect(normalizeSelectionRect(start, end)).toEqual(expected);
  });

  it('uses the first and last texels as inclusive drag endpoints', () => {
    expect(normalizeSelectionRect({ x: 63, y: 63 }, { x: 0, y: 0 })).toEqual({
      x: 0,
      y: 0,
      width: 64,
      height: 64,
    });
    expect(
      normalizeSelectionRect({ x: -20, y: -20 }, { x: 100, y: 100 }),
    ).toEqual({ x: 0, y: 0, width: 64, height: 64 });
  });

  it('clips floating regions without changing their logical dimensions', () => {
    expect(clipPixelRegion({ x: -2, y: 62, width: 4, height: 4 })).toEqual({
      x: 0,
      y: 62,
      width: 2,
      height: 2,
    });
    expect(
      clipPixelRegion({ x: 64, y: 0, width: 2, height: 2 }),
    ).toBeUndefined();
  });
});

describe('exact selection pixel operations', () => {
  it('copies every RGBA byte, including transparent RGB bytes, defensively', () => {
    const document = documentWithPixels();
    const clipboard = copySelection(document, {
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });

    expect(clipboard.width).toBe(2);
    expect(clipboard.height).toBe(2);
    expect([...clipboard.data]).toEqual([
      0xa1, 0xb2, 0xc3, 0x40, 0x11, 0x22, 0x33, 0xff, 0x44, 0x55, 0x66, 0x80, 7,
      8, 9, 0,
    ]);

    clipboard.data[0] = 0;
    expect(
      copySelection(document, { x: 0, y: 0, width: 1, height: 1 }).data[0],
    ).toBe(0xa1);
  });

  it('cuts as one transparent-black transaction and restores exact RGBA on undo/redo', () => {
    const document = documentWithPixels();
    const history = new DocumentHistory(document);
    const clipboard = cutSelection(document, history, {
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });

    expect([...clipboard.data]).toEqual([
      0xa1, 0xb2, 0xc3, 0x40, 0x11, 0x22, 0x33, 0xff, 0x44, 0x55, 0x66, 0x80, 7,
      8, 9, 0,
    ]);
    expect(document.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(1, 1)).toEqual(TRANSPARENT_RGBA);
    expect(operationLabels(history)).toEqual(['Cut']);

    expect(history.undo()).toBe(true);
    expect(document.readPixel(0, 0)).toEqual(RED);
    expect(document.readPixel(1, 0)).toEqual(GREEN);
    expect(document.readPixel(0, 1)).toEqual(BLUE);
    expect(history.redo()).toBe(true);
    expect(document.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
  });

  it('deletes a rectangle in one transaction and preserves clean no-op behavior', () => {
    const document = documentWithPixels();
    const history = new DocumentHistory(document);
    deleteSelection(document, history, { x: 0, y: 0, width: 2, height: 2 });
    expect(operationLabels(history)).toEqual(['Delete']);
    expect(
      deleteSelection(document, history, { x: 0, y: 0, width: 2, height: 2 }),
    ).toBeUndefined();
    expect(operationLabels(history)).toEqual(['Delete']);
  });

  it('pastes exact RGBA data with one undoable operation', () => {
    const document = SkinDocument.createBlank({ id: 'paste-test' });
    const history = new DocumentHistory(document);
    const clipboard = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0,
      ]),
    };

    pasteClipboard(document, history, clipboard, { x: 4, y: 5 });
    expect(document.readPixel(4, 5)).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 4,
    });
    expect(document.readPixel(5, 5)).toEqual({
      r: 5,
      g: 6,
      b: 7,
      a: 8,
    });
    expect(document.readPixel(4, 6)).toEqual({
      r: 9,
      g: 10,
      b: 11,
      a: 12,
    });
    expect(document.readPixel(5, 6)).toEqual({
      r: 13,
      g: 14,
      b: 15,
      a: 0,
    });
    expect(operationLabels(history)).toEqual(['Paste']);
    expect(history.undo()).toBe(true);
    expect(document.readPixel(4, 5)).toEqual(TRANSPARENT_RGBA);
    expect(history.redo()).toBe(true);
    expect(document.readPixel(5, 6)).toEqual({
      r: 13,
      g: 14,
      b: 15,
      a: 0,
    });
  });

  it('clips a paste to the last texture texel', () => {
    const document = SkinDocument.createBlank({ id: 'paste-clipping-test' });
    const history = new DocumentHistory(document);
    const clipboard = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([
        1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0,
      ]),
    };

    pasteClipboard(document, history, clipboard, { x: 63, y: 63 });
    expect(document.readPixel(63, 63)).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 4,
    });
    expect(operationLabels(history)).toEqual(['Paste']);
  });

  it('moves every RGBA byte exactly', () => {
    const document = documentWithPixels();
    const history = new DocumentHistory(document);
    moveSelection(
      document,
      history,
      { x: 0, y: 0, width: 2, height: 2 },
      { x: 4, y: 3 },
    );

    expect(document.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(1, 1)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(4, 3)).toEqual(RED);
    expect(document.readPixel(5, 3)).toEqual(GREEN);
    expect(document.readPixel(4, 4)).toEqual(BLUE);
    expect(document.readPixel(5, 4)).toEqual(HIDDEN_TRANSPARENT);
    expect(operationLabels(history)).toEqual(['Move Selection']);
    expect(history.undo()).toBe(true);
    expect(document.readPixel(0, 0)).toEqual(RED);
    expect(document.readPixel(1, 0)).toEqual(GREEN);
    expect(document.readPixel(0, 1)).toEqual(BLUE);
    expect(document.readPixel(1, 1)).toEqual(HIDDEN_TRANSPARENT);
  });

  it('clips a moved selection at the last texture texel', () => {
    const document = documentWithPixels();
    const history = new DocumentHistory(document);

    moveSelection(
      document,
      history,
      { x: 0, y: 0, width: 2, height: 2 },
      { x: 63, y: 63 },
    );

    expect(document.readPixel(63, 63)).toEqual(RED);
    expect(document.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(1, 1)).toEqual(TRANSPARENT_RGBA);
  });
});

describe('SelectionController lifecycle', () => {
  it('keeps selection state outside document dirty/history state', () => {
    const document = SkinDocument.createBlank({ id: 'controller-selection' });
    const history = new DocumentHistory(document);
    const controller = new SelectionController(
      document,
      history,
      new SelectionClipboard(),
    );

    controller.beginSelection({ x: 4, y: 5 });
    controller.updateSelection({ x: 1, y: 2 });
    expect(controller.getState().draft).toEqual({
      x: 1,
      y: 2,
      width: 4,
      height: 4,
    });
    controller.commitSelection();
    expect(controller.getState().selection).toEqual({
      x: 1,
      y: 2,
      width: 4,
      height: 4,
    });
    expect(document.isDirty).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it('supports floating paste move, keyboard-style movement, cancel, and commit', () => {
    const document = documentWithPixels();
    const history = new DocumentHistory(document);
    const controller = new SelectionController(
      document,
      history,
      new SelectionClipboard(),
    );
    controller.setSelection({ x: 0, y: 0, width: 2, height: 2 });
    controller.copy();
    expect(controller.beginPaste({ x: 10, y: 10 })).toBe(true);
    controller.moveFloatingBy({ x: 1, y: 2 });
    expect(controller.getState().floating?.rect).toEqual({
      x: 11,
      y: 12,
      width: 2,
      height: 2,
    });
    const beforeCancel = document.copyPixelData();
    controller.cancelFloating();
    expect(document.copyPixelData()).toEqual(beforeCancel);
    expect(history.canUndo).toBe(false);

    expect(controller.beginPaste({ x: 10, y: 10 })).toBe(true);
    controller.moveFloatingBy({ x: 1, y: 0 });
    controller.commitFloating();
    expect(operationLabels(history)).toEqual(['Paste']);
    expect(document.readPixel(11, 10)).toEqual(RED);
    expect(history.undo()).toBe(true);
    expect(document.readPixel(11, 10)).toEqual(TRANSPARENT_RGBA);
    expect(history.redo()).toBe(true);
    expect(document.readPixel(11, 10)).toEqual(RED);
  });

  it('rolls back a moved selection on cancel and clears replacement-document state', () => {
    const document = documentWithPixels();
    const history = new DocumentHistory(document);
    const controller = new SelectionController(
      document,
      history,
      new SelectionClipboard(),
    );
    controller.setSelection({ x: 0, y: 0, width: 2, height: 2 });
    const before = document.copyPixelData();
    expect(controller.beginMove({ x: 0, y: 0 })).toBe(true);
    controller.moveFloatingBy({ x: -1, y: 0 });
    controller.cancelFloating();
    expect(document.copyPixelData()).toEqual(before);
    expect(history.canUndo).toBe(false);

    controller.beginSelection({ x: 8, y: 8 });
    controller.clear();
    expect(controller.getState()).toEqual({
      selection: undefined,
      draft: undefined,
      floating: undefined,
    });
  });
});
