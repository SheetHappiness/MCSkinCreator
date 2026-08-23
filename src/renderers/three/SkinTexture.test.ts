import { describe, expect, it } from 'vitest';
import { NearestFilter, SRGBColorSpace } from 'three';

import { SKIN_PIXEL_BUFFER_LENGTH, SkinDocument } from '../../engine/document';
import { SkinTexture } from './SkinTexture';

function createDocument(): SkinDocument {
  const pixels = new Uint8ClampedArray(SKIN_PIXEL_BUFFER_LENGTH);
  pixels.set([1, 2, 3, 4], 0);
  pixels.set([251, 252, 253, 254], pixels.length - 4);
  return SkinDocument.create({
    id: 'texture-test',
    width: 64,
    height: 64,
    pixels,
  });
}

describe('Three.js skin texture', () => {
  it('copies the exact 64x64 RGBA buffer and configures pixel-art sampling', () => {
    const document = createDocument();
    const beforeRevision = document.revision;
    const texture = new SkinTexture(document);

    expect(texture.texture.image.width).toBe(64);
    expect(texture.texture.image.height).toBe(64);
    expect(texture.copyData()).toHaveLength(SKIN_PIXEL_BUFFER_LENGTH);
    expect(Array.from(texture.copyData().slice(0, 4))).toEqual([1, 2, 3, 4]);
    expect(Array.from(texture.copyData().slice(-4))).toEqual([
      251, 252, 253, 254,
    ]);
    expect(texture.texture.magFilter).toBe(NearestFilter);
    expect(texture.texture.minFilter).toBe(NearestFilter);
    expect(texture.texture.generateMipmaps).toBe(false);
    expect(texture.texture.flipY).toBe(false);
    expect(texture.texture.colorSpace).toBe(SRGBColorSpace);
    expect(document.revision).toBe(beforeRevision);
  });

  it('updates derived bytes after a mutation without exposing writable state', () => {
    const document = createDocument();
    const texture = new SkinTexture(document);
    const exposedCopy = texture.copyData();
    exposedCopy[0] = 99;

    expect(document.readPixel(0, 0)).toEqual({ r: 1, g: 2, b: 3, a: 4 });
    expect(texture.copyData()[0]).toBe(1);

    document.writePixel(4, 5, { r: 80, g: 90, b: 100, a: 110 });
    texture.update(document);
    const offset = (5 * 64 + 4) * 4;
    expect(Array.from(texture.copyData().slice(offset, offset + 4))).toEqual([
      80, 90, 100, 110,
    ]);
  });
});
