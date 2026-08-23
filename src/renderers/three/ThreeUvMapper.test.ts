import { describe, expect, it } from 'vitest';

import {
  BODY_PARTS,
  CUBE_FACES,
  DIAGNOSTIC_CORNER_COLORS,
  SKIN_LAYERS,
  SKIN_MODELS,
  createDiagnosticSkinFixture,
  getBodyPartGeometry,
  getFaceDefinition,
  type CubeFace,
  type ModelDirection,
  type ModelVector3,
} from '../../engine/minecraft-skin-spec';
import {
  createSkinCuboidGeometry,
  mapFaceDefinitionToThreeQuad,
} from './ThreeUvMapper';

const DIRECTION_VECTORS: Readonly<Record<ModelDirection, ModelVector3>> = {
  positiveX: { x: 1, y: 0, z: 0 },
  negativeX: { x: -1, y: 0, z: 0 },
  positiveY: { x: 0, y: 1, z: 0 },
  negativeY: { x: 0, y: -1, z: 0 },
  positiveZ: { x: 0, y: 0, z: 1 },
  negativeZ: { x: 0, y: 0, z: -1 },
};

const FACE_NORMALS: Readonly<Record<CubeFace, ModelVector3>> = {
  top: DIRECTION_VECTORS.positiveY,
  bottom: DIRECTION_VECTORS.negativeY,
  front: DIRECTION_VECTORS.positiveZ,
  back: DIRECTION_VECTORS.negativeZ,
  left: DIRECTION_VECTORS.positiveX,
  right: DIRECTION_VECTORS.negativeX,
};

function subtract(left: ModelVector3, right: ModelVector3): ModelVector3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function normalize(vector: ModelVector3): ModelVector3 {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function cross(left: ModelVector3, right: ModelVector3): ModelVector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function dot(left: ModelVector3, right: ModelVector3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function readFixturePixel(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
): readonly number[] {
  const offset = (y * 64 + x) * 4;
  return Array.from(pixels.slice(offset, offset + 4));
}

describe('M6 face to Three.js UV conversion', () => {
  it('maps every canonical U/V direction to its geometric quad direction', () => {
    for (const model of SKIN_MODELS) {
      for (const bodyPart of BODY_PARTS) {
        const dimensions = getBodyPartGeometry({ model, bodyPart }).dimensions;
        for (const layer of SKIN_LAYERS) {
          for (const face of CUBE_FACES) {
            const definition = getFaceDefinition({
              model,
              bodyPart,
              layer,
              face,
            });
            const quad = mapFaceDefinitionToThreeQuad(
              face,
              dimensions,
              definition,
            );
            const [topLeft, topRight, bottomRight, bottomLeft] = quad.positions;

            expect(normalize(subtract(topRight, topLeft))).toEqual(
              DIRECTION_VECTORS[definition.orientation.uDirection],
            );
            expect(normalize(subtract(bottomLeft, topLeft))).toEqual(
              DIRECTION_VECTORS[definition.orientation.vDirection],
            );

            const outwardNormal = cross(
              subtract(bottomRight, topLeft),
              subtract(topRight, topLeft),
            );
            expect(dot(outwardNormal, FACE_NORMALS[face])).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('maps diagnostic corner markers in source order without mirroring', () => {
    for (const model of SKIN_MODELS) {
      const fixture = createDiagnosticSkinFixture(model);
      for (const bodyPart of BODY_PARTS) {
        const dimensions = getBodyPartGeometry({ model, bodyPart }).dimensions;
        for (const layer of SKIN_LAYERS) {
          for (const face of CUBE_FACES) {
            const definition = getFaceDefinition({
              model,
              bodyPart,
              layer,
              face,
            });
            const quad = mapFaceDefinitionToThreeQuad(
              face,
              dimensions,
              definition,
            );
            const { x, y, width, height } = definition.region;
            expect(quad.textureCoordinates).toEqual([
              { u: x / 64, v: y / 64 },
              { u: (x + width) / 64, v: y / 64 },
              { u: (x + width) / 64, v: (y + height) / 64 },
              { u: x / 64, v: (y + height) / 64 },
            ]);
            const texelCorners = [
              { x, y },
              { x: x + width - 1, y },
              { x: x + width - 1, y: y + height - 1 },
              { x, y: y + height - 1 },
            ];

            expect(
              texelCorners.map(({ x, y }) =>
                readFixturePixel(fixture.pixels, x, y),
              ),
              `${model}/${bodyPart}/${layer}/${face}`,
            ).toEqual([
              DIAGNOSTIC_CORNER_COLORS.topLeft,
              DIAGNOSTIC_CORNER_COLORS.topRight,
              DIAGNOSTIC_CORNER_COLORS.bottomRight,
              DIAGNOSTIC_CORNER_COLORS.bottomLeft,
            ]);
          }
        }
      }
    }
  });

  it('assembles six mapped quads into one indexed cuboid geometry', () => {
    const geometry = createSkinCuboidGeometry({
      model: 'slim',
      bodyPart: 'rightArm',
      layer: 'outer',
      dimensions: { width: 3.5, height: 12.5, depth: 4.5 },
    });

    expect(geometry.getAttribute('position').count).toBe(24);
    expect(geometry.getAttribute('uv').count).toBe(24);
    expect(geometry.index?.count).toBe(36);
    geometry.dispose();
  });
});
