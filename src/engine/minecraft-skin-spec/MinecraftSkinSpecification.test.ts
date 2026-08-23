import { describe, expect, it } from 'vitest';

import {
  BODY_PARTS,
  CUBE_FACES,
  FACE_ORIENTATIONS,
  MODEL_COORDINATE_SYSTEM,
  MODEL_INVARIANT_BODY_PARTS,
  SKIN_LAYERS,
  SKIN_MODELS,
  getBodyPartGeometry,
  getBodyPartRegions,
  getFaceDefinition,
  getFaceRegion,
  type BodyPart,
  type CubeFace,
  type SkinLayer,
  type SkinModel,
  type TextureRegion,
} from '.';

interface CuboidLayout {
  readonly u: number;
  readonly v: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

const CLASSIC_LAYOUTS: Readonly<
  Record<BodyPart, Readonly<Record<SkinLayer, CuboidLayout>>>
> = {
  head: {
    base: { u: 0, v: 0, width: 8, height: 8, depth: 8 },
    outer: { u: 32, v: 0, width: 8, height: 8, depth: 8 },
  },
  torso: {
    base: { u: 16, v: 16, width: 8, height: 12, depth: 4 },
    outer: { u: 16, v: 32, width: 8, height: 12, depth: 4 },
  },
  rightArm: {
    base: { u: 40, v: 16, width: 4, height: 12, depth: 4 },
    outer: { u: 40, v: 32, width: 4, height: 12, depth: 4 },
  },
  leftArm: {
    base: { u: 32, v: 48, width: 4, height: 12, depth: 4 },
    outer: { u: 48, v: 48, width: 4, height: 12, depth: 4 },
  },
  rightLeg: {
    base: { u: 0, v: 16, width: 4, height: 12, depth: 4 },
    outer: { u: 0, v: 32, width: 4, height: 12, depth: 4 },
  },
  leftLeg: {
    base: { u: 16, v: 48, width: 4, height: 12, depth: 4 },
    outer: { u: 0, v: 48, width: 4, height: 12, depth: 4 },
  },
};

const SLIM_LAYOUTS = {
  ...CLASSIC_LAYOUTS,
  rightArm: {
    base: { u: 40, v: 16, width: 3, height: 12, depth: 4 },
    outer: { u: 40, v: 32, width: 3, height: 12, depth: 4 },
  },
  leftArm: {
    base: { u: 32, v: 48, width: 3, height: 12, depth: 4 },
    outer: { u: 48, v: 48, width: 3, height: 12, depth: 4 },
  },
} satisfies Readonly<
  Record<BodyPart, Readonly<Record<SkinLayer, CuboidLayout>>>
>;

const MODEL_LAYOUTS: Readonly<
  Record<
    SkinModel,
    Readonly<Record<BodyPart, Readonly<Record<SkinLayer, CuboidLayout>>>>
  >
> = {
  classic: CLASSIC_LAYOUTS,
  slim: SLIM_LAYOUTS,
};

function expectedRegion(layout: CuboidLayout, face: CubeFace): TextureRegion {
  const { u, v, width, height, depth } = layout;
  switch (face) {
    case 'top':
      return { x: u + depth, y: v, width, height: depth };
    case 'bottom':
      return { x: u + depth + width, y: v, width, height: depth };
    case 'front':
      return { x: u + depth, y: v + depth, width, height };
    case 'back':
      return {
        x: u + depth * 2 + width,
        y: v + depth,
        width,
        height,
      };
    case 'left':
      return { x: u + depth + width, y: v + depth, width: depth, height };
    case 'right':
      return { x: u, y: v + depth, width: depth, height };
  }
}

describe('canonical 64x64 UV map', () => {
  it('matches every face of every model, body part, and layer', () => {
    let assertionCount = 0;

    for (const model of SKIN_MODELS) {
      for (const bodyPart of BODY_PARTS) {
        for (const layer of SKIN_LAYERS) {
          const definitions = getBodyPartRegions({ model, bodyPart, layer });
          expect(Object.keys(definitions)).toHaveLength(CUBE_FACES.length);

          for (const face of CUBE_FACES) {
            expect(getFaceRegion({ model, bodyPart, layer, face })).toEqual(
              expectedRegion(MODEL_LAYOUTS[model][bodyPart][layer], face),
            );
            assertionCount += 1;
          }
        }
      }
    }

    expect(assertionCount).toBe(144);
  });

  it('uses half-open bounds with unambiguous first and last texels', () => {
    const region = getFaceRegion({
      model: 'classic',
      bodyPart: 'head',
      layer: 'base',
      face: 'front',
    });

    expect(region).toEqual({ x: 8, y: 8, width: 8, height: 8 });
    expect([region.x, region.y]).toEqual([8, 8]);
    expect([region.x + region.width - 1, region.y + region.height - 1]).toEqual(
      [15, 15],
    );
  });

  it('keeps non-arm mappings identical between Classic and Slim', () => {
    expect(MODEL_INVARIANT_BODY_PARTS).toEqual([
      'head',
      'torso',
      'rightLeg',
      'leftLeg',
    ]);

    for (const bodyPart of MODEL_INVARIANT_BODY_PARTS) {
      for (const layer of SKIN_LAYERS) {
        expect(getBodyPartRegions({ model: 'slim', bodyPart, layer })).toBe(
          getBodyPartRegions({ model: 'classic', bodyPart, layer }),
        );
      }
    }
  });
});

describe('Classic and Slim arm UV differences', () => {
  it('uses 4-wide Classic arm fronts and 3-wide Slim arm fronts', () => {
    expect(
      getFaceRegion({
        model: 'classic',
        bodyPart: 'rightArm',
        layer: 'base',
        face: 'front',
      }),
    ).toEqual({ x: 44, y: 20, width: 4, height: 12 });
    expect(
      getFaceRegion({
        model: 'slim',
        bodyPart: 'rightArm',
        layer: 'base',
        face: 'front',
      }),
    ).toEqual({ x: 44, y: 20, width: 3, height: 12 });
  });

  it('retains 4-wide side faces because arm depth remains four', () => {
    for (const model of SKIN_MODELS) {
      for (const bodyPart of ['rightArm', 'leftArm'] as const) {
        for (const face of ['left', 'right'] as const) {
          expect(
            getFaceRegion({ model, bodyPart, layer: 'outer', face }),
          ).toMatchObject({ width: 4, height: 12 });
        }
      }
    }
  });
});

describe('character-relative left and right semantics', () => {
  it('keeps right and left arm atlas locations distinct', () => {
    expect(
      getFaceRegion({
        model: 'classic',
        bodyPart: 'rightArm',
        layer: 'base',
        face: 'front',
      }),
    ).toEqual({ x: 44, y: 20, width: 4, height: 12 });
    expect(
      getFaceRegion({
        model: 'classic',
        bodyPart: 'leftArm',
        layer: 'base',
        face: 'front',
      }),
    ).toEqual({ x: 36, y: 52, width: 4, height: 12 });
  });

  it('keeps right and left leg atlas locations distinct', () => {
    expect(
      getFaceRegion({
        model: 'classic',
        bodyPart: 'rightLeg',
        layer: 'base',
        face: 'front',
      }),
    ).toEqual({ x: 4, y: 20, width: 4, height: 12 });
    expect(
      getFaceRegion({
        model: 'classic',
        bodyPart: 'leftLeg',
        layer: 'base',
        face: 'front',
      }),
    ).toEqual({ x: 20, y: 52, width: 4, height: 12 });
  });
});

describe('renderer-independent geometry', () => {
  it.each([
    ['head', 'classic', { width: 8, height: 8, depth: 8 }],
    ['torso', 'classic', { width: 8, height: 12, depth: 4 }],
    ['rightArm', 'classic', { width: 4, height: 12, depth: 4 }],
    ['leftArm', 'slim', { width: 3, height: 12, depth: 4 }],
    ['rightLeg', 'slim', { width: 4, height: 12, depth: 4 }],
  ] as const)(
    'defines %s dimensions for %s',
    (bodyPart, model, expectedDimensions) => {
      expect(getBodyPartGeometry({ model, bodyPart }).dimensions).toEqual(
        expectedDimensions,
      );
    },
  );

  it('places neutral parts relative to a ground-centered origin', () => {
    expect(MODEL_COORDINATE_SYSTEM).toEqual({
      x: 'character-left',
      y: 'up',
      z: 'character-front',
      origin: 'center-between-feet-on-ground',
    });
    expect(
      getBodyPartGeometry({ model: 'classic', bodyPart: 'head' }),
    ).toMatchObject({
      pivot: { x: 0, y: 24, z: 0 },
      cubeOffset: { x: 0, y: 4, z: 0 },
    });
    expect(
      getBodyPartGeometry({ model: 'classic', bodyPart: 'rightLeg' }),
    ).toMatchObject({
      pivot: { x: -1.9, y: 12, z: 0 },
      cubeOffset: { x: 0, y: -6, z: 0 },
    });
  });

  it('encodes the lower Slim shoulder pivot and centered three-wide boxes', () => {
    expect(
      getBodyPartGeometry({ model: 'classic', bodyPart: 'rightArm' }),
    ).toMatchObject({
      pivot: { x: -5, y: 22, z: 0 },
      cubeOffset: { x: -1, y: -4, z: 0 },
    });
    expect(
      getBodyPartGeometry({ model: 'slim', bodyPart: 'rightArm' }),
    ).toMatchObject({
      pivot: { x: -5, y: 21.5, z: 0 },
      cubeOffset: { x: -0.5, y: -4, z: 0 },
    });
  });

  it('keeps left and right geometry on the character-relative side', () => {
    for (const model of SKIN_MODELS) {
      expect(
        getBodyPartGeometry({ model, bodyPart: 'rightArm' }).pivot.x,
      ).toBeLessThan(0);
      expect(
        getBodyPartGeometry({ model, bodyPart: 'leftArm' }).pivot.x,
      ).toBeGreaterThan(0);
      expect(
        getBodyPartGeometry({ model, bodyPart: 'rightLeg' }).pivot.x,
      ).toBeLessThan(0);
      expect(
        getBodyPartGeometry({ model, bodyPart: 'leftLeg' }).pivot.x,
      ).toBeGreaterThan(0);
    }
  });

  it('defines canonical outer-layer semantics and expansions', () => {
    expect(
      getBodyPartGeometry({ model: 'classic', bodyPart: 'head' }).outerLayer,
    ).toEqual({ meaning: 'hat', expansion: 0.5 });
    expect(
      getBodyPartGeometry({ model: 'classic', bodyPart: 'torso' }).outerLayer,
    ).toEqual({ meaning: 'jacket', expansion: 0.25 });
    expect(
      getBodyPartGeometry({ model: 'slim', bodyPart: 'leftArm' }).outerLayer,
    ).toEqual({ meaning: 'sleeve', expansion: 0.25 });
    expect(
      getBodyPartGeometry({ model: 'slim', bodyPart: 'leftLeg' }).outerLayer,
    ).toEqual({ meaning: 'pants', expansion: 0.25 });
  });
});

describe('face orientation metadata', () => {
  it('defines exact U/V model directions for every face', () => {
    expect(FACE_ORIENTATIONS).toEqual({
      top: { uDirection: 'positiveX', vDirection: 'positiveZ' },
      bottom: { uDirection: 'positiveX', vDirection: 'negativeZ' },
      front: { uDirection: 'positiveX', vDirection: 'negativeY' },
      back: { uDirection: 'negativeX', vDirection: 'negativeY' },
      left: { uDirection: 'negativeZ', vDirection: 'negativeY' },
      right: { uDirection: 'positiveZ', vDirection: 'negativeY' },
    });
  });

  it('attaches the canonical orientation to every face definition', () => {
    for (const model of SKIN_MODELS) {
      for (const bodyPart of BODY_PARTS) {
        for (const layer of SKIN_LAYERS) {
          for (const face of CUBE_FACES) {
            expect(
              getFaceDefinition({ model, bodyPart, layer, face }).orientation,
            ).toBe(FACE_ORIENTATIONS[face]);
          }
        }
      }
    }
  });
});
