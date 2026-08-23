import { SkinDocument, type RgbaColor, type SkinModel } from '../document';

export const MAX_HISTORY_OPERATIONS = 100;

export interface PixelChange {
  readonly x: number;
  readonly y: number;
  readonly before: RgbaColor;
  readonly after: RgbaColor;
}

export interface ModelChange {
  readonly before: SkinModel;
  readonly after: SkinModel;
}

export interface DocumentEditOperation {
  readonly kind: 'document-edit';
  readonly pixels: readonly PixelChange[];
  readonly model?: ModelChange;
}

export interface DocumentHistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type DocumentHistoryListener = (state: DocumentHistoryState) => void;

export interface DocumentEditTransaction {
  readonly isActive: boolean;
  writePixel(x: number, y: number, color: RgbaColor): boolean;
  setModel(model: SkinModel): boolean;
  commit(): DocumentEditOperation | undefined;
  cancel(): void;
}

interface MutablePixelChange {
  readonly x: number;
  readonly y: number;
  readonly before: RgbaColor;
  after: RgbaColor;
}

function copyColor(color: RgbaColor): RgbaColor {
  return Object.freeze({
    r: color.r,
    g: color.g,
    b: color.b,
    a: color.a,
  });
}

function colorsEqual(left: RgbaColor, right: RgbaColor): boolean {
  return (
    left.r === right.r &&
    left.g === right.g &&
    left.b === right.b &&
    left.a === right.a
  );
}

function freezeOperation(
  pixels: readonly MutablePixelChange[],
  model: ModelChange | undefined,
): DocumentEditOperation {
  const immutablePixels = pixels.map((change) =>
    Object.freeze({
      x: change.x,
      y: change.y,
      before: copyColor(change.before),
      after: copyColor(change.after),
    }),
  );

  return Object.freeze({
    kind: 'document-edit' as const,
    pixels: Object.freeze(immutablePixels),
    ...(model === undefined
      ? {}
      : {
          model: Object.freeze({
            before: model.before,
            after: model.after,
          }),
        }),
  });
}

function applyOperation(
  document: SkinDocument,
  operation: DocumentEditOperation,
  direction: 'before' | 'after',
): void {
  for (const change of operation.pixels) {
    document.writePixel(change.x, change.y, change[direction]);
  }

  if (operation.model !== undefined) {
    document.setModel(operation.model[direction]);
  }
}

/**
 * A scoped, live edit transaction. Pixel writes update the canonical document
 * immediately while the transaction retains one exact before/final pair per
 * coordinate. Callers must finish it with commit or cancel.
 */
class LiveDocumentEditTransaction implements DocumentEditTransaction {
  private readonly pixelChanges = new Map<number, MutablePixelChange>();
  private modelChange: ModelChange | undefined;
  private active = true;

  constructor(
    private readonly document: SkinDocument,
    private readonly onFinish: (
      transaction: LiveDocumentEditTransaction,
      operation: DocumentEditOperation | undefined,
    ) => void,
  ) {}

  get isActive(): boolean {
    return this.active;
  }

  writePixel(x: number, y: number, color: RgbaColor): boolean {
    this.assertActive();

    try {
      const key = y * this.document.width + x;
      const existing = this.pixelChanges.get(key);
      const before = existing?.before ?? this.document.readPixel(x, y);
      const changed = this.document.writePixel(x, y, color);

      if (existing === undefined) {
        if (changed) {
          this.pixelChanges.set(key, {
            x,
            y,
            before: copyColor(before),
            after: copyColor(color),
          });
        }
      } else {
        existing.after = copyColor(color);
      }

      return changed;
    } catch (error) {
      this.rollbackAfterFailure();
      throw error;
    }
  }

  setModel(model: SkinModel): boolean {
    this.assertActive();

    try {
      const before = this.modelChange?.before ?? this.document.model;
      const changed = this.document.setModel(model);

      if (this.modelChange === undefined) {
        if (changed) {
          this.modelChange = { before, after: model };
        }
      } else {
        this.modelChange = { before, after: model };
      }

      return changed;
    } catch (error) {
      this.rollbackAfterFailure();
      throw error;
    }
  }

  commit(): DocumentEditOperation | undefined {
    this.assertActive();
    this.active = false;

    const effectivePixels = [...this.pixelChanges.values()].filter(
      (change) => !colorsEqual(change.before, change.after),
    );
    const effectiveModel =
      this.modelChange !== undefined &&
      this.modelChange.before !== this.modelChange.after
        ? this.modelChange
        : undefined;
    const operation =
      effectivePixels.length === 0 && effectiveModel === undefined
        ? undefined
        : freezeOperation(effectivePixels, effectiveModel);

    this.onFinish(this, operation);
    return operation;
  }

  cancel(): void {
    this.assertActive();
    this.rollback();
    this.active = false;
    this.onFinish(this, undefined);
  }

  private assertActive(): void {
    if (!this.active) {
      throw new Error('This edit transaction has already finished.');
    }
  }

  private rollback(): void {
    for (const change of this.pixelChanges.values()) {
      this.document.writePixel(change.x, change.y, change.before);
    }

    if (this.modelChange !== undefined) {
      this.document.setModel(this.modelChange.before);
    }
  }

  private rollbackAfterFailure(): void {
    this.rollback();
    this.active = false;
    this.onFinish(this, undefined);
  }
}

/** Framework-independent, document-owned bounded Undo/Redo controller. */
export class DocumentHistory {
  private readonly undoStack: DocumentEditOperation[] = [];
  private readonly redoStack: DocumentEditOperation[] = [];
  private readonly listeners = new Set<DocumentHistoryListener>();
  private activeTransaction: LiveDocumentEditTransaction | undefined;

  constructor(
    private readonly document: SkinDocument,
    private readonly capacity = MAX_HISTORY_OPERATIONS,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('History capacity must be a positive integer.');
    }
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  getState(): DocumentHistoryState {
    return { canUndo: this.canUndo, canRedo: this.canRedo };
  }

  subscribe(listener: DocumentHistoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  beginTransaction(): DocumentEditTransaction {
    if (this.activeTransaction !== undefined) {
      throw new Error('An edit transaction is already active.');
    }

    const transaction = new LiveDocumentEditTransaction(
      this.document,
      (finished, operation) => this.finishTransaction(finished, operation),
    );
    this.activeTransaction = transaction;
    return transaction;
  }

  editPixel(x: number, y: number, color: RgbaColor): boolean {
    const transaction = this.beginTransaction();
    const changed = transaction.writePixel(x, y, color);
    transaction.commit();
    return changed;
  }

  undo(): boolean {
    this.assertNoActiveTransaction();
    const operation = this.undoStack.pop();
    if (operation === undefined) {
      return false;
    }

    applyOperation(this.document, operation, 'before');
    this.redoStack.push(operation);
    this.publish();
    return true;
  }

  redo(): boolean {
    this.assertNoActiveTransaction();
    const operation = this.redoStack.pop();
    if (operation === undefined) {
      return false;
    }

    applyOperation(this.document, operation, 'after');
    this.undoStack.push(operation);
    this.publish();
    return true;
  }

  clear(): void {
    if (this.activeTransaction !== undefined) {
      this.activeTransaction.cancel();
    }
    const changed = this.undoStack.length > 0 || this.redoStack.length > 0;
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    if (changed) {
      this.publish();
    }
  }

  private finishTransaction(
    transaction: LiveDocumentEditTransaction,
    operation: DocumentEditOperation | undefined,
  ): void {
    if (this.activeTransaction !== transaction) {
      throw new Error('The edit transaction is not owned by this history.');
    }

    this.activeTransaction = undefined;
    if (operation === undefined) {
      return;
    }

    this.undoStack.push(operation);
    if (this.undoStack.length > this.capacity) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    this.publish();
  }

  private assertNoActiveTransaction(): void {
    if (this.activeTransaction !== undefined) {
      throw new Error('Finish the active edit transaction first.');
    }
  }

  private publish(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}
