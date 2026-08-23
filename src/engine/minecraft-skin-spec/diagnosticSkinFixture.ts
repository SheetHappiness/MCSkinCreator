import {
  BODY_PARTS,
  CUBE_FACES,
  SKIN_LAYERS,
  type FaceRegionQuery,
  type SkinModel,
} from './types';
import {
  getFaceRegion,
  SKIN_TEXTURE_HEIGHT,
  SKIN_TEXTURE_WIDTH,
} from './MinecraftSkinSpecification';

export type DiagnosticRgba = readonly [
  red: number,
  green: number,
  blue: number,
  alpha: number,
];

export interface DiagnosticSkinFixture {
  readonly width: typeof SKIN_TEXTURE_WIDTH;
  readonly height: typeof SKIN_TEXTURE_HEIGHT;
  readonly model: SkinModel;
  readonly pixels: Uint8ClampedArray;
}

export const DIAGNOSTIC_CORNER_COLORS = Object.freeze({
  topLeft: Object.freeze([255, 32, 32, 255] as const),
  topRight: Object.freeze([32, 255, 32, 255] as const),
  bottomRight: Object.freeze([255, 224, 32, 255] as const),
  bottomLeft: Object.freeze([32, 96, 255, 255] as const),
});

function queryIndex(query: FaceRegionQuery): number {
  const bodyPartIndex = BODY_PARTS.indexOf(query.bodyPart);
  const layerIndex = SKIN_LAYERS.indexOf(query.layer);
  const faceIndex = CUBE_FACES.indexOf(query.face);
  return (
    bodyPartIndex * SKIN_LAYERS.length * CUBE_FACES.length +
    layerIndex * CUBE_FACES.length +
    faceIndex
  );
}

/** Unique, opaque face color independent of the selected model. */
export function getDiagnosticFaceColor(query: FaceRegionQuery): DiagnosticRgba {
  const index = queryIndex(query);
  return Object.freeze([
    32 + ((index * 47) % 192),
    32 + ((index * 83) % 192),
    32 + ((index * 131) % 192),
    255,
  ] as const);
}

function writePixel(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
  color: DiagnosticRgba,
): void {
  const offset = (y * SKIN_TEXTURE_WIDTH + x) * 4;
  pixels.set(color, offset);
}

export function createDiagnosticSkinFixture(
  model: SkinModel,
): DiagnosticSkinFixture {
  const pixels = new Uint8ClampedArray(
    SKIN_TEXTURE_WIDTH * SKIN_TEXTURE_HEIGHT * 4,
  );

  for (const bodyPart of BODY_PARTS) {
    for (const layer of SKIN_LAYERS) {
      for (const face of CUBE_FACES) {
        const query = { model, bodyPart, layer, face } as const;
        const region = getFaceRegion(query);
        const baseColor = getDiagnosticFaceColor(query);

        for (let y = region.y; y < region.y + region.height; y += 1) {
          for (let x = region.x; x < region.x + region.width; x += 1) {
            writePixel(pixels, x, y, baseColor);
          }
        }

        writePixel(
          pixels,
          region.x,
          region.y,
          DIAGNOSTIC_CORNER_COLORS.topLeft,
        );
        writePixel(
          pixels,
          region.x + region.width - 1,
          region.y,
          DIAGNOSTIC_CORNER_COLORS.topRight,
        );
        writePixel(
          pixels,
          region.x + region.width - 1,
          region.y + region.height - 1,
          DIAGNOSTIC_CORNER_COLORS.bottomRight,
        );
        writePixel(
          pixels,
          region.x,
          region.y + region.height - 1,
          DIAGNOSTIC_CORNER_COLORS.bottomLeft,
        );
      }
    }
  }

  return Object.freeze({
    width: SKIN_TEXTURE_WIDTH,
    height: SKIN_TEXTURE_HEIGHT,
    model,
    pixels,
  });
}
