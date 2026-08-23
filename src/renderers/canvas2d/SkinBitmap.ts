import type { SkinDocument } from '../../engine/document';

export interface SkinBitmapData {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** Creates immutable renderer input without sharing SkinDocument storage. */
export function createSkinBitmapData(
  skinDocument: SkinDocument,
): SkinBitmapData {
  return {
    width: skinDocument.width,
    height: skinDocument.height,
    data: skinDocument.copyPixelData(),
  };
}

export function writeSkinBitmap(
  context: CanvasRenderingContext2D,
  bitmap: SkinBitmapData,
): void {
  const imageData = context.createImageData(bitmap.width, bitmap.height);
  imageData.data.set(bitmap.data);
  context.putImageData(imageData, 0, 0);
}
