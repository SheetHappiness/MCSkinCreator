import { describe, expect, it } from 'vitest';

import {
  BODY_PARTS,
  CUBE_FACES,
  SKIN_LAYERS,
  SKIN_MODELS,
  collectCanonicalRegions,
  getBodyPartTextureBounds,
  getTextureFocusBounds,
  queryTextureSemantic,
  queryTextureSemantics,
  type BodyPart,
  type CubeFace,
  type SkinLayer,
  type SkinModel,
} from '.';

describe('canonical texture semantics', () => {
  it('maps every canonical face texel to exactly one semantic within a model and layer', () => {
    for (const model of SKIN_MODELS) {
      for (const entry of collectCanonicalRegions(model)) {
        for (
          let y = entry.region.y;
          y < entry.region.y + entry.region.height;
          y += 1
        ) {
          for (
            let x = entry.region.x;
            x < entry.region.x + entry.region.width;
            x += 1
          ) {
            expect(
              queryTextureSemantics({
                model,
                x,
                y,
                layer: entry.layer,
              }),
            ).toEqual([
              {
                bodyPart: entry.bodyPart,
                layer: entry.layer,
                face: entry.face,
                region: entry.region,
              },
            ]);
          }
        }
      }
    }
  });

  it('returns no semantic for every unused texel and out-of-bounds query', () => {
    for (const model of SKIN_MODELS) {
      const canonicalRegions = collectCanonicalRegions(model);

      for (let y = 0; y < 64; y += 1) {
        for (let x = 0; x < 64; x += 1) {
          const covered = canonicalRegions.some(
            ({ region }) =>
              x >= region.x &&
              x < region.x + region.width &&
              y >= region.y &&
              y < region.y + region.height,
          );
          if (!covered) {
            expect(queryTextureSemantics({ model, x, y })).toEqual([]);
          }
        }
      }

      expect(queryTextureSemantic({ model, x: -1, y: 0 })).toBeUndefined();
      expect(queryTextureSemantic({ model, x: 64, y: 0 })).toBeUndefined();
      expect(queryTextureSemantic({ model, x: 0.5, y: 0 })).toBeUndefined();
      expect(canonicalRegions).toHaveLength(72);
    }
  });

  it('keeps layer filtering and deterministic both-layer precedence explicit', () => {
    const outer = queryTextureSemantic({
      model: 'classic',
      x: 40,
      y: 8,
      layer: 'outer',
    });
    expect(outer).toMatchObject({
      bodyPart: 'head',
      layer: 'outer',
      face: 'front',
    });
    expect(
      queryTextureSemantic({ model: 'classic', x: 40, y: 8, layer: 'base' }),
    ).toBeUndefined();
    expect(
      queryTextureSemantics({ model: 'classic', x: 40, y: 8, layer: 'both' }),
    ).toEqual([outer]);
  });

  it('uses character-relative limb semantics for Classic and Slim', () => {
    expect(
      queryTextureSemantic({ model: 'classic', x: 47, y: 20, layer: 'base' }),
    ).toMatchObject({ bodyPart: 'rightArm', face: 'front' });
    expect(
      queryTextureSemantic({ model: 'slim', x: 47, y: 20, layer: 'base' }),
    ).toMatchObject({ bodyPart: 'rightArm', face: 'left' });
    expect(
      queryTextureSemantic({ model: 'classic', x: 36, y: 52, layer: 'base' }),
    ).toMatchObject({ bodyPart: 'leftArm', face: 'front' });
    expect(
      queryTextureSemantic({ model: 'classic', x: 20, y: 52, layer: 'base' }),
    ).toMatchObject({ bodyPart: 'leftLeg', face: 'front' });
  });
});

describe('canonical texture focus bounds', () => {
  it('returns half-open bounds for each layer and grouped limbs', () => {
    expect(
      getBodyPartTextureBounds({
        model: 'classic',
        bodyPart: 'head',
        layer: 'base',
      }),
    ).toEqual({ x: 0, y: 0, width: 32, height: 16 });
    expect(
      getBodyPartTextureBounds({
        model: 'classic',
        bodyPart: 'head',
        layer: 'outer',
      }),
    ).toEqual({ x: 32, y: 0, width: 32, height: 16 });
    expect(
      getTextureFocusBounds({
        model: 'classic',
        target: 'arms',
        layer: 'base',
      }),
    ).toEqual({ x: 32, y: 16, width: 24, height: 48 });
    expect(
      getTextureFocusBounds({
        model: 'classic',
        target: 'legs',
        layer: 'outer',
      }),
    ).toEqual({ x: 0, y: 32, width: 16, height: 32 });
  });

  it('combines both layers and returns the whole texture explicitly', () => {
    expect(
      getTextureFocusBounds({
        model: 'classic',
        target: 'head',
        layer: 'both',
      }),
    ).toEqual({ x: 0, y: 0, width: 64, height: 16 });
    expect(
      getTextureFocusBounds({
        model: 'slim',
        target: 'arms',
        layer: 'both',
      }),
    ).toEqual({ x: 32, y: 16, width: 30, height: 48 });
    expect(
      getTextureFocusBounds({ model: 'classic', target: 'whole' }),
    ).toEqual({ x: 0, y: 0, width: 64, height: 64 });
  });
});

describe('semantic type tables remain complete', () => {
  it('keeps the canonical domain dimensions available to exhaustive callers', () => {
    const bodyParts: readonly BodyPart[] = BODY_PARTS;
    const faces: readonly CubeFace[] = CUBE_FACES;
    const layers: readonly SkinLayer[] = SKIN_LAYERS;
    const models: readonly SkinModel[] = SKIN_MODELS;
    expect(bodyParts).toHaveLength(6);
    expect(faces).toHaveLength(6);
    expect(layers).toHaveLength(2);
    expect(models).toHaveLength(2);
  });
});
