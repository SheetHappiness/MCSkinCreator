import {
  DataTexture,
  NearestFilter,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
} from 'three';

import {
  SKIN_HEIGHT,
  SKIN_PIXEL_BUFFER_LENGTH,
  SKIN_WIDTH,
  type SkinDocument,
} from '../../engine/document';

export class SkinTexture {
  readonly texture: DataTexture;
  private readonly uploadBuffer: Uint8Array;

  constructor(document: SkinDocument) {
    this.uploadBuffer = new Uint8Array(SKIN_PIXEL_BUFFER_LENGTH);
    this.copyFromDocument(document);
    this.texture = new DataTexture(
      this.uploadBuffer,
      SKIN_WIDTH,
      SKIN_HEIGHT,
      RGBAFormat,
      UnsignedByteType,
    );
    this.texture.name = `skin:${document.id}`;
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.flipY = false;
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.unpackAlignment = 1;
    this.texture.needsUpdate = true;
  }

  update(document: SkinDocument): void {
    this.copyFromDocument(document);
    this.texture.needsUpdate = true;
  }

  copyData(): Uint8Array {
    return new Uint8Array(this.uploadBuffer);
  }

  dispose(): void {
    this.texture.dispose();
  }

  private copyFromDocument(document: SkinDocument): void {
    if (document.width !== SKIN_WIDTH || document.height !== SKIN_HEIGHT) {
      throw new RangeError('Three.js skin textures must be exactly 64x64.');
    }
    this.uploadBuffer.set(document.copyPixelData());
  }
}
