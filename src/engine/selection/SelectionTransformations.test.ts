import { describe, expect, it } from 'vitest';

import { SkinDocument, type RgbaColor } from '../document';
import { DocumentHistory } from '../history';
import {
  CUBE_FACES,
  DIAGNOSTIC_CORNER_COLORS,
  SKIN_LAYERS,
  SKIN_MODELS,
  createDiagnosticSkinFixture,
  getFaceRegion,
  type CubeFace,
  type SkinLayer,
  type SkinModel,
} from '../minecraft-skin-spec';
import {
  SelectionClipboard,
  SelectionController,
  flipClipboardHorizontally,
  flipClipboardVertically,
  flipSelectionHorizontally,
  flipSelectionVertically,
  getBodyPartTransferMappings,
  transferBodyPart,
  type TransferableBodyPart,
} from './Selection';

const MIRRORED_FACES: Readonly<Record<CubeFace, CubeFace>> = {
  top: 'top',
  bottom: 'bottom',
  front: 'front',
  back: 'back',
  left: 'right',
  right: 'left',
};

const TRANSFORM_PIXELS = new Uint8ClampedArray([
  1, 2, 3, 4, 5, 6, 7, 0, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  23, 24,
]);

function operationLabels(history: DocumentHistory): string[] {
  return history
    .getTimelineState()
    .entries.filter((entry) => entry.kind === 'operation')
    .map((entry) => entry.label);
}

function readBufferPixel(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
): RgbaColor {
  const offset = (y * 64 + x) * 4;
  return {
    r: pixels[offset]!,
    g: pixels[offset + 1]!,
    b: pixels[offset + 2]!,
    a: pixels[offset + 3]!,
  };
}

function fixtureDocument(model: SkinModel): SkinDocument {
  const fixture = createDiagnosticSkinFixture(model);
  return SkinDocument.create({
    id: `selection-transform-${model}`,
    width: fixture.width,
    height: fixture.height,
    pixels: fixture.pixels,
    model,
  });
}

function isInsideRegion(
  x: number,
  y: number,
  region: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  },
): boolean {
  return (
    x >= region.x &&
    x < region.x + region.width &&
    y >= region.y &&
    y < region.y + region.height
  );
}

describe('exact selection transformations', () => {
  it('flips odd and even RGBA snapshots without losing transparent bytes', () => {
    const clipboard = {
      width: 3,
      height: 2,
      data: TRANSFORM_PIXELS,
    };

    expect([...flipClipboardHorizontally(clipboard).data]).toEqual([
      9, 10, 11, 12, 5, 6, 7, 0, 1, 2, 3, 4, 21, 22, 23, 24, 17, 18, 19, 20, 13,
      14, 15, 16,
    ]);
    expect([...flipClipboardVertically(clipboard).data]).toEqual([
      13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 1, 2, 3, 4, 5, 6, 7, 0, 9,
      10, 11, 12,
    ]);
  });

  it('commits one exact horizontal or vertical selection flip with undo and redo', () => {
    const document = SkinDocument.createBlank({ id: 'flip-selection' });
    const history = new DocumentHistory(document);
    const rect = { x: 4, y: 5, width: 3, height: 2 } as const;

    for (let row = 0; row < rect.height; row += 1) {
      for (let column = 0; column < rect.width; column += 1) {
        document.writePixel(rect.x + column, rect.y + row, {
          r: row * 30 + column,
          g: row * 30 + column + 1,
          b: row * 30 + column + 2,
          a: column === 1 && row === 0 ? 0 : 255,
        });
      }
    }
    const before = document.copyPixelData();

    expect(flipSelectionHorizontally(document, history, rect)).toBeDefined();
    expect(operationLabels(history)).toEqual(['Flip Horizontal']);
    expect(document.readPixel(4, 5)).toEqual({
      r: 2,
      g: 3,
      b: 4,
      a: 255,
    });
    expect(document.readPixel(5, 5)).toEqual({
      r: 1,
      g: 2,
      b: 3,
      a: 0,
    });
    expect(document.readPixel(6, 5)).toEqual({
      r: 0,
      g: 1,
      b: 2,
      a: 255,
    });
    expect(history.undo()).toBe(true);
    expect(document.copyPixelData()).toEqual(before);
    expect(history.redo()).toBe(true);
    expect(document.readPixel(4, 6)).toEqual({
      r: 32,
      g: 33,
      b: 34,
      a: 255,
    });

    expect(flipSelectionVertically(document, history, rect)).toBeDefined();
    expect(operationLabels(history)).toEqual([
      'Flip Horizontal',
      'Flip Vertical',
    ]);
    expect(document.readPixel(4, 5)).toEqual({
      r: 32,
      g: 33,
      b: 34,
      a: 255,
    });
    expect(history.undo()).toBe(true);
    expect(document.readPixel(4, 5)).toEqual({
      r: 2,
      g: 3,
      b: 4,
      a: 255,
    });
  });

  it('duplicates through a floating copy, supports cancel, and commits one undoable operation', () => {
    const document = SkinDocument.createBlank({ id: 'duplicate-selection' });
    const history = new DocumentHistory(document);
    document.writePixel(2, 3, { r: 10, g: 20, b: 30, a: 0 });
    document.writePixel(3, 3, { r: 40, g: 50, b: 60, a: 255 });
    const controller = new SelectionController(
      document,
      history,
      new SelectionClipboard(),
    );
    controller.setSelection({ x: 2, y: 3, width: 2, height: 1 });
    const before = document.copyPixelData();

    expect(controller.beginDuplicate({ x: 10, y: 11 })).toBe(true);
    expect(controller.getState().floating).toMatchObject({
      kind: 'duplicate',
      rect: { x: 10, y: 11, width: 2, height: 1 },
    });
    controller.flipHorizontal();
    expect([...controller.getState().floating!.data]).toEqual([
      40, 50, 60, 255, 10, 20, 30, 0,
    ]);
    controller.cancelFloating();
    expect(document.copyPixelData()).toEqual(before);
    expect(history.canUndo).toBe(false);

    expect(controller.beginDuplicate({ x: 10, y: 11 })).toBe(true);
    controller.moveFloatingBy({ x: 1, y: 1 });
    controller.commitFloating();
    expect(operationLabels(history)).toEqual(['Duplicate']);
    expect(document.readPixel(11, 12)).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 0,
    });
    expect(document.readPixel(12, 12)).toEqual({
      r: 40,
      g: 50,
      b: 60,
      a: 255,
    });
    expect(document.readPixel(2, 3)).toEqual({
      r: 10,
      g: 20,
      b: 30,
      a: 0,
    });
    expect(history.undo()).toBe(true);
    expect(document.readPixel(11, 12)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    expect(history.redo()).toBe(true);
    expect(document.readPixel(12, 12)).toEqual({
      r: 40,
      g: 50,
      b: 60,
      a: 255,
    });
  });
});

describe('canonical paired-limb body transfer', () => {
  it('maps all mirrored faces through canonical orientation metadata', () => {
    for (const model of SKIN_MODELS) {
      const mappings = getBodyPartTransferMappings(model, {
        source: 'rightArm',
        target: 'leftArm',
        layer: 'base',
      });

      expect(mappings).toHaveLength(CUBE_FACES.length);
      for (const mapping of mappings) {
        expect(mapping.targetFace).toBe(MIRRORED_FACES[mapping.sourceFace]);
        expect(mapping.flipU).toBe(true);
        expect(mapping.flipV).toBe(false);
        expect(mapping.sourceRegion.width).toBe(mapping.targetRegion.width);
        expect(mapping.sourceRegion.height).toBe(mapping.targetRegion.height);
      }
    }
  });

  it.each(
    SKIN_MODELS.flatMap((model) =>
      (['arm', 'leg'] as const).flatMap((limb) =>
        SKIN_LAYERS.flatMap((layer) =>
          (['right-to-left', 'left-to-right'] as const).map(
            (direction) => [model, limb, layer, direction] as const,
          ),
        ),
      ),
    ),
  )(
    'transfers every %s %s face in %s %s mode without touching unrelated texels',
    (model, limb, layer, direction) => {
      const source: TransferableBodyPart =
        limb === 'arm'
          ? direction === 'right-to-left'
            ? 'rightArm'
            : 'leftArm'
          : direction === 'right-to-left'
            ? 'rightLeg'
            : 'leftLeg';
      const target: TransferableBodyPart =
        limb === 'arm'
          ? direction === 'right-to-left'
            ? 'leftArm'
            : 'rightArm'
          : direction === 'right-to-left'
            ? 'leftLeg'
            : 'rightLeg';
      const request = {
        source,
        target,
        layer,
      } as const;
      const document = fixtureDocument(model);
      const history = new DocumentHistory(document);
      const before = document.copyPixelData();

      expect(transferBodyPart(document, history, request)).toBeDefined();
      const after = document.copyPixelData();
      expect(operationLabels(history)).toEqual([
        `Transfer ${source === 'rightArm' ? 'Right Arm' : source === 'leftArm' ? 'Left Arm' : source === 'rightLeg' ? 'Right Leg' : 'Left Leg'} → ${target === 'rightArm' ? 'Right Arm' : target === 'leftArm' ? 'Left Arm' : target === 'rightLeg' ? 'Right Leg' : 'Left Leg'} · ${layer === 'base' ? 'Base' : 'Outer'}`,
      ]);

      const targetRegions = CUBE_FACES.map((face) =>
        getFaceRegion({ model, bodyPart: target, layer, face }),
      );
      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          if (!targetRegions.some((region) => isInsideRegion(x, y, region))) {
            expect(readBufferPixel(after, x, y)).toEqual(
              readBufferPixel(before, x, y),
            );
          }
        }
      }

      for (const sourceFace of CUBE_FACES) {
        const targetFace = MIRRORED_FACES[sourceFace];
        const sourceRegion = getFaceRegion({
          model,
          bodyPart: source,
          layer,
          face: sourceFace,
        });
        const targetRegion = getFaceRegion({
          model,
          bodyPart: target,
          layer,
          face: targetFace,
        });
        for (let row = 0; row < targetRegion.height; row += 1) {
          for (let column = 0; column < targetRegion.width; column += 1) {
            expect(
              document.readPixel(targetRegion.x + column, targetRegion.y + row),
            ).toEqual(
              readBufferPixel(
                before,
                sourceRegion.x + sourceRegion.width - 1 - column,
                sourceRegion.y + row,
              ),
            );
          }
        }
      }

      expect(history.undo()).toBe(true);
      expect(document.copyPixelData()).toEqual(before);
      expect(history.redo()).toBe(true);
    },
  );

  it('exposes diagnostic corner reversal on a Slim outer arm transfer', () => {
    const model = 'slim';
    const layer: SkinLayer = 'outer';
    const document = fixtureDocument(model);
    const history = new DocumentHistory(document);
    const source = getFaceRegion({
      model,
      bodyPart: 'rightArm',
      layer,
      face: 'front',
    });
    const target = getFaceRegion({
      model,
      bodyPart: 'leftArm',
      layer,
      face: 'front',
    });

    transferBodyPart(document, history, {
      source: 'rightArm',
      target: 'leftArm',
      layer,
    });

    expect(document.readPixel(target.x, target.y)).toEqual({
      r: DIAGNOSTIC_CORNER_COLORS.topRight[0],
      g: DIAGNOSTIC_CORNER_COLORS.topRight[1],
      b: DIAGNOSTIC_CORNER_COLORS.topRight[2],
      a: DIAGNOSTIC_CORNER_COLORS.topRight[3],
    });
    expect(document.readPixel(target.x + target.width - 1, target.y)).toEqual({
      r: DIAGNOSTIC_CORNER_COLORS.topLeft[0],
      g: DIAGNOSTIC_CORNER_COLORS.topLeft[1],
      b: DIAGNOSTIC_CORNER_COLORS.topLeft[2],
      a: DIAGNOSTIC_CORNER_COLORS.topLeft[3],
    });
    expect(document.readPixel(target.x, target.y + target.height - 1)).toEqual({
      r: DIAGNOSTIC_CORNER_COLORS.bottomRight[0],
      g: DIAGNOSTIC_CORNER_COLORS.bottomRight[1],
      b: DIAGNOSTIC_CORNER_COLORS.bottomRight[2],
      a: DIAGNOSTIC_CORNER_COLORS.bottomRight[3],
    });
    expect(
      document.readPixel(
        target.x + target.width - 1,
        target.y + target.height - 1,
      ),
    ).toEqual({
      r: DIAGNOSTIC_CORNER_COLORS.bottomLeft[0],
      g: DIAGNOSTIC_CORNER_COLORS.bottomLeft[1],
      b: DIAGNOSTIC_CORNER_COLORS.bottomLeft[2],
      a: DIAGNOSTIC_CORNER_COLORS.bottomLeft[3],
    });
    expect(source.width).toBe(3);
    expect(target.width).toBe(3);
  });
});
