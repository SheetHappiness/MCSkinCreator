import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint16BufferAttribute,
} from 'three';

import {
  CUBE_FACES,
  getFaceDefinition,
  type BoxDimensions,
  type CubeFace,
  type FaceUvDefinition,
  type ModelDirection,
  type ModelVector3,
  type SkinLayer,
  type SkinModel,
  type BodyPart,
} from '../../engine/minecraft-skin-spec';
import { SKIN_HEIGHT, SKIN_WIDTH } from '../../engine/document';

export type QuadCorners<T> = readonly [T, T, T, T];

export interface TextureCoordinate {
  readonly u: number;
  readonly v: number;
}

export interface SkinFaceQuad {
  readonly face: CubeFace;
  /** Source top-left, top-right, bottom-right, bottom-left. */
  readonly positions: QuadCorners<ModelVector3>;
  /** Source top-left, top-right, bottom-right, bottom-left. */
  readonly textureCoordinates: QuadCorners<TextureCoordinate>;
}

const DIRECTION_VECTORS: Readonly<Record<ModelDirection, ModelVector3>> = {
  positiveX: { x: 1, y: 0, z: 0 },
  negativeX: { x: -1, y: 0, z: 0 },
  positiveY: { x: 0, y: 1, z: 0 },
  negativeY: { x: 0, y: -1, z: 0 },
  positiveZ: { x: 0, y: 0, z: 1 },
  negativeZ: { x: 0, y: 0, z: -1 },
};

const FACE_CENTERS = {
  top: (dimensions: BoxDimensions) => ({
    x: 0,
    y: dimensions.height / 2,
    z: 0,
  }),
  bottom: (dimensions: BoxDimensions) => ({
    x: 0,
    y: -dimensions.height / 2,
    z: 0,
  }),
  front: (dimensions: BoxDimensions) => ({
    x: 0,
    y: 0,
    z: dimensions.depth / 2,
  }),
  back: (dimensions: BoxDimensions) => ({
    x: 0,
    y: 0,
    z: -dimensions.depth / 2,
  }),
  left: (dimensions: BoxDimensions) => ({
    x: dimensions.width / 2,
    y: 0,
    z: 0,
  }),
  right: (dimensions: BoxDimensions) => ({
    x: -dimensions.width / 2,
    y: 0,
    z: 0,
  }),
} satisfies Readonly<
  Record<CubeFace, (dimensions: BoxDimensions) => ModelVector3>
>;

function directionExtent(
  direction: ModelDirection,
  dimensions: BoxDimensions,
): number {
  if (direction.endsWith('X')) return dimensions.width;
  if (direction.endsWith('Y')) return dimensions.height;
  return dimensions.depth;
}

function addScaled(
  origin: ModelVector3,
  direction: ModelVector3,
  distance: number,
): ModelVector3 {
  return {
    x: origin.x + direction.x * distance,
    y: origin.y + direction.y * distance,
    z: origin.z + direction.z * distance,
  };
}

/**
 * Converts the renderer-independent M6 face orientation into one Three.js
 * quad. DataTexture rows are uploaded without Y flipping, so source Y maps
 * directly to normalized texture V.
 */
export function mapFaceDefinitionToThreeQuad(
  face: CubeFace,
  dimensions: BoxDimensions,
  definition: FaceUvDefinition,
): SkinFaceQuad {
  const uDirection = DIRECTION_VECTORS[definition.orientation.uDirection];
  const vDirection = DIRECTION_VECTORS[definition.orientation.vDirection];
  const uExtent = directionExtent(
    definition.orientation.uDirection,
    dimensions,
  );
  const vExtent = directionExtent(
    definition.orientation.vDirection,
    dimensions,
  );
  const center = FACE_CENTERS[face](dimensions);
  const topLeft = addScaled(
    addScaled(center, uDirection, -uExtent / 2),
    vDirection,
    -vExtent / 2,
  );
  const topRight = addScaled(topLeft, uDirection, uExtent);
  const bottomLeft = addScaled(topLeft, vDirection, vExtent);
  const bottomRight = addScaled(topRight, vDirection, vExtent);
  const { x, y, width, height } = definition.region;

  return {
    face,
    positions: [topLeft, topRight, bottomRight, bottomLeft],
    textureCoordinates: [
      { u: x / SKIN_WIDTH, v: y / SKIN_HEIGHT },
      { u: (x + width) / SKIN_WIDTH, v: y / SKIN_HEIGHT },
      {
        u: (x + width) / SKIN_WIDTH,
        v: (y + height) / SKIN_HEIGHT,
      },
      { u: x / SKIN_WIDTH, v: (y + height) / SKIN_HEIGHT },
    ],
  };
}

export interface CreateSkinCuboidGeometryOptions {
  readonly model: SkinModel;
  readonly bodyPart: BodyPart;
  readonly layer: SkinLayer;
  readonly dimensions: BoxDimensions;
}

export function createSkinCuboidGeometry(
  options: CreateSkinCuboidGeometryOptions,
): BufferGeometry {
  const positions: number[] = [];
  const textureCoordinates: number[] = [];
  const indices: number[] = [];

  for (const face of CUBE_FACES) {
    const quad = mapFaceDefinitionToThreeQuad(
      face,
      options.dimensions,
      getFaceDefinition({
        model: options.model,
        bodyPart: options.bodyPart,
        layer: options.layer,
        face,
      }),
    );
    const firstVertex = positions.length / 3;

    for (const position of quad.positions) {
      positions.push(position.x, position.y, position.z);
    }
    for (const coordinate of quad.textureCoordinates) {
      textureCoordinates.push(coordinate.u, coordinate.v);
    }

    // M6 U/V directions cross inward for every canonical face. Reverse the
    // winding so Three.js front-face culling keeps the outward surface.
    indices.push(
      firstVertex,
      firstVertex + 2,
      firstVertex + 1,
      firstVertex,
      firstVertex + 3,
      firstVertex + 2,
    );
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute(
    'uv',
    new Float32BufferAttribute(textureCoordinates, 2),
  );
  geometry.setIndex(new Uint16BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}
