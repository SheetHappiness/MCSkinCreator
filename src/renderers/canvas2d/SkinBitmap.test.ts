import { describe, expect, it, vi } from 'vitest';

import { SkinDocument } from '../../engine/document';
import { createSkinBitmapData, writeSkinBitmap } from './SkinBitmap';

describe('skin bitmap generation', () => {
  it('preserves exact 64x64 RGBA values and alpha', () => {
    const document = SkinDocument.createBlank({ id: 'bitmap' });
    document.writePixel(0, 0, { r: 12, g: 34, b: 56, a: 78 });
    document.writePixel(63, 63, { r: 210, g: 220, b: 230, a: 255 });

    const bitmap = createSkinBitmapData(document);

    expect(bitmap.width).toBe(64);
    expect(bitmap.height).toBe(64);
    expect([...bitmap.data.slice(0, 4)]).toEqual([12, 34, 56, 78]);
    expect([...bitmap.data.slice(-4)]).toEqual([210, 220, 230, 255]);
  });

  it('does not expose writable SkinDocument storage', () => {
    const document = SkinDocument.createBlank({ id: 'defensive-copy' });
    const bitmap = createSkinBitmapData(document);

    bitmap.data.set([255, 128, 64, 32], 0);

    expect(document.readPixel(0, 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(document.revision).toBe(0);
  });

  it('writes the complete RGBA buffer through ImageData', () => {
    const document = SkinDocument.createBlank({ id: 'image-data' });
    document.writePixel(7, 9, { r: 1, g: 2, b: 3, a: 4 });
    const imageData = {
      width: 64,
      height: 64,
      data: new Uint8ClampedArray(64 * 64 * 4),
    } as ImageData;
    const context = {
      createImageData: vi.fn(() => imageData),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    writeSkinBitmap(context, createSkinBitmapData(document));

    expect(context.createImageData).toHaveBeenCalledWith(64, 64);
    expect(context.putImageData).toHaveBeenCalledWith(imageData, 0, 0);
    expect([
      ...imageData.data.slice((9 * 64 + 7) * 4, (9 * 64 + 7) * 4 + 4),
    ]).toEqual([1, 2, 3, 4]);
  });
});
