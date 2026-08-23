import type { SkinModel } from '../minecraft-skin-spec/types';

export const SKIN_WIDTH = 64 as const;
export const SKIN_HEIGHT = 64 as const;
export const RGBA_CHANNEL_COUNT = 4 as const;
export const SKIN_PIXEL_BUFFER_LENGTH =
  SKIN_WIDTH * SKIN_HEIGHT * RGBA_CHANNEL_COUNT;

export type { SkinModel } from '../minecraft-skin-spec/types';

export interface RgbaColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly a: number;
}

export const TRANSPARENT_RGBA: RgbaColor = Object.freeze({
  r: 0,
  g: 0,
  b: 0,
  a: 0,
});

interface SkinDocumentState {
  readonly id: string;
  readonly pixels: Uint8ClampedArray;
  readonly model: SkinModel;
  readonly revision: number;
  readonly savedPixels: Uint8ClampedArray;
  readonly savedModel: SkinModel;
  readonly savedRevision: number;
}

export interface CreateSkinDocumentOptions {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
  readonly model?: SkinModel;
}

export interface CreateBlankSkinDocumentOptions {
  readonly id: string;
  readonly model?: SkinModel;
}

export interface CloneSkinDocumentOptions {
  readonly id?: string;
}

export type SkinDocumentMutationListener = () => void;

const COLOR_CHANNELS = ['r', 'g', 'b', 'a'] as const;

function assertDocumentId(id: string): void {
  if (id.trim().length === 0) {
    throw new TypeError('Skin document id must not be empty.');
  }
}

function assertDimensions(width: number, height: number): void {
  if (width !== SKIN_WIDTH || height !== SKIN_HEIGHT) {
    throw new RangeError(
      `Unsupported skin dimensions: ${width}x${height}. Expected ${SKIN_WIDTH}x${SKIN_HEIGHT}.`,
    );
  }
}

function assertPixelBufferLength(pixels: Uint8ClampedArray): void {
  if (pixels.length !== SKIN_PIXEL_BUFFER_LENGTH) {
    throw new RangeError(
      `Invalid RGBA pixel buffer length: ${pixels.length}. Expected ${SKIN_PIXEL_BUFFER_LENGTH}.`,
    );
  }
}

function assertSkinModel(model: SkinModel): void {
  if (model !== 'classic' && model !== 'slim') {
    throw new TypeError(`Unsupported skin model: ${String(model)}.`);
  }
}

function assertCoordinate(value: number, axis: 'x' | 'y'): void {
  const limit = axis === 'x' ? SKIN_WIDTH : SKIN_HEIGHT;

  if (!Number.isInteger(value) || value < 0 || value >= limit) {
    throw new RangeError(
      `${axis} must be an integer from 0 to ${limit - 1}; received ${value}.`,
    );
  }
}

function assertColor(color: RgbaColor): void {
  for (const channel of COLOR_CHANNELS) {
    const value = color[channel];

    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError(
        `${channel} must be an integer from 0 to 255; received ${value}.`,
      );
    }
  }
}

function pixelOffset(x: number, y: number): number {
  return (y * SKIN_WIDTH + x) * RGBA_CHANNEL_COUNT;
}

function buffersEqual(
  left: Uint8ClampedArray,
  right: Uint8ClampedArray,
): boolean {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

/**
 * Canonical, framework-independent representation of one modern Minecraft skin.
 *
 * The document exclusively owns its mutable pixel storage. Consumers can read
 * individual pixels or request a defensive buffer copy, but cannot mutate the
 * canonical storage without going through a validated document operation.
 */
export class SkinDocument {
  readonly width = SKIN_WIDTH;
  readonly height = SKIN_HEIGHT;
  readonly id: string;

  private readonly pixels: Uint8ClampedArray;
  private modelValue: SkinModel;
  private revisionValue: number;
  private savedPixels: Uint8ClampedArray;
  private savedModel: SkinModel;
  private savedRevisionValue: number;
  private readonly mutationListeners = new Set<SkinDocumentMutationListener>();

  private constructor(state: SkinDocumentState) {
    this.id = state.id;
    this.pixels = state.pixels;
    this.modelValue = state.model;
    this.revisionValue = state.revision;
    this.savedPixels = state.savedPixels;
    this.savedModel = state.savedModel;
    this.savedRevisionValue = state.savedRevision;
  }

  get model(): SkinModel {
    return this.modelValue;
  }

  /** Increases once for every effective pixel or model mutation. */
  get revision(): number {
    return this.revisionValue;
  }

  /** Revision at which the current saved-state checkpoint was established. */
  get savedRevision(): number {
    return this.savedRevisionValue;
  }

  /**
   * Compares exact document content with the saved checkpoint.
   *
   * Revision equality provides a fast path. Exact comparison allows a future
   * Undo implementation to return to saved content without manipulating a
   * fragile dirty boolean or resetting the monotonic mutation revision.
   */
  get isDirty(): boolean {
    if (this.revisionValue === this.savedRevisionValue) {
      return false;
    }

    return (
      this.modelValue !== this.savedModel ||
      !buffersEqual(this.pixels, this.savedPixels)
    );
  }

  readPixel(x: number, y: number): RgbaColor {
    assertCoordinate(x, 'x');
    assertCoordinate(y, 'y');

    const offset = pixelOffset(x, y);

    return {
      r: this.pixels[offset]!,
      g: this.pixels[offset + 1]!,
      b: this.pixels[offset + 2]!,
      a: this.pixels[offset + 3]!,
    };
  }

  /**
   * Subscribes a renderer to canonical document mutations without routing the
   * high-frequency pixel buffer through React state.
   */
  subscribeToMutations(listener: SkinDocumentMutationListener): () => void {
    this.mutationListeners.add(listener);
    return () => this.mutationListeners.delete(listener);
  }

  /** Returns whether the canonical document content changed. */
  writePixel(x: number, y: number, color: RgbaColor): boolean {
    assertCoordinate(x, 'x');
    assertCoordinate(y, 'y');
    assertColor(color);

    const offset = pixelOffset(x, y);

    if (
      this.pixels[offset] === color.r &&
      this.pixels[offset + 1] === color.g &&
      this.pixels[offset + 2] === color.b &&
      this.pixels[offset + 3] === color.a
    ) {
      return false;
    }

    this.pixels[offset] = color.r;
    this.pixels[offset + 1] = color.g;
    this.pixels[offset + 2] = color.b;
    this.pixels[offset + 3] = color.a;
    this.revisionValue += 1;
    this.publishMutation();

    return true;
  }

  /** Returns whether the model metadata changed. */
  setModel(model: SkinModel): boolean {
    assertSkinModel(model);

    if (model === this.modelValue) {
      return false;
    }

    this.modelValue = model;
    this.revisionValue += 1;
    this.publishMutation();

    return true;
  }

  /** Establishes an exact saved-state checkpoint for future dirty checks. */
  markSaved(): void {
    this.savedPixels = new Uint8ClampedArray(this.pixels);
    this.savedModel = this.modelValue;
    this.savedRevisionValue = this.revisionValue;
  }

  /** Returns a defensive copy; mutating it cannot change this document. */
  copyPixelData(): Uint8ClampedArray {
    return new Uint8ClampedArray(this.pixels);
  }

  private publishMutation(): void {
    for (const listener of this.mutationListeners) {
      listener();
    }
  }

  /**
   * Copies current and saved state without sharing mutable pixel storage.
   * By default the clone retains the same logical document identity; callers
   * creating a distinct document can provide a different id explicitly.
   */
  clone(options: CloneSkinDocumentOptions = {}): SkinDocument {
    const id = options.id ?? this.id;
    assertDocumentId(id);

    return new SkinDocument({
      id,
      pixels: new Uint8ClampedArray(this.pixels),
      model: this.modelValue,
      revision: this.revisionValue,
      savedPixels: new Uint8ClampedArray(this.savedPixels),
      savedModel: this.savedModel,
      savedRevision: this.savedRevisionValue,
    });
  }

  static create(options: CreateSkinDocumentOptions): SkinDocument {
    assertDocumentId(options.id);
    assertDimensions(options.width, options.height);
    assertPixelBufferLength(options.pixels);

    const model = options.model ?? 'classic';
    assertSkinModel(model);

    const pixels = new Uint8ClampedArray(options.pixels);

    return new SkinDocument({
      id: options.id,
      pixels,
      model,
      revision: 0,
      savedPixels: new Uint8ClampedArray(pixels),
      savedModel: model,
      savedRevision: 0,
    });
  }

  static createBlank(options: CreateBlankSkinDocumentOptions): SkinDocument {
    return SkinDocument.create({
      id: options.id,
      width: SKIN_WIDTH,
      height: SKIN_HEIGHT,
      pixels: new Uint8ClampedArray(SKIN_PIXEL_BUFFER_LENGTH),
      model: options.model,
    });
  }
}
