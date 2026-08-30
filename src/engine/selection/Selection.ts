import {
  RGBA_CHANNEL_COUNT,
  SKIN_HEIGHT,
  SKIN_WIDTH,
  TRANSPARENT_RGBA,
  type RgbaColor,
  type SkinDocument,
} from '../document';
import type { DocumentEditOperation, DocumentHistory } from '../history';
import type { Size, TextureCoordinate } from '../viewport';

export interface SelectionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A pixel rectangle whose origin may be outside the texture while floating. */
export type PixelRegion = SelectionRect;

export interface InternalClipboard {
  readonly width: number;
  readonly height: number;
  /** Row-major RGBA bytes. Transparent texels retain all four source bytes. */
  readonly data: Uint8ClampedArray;
}

export interface FloatingSelectionState {
  readonly kind: 'move' | 'paste';
  readonly rect: PixelRegion;
  readonly sourceRect?: SelectionRect;
  readonly data: Uint8ClampedArray;
}

export interface SelectionState {
  readonly selection: SelectionRect | undefined;
  /** The in-progress rectangle while the selection tool is being dragged. */
  readonly draft: SelectionRect | undefined;
  /** A paste or move which has not yet been committed. */
  readonly floating: FloatingSelectionState | undefined;
}

export type SelectionStateListener = (state: SelectionState) => void;

export interface SelectionClipboardStore {
  get(): InternalClipboard | undefined;
  set(clipboard: InternalClipboard): void;
  clear(): void;
}

const DEFAULT_BOUNDS: Size = {
  width: SKIN_WIDTH,
  height: SKIN_HEIGHT,
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}

function assertInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be an integer.`);
  }
}

function assertBounds(bounds: Size): void {
  assertPositiveInteger(bounds.width, 'Selection bounds width');
  assertPositiveInteger(bounds.height, 'Selection bounds height');
}

function assertPoint(point: TextureCoordinate, name = 'Texture point'): void {
  assertInteger(point.x, `${name} x`);
  assertInteger(point.y, `${name} y`);
}

function assertOrigin(point: TextureCoordinate): void {
  assertPoint(point, 'Pixel origin');
}

function assertPixelRegion(region: PixelRegion): void {
  assertInteger(region.x, 'Pixel region x');
  assertInteger(region.y, 'Pixel region y');
  assertPositiveInteger(region.width, 'Pixel region width');
  assertPositiveInteger(region.height, 'Pixel region height');
  if (
    !Number.isSafeInteger(region.x + region.width) ||
    !Number.isSafeInteger(region.y + region.height)
  ) {
    throw new RangeError('Pixel region edges must be safe integers.');
  }
}

export function assertSelectionRect(
  rect: SelectionRect,
  bounds: Size = DEFAULT_BOUNDS,
): void {
  assertBounds(bounds);
  assertPixelRegion(rect);
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.x + rect.width > bounds.width ||
    rect.y + rect.height > bounds.height
  ) {
    throw new RangeError('Selection rectangle must remain inside the texture.');
  }
}

export function clampSelectionPoint(
  point: TextureCoordinate,
  bounds: Size = DEFAULT_BOUNDS,
): TextureCoordinate {
  assertBounds(bounds);
  assertPoint(point);
  return {
    x: Math.min(bounds.width - 1, Math.max(0, point.x)),
    y: Math.min(bounds.height - 1, Math.max(0, point.y)),
  };
}

/**
 * Converts two inclusive texel endpoints into a normalized half-open rect.
 * Endpoints outside the texture are clamped to the nearest valid texel.
 */
export function normalizeSelectionRect(
  start: TextureCoordinate,
  end: TextureCoordinate,
  bounds: Size = DEFAULT_BOUNDS,
): SelectionRect {
  const first = clampSelectionPoint(start, bounds);
  const last = clampSelectionPoint(end, bounds);
  return {
    x: Math.min(first.x, last.x),
    y: Math.min(first.y, last.y),
    width: Math.abs(first.x - last.x) + 1,
    height: Math.abs(first.y - last.y) + 1,
  };
}

export function selectionRectContainsPoint(
  rect: SelectionRect,
  point: TextureCoordinate,
): boolean {
  assertPixelRegion(rect);
  assertPoint(point);
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

/** Returns the visible in-bounds portion of a possibly floating region. */
export function clipPixelRegion(
  region: PixelRegion,
  bounds: Size = DEFAULT_BOUNDS,
): SelectionRect | undefined {
  assertBounds(bounds);
  assertPixelRegion(region);
  const left = Math.max(0, region.x);
  const top = Math.max(0, region.y);
  const right = Math.min(bounds.width, region.x + region.width);
  const bottom = Math.min(bounds.height, region.y + region.height);
  if (right <= left || bottom <= top) return undefined;
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function translatePixelRegion(
  region: PixelRegion,
  delta: TextureCoordinate,
): PixelRegion {
  assertPixelRegion(region);
  assertPoint(delta, 'Pixel delta');
  return {
    x: region.x + delta.x,
    y: region.y + delta.y,
    width: region.width,
    height: region.height,
  };
}

function assertClipboard(clipboard: InternalClipboard): void {
  assertPositiveInteger(clipboard.width, 'Clipboard width');
  assertPositiveInteger(clipboard.height, 'Clipboard height');
  const expectedLength =
    clipboard.width * clipboard.height * RGBA_CHANNEL_COUNT;
  if (
    !Number.isSafeInteger(expectedLength) ||
    clipboard.data.length !== expectedLength
  ) {
    throw new RangeError(
      `Clipboard data length must be ${expectedLength}; received ${clipboard.data.length}.`,
    );
  }
}

export function cloneInternalClipboard(
  clipboard: InternalClipboard,
): InternalClipboard {
  assertClipboard(clipboard);
  return Object.freeze({
    width: clipboard.width,
    height: clipboard.height,
    data: new Uint8ClampedArray(clipboard.data),
  });
}

export function createInternalClipboard(
  width: number,
  height: number,
  data: Uint8ClampedArray,
): InternalClipboard {
  return cloneInternalClipboard({ width, height, data });
}

function colorFromData(data: Uint8ClampedArray, offset: number): RgbaColor {
  return {
    r: data[offset]!,
    g: data[offset + 1]!,
    b: data[offset + 2]!,
    a: data[offset + 3]!,
  };
}

function writeSelectionData(
  document: SkinDocument,
  transaction: {
    writePixel(x: number, y: number, color: RgbaColor): boolean;
  },
  clipboard: InternalClipboard,
  origin: TextureCoordinate,
): void {
  assertClipboard(clipboard);
  assertOrigin(origin);

  for (let row = 0; row < clipboard.height; row += 1) {
    for (let column = 0; column < clipboard.width; column += 1) {
      const x = origin.x + column;
      const y = origin.y + row;
      if (x < 0 || x >= document.width || y < 0 || y >= document.height) {
        continue;
      }
      const offset = (row * clipboard.width + column) * RGBA_CHANNEL_COUNT;
      transaction.writePixel(x, y, colorFromData(clipboard.data, offset));
    }
  }
}

function runSelectionTransaction(
  history: DocumentHistory,
  label: string,
  write: (transaction: ReturnType<DocumentHistory['beginTransaction']>) => void,
): DocumentEditOperation | undefined {
  const transaction = history.beginTransaction(label);
  try {
    write(transaction);
    return transaction.commit();
  } catch (error) {
    if (transaction.isActive) transaction.cancel();
    throw error;
  }
}

export function copySelection(
  document: SkinDocument,
  rect: SelectionRect,
): InternalClipboard {
  assertSelectionRect(rect, document);
  const data = new Uint8ClampedArray(
    rect.width * rect.height * RGBA_CHANNEL_COUNT,
  );
  for (let row = 0; row < rect.height; row += 1) {
    for (let column = 0; column < rect.width; column += 1) {
      const color = document.readPixel(rect.x + column, rect.y + row);
      const offset = (row * rect.width + column) * RGBA_CHANNEL_COUNT;
      data[offset] = color.r;
      data[offset + 1] = color.g;
      data[offset + 2] = color.b;
      data[offset + 3] = color.a;
    }
  }
  return createInternalClipboard(rect.width, rect.height, data);
}

export function clearSelection(
  document: SkinDocument,
  history: DocumentHistory,
  rect: SelectionRect,
  label = 'Delete',
): DocumentEditOperation | undefined {
  assertSelectionRect(rect, document);
  return runSelectionTransaction(history, label, (transaction) => {
    for (let row = 0; row < rect.height; row += 1) {
      for (let column = 0; column < rect.width; column += 1) {
        transaction.writePixel(rect.x + column, rect.y + row, TRANSPARENT_RGBA);
      }
    }
  });
}

export function deleteSelection(
  document: SkinDocument,
  history: DocumentHistory,
  rect: SelectionRect,
): DocumentEditOperation | undefined {
  return clearSelection(document, history, rect, 'Delete');
}

/** Copies and clears a rectangle as one history operation. */
export function cutSelection(
  document: SkinDocument,
  history: DocumentHistory,
  rect: SelectionRect,
): InternalClipboard {
  const clipboard = copySelection(document, rect);
  clearSelection(document, history, rect, 'Cut');
  return clipboard;
}

export function pasteClipboard(
  document: SkinDocument,
  history: DocumentHistory,
  clipboard: InternalClipboard,
  origin: TextureCoordinate,
  label = 'Paste',
): DocumentEditOperation | undefined {
  assertOrigin(origin);
  return runSelectionTransaction(history, label, (transaction) => {
    writeSelectionData(document, transaction, clipboard, origin);
  });
}

/** Moves a snapshot, clears its source, and clips only at the texture edges. */
export function moveSelection(
  document: SkinDocument,
  history: DocumentHistory,
  sourceRect: SelectionRect,
  delta: TextureCoordinate,
  label = 'Move Selection',
): DocumentEditOperation | undefined {
  assertSelectionRect(sourceRect, document);
  const clipboard = copySelection(document, sourceRect);
  const target = translatePixelRegion(sourceRect, delta);
  return applyFloatingSelection(
    document,
    history,
    {
      kind: 'move',
      rect: target,
      sourceRect,
      data: clipboard.data,
    },
    label,
  );
}

export function applyFloatingSelection(
  document: SkinDocument,
  history: DocumentHistory,
  floating: FloatingSelectionState,
  label = floating.kind === 'move' ? 'Move Selection' : 'Paste',
): DocumentEditOperation | undefined {
  assertPixelRegion(floating.rect);
  const clipboard = createInternalClipboard(
    floating.rect.width,
    floating.rect.height,
    floating.data,
  );
  if (floating.kind === 'move') {
    if (floating.sourceRect === undefined) {
      throw new TypeError('A moving selection must include its source rect.');
    }
    assertSelectionRect(floating.sourceRect, document);
  }

  return runSelectionTransaction(history, label, (transaction) => {
    if (floating.kind === 'move') {
      const sourceRect = floating.sourceRect!;
      for (let row = 0; row < sourceRect.height; row += 1) {
        for (let column = 0; column < sourceRect.width; column += 1) {
          transaction.writePixel(
            sourceRect.x + column,
            sourceRect.y + row,
            TRANSPARENT_RGBA,
          );
        }
      }
    }
    writeSelectionData(document, transaction, clipboard, {
      x: floating.rect.x,
      y: floating.rect.y,
    });
  });
}

/** A defensive in-memory clipboard; it is intentionally independent of OS clipboard APIs. */
export class SelectionClipboard implements SelectionClipboardStore {
  private value: InternalClipboard | undefined;

  get(): InternalClipboard | undefined {
    return this.value === undefined
      ? undefined
      : cloneInternalClipboard(this.value);
  }

  set(clipboard: InternalClipboard): void {
    this.value = cloneInternalClipboard(clipboard);
  }

  clear(): void {
    this.value = undefined;
  }
}

export const globalSelectionClipboard = new SelectionClipboard();

interface SelectionDrag {
  readonly anchor: TextureCoordinate;
  readonly current: TextureCoordinate;
}

interface FloatingDrag {
  readonly anchor: TextureCoordinate;
  readonly origin: PixelRegion;
}

function freezeRect(rect: SelectionRect): SelectionRect {
  return Object.freeze({ ...rect });
}

function freezeFloating(
  floating: FloatingSelectionState,
): FloatingSelectionState {
  return Object.freeze({
    kind: floating.kind,
    rect: freezeRect(floating.rect),
    ...(floating.sourceRect === undefined
      ? {}
      : { sourceRect: freezeRect(floating.sourceRect) }),
    data: floating.data,
  });
}

/**
 * Renderer-independent selection state and transactional selection commands.
 * Floating move/paste data is only applied to the document on commit.
 */
export class SelectionController {
  private selectionValue: SelectionRect | undefined;
  private selectionDrag: SelectionDrag | undefined;
  private floatingValue: FloatingSelectionState | undefined;
  private floatingDrag: FloatingDrag | undefined;
  private selectionBeforeFloating: SelectionRect | undefined;
  private readonly listeners = new Set<SelectionStateListener>();
  private stateValue: SelectionState = {
    selection: undefined,
    draft: undefined,
    floating: undefined,
  };

  constructor(
    private readonly document: SkinDocument,
    private readonly history: DocumentHistory,
    private readonly clipboard: SelectionClipboardStore = globalSelectionClipboard,
  ) {}

  getState(): SelectionState {
    return this.stateValue;
  }

  subscribe(listener: SelectionStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setSelection(rect: SelectionRect | undefined): void {
    this.cancelTransient(false);
    if (rect !== undefined) {
      assertSelectionRect(rect, this.document);
      this.selectionValue = freezeRect(rect);
    } else {
      this.selectionValue = undefined;
    }
    this.publish();
  }

  beginSelection(point: TextureCoordinate): void {
    this.cancelTransient(false);
    const anchor = clampSelectionPoint(point, this.document);
    this.selectionDrag = { anchor, current: anchor };
    this.publish();
  }

  updateSelection(point: TextureCoordinate): boolean {
    if (this.selectionDrag === undefined) return false;
    const current = clampSelectionPoint(point, this.document);
    if (
      current.x === this.selectionDrag.current.x &&
      current.y === this.selectionDrag.current.y
    ) {
      return false;
    }
    this.selectionDrag = { ...this.selectionDrag, current };
    this.publish();
    return true;
  }

  commitSelection(): boolean {
    if (this.selectionDrag === undefined) return false;
    const { anchor, current } = this.selectionDrag;
    this.selectionValue = freezeRect(
      normalizeSelectionRect(anchor, current, this.document),
    );
    this.selectionDrag = undefined;
    this.publish();
    return true;
  }

  cancelSelection(): boolean {
    if (this.selectionDrag === undefined) return false;
    this.selectionDrag = undefined;
    this.publish();
    return true;
  }

  beginMove(point: TextureCoordinate): boolean {
    if (
      this.floatingValue !== undefined ||
      this.selectionDrag !== undefined ||
      this.selectionValue === undefined ||
      !selectionRectContainsPoint(this.selectionValue, point)
    ) {
      return false;
    }
    const clipboard = copySelection(this.document, this.selectionValue);
    this.selectionBeforeFloating = this.selectionValue;
    this.floatingValue = {
      kind: 'move',
      rect: this.selectionValue,
      sourceRect: this.selectionValue,
      data: clipboard.data,
    };
    this.floatingDrag = {
      anchor: { x: point.x, y: point.y },
      origin: this.selectionValue,
    };
    this.publish();
    return true;
  }

  beginFloatingDrag(point: TextureCoordinate): boolean {
    if (
      this.floatingValue === undefined ||
      !selectionRectContainsPoint(this.floatingValue.rect, point)
    ) {
      return false;
    }
    this.floatingDrag = {
      anchor: { x: point.x, y: point.y },
      origin: this.floatingValue.rect,
    };
    return true;
  }

  moveFloatingFromPointer(point: TextureCoordinate): boolean {
    if (this.floatingValue === undefined || this.floatingDrag === undefined) {
      return false;
    }
    assertPoint(point);
    const nextRect = {
      x: this.floatingDrag.origin.x + (point.x - this.floatingDrag.anchor.x),
      y: this.floatingDrag.origin.y + (point.y - this.floatingDrag.anchor.y),
      width: this.floatingDrag.origin.width,
      height: this.floatingDrag.origin.height,
    };
    return this.moveFloatingTo(nextRect);
  }

  moveFloatingBy(delta: TextureCoordinate): boolean {
    if (this.floatingValue === undefined) return false;
    return this.moveFloatingTo(
      translatePixelRegion(this.floatingValue.rect, delta),
    );
  }

  moveFloatingTo(rect: PixelRegion): boolean {
    if (this.floatingValue === undefined) return false;
    assertPixelRegion(rect);
    const current = this.floatingValue.rect;
    if (
      current.x === rect.x &&
      current.y === rect.y &&
      current.width === rect.width &&
      current.height === rect.height
    ) {
      return false;
    }
    if (current.width !== rect.width || current.height !== rect.height) {
      throw new RangeError('Floating selection dimensions cannot change.');
    }
    this.floatingValue = { ...this.floatingValue, rect: rect };
    this.publish();
    return true;
  }

  canPaste(): boolean {
    return this.clipboard.get() !== undefined;
  }

  beginPaste(origin?: TextureCoordinate): boolean {
    const clipboard = this.clipboard.get();
    if (clipboard === undefined) return false;
    this.cancelTransient(false);
    const target = origin ?? {
      x: this.selectionValue?.x ?? 0,
      y: this.selectionValue?.y ?? 0,
    };
    assertOrigin(target);
    this.selectionBeforeFloating = this.selectionValue;
    this.floatingValue = {
      kind: 'paste',
      rect: {
        x: target.x,
        y: target.y,
        width: clipboard.width,
        height: clipboard.height,
      },
      data: clipboard.data,
    };
    this.floatingDrag = undefined;
    this.publish();
    return true;
  }

  copy(): InternalClipboard | undefined {
    const floating = this.floatingValue;
    const clipboard =
      floating === undefined
        ? this.selectionValue === undefined
          ? undefined
          : copySelection(this.document, this.selectionValue)
        : createInternalClipboard(
            floating.rect.width,
            floating.rect.height,
            floating.data,
          );
    if (clipboard === undefined) return undefined;
    this.clipboard.set(clipboard);
    return this.clipboard.get();
  }

  cut(): InternalClipboard | undefined {
    this.cancelTransient(false);
    if (this.selectionValue === undefined) return undefined;
    const clipboard = cutSelection(
      this.document,
      this.history,
      this.selectionValue,
    );
    this.clipboard.set(clipboard);
    return this.clipboard.get();
  }

  delete(): DocumentEditOperation | undefined {
    this.cancelTransient(false);
    if (this.selectionValue === undefined) return undefined;
    return clearSelection(
      this.document,
      this.history,
      this.selectionValue,
      'Delete',
    );
  }

  commitFloating(): DocumentEditOperation | undefined {
    if (this.floatingValue === undefined) return undefined;
    const floating = this.floatingValue;
    const operation = applyFloatingSelection(
      this.document,
      this.history,
      floating,
    );
    this.selectionValue = clipPixelRegion(floating.rect, this.document);
    this.floatingValue = undefined;
    this.floatingDrag = undefined;
    this.selectionBeforeFloating = undefined;
    this.publish();
    return operation;
  }

  cancelFloating(): boolean {
    return this.cancelTransient(true);
  }

  /** Cancels an in-progress drag or floating edit without touching the document. */
  cancelTransient(restoreFloatingSelection = true): boolean {
    const hadTransient =
      this.selectionDrag !== undefined || this.floatingValue !== undefined;
    if (!hadTransient) return false;
    if (this.floatingValue !== undefined && restoreFloatingSelection) {
      this.selectionValue = this.selectionBeforeFloating;
    }
    this.selectionDrag = undefined;
    this.floatingValue = undefined;
    this.floatingDrag = undefined;
    this.selectionBeforeFloating = undefined;
    this.publish();
    return true;
  }

  clear(): void {
    if (
      this.selectionValue === undefined &&
      this.selectionDrag === undefined &&
      this.floatingValue === undefined
    ) {
      return;
    }
    this.selectionValue = undefined;
    this.selectionDrag = undefined;
    this.floatingValue = undefined;
    this.floatingDrag = undefined;
    this.selectionBeforeFloating = undefined;
    this.publish();
  }

  private publish(): void {
    const draft =
      this.selectionDrag === undefined
        ? undefined
        : normalizeSelectionRect(
            this.selectionDrag.anchor,
            this.selectionDrag.current,
            this.document,
          );
    this.stateValue = Object.freeze({
      selection: this.selectionValue,
      draft,
      floating:
        this.floatingValue === undefined
          ? undefined
          : freezeFloating(this.floatingValue),
    });
    for (const listener of this.listeners) listener(this.stateValue);
  }
}
