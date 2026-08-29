import { describe, expect, it, vi } from 'vitest';

import { SkinDocument, TRANSPARENT_RGBA, type RgbaColor } from '../document';
import { DocumentHistory } from './DocumentHistory';

const RED: RgbaColor = { r: 255, g: 0, b: 0, a: 255 };
const BLUE_ALPHA: RgbaColor = { r: 4, g: 30, b: 220, a: 37 };

function createEditor(capacity?: number): {
  document: SkinDocument;
  history: DocumentHistory;
} {
  const document = SkinDocument.createBlank({ id: 'history-document' });
  return {
    document,
    history: new DocumentHistory(document, capacity),
  };
}

describe('DocumentHistory basic Undo and Redo', () => {
  it('starts without Undo or Redo', () => {
    const { history } = createEditor();

    expect(history.getState()).toEqual({ canUndo: false, canRedo: false });
    expect(history.undo()).toBe(false);
    expect(history.redo()).toBe(false);
  });

  it.each([
    [0, 0],
    [63, 63],
  ])('restores and reapplies the exact pixel at (%i, %i)', (x, y) => {
    const { document, history } = createEditor();

    expect(history.editPixel(x, y, BLUE_ALPHA)).toBe(true);
    expect(history.getState()).toEqual({ canUndo: true, canRedo: false });
    expect(document.readPixel(x, y)).toEqual(BLUE_ALPHA);

    expect(history.undo()).toBe(true);
    expect(document.readPixel(x, y)).toEqual(TRANSPARENT_RGBA);
    expect(history.getState()).toEqual({ canUndo: false, canRedo: true });

    expect(history.redo()).toBe(true);
    expect(document.readPixel(x, y)).toEqual(BLUE_ALPHA);
    expect(history.getState()).toEqual({ canUndo: true, canRedo: false });
  });

  it('undoes multiple operations in reverse and redoes them forward', () => {
    const { document, history } = createEditor();
    const green: RgbaColor = { r: 0, g: 200, b: 30, a: 128 };

    history.editPixel(1, 1, RED);
    history.editPixel(2, 2, green);

    history.undo();
    expect(document.readPixel(1, 1)).toEqual(RED);
    expect(document.readPixel(2, 2)).toEqual(TRANSPARENT_RGBA);
    history.undo();
    expect(document.readPixel(1, 1)).toEqual(TRANSPARENT_RGBA);

    history.redo();
    expect(document.readPixel(1, 1)).toEqual(RED);
    expect(document.readPixel(2, 2)).toEqual(TRANSPARENT_RGBA);
    history.redo();
    expect(document.readPixel(2, 2)).toEqual(green);
  });

  it('clears the Redo branch after a new effective edit', () => {
    const { document, history } = createEditor();

    history.editPixel(1, 1, RED);
    history.editPixel(2, 2, BLUE_ALPHA);
    history.undo();
    history.editPixel(3, 3, { r: 9, g: 8, b: 7, a: 6 });

    expect(history.canRedo).toBe(false);
    expect(history.redo()).toBe(false);
    expect(document.readPixel(2, 2)).toEqual(TRANSPARENT_RGBA);
  });

  it('does not create history for a no-op edit', () => {
    const { history } = createEditor();

    expect(history.editPixel(5, 5, TRANSPARENT_RGBA)).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it('copies caller-owned colors before recording history', () => {
    const { document, history } = createEditor();
    const mutable = { r: 10, g: 20, b: 30, a: 40 };

    history.editPixel(4, 4, mutable);
    mutable.r = 99;
    mutable.a = 0;
    history.undo();
    history.redo();

    expect(document.readPixel(4, 4)).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 40,
    });
  });
});

describe('DocumentHistory transaction semantics', () => {
  it('commits multiple pixels as one operation and replays them atomically', () => {
    const { document, history } = createEditor();
    const listener = vi.fn();
    history.subscribe(listener);
    const transaction = history.beginTransaction();

    transaction.writePixel(8, 9, RED);
    transaction.writePixel(10, 11, BLUE_ALPHA);
    const operation = transaction.commit();

    expect(operation?.pixels).toHaveLength(2);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(history.undo()).toBe(true);
    expect(document.readPixel(8, 9)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(10, 11)).toEqual(TRANSPARENT_RGBA);
    expect(history.undo()).toBe(false);

    expect(history.redo()).toBe(true);
    expect(document.readPixel(8, 9)).toEqual(RED);
    expect(document.readPixel(10, 11)).toEqual(BLUE_ALPHA);
  });

  it('collapses repeated writes to one exact before/final pixel pair', () => {
    const { document, history } = createEditor();
    const intermediate: RgbaColor = { r: 1, g: 2, b: 3, a: 4 };
    const transaction = history.beginTransaction();

    transaction.writePixel(12, 13, RED);
    transaction.writePixel(12, 13, intermediate);
    transaction.writePixel(12, 13, BLUE_ALPHA);
    const operation = transaction.commit();

    expect(operation?.pixels).toEqual([
      {
        x: 12,
        y: 13,
        before: TRANSPARENT_RGBA,
        after: BLUE_ALPHA,
      },
    ]);
    history.undo();
    expect(document.readPixel(12, 13)).toEqual(TRANSPARENT_RGBA);
    history.redo();
    expect(document.readPixel(12, 13)).toEqual(BLUE_ALPHA);
  });

  it('drops a transaction whose final content equals its initial content', () => {
    const { document, history } = createEditor();
    const transaction = history.beginTransaction();

    transaction.writePixel(3, 4, RED);
    transaction.writePixel(3, 4, TRANSPARENT_RGBA);

    expect(transaction.commit()).toBeUndefined();
    expect(document.readPixel(3, 4)).toEqual(TRANSPARENT_RGBA);
    expect(history.canUndo).toBe(false);
  });

  it('rolls back every collected mutation when canceled', () => {
    const { document, history } = createEditor();
    const transaction = history.beginTransaction();

    transaction.writePixel(1, 2, RED);
    transaction.writePixel(3, 4, BLUE_ALPHA);
    transaction.cancel();

    expect(document.readPixel(1, 2)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(3, 4)).toEqual(TRANSPARENT_RGBA);
    expect(history.canUndo).toBe(false);
  });

  it('allows lifecycle commands to cancel the active transient transaction', () => {
    const { document, history } = createEditor();
    const transaction = history.beginTransaction();
    transaction.writePixel(1, 2, RED);

    expect(history.cancelActiveTransaction()).toBe(true);
    expect(history.cancelActiveTransaction()).toBe(false);
    expect(document.readPixel(1, 2)).toEqual(TRANSPARENT_RGBA);
    expect(history.canUndo).toBe(false);
  });

  it('rolls back valid writes when a later change is invalid', () => {
    const { document, history } = createEditor();
    const transaction = history.beginTransaction();

    transaction.writePixel(1, 1, RED);
    expect(() => transaction.writePixel(64, 1, BLUE_ALPHA)).toThrow(RangeError);

    expect(document.readPixel(1, 1)).toEqual(TRANSPARENT_RGBA);
    expect(transaction.isActive).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it('prevents concurrent transactions and history traversal mid-transaction', () => {
    const { history } = createEditor();
    const transaction = history.beginTransaction();

    expect(() => history.beginTransaction()).toThrow(
      'An edit transaction is already active.',
    );
    expect(() => history.undo()).toThrow(
      'Finish the active edit transaction first.',
    );
    transaction.cancel();
  });

  it('supports reversible model metadata without model-changing UI', () => {
    const { document, history } = createEditor();
    const transaction = history.beginTransaction();

    transaction.setModel('slim');
    transaction.commit();
    expect(document.model).toBe('slim');

    history.undo();
    expect(document.model).toBe('classic');
    history.redo();
    expect(document.model).toBe('slim');
  });
});

describe('DocumentHistory saved-state interaction', () => {
  it('becomes clean when Undo restores saved content', () => {
    const { document, history } = createEditor();

    history.editPixel(7, 7, RED);
    expect(document.isDirty).toBe(true);
    history.undo();

    expect(document.isDirty).toBe(false);
  });

  it('becomes dirty again after Redo', () => {
    const { document, history } = createEditor();

    history.editPixel(7, 7, RED);
    history.undo();
    history.redo();

    expect(document.isDirty).toBe(true);
  });

  it('preserves history across a saved checkpoint', () => {
    const { document, history } = createEditor();

    history.editPixel(1, 1, RED);
    document.markSaved();
    history.editPixel(1, 1, BLUE_ALPHA);
    history.undo();

    expect(document.readPixel(1, 1)).toEqual(RED);
    expect(document.isDirty).toBe(false);
    expect(history.canUndo).toBe(true);

    history.undo();
    expect(document.readPixel(1, 1)).toEqual(TRANSPARENT_RGBA);
    expect(document.isDirty).toBe(true);
  });
});

describe('DocumentHistory timeline', () => {
  it('exposes concise labels, metadata, and the current history position', () => {
    const { document, history } = createEditor();

    const pencil = history.editPixel(1, 1, RED, 'Pencil Stroke');
    const eraser = history.editPixel(2, 2, RED, 'Eraser Stroke');
    const fill = history.beginTransaction('Fill');
    fill.writePixel(3, 3, BLUE_ALPHA);
    const fillOperation = fill.commit();
    const model = history.beginTransaction('Model → Slim');
    model.setModel('slim');
    const modelOperation = model.commit();

    expect(pencil).toBe(true);
    expect(eraser).toBe(true);
    expect(fillOperation?.label).toBe('Fill');
    expect(modelOperation?.label).toBe('Model → Slim');
    expect(history.getTimelineState()).toMatchObject({
      currentIndex: 3,
      savedIndex: -1,
      canUndo: true,
      canRedo: false,
    });
    expect(history.getTimelineState().entries).toEqual([
      expect.objectContaining({
        index: -1,
        kind: 'initial',
        label: 'Initial state',
        state: 'undoable',
        isCurrent: false,
        isSaved: true,
      }),
      expect.objectContaining({
        index: 0,
        label: 'Pencil Stroke',
        pixelCount: 1,
        state: 'undoable',
      }),
      expect.objectContaining({
        index: 1,
        label: 'Eraser Stroke',
        pixelCount: 1,
        state: 'undoable',
      }),
      expect.objectContaining({
        index: 2,
        label: 'Fill',
        pixelCount: 1,
        state: 'undoable',
      }),
      expect.objectContaining({
        index: 3,
        label: 'Model → Slim',
        pixelCount: 0,
        hasModelChange: true,
        state: 'current',
        isCurrent: true,
      }),
    ]);
    expect(document.model).toBe('slim');
  });

  it('jumps across retained states without adding history or changing labels', () => {
    const { document, history } = createEditor();

    history.editPixel(1, 1, RED, 'First');
    history.editPixel(2, 2, BLUE_ALPHA, 'Second');
    history.editPixel(3, 3, { r: 8, g: 7, b: 6, a: 5 }, 'Third');
    const beforeEntries = history.getTimelineState().entries;
    const listener = vi.fn();
    history.subscribeTimeline(listener);

    expect(history.jumpTo(0)).toBe(true);
    expect(document.readPixel(1, 1)).toEqual(RED);
    expect(document.readPixel(2, 2)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(3, 3)).toEqual(TRANSPARENT_RGBA);
    expect(history.getTimelineState().currentIndex).toBe(0);
    expect(history.getTimelineState().entries).toEqual([
      ...beforeEntries.slice(0, 4).map((entry, index) =>
        expect.objectContaining({
          index: entry.index,
          label: entry.label,
          kind: entry.kind,
          state:
            index === 1 ? 'current' : index === 0 ? 'undoable' : 'redoable',
        }),
      ),
    ]);
    expect(history.getTimelineState().entries).toHaveLength(4);
    expect(listener).toHaveBeenCalledTimes(1);

    expect(history.jumpTo(2)).toBe(true);
    expect(document.readPixel(2, 2)).toEqual(BLUE_ALPHA);
    expect(document.readPixel(3, 3)).toEqual({ r: 8, g: 7, b: 6, a: 5 });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(history.jumpTo(2)).toBe(false);
    expect(history.getTimelineState().entries).toHaveLength(4);
  });

  it('tracks a reachable saved checkpoint and clears it when branching past it', () => {
    const { document, history } = createEditor();

    history.editPixel(1, 1, RED, 'Before Save');
    history.editPixel(2, 2, BLUE_ALPHA, 'Saved Edit');
    document.markSaved();
    history.markSavedCheckpoint();

    expect(history.getTimelineState().savedIndex).toBe(1);
    expect(
      history.getTimelineState().entries.find((entry) => entry.isSaved)?.label,
    ).toBe('Saved Edit');

    history.undo();
    expect(history.getTimelineState().currentIndex).toBe(0);
    expect(history.getTimelineState().entries[2]!.isSaved).toBe(true);
    expect(document.isDirty).toBe(true);

    history.editPixel(3, 3, { r: 1, g: 2, b: 3, a: 4 }, 'New Branch');
    expect(history.canRedo).toBe(false);
    expect(history.getTimelineState().savedIndex).toBeUndefined();
    expect(
      history.getTimelineState().entries.some((entry) => entry.isSaved),
    ).toBe(false);
  });

  it('retains only bounded operations and starts a replacement session at a clean baseline', () => {
    const first = createEditor(2);
    first.history.editPixel(0, 0, RED, 'One');
    first.history.editPixel(1, 0, RED, 'Two');
    first.history.editPixel(2, 0, RED, 'Three');

    expect(
      first.history.getTimelineState().entries.map((entry) => entry.label),
    ).toEqual(['Initial state', 'Two', 'Three']);
    expect(first.history.getTimelineState().currentIndex).toBe(1);

    const replacement = createEditor();
    expect(replacement.history.getTimelineState()).toMatchObject({
      currentIndex: -1,
      savedIndex: -1,
      canUndo: false,
      canRedo: false,
    });
    expect(replacement.history.getTimelineState().entries).toHaveLength(1);
    expect(replacement.document.revision).toBe(0);
  });

  it('does not mutate the document when inspecting or rejecting a timeline target', () => {
    const { document, history } = createEditor();
    history.editPixel(4, 4, RED, 'Paint');
    const revision = document.revision;
    const color = document.readPixel(4, 4);

    expect(history.getTimelineState().entries).toHaveLength(2);
    expect(() => history.jumpTo(4)).toThrow(RangeError);
    expect(document.revision).toBe(revision);
    expect(document.readPixel(4, 4)).toEqual(color);
  });
});

describe('DocumentHistory capacity', () => {
  it('evicts oldest operations and retains the newest operations predictably', () => {
    const { document, history } = createEditor(2);

    history.editPixel(0, 0, RED);
    history.editPixel(1, 0, RED);
    history.editPixel(2, 0, RED);

    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(true);
    expect(history.undo()).toBe(false);
    expect(document.readPixel(0, 0)).toEqual(RED);
    expect(document.readPixel(1, 0)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(2, 0)).toEqual(TRANSPARENT_RGBA);

    expect(history.redo()).toBe(true);
    expect(history.redo()).toBe(true);
    expect(history.redo()).toBe(false);
    expect(document.readPixel(1, 0)).toEqual(RED);
    expect(document.readPixel(2, 0)).toEqual(RED);
  });

  it('enforces capacity after creating a new branch from Undo', () => {
    const { document, history } = createEditor(2);

    history.editPixel(0, 0, RED);
    history.editPixel(1, 0, RED);
    history.undo();
    history.editPixel(2, 0, BLUE_ALPHA);

    expect(history.canRedo).toBe(false);
    history.undo();
    history.undo();
    expect(document.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(1, 0)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(2, 0)).toEqual(TRANSPARENT_RGBA);
  });

  it('rejects invalid capacity values', () => {
    const document = SkinDocument.createBlank({ id: 'invalid-capacity' });

    expect(() => new DocumentHistory(document, 0)).toThrow(RangeError);
    expect(() => new DocumentHistory(document, 1.5)).toThrow(RangeError);
  });
});
