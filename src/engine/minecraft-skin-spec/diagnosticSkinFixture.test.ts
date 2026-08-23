import { describe, expect, it } from 'vitest';

import { SkinDocument } from '../document';
import { decodeSkinPng, encodeSkinPng } from '../png';
import {
  BODY_PARTS,
  CUBE_FACES,
  DIAGNOSTIC_CORNER_COLORS,
  SKIN_LAYERS,
  SKIN_MODELS,
  createDiagnosticSkinFixture,
  getDiagnosticFaceColor,
  getFaceRegion,
  type DiagnosticRgba,
} from '.';

function readPixel(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
): DiagnosticRgba {
  const offset = (y * 64 + x) * 4;
  return [
    pixels[offset]!,
    pixels[offset + 1]!,
    pixels[offset + 2]!,
    pixels[offset + 3]!,
  ];
}

describe('diagnostic skin fixture', () => {
  it('generates exact deterministic 64x64 RGBA buffers for both models', () => {
    for (const model of SKIN_MODELS) {
      const first = createDiagnosticSkinFixture(model);
      const second = createDiagnosticSkinFixture(model);

      expect(first).toMatchObject({ width: 64, height: 64, model });
      expect(first.pixels).toHaveLength(64 * 64 * 4);
      expect(first.pixels).toEqual(second.pixels);
    }
  });

  it('assigns a distinct base color to all 72 semantic faces', () => {
    const colors = new Set<string>();

    for (const model of ['classic'] as const) {
      for (const bodyPart of BODY_PARTS) {
        for (const layer of SKIN_LAYERS) {
          for (const face of CUBE_FACES) {
            colors.add(
              getDiagnosticFaceColor({
                model,
                bodyPart,
                layer,
                face,
              }).join(','),
            );
          }
        }
      }
    }

    expect(colors.size).toBe(72);
  });

  it('uses asymmetric corner markers that expose flips and rotations', () => {
    const model = 'slim';
    const fixture = createDiagnosticSkinFixture(model);
    const query = {
      model,
      bodyPart: 'rightArm',
      layer: 'base',
      face: 'front',
    } as const;
    const region = getFaceRegion(query);

    expect(readPixel(fixture.pixels, region.x, region.y)).toEqual(
      DIAGNOSTIC_CORNER_COLORS.topLeft,
    );
    expect(
      readPixel(fixture.pixels, region.x + region.width - 1, region.y),
    ).toEqual(DIAGNOSTIC_CORNER_COLORS.topRight);
    expect(
      readPixel(
        fixture.pixels,
        region.x + region.width - 1,
        region.y + region.height - 1,
      ),
    ).toEqual(DIAGNOSTIC_CORNER_COLORS.bottomRight);
    expect(
      readPixel(fixture.pixels, region.x, region.y + region.height - 1),
    ).toEqual(DIAGNOSTIC_CORNER_COLORS.bottomLeft);
    expect(readPixel(fixture.pixels, region.x + 1, region.y + 1)).toEqual(
      getDiagnosticFaceColor(query),
    );
  });

  it('round-trips through the existing PNG codec without RGBA loss', () => {
    for (const model of SKIN_MODELS) {
      const fixture = createDiagnosticSkinFixture(model);
      const document = SkinDocument.create({
        id: `diagnostic-${model}`,
        width: fixture.width,
        height: fixture.height,
        pixels: fixture.pixels,
        model,
      });
      const decoded = decodeSkinPng(encodeSkinPng(document), {
        id: `decoded-${model}`,
        model,
      });

      expect(decoded.model).toBe(model);
      expect(decoded.copyPixelData()).toEqual(fixture.pixels);
    }
  });
});
