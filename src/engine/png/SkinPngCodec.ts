import {
  convertIndexedToRgb,
  decode,
  encode,
  hasPngSignature,
  type DecodedPng,
} from 'fast-png';

import {
  SKIN_HEIGHT,
  SKIN_PIXEL_BUFFER_LENGTH,
  SKIN_WIDTH,
  SkinDocument,
  type SkinModel,
} from '../document';

export type SkinPngErrorCode =
  | 'invalid_png'
  | 'unsupported_dimensions'
  | 'unsupported_format'
  | 'encode_failed';

export class SkinPngError extends Error {
  readonly code: SkinPngErrorCode;
  readonly width?: number;
  readonly height?: number;

  constructor(
    code: SkinPngErrorCode,
    message: string,
    options: { cause?: unknown; width?: number; height?: number } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'SkinPngError';
    this.code = code;
    this.width = options.width;
    this.height = options.height;
  }
}

export interface DecodeSkinPngOptions {
  readonly id: string;
  readonly model?: SkinModel;
}

function unsupportedFormat(message: string): SkinPngError {
  return new SkinPngError(
    'unsupported_format',
    `This PNG uses ${message}. v0.1 supports PNG data that can be represented as exact 8-bit RGBA pixels.`,
  );
}

function expandChannels(
  data: Uint8Array | Uint8ClampedArray,
  channels: number,
  transparency?: Uint16Array,
): Uint8ClampedArray {
  const pixelCount = SKIN_WIDTH * SKIN_HEIGHT;

  if (data.length !== pixelCount * channels) {
    throw new Error('Decoded PNG pixel data has an unexpected length.');
  }

  const rgba = new Uint8ClampedArray(SKIN_PIXEL_BUFFER_LENGTH);
  const transparentGray =
    transparency?.length === 1 ? transparency[0] : undefined;
  const transparentRgb = transparency?.length === 3 ? transparency : undefined;

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;

    if (channels === 1 || channels === 2) {
      const gray = data[source]!;
      rgba[target] = gray;
      rgba[target + 1] = gray;
      rgba[target + 2] = gray;
      rgba[target + 3] =
        channels === 2 ? data[source + 1]! : gray === transparentGray ? 0 : 255;
      continue;
    }

    const red = data[source]!;
    const green = data[source + 1]!;
    const blue = data[source + 2]!;
    rgba[target] = red;
    rgba[target + 1] = green;
    rgba[target + 2] = blue;
    rgba[target + 3] =
      channels === 4
        ? data[source + 3]!
        : transparentRgb !== undefined &&
            red === transparentRgb[0] &&
            green === transparentRgb[1] &&
            blue === transparentRgb[2]
          ? 0
          : 255;
  }

  return rgba;
}

function decodedRgba(decoded: DecodedPng): Uint8ClampedArray {
  if (decoded.palette !== undefined) {
    const paletteChannels = decoded.palette[0]?.length;

    if (paletteChannels !== 3 && paletteChannels !== 4) {
      throw unsupportedFormat('an unsupported indexed-color palette');
    }

    return expandChannels(convertIndexedToRgb(decoded), paletteChannels);
  }

  if (decoded.depth !== 8) {
    throw unsupportedFormat(`${decoded.depth}-bit color depth`);
  }

  if (
    decoded.channels !== 1 &&
    decoded.channels !== 2 &&
    decoded.channels !== 3 &&
    decoded.channels !== 4
  ) {
    throw unsupportedFormat(`${decoded.channels} color channels`);
  }

  if (!(decoded.data instanceof Uint8Array)) {
    throw unsupportedFormat(`${decoded.depth}-bit color depth`);
  }

  return expandChannels(decoded.data, decoded.channels, decoded.transparency);
}

export function decodeSkinPng(
  bytes: Uint8Array,
  options: DecodeSkinPngOptions,
): SkinDocument {
  if (!hasPngSignature(bytes)) {
    throw new SkinPngError(
      'invalid_png',
      'The selected file could not be decoded as a valid PNG.',
    );
  }

  let decoded: DecodedPng;

  try {
    decoded = decode(bytes, { checkCrc: true });
  } catch (error) {
    throw new SkinPngError(
      'invalid_png',
      'The selected file could not be decoded as a valid PNG.',
      { cause: error },
    );
  }

  if (decoded.width !== SKIN_WIDTH || decoded.height !== SKIN_HEIGHT) {
    throw new SkinPngError(
      'unsupported_dimensions',
      `This file is ${decoded.width}×${decoded.height}. v0.1 currently supports 64×64 Minecraft skins only.`,
      { width: decoded.width, height: decoded.height },
    );
  }

  try {
    return SkinDocument.create({
      id: options.id,
      width: decoded.width,
      height: decoded.height,
      pixels: decodedRgba(decoded),
      model: options.model ?? 'classic',
    });
  } catch (error) {
    if (error instanceof SkinPngError) {
      throw error;
    }

    throw new SkinPngError(
      'invalid_png',
      'The selected file could not be decoded as a valid PNG.',
      { cause: error },
    );
  }
}

export function encodeSkinPng(document: SkinDocument): Uint8Array {
  try {
    return new Uint8Array(
      encode({
        width: SKIN_WIDTH,
        height: SKIN_HEIGHT,
        data: document.copyPixelData(),
        channels: 4,
        depth: 8,
      }),
    );
  } catch (error) {
    throw new SkinPngError(
      'encode_failed',
      'The current skin could not be encoded as a PNG.',
      { cause: error },
    );
  }
}
