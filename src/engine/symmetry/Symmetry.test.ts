import { describe, expect, it } from 'vitest';

import { SkinDocument, TRANSPARENT_RGBA, type RgbaColor } from '../document';
import { DocumentHistory } from '../history';
import {
  CUBE_FACES,
  DIAGNOSTIC_CORNER_COLORS,
  SKIN_LAYERS,
  createDiagnosticSkinFixture,
  getFaceRegion,
  type BodyPart,
  type CubeFace,
  type SkinLayer,
  type SkinModel,
} from '../minecraft-skin-spec';
import {
  beginAdvancedPaintStroke,
  beginPixelStroke,
  ERASER_COLOR,
  fillAt,
  lightenColor,
} from '../tools';
import {
  expandSymmetryTargets,
  mapBodyPairTexel,
  mirrorTextureCoordinate,
  resolveSymmetrySurface,
} from './Symmetry';

const PAINT_COLOR: RgbaColor = { r: 220, g: 80, b: 40, a: 255 };

const BODY_PAIRS = [
  ['rightArm', 'leftArm'],
  ['leftArm', 'rightArm'],
  ['rightLeg', 'leftLeg'],
  ['leftLeg', 'rightLeg'],
] as const satisfies readonly (readonly [BodyPart, BodyPart])[];

function readFixturePixel(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const offset = (y * 64 + x) * 4;
  return [
    pixels[offset]!,
    pixels[offset + 1]!,
    pixels[offset + 2]!,
    pixels[offset + 3]!,
  ];
}

function targetFace(face: CubeFace): CubeFace {
  return face === 'left' ? 'right' : face === 'right' ? 'left' : face;
}

function surface(
  model: SkinModel,
  bodyPart: BodyPart,
  layer: SkinLayer,
  face: CubeFace,
) {
  return { model, bodyPart, layer, face } as const;
}

describe('generic symmetry mapping', () => {
  it('mirrors exact 64x64 coordinates across the vertical canvas axis', () => {
    expect(mirrorTextureCoordinate({ x: 0, y: 0 })).toEqual({ x: 63, y: 0 });
    expect(mirrorTextureCoordinate({ x: 31, y: 17 })).toEqual({
      x: 32,
      y: 17,
    });
    expect(mirrorTextureCoordinate({ x: 63, y: 63 })).toEqual({
      x: 0,
      y: 63,
    });
  });

  it('expands Off, Mirror, and identity body-pair targets with deduplication', () => {
    expect(
      expandSymmetryTargets(
        { x: 10, y: 20 },
        { mode: 'off', model: 'classic' },
      ),
    ).toEqual([{ x: 10, y: 20 }]);
    expect(
      expandSymmetryTargets(
        { x: 10, y: 20 },
        { mode: 'mirror', model: 'classic' },
      ),
    ).toEqual([
      { x: 10, y: 20 },
      { x: 53, y: 20 },
    ]);
    expect(
      expandSymmetryTargets(
        { x: 20, y: 20 },
        { mode: 'body-pair', model: 'classic' },
      ),
    ).toEqual([{ x: 20, y: 20 }]);
  });
});

describe('Minecraft body-pair symmetry mapping', () => {
  it('resolves every canonical face and maps Classic/Slim arm and leg U/V endpoints', () => {
    for (const model of ['classic', 'slim'] as const) {
      for (const layer of SKIN_LAYERS) {
        for (const [sourceBodyPart, targetBodyPart] of BODY_PAIRS) {
          for (const face of CUBE_FACES) {
            const sourceRegion = getFaceRegion(
              surface(model, sourceBodyPart, layer, face),
            );
            const targetRegion = getFaceRegion(
              surface(model, targetBodyPart, layer, targetFace(face)),
            );
            const sourceSurface = surface(model, sourceBodyPart, layer, face);

            expect(
              resolveSymmetrySurface(model, {
                x: sourceRegion.x,
                y: sourceRegion.y,
              }),
            ).toEqual(sourceSurface);
            expect(
              mapBodyPairTexel(
                {
                  x: sourceRegion.x,
                  y: sourceRegion.y,
                  surface: sourceSurface,
                },
                model,
              ),
            ).toEqual({
              x: targetRegion.x + targetRegion.width - 1,
              y: targetRegion.y,
            });
            expect(
              mapBodyPairTexel(
                {
                  x: sourceRegion.x + sourceRegion.width - 1,
                  y: sourceRegion.y + sourceRegion.height - 1,
                  surface: sourceSurface,
                },
                model,
              ),
            ).toEqual({
              x: targetRegion.x,
              y: targetRegion.y + targetRegion.height - 1,
            });
          }
        }
      }
    }
  });

  it('preserves diagnostic orientation markers while reflecting paired faces', () => {
    const model = 'slim';
    const layer = 'outer';
    const face = 'front';
    const source = surface(model, 'rightArm', layer, face);
    const sourceRegion = getFaceRegion(source);
    const targetRegion = getFaceRegion(
      surface(model, 'leftArm', layer, targetFace(face)),
    );
    const fixture = createDiagnosticSkinFixture(model);
    const corners = [
      [0, 0, DIAGNOSTIC_CORNER_COLORS.topLeft],
      [sourceRegion.width - 1, 0, DIAGNOSTIC_CORNER_COLORS.topRight],
      [
        sourceRegion.width - 1,
        sourceRegion.height - 1,
        DIAGNOSTIC_CORNER_COLORS.bottomRight,
      ],
      [0, sourceRegion.height - 1, DIAGNOSTIC_CORNER_COLORS.bottomLeft],
    ] as const;

    for (const [u, v, marker] of corners) {
      const sourcePoint = { x: sourceRegion.x + u, y: sourceRegion.y + v };
      const targetPoint = mapBodyPairTexel(
        { ...sourcePoint, surface: source },
        model,
      );
      expect(
        readFixturePixel(fixture.pixels, sourcePoint.x, sourcePoint.y),
      ).toEqual(marker);
      expect(targetPoint).toEqual({
        x: targetRegion.x + sourceRegion.width - 1 - u,
        y: targetRegion.y + v,
      });
    }
  });

  it('leaves unpaired head and torso texels as identity targets', () => {
    for (const model of ['classic', 'slim'] as const) {
      for (const bodyPart of ['head', 'torso'] as const) {
        const point = getFaceRegion(surface(model, bodyPart, 'base', 'front'));
        const coordinate = { x: point.x + 1, y: point.y + 1 };
        expect(
          mapBodyPairTexel(
            {
              ...coordinate,
              surface: surface(model, bodyPart, 'base', 'front'),
            },
            model,
          ),
        ).toEqual(coordinate);
      }
    }
  });
});

describe('symmetry paint transactions', () => {
  it('applies the generic canvas mirror in one 2D Pencil transaction', () => {
    const document = SkinDocument.createBlank({ id: 'symmetry-mirror' });
    const history = new DocumentHistory(document);
    const operation = beginPixelStroke(
      history,
      PAINT_COLOR,
      { x: 10, y: 20 },
      'Pencil Stroke',
      { mode: 'mirror', model: 'classic' },
    ).commit();

    expect(operation?.pixels).toHaveLength(2);
    expect(document.readPixel(10, 20)).toEqual(PAINT_COLOR);
    expect(document.readPixel(53, 20)).toEqual(PAINT_COLOR);
    expect(history.undo()).toBe(true);
    expect(document.readPixel(53, 20)).toEqual(TRANSPARENT_RGBA);
  });

  it('applies a 2D Pencil stroke to a paired limb in one undoable operation', () => {
    const document = SkinDocument.createBlank({ id: 'symmetry-pencil' });
    const history = new DocumentHistory(document);
    const source = { x: 44, y: 20 };
    const target = { x: 39, y: 52 };

    const operation = beginPixelStroke(
      history,
      PAINT_COLOR,
      source,
      'Pencil Stroke',
      { mode: 'body-pair', model: 'classic' },
    ).commit();

    expect(operation?.pixels).toHaveLength(2);
    expect(document.readPixel(source.x, source.y)).toEqual(PAINT_COLOR);
    expect(document.readPixel(target.x, target.y)).toEqual(PAINT_COLOR);
    expect(history.getTimelineState().entries).toHaveLength(2);
    expect(history.undo()).toBe(true);
    expect(document.readPixel(source.x, source.y)).toEqual(TRANSPARENT_RGBA);
    expect(document.readPixel(target.x, target.y)).toEqual(TRANSPARENT_RGBA);
    expect(history.redo()).toBe(true);
    expect(document.readPixel(target.x, target.y)).toEqual(PAINT_COLOR);
  });

  it('writes an identity body-pair target only once', () => {
    const document = SkinDocument.createBlank({ id: 'symmetry-identity' });
    const history = new DocumentHistory(document);
    const operation = beginPixelStroke(
      history,
      PAINT_COLOR,
      { x: 20, y: 20 },
      'Pencil Stroke',
      { mode: 'body-pair', model: 'classic' },
    ).commit();

    expect(operation?.pixels).toHaveLength(1);
    expect(document.readPixel(20, 20)).toEqual(PAINT_COLOR);
  });

  it('erases both paired texels and restores hidden RGBA on Undo', () => {
    const document = SkinDocument.createBlank({ id: 'symmetry-eraser' });
    const history = new DocumentHistory(document);
    const source = { x: 44, y: 20 };
    const target = { x: 39, y: 52 };
    const sourceColor = { r: 10, g: 20, b: 30, a: 40 };
    const targetColor = { r: 50, g: 60, b: 70, a: 80 };
    document.writePixel(source.x, source.y, sourceColor);
    document.writePixel(target.x, target.y, targetColor);
    document.markSaved();

    const operation = beginPixelStroke(
      history,
      ERASER_COLOR,
      source,
      'Eraser Stroke',
      { mode: 'body-pair', model: 'classic' },
    ).commit();

    expect(operation?.pixels).toHaveLength(2);
    expect(document.readPixel(source.x, source.y)).toEqual(ERASER_COLOR);
    expect(document.readPixel(target.x, target.y)).toEqual(ERASER_COLOR);
    expect(document.isDirty).toBe(true);
    expect(history.undo()).toBe(true);
    expect(document.readPixel(source.x, source.y)).toEqual(sourceColor);
    expect(document.readPixel(target.x, target.y)).toEqual(targetColor);
    expect(history.redo()).toBe(true);
  });

  it('expands a fill region before committing one source-plus-mirror operation', () => {
    const document = SkinDocument.createBlank({ id: 'symmetry-fill' });
    const history = new DocumentHistory(document);
    const source = { x: 44, y: 20 };
    const target = { x: 39, y: 52 };
    const sourceColor = { r: 1, g: 2, b: 3, a: 255 };
    document.writePixel(source.x, source.y, sourceColor);
    document.markSaved();

    const operation = fillAt(document, history, source, PAINT_COLOR, 'Fill', {
      mode: 'body-pair',
      model: 'classic',
    });

    expect(operation?.pixels).toHaveLength(2);
    expect(document.readPixel(source.x, source.y)).toEqual(PAINT_COLOR);
    expect(document.readPixel(target.x, target.y)).toEqual(PAINT_COLOR);
    expect(history.undo()).toBe(true);
    expect(document.readPixel(source.x, source.y)).toEqual(sourceColor);
    expect(document.readPixel(target.x, target.y)).toEqual(TRANSPARENT_RGBA);
  });

  it('visits each expanded target once for deterministic advanced transforms', () => {
    const document = SkinDocument.createBlank({ id: 'symmetry-noise' });
    const history = new DocumentHistory(document);
    const randomValues = [0, 0.75, 0, 0.25, 0, 0.5, 0, 0.9];
    let randomCalls = 0;
    const random = () => randomValues[randomCalls++] ?? 0;
    const source = { x: 31, y: 10 };
    const mirror = { x: 32, y: 10 };
    const sourceColor = { r: 100, g: 150, b: 200, a: 91 };
    document.writePixel(source.x, source.y, sourceColor);
    document.writePixel(mirror.x, mirror.y, sourceColor);

    const stroke = beginAdvancedPaintStroke(
      document,
      history,
      'noise',
      { strength: 0.5, density: 1, seed: 7 },
      { primary: PAINT_COLOR, secondary: PAINT_COLOR },
      source,
      random,
      { mode: 'mirror', model: 'classic' },
    );
    stroke.extend(mirror);
    const operation = stroke.commit();

    expect(operation?.pixels).toHaveLength(2);
    expect(randomCalls).toBe(2);
    expect(document.readPixel(source.x, source.y)).toEqual(
      document.readPixel(mirror.x, mirror.y),
    );
    expect(history.undo()).toBe(true);
    expect(document.readPixel(source.x, source.y)).toEqual(sourceColor);
    expect(document.readPixel(mirror.x, mirror.y)).toEqual(sourceColor);
  });

  it('keeps Off independent from document dirty state', () => {
    const document = SkinDocument.createBlank({ id: 'symmetry-off' });
    const history = new DocumentHistory(document);
    const revision = document.revision;

    expect(
      expandSymmetryTargets(
        { x: 0, y: 0 },
        { mode: 'off', model: document.model },
      ),
    ).toEqual([{ x: 0, y: 0 }]);
    expect(document.revision).toBe(revision);
    expect(document.isDirty).toBe(false);
    expect(history.canUndo).toBe(false);
  });

  it('keeps the shared transform result exact for a paired Classic texel', () => {
    const document = SkinDocument.createBlank({ id: 'symmetry-lighten' });
    const history = new DocumentHistory(document);
    const source = { x: 44, y: 20 };
    const target = { x: 39, y: 52 };
    const original = { r: 64, g: 128, b: 192, a: 91 };
    document.writePixel(source.x, source.y, original);
    document.writePixel(target.x, target.y, original);

    const stroke = beginAdvancedPaintStroke(
      document,
      history,
      'lighten',
      { strength: 0.5 },
      { primary: PAINT_COLOR, secondary: PAINT_COLOR },
      source,
      undefined,
      { mode: 'body-pair', model: 'classic' },
    );
    stroke.commit();

    expect(document.readPixel(source.x, source.y)).toEqual(
      lightenColor(original, 0.5),
    );
    expect(document.readPixel(target.x, target.y)).toEqual(
      lightenColor(original, 0.5),
    );
  });
});
