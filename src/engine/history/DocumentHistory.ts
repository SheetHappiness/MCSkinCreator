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
  readonly label: string;
  readonly pixels: readonly PixelChange[];
  readonly model?: ModelChange;
}

export interface DocumentHistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type DocumentHistoryListener = (state: DocumentHistoryState) => void;

export type DocumentHistoryTimelineEntryState =
  'undoable' | 'current' | 'redoable';

export interface DocumentHistoryTimelineEntry {
  /** -1 is the session's initial state; operations use their retained index. */
  readonly index: number;
  readonly kind: 'initial' | 'operation';
  readonly label: string;
  readonly state: DocumentHistoryTimelineEntryState;
  readonly isCurrent: boolean;
  readonly isSaved: boolean;
  readonly pixelCount: number;
  readonly hasModelChange: boolean;
}

export interface DocumentHistoryTimelineState {
  readonly entries: readonly DocumentHistoryTimelineEntry[];
  /** The state currently applied to the document, where -1 is initial. */
  readonly currentIndex: number;
  /** Undefined means the saved state is no longer represented by this timeline. */
  readonly savedIndex: number | undefined;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type DocumentHistoryTimelineListener = (
  state: DocumentHistoryTimelineState,
) => void;

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
  label: string,
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
    label,
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
    private readonly label: string,
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
        : freezeOperation(this.label, effectivePixels, effectiveModel);

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
  private readonly operations: DocumentEditOperation[] = [];
  private readonly listeners = new Set<DocumentHistoryListener>();
  private readonly timelineListeners =
    new Set<DocumentHistoryTimelineListener>();
  private activeTransaction: LiveDocumentEditTransaction | undefined;
  private currentIndex = -1;
  private savedIndex: number | undefined = -1;
  private timelineStateValue: DocumentHistoryTimelineState;

  constructor(
    private readonly document: SkinDocument,
    private readonly capacity = MAX_HISTORY_OPERATIONS,
  ) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('History capacity must be a positive integer.');
    }

    this.timelineStateValue = this.createTimelineState();
  }

  get canUndo(): boolean {
    return this.currentIndex >= 0;
  }

  get canRedo(): boolean {
    return this.currentIndex < this.operations.length - 1;
  }

  getState(): DocumentHistoryState {
    return { canUndo: this.canUndo, canRedo: this.canRedo };
  }

  subscribe(listener: DocumentHistoryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getTimelineState(): DocumentHistoryTimelineState {
    return this.timelineStateValue;
  }

  subscribeTimeline(listener: DocumentHistoryTimelineListener): () => void {
    this.timelineListeners.add(listener);
    return () => this.timelineListeners.delete(listener);
  }

  beginTransaction(label = 'Edit'): DocumentEditTransaction {
    if (this.activeTransaction !== undefined) {
      throw new Error('An edit transaction is already active.');
    }

    const transaction = new LiveDocumentEditTransaction(
      this.document,
      normalizeHistoryLabel(label),
      (finished, operation) => this.finishTransaction(finished, operation),
    );
    this.activeTransaction = transaction;
    return transaction;
  }

  /** Cancels and rolls back the current transient edit, when one exists. */
  cancelActiveTransaction(): boolean {
    if (this.activeTransaction === undefined) {
      return false;
    }

    this.activeTransaction.cancel();
    return true;
  }

  editPixel(
    x: number,
    y: number,
    color: RgbaColor,
    label = 'Pixel Edit',
  ): boolean {
    const transaction = this.beginTransaction(label);
    const changed = transaction.writePixel(x, y, color);
    transaction.commit();
    return changed;
  }

  undo(): boolean {
    this.assertNoActiveTransaction();
    if (!this.canUndo) {
      return false;
    }

    const operation = this.operations[this.currentIndex]!;
    applyOperation(this.document, operation, 'before');
    this.currentIndex -= 1;
    this.publish();
    return true;
  }

  redo(): boolean {
    this.assertNoActiveTransaction();
    if (!this.canRedo) {
      return false;
    }

    const operation = this.operations[this.currentIndex + 1]!;
    applyOperation(this.document, operation, 'after');
    this.currentIndex += 1;
    this.publish();
    return true;
  }

  /**
   * Moves the canonical document to a retained history state without adding
   * an operation. The target is -1 for the initial state or an operation
   * index returned by getTimelineState().
   */
  jumpTo(targetIndex: number): boolean {
    this.assertNoActiveTransaction();
    if (
      !Number.isInteger(targetIndex) ||
      targetIndex < -1 ||
      targetIndex >= this.operations.length
    ) {
      throw new RangeError('History target is outside the retained timeline.');
    }
    if (targetIndex === this.currentIndex) return false;

    while (this.currentIndex > targetIndex) {
      applyOperation(
        this.document,
        this.operations[this.currentIndex]!,
        'before',
      );
      this.currentIndex -= 1;
    }
    while (this.currentIndex < targetIndex) {
      const nextIndex = this.currentIndex + 1;
      applyOperation(this.document, this.operations[nextIndex]!, 'after');
      this.currentIndex = nextIndex;
    }
    this.publish();
    return true;
  }

  /** Records the current document content as the saved timeline checkpoint. */
  markSavedCheckpoint(): void {
    this.assertNoActiveTransaction();
    this.savedIndex = this.currentIndex;
    this.publishTimeline();
  }

  clear(): void {
    this.cancelActiveTransaction();
    const changed =
      this.operations.length > 0 ||
      this.currentIndex !== -1 ||
      this.savedIndex !== undefined;
    this.operations.length = 0;
    this.currentIndex = -1;
    // clear() may be used to re-baseline an existing document. Its actual
    // dirty state remains owned by SkinDocument, so no saved marker is
    // invented here; callers can explicitly mark a successful save.
    this.savedIndex = undefined;
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

    if (this.currentIndex < this.operations.length - 1) {
      this.operations.splice(this.currentIndex + 1);
      if (
        this.savedIndex !== undefined &&
        this.savedIndex > this.currentIndex
      ) {
        this.savedIndex = undefined;
      }
    }

    this.operations.push(operation);
    this.currentIndex += 1;
    if (this.operations.length > this.capacity) {
      this.operations.shift();
      this.currentIndex -= 1;
      if (this.savedIndex !== undefined) {
        this.savedIndex =
          this.savedIndex === 0 ? undefined : this.savedIndex - 1;
      }
    }
    this.publish();
  }

  private assertNoActiveTransaction(): void {
    if (this.activeTransaction !== undefined) {
      throw new Error('Finish the active edit transaction first.');
    }
  }

  private publish(): void {
    this.publishTimeline();
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  private publishTimeline(): void {
    this.timelineStateValue = this.createTimelineState();
    for (const listener of this.timelineListeners) {
      listener(this.timelineStateValue);
    }
  }

  private createTimelineState(): DocumentHistoryTimelineState {
    const entries: DocumentHistoryTimelineEntry[] = [
      {
        index: -1,
        kind: 'initial',
        label: 'Initial state',
        state: this.currentIndex === -1 ? 'current' : 'undoable',
        isCurrent: this.currentIndex === -1,
        isSaved: this.savedIndex === -1,
        pixelCount: 0,
        hasModelChange: false,
      },
      ...this.operations.map((operation, index) => ({
        index,
        kind: 'operation' as const,
        label: operation.label,
        state:
          index < this.currentIndex
            ? ('undoable' as const)
            : index === this.currentIndex
              ? ('current' as const)
              : ('redoable' as const),
        isCurrent: index === this.currentIndex,
        isSaved: this.savedIndex === index,
        pixelCount: operation.pixels.length,
        hasModelChange: operation.model !== undefined,
      })),
    ];

    return Object.freeze({
      entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
      currentIndex: this.currentIndex,
      savedIndex: this.savedIndex,
      canUndo: this.canUndo,
      canRedo: this.canRedo,
    });
  }
}

const MAX_HISTORY_LABEL_LENGTH = 64;

function normalizeHistoryLabel(label: string): string {
  const normalized = label.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) {
    throw new TypeError('History labels must not be empty.');
  }
  if (normalized.length > MAX_HISTORY_LABEL_LENGTH) {
    throw new RangeError(
      `History labels must be ${MAX_HISTORY_LABEL_LENGTH} characters or fewer.`,
    );
  }
  return normalized;
}
