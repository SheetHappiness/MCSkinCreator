import { decode, encode, hasPngSignature } from 'fast-png';
import { describe, expect, it } from 'vitest';

import {
  SKIN_PIXEL_BUFFER_LENGTH,
  SkinDocument,
  TRANSPARENT_RGBA,
} from '../document';
import { SkinPngError, decodeSkinPng, encodeSkinPng } from './SkinPngCodec';

const DOCUMENT_ID = 'codec-test';

function blankDocument(): SkinDocument {
  return SkinDocument.createBlank({ id: DOCUMENT_ID });
}

function pngWithDimensions(width: number, height: number): Uint8Array {
  return encode({
    width,
    height,
    data: new Uint8Array(width * height * 4),
    channels: 4,
    depth: 8,
  });
}

function expectCodecError(
  action: () => unknown,
  code: SkinPngError['code'],
): SkinPngError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(SkinPngError);
    expect((error as SkinPngError).code).toBe(code);
    return error as SkinPngError;
  }

  throw new Error('Expected a SkinPngError.');
}

describe('Skin PNG encoding', () => {
  it('encodes a blank document as a valid 64x64 RGBA PNG', () => {
    const bytes = encodeSkinPng(blankDocument());
    const decoded = decode(bytes, { checkCrc: true });

    expect(hasPngSignature(bytes)).toBe(true);
    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(64);
    expect(decoded.channels).toBe(4);
    expect(decoded.depth).toBe(8);
    expect(decoded.data).toHaveLength(SKIN_PIXEL_BUFFER_LENGTH);
  });
});

describe('Skin PNG round trips', () => {
  it('preserves exact RGBA values, alpha, distinct colors, and boundary pixels', () => {
    const source = blankDocument();
    source.writePixel(0, 0, { r: 1, g: 2, b: 3, a: 0 });
    source.writePixel(1, 0, { r: 10, g: 20, b: 30, a: 37 });
    source.writePixel(32, 31, { r: 90, g: 80, b: 70, a: 128 });
    source.writePixel(63, 63, { r: 252, g: 253, b: 254, a: 255 });

    const decoded = decodeSkinPng(encodeSkinPng(source), {
      id: 'round-trip',
    });

    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(64);
    expect(decoded.copyPixelData()).toEqual(source.copyPixelData());
    expect(decoded.readPixel(0, 0)).toEqual({ r: 1, g: 2, b: 3, a: 0 });
    expect(decoded.readPixel(1, 0).a).toBe(37);
    expect(decoded.readPixel(63, 63)).toEqual({
      r: 252,
      g: 253,
      b: 254,
      a: 255,
    });
  });

  it('normalizes an RGB PNG to exact opaque RGBA pixels', () => {
    const rgb = new Uint8Array(64 * 64 * 3);
    rgb.set([12, 34, 56], 0);
    rgb.set([78, 90, 123], rgb.length - 3);

    const decoded = decodeSkinPng(
      encode({ width: 64, height: 64, data: rgb, channels: 3, depth: 8 }),
      { id: 'rgb-source' },
    );

    expect(decoded.readPixel(0, 0)).toEqual({ r: 12, g: 34, b: 56, a: 255 });
    expect(decoded.readPixel(63, 63)).toEqual({
      r: 78,
      g: 90,
      b: 123,
      a: 255,
    });
  });

  it('preserves fully transparent black pixels', () => {
    const decoded = decodeSkinPng(encodeSkinPng(blankDocument()), {
      id: 'transparent-round-trip',
    });

    expect(decoded.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
    expect(decoded.readPixel(63, 63)).toEqual(TRANSPARENT_RGBA);
  });
});

describe('Skin PNG validation', () => {
  it('rejects bytes without a PNG signature', () => {
    expectCodecError(
      () => decodeSkinPng(new Uint8Array([1, 2, 3, 4]), { id: DOCUMENT_ID }),
      'invalid_png',
    );
  });

  it('rejects a truncated PNG', () => {
    const valid = pngWithDimensions(64, 64);
    const truncated = valid.slice(0, valid.length - 12);

    expectCodecError(
      () => decodeSkinPng(truncated, { id: DOCUMENT_ID }),
      'invalid_png',
    );
  });

  it('rejects an invalid width without resizing', () => {
    const error = expectCodecError(
      () => decodeSkinPng(pngWithDimensions(32, 64), { id: DOCUMENT_ID }),
      'unsupported_dimensions',
    );

    expect(error.width).toBe(32);
    expect(error.height).toBe(64);
  });

  it('rejects an invalid height without resizing', () => {
    const error = expectCodecError(
      () => decodeSkinPng(pngWithDimensions(64, 32), { id: DOCUMENT_ID }),
      'unsupported_dimensions',
    );

    expect(error.width).toBe(64);
    expect(error.height).toBe(32);
  });
});

describe('Skin PNG buffer ownership', () => {
  it('does not share decoded storage with the caller-owned PNG bytes', () => {
    const bytes = encodeSkinPng(blankDocument());
    const decoded = decodeSkinPng(bytes, { id: DOCUMENT_ID });

    bytes.fill(255);

    expect(decoded.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
  });

  it('does not share encoded output with document pixel storage', () => {
    const document = blankDocument();
    const encoded = encodeSkinPng(document);

    encoded.fill(255);

    expect(document.readPixel(0, 0)).toEqual(TRANSPARENT_RGBA);
    expect(document.copyPixelData()).toHaveLength(SKIN_PIXEL_BUFFER_LENGTH);
  });
});
