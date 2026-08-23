import {
  BODY_PARTS,
  CUBE_FACES,
  type BodyPart,
  type BodyPartGeometry,
  type BodyPartQuery,
  type BodyPartRegionsQuery,
  type BoxDimensions,
  type CubeFace,
  type FaceOrientation,
  type FaceRegionQuery,
  type FaceUvDefinition,
  type ModelVector3,
  type SkinLayer,
  type SkinModel,
  type TextureRegion,
} from './types';

type FaceRegionCoordinates = Readonly<
  Record<CubeFace, readonly [number, number, number, number]>
>;
type FaceDefinitions = Readonly<Record<CubeFace, FaceUvDefinition>>;
type LayerDefinitions = Readonly<Record<SkinLayer, FaceDefinitions>>;
type ModelUvMap = Readonly<Record<BodyPart, LayerDefinitions>>;
type GeometryMap = Readonly<Record<BodyPart, BodyPartGeometry>>;

export const SKIN_TEXTURE_WIDTH = 64 as const;
export const SKIN_TEXTURE_HEIGHT = 64 as const;

/**
 * Canonical model coordinates for M7: +X character-left, +Y up, +Z front.
 * Body-part names are always from the character's perspective.
 */
export const MODEL_COORDINATE_SYSTEM = Object.freeze({
  x: 'character-left',
  y: 'up',
  z: 'character-front',
  origin: 'center-between-feet-on-ground',
} as const);

export const FACE_ORIENTATIONS: Readonly<Record<CubeFace, FaceOrientation>> =
  Object.freeze({
    top: Object.freeze({
      uDirection: 'positiveX',
      vDirection: 'positiveZ',
    }),
    bottom: Object.freeze({
      uDirection: 'positiveX',
      vDirection: 'negativeZ',
    }),
    front: Object.freeze({
      uDirection: 'positiveX',
      vDirection: 'negativeY',
    }),
    back: Object.freeze({
      uDirection: 'negativeX',
      vDirection: 'negativeY',
    }),
    left: Object.freeze({
      uDirection: 'negativeZ',
      vDirection: 'negativeY',
    }),
    right: Object.freeze({
      uDirection: 'positiveZ',
      vDirection: 'negativeY',
    }),
  });

function textureRegion(
  coordinates: readonly [number, number, number, number],
): TextureRegion {
  const [x, y, width, height] = coordinates;
  return Object.freeze({ x, y, width, height });
}

function faceDefinitions(coordinates: FaceRegionCoordinates): FaceDefinitions {
  return Object.freeze(
    Object.fromEntries(
      CUBE_FACES.map((face) => [
        face,
        Object.freeze({
          region: textureRegion(coordinates[face]),
          orientation: FACE_ORIENTATIONS[face],
        }),
      ]),
    ) as Record<CubeFace, FaceUvDefinition>,
  );
}

function layers(
  base: FaceRegionCoordinates,
  outer: FaceRegionCoordinates,
): LayerDefinitions {
  return Object.freeze({
    base: faceDefinitions(base),
    outer: faceDefinitions(outer),
  });
}

const HEAD = layers(
  {
    top: [8, 0, 8, 8],
    bottom: [16, 0, 8, 8],
    front: [8, 8, 8, 8],
    back: [24, 8, 8, 8],
    left: [16, 8, 8, 8],
    right: [0, 8, 8, 8],
  },
  {
    top: [40, 0, 8, 8],
    bottom: [48, 0, 8, 8],
    front: [40, 8, 8, 8],
    back: [56, 8, 8, 8],
    left: [48, 8, 8, 8],
    right: [32, 8, 8, 8],
  },
);

const TORSO = layers(
  {
    top: [20, 16, 8, 4],
    bottom: [28, 16, 8, 4],
    front: [20, 20, 8, 12],
    back: [32, 20, 8, 12],
    left: [28, 20, 4, 12],
    right: [16, 20, 4, 12],
  },
  {
    top: [20, 32, 8, 4],
    bottom: [28, 32, 8, 4],
    front: [20, 36, 8, 12],
    back: [32, 36, 8, 12],
    left: [28, 36, 4, 12],
    right: [16, 36, 4, 12],
  },
);

const CLASSIC_RIGHT_ARM = layers(
  {
    top: [44, 16, 4, 4],
    bottom: [48, 16, 4, 4],
    front: [44, 20, 4, 12],
    back: [52, 20, 4, 12],
    left: [48, 20, 4, 12],
    right: [40, 20, 4, 12],
  },
  {
    top: [44, 32, 4, 4],
    bottom: [48, 32, 4, 4],
    front: [44, 36, 4, 12],
    back: [52, 36, 4, 12],
    left: [48, 36, 4, 12],
    right: [40, 36, 4, 12],
  },
);

const CLASSIC_LEFT_ARM = layers(
  {
    top: [36, 48, 4, 4],
    bottom: [40, 48, 4, 4],
    front: [36, 52, 4, 12],
    back: [44, 52, 4, 12],
    left: [40, 52, 4, 12],
    right: [32, 52, 4, 12],
  },
  {
    top: [52, 48, 4, 4],
    bottom: [56, 48, 4, 4],
    front: [52, 52, 4, 12],
    back: [60, 52, 4, 12],
    left: [56, 52, 4, 12],
    right: [48, 52, 4, 12],
  },
);

const SLIM_RIGHT_ARM = layers(
  {
    top: [44, 16, 3, 4],
    bottom: [47, 16, 3, 4],
    front: [44, 20, 3, 12],
    back: [51, 20, 3, 12],
    left: [47, 20, 4, 12],
    right: [40, 20, 4, 12],
  },
  {
    top: [44, 32, 3, 4],
    bottom: [47, 32, 3, 4],
    front: [44, 36, 3, 12],
    back: [51, 36, 3, 12],
    left: [47, 36, 4, 12],
    right: [40, 36, 4, 12],
  },
);

const SLIM_LEFT_ARM = layers(
  {
    top: [36, 48, 3, 4],
    bottom: [39, 48, 3, 4],
    front: [36, 52, 3, 12],
    back: [43, 52, 3, 12],
    left: [39, 52, 4, 12],
    right: [32, 52, 4, 12],
  },
  {
    top: [52, 48, 3, 4],
    bottom: [55, 48, 3, 4],
    front: [52, 52, 3, 12],
    back: [59, 52, 3, 12],
    left: [55, 52, 4, 12],
    right: [48, 52, 4, 12],
  },
);

const RIGHT_LEG = layers(
  {
    top: [4, 16, 4, 4],
    bottom: [8, 16, 4, 4],
    front: [4, 20, 4, 12],
    back: [12, 20, 4, 12],
    left: [8, 20, 4, 12],
    right: [0, 20, 4, 12],
  },
  {
    top: [4, 32, 4, 4],
    bottom: [8, 32, 4, 4],
    front: [4, 36, 4, 12],
    back: [12, 36, 4, 12],
    left: [8, 36, 4, 12],
    right: [0, 36, 4, 12],
  },
);

const LEFT_LEG = layers(
  {
    top: [20, 48, 4, 4],
    bottom: [24, 48, 4, 4],
    front: [20, 52, 4, 12],
    back: [28, 52, 4, 12],
    left: [24, 52, 4, 12],
    right: [16, 52, 4, 12],
  },
  {
    top: [4, 48, 4, 4],
    bottom: [8, 48, 4, 4],
    front: [4, 52, 4, 12],
    back: [12, 52, 4, 12],
    left: [8, 52, 4, 12],
    right: [0, 52, 4, 12],
  },
);

const CLASSIC_UV_MAP: ModelUvMap = Object.freeze({
  head: HEAD,
  torso: TORSO,
  rightArm: CLASSIC_RIGHT_ARM,
  leftArm: CLASSIC_LEFT_ARM,
  rightLeg: RIGHT_LEG,
  leftLeg: LEFT_LEG,
});

const SLIM_UV_MAP: ModelUvMap = Object.freeze({
  head: HEAD,
  torso: TORSO,
  rightArm: SLIM_RIGHT_ARM,
  leftArm: SLIM_LEFT_ARM,
  rightLeg: RIGHT_LEG,
  leftLeg: LEFT_LEG,
});

const UV_MAPS: Readonly<Record<SkinModel, ModelUvMap>> = Object.freeze({
  classic: CLASSIC_UV_MAP,
  slim: SLIM_UV_MAP,
});

function vector(x: number, y: number, z: number): ModelVector3 {
  return Object.freeze({ x, y, z });
}

function dimensions(
  width: number,
  height: number,
  depth: number,
): BoxDimensions {
  return Object.freeze({ width, height, depth });
}

function geometry(
  box: BoxDimensions,
  pivot: ModelVector3,
  cubeOffset: ModelVector3,
  meaning: BodyPartGeometry['outerLayer']['meaning'],
  expansion: number,
): BodyPartGeometry {
  return Object.freeze({
    dimensions: box,
    pivot,
    cubeOffset,
    outerLayer: Object.freeze({ meaning, expansion }),
  });
}

const HEAD_GEOMETRY = geometry(
  dimensions(8, 8, 8),
  vector(0, 24, 0),
  vector(0, 4, 0),
  'hat',
  0.5,
);
const TORSO_GEOMETRY = geometry(
  dimensions(8, 12, 4),
  vector(0, 24, 0),
  vector(0, -6, 0),
  'jacket',
  0.25,
);
const RIGHT_LEG_GEOMETRY = geometry(
  dimensions(4, 12, 4),
  vector(-1.9, 12, 0),
  vector(0, -6, 0),
  'pants',
  0.25,
);
const LEFT_LEG_GEOMETRY = geometry(
  dimensions(4, 12, 4),
  vector(1.9, 12, 0),
  vector(0, -6, 0),
  'pants',
  0.25,
);

const CLASSIC_GEOMETRY: GeometryMap = Object.freeze({
  head: HEAD_GEOMETRY,
  torso: TORSO_GEOMETRY,
  rightArm: geometry(
    dimensions(4, 12, 4),
    vector(-5, 22, 0),
    vector(-1, -4, 0),
    'sleeve',
    0.25,
  ),
  leftArm: geometry(
    dimensions(4, 12, 4),
    vector(5, 22, 0),
    vector(1, -4, 0),
    'sleeve',
    0.25,
  ),
  rightLeg: RIGHT_LEG_GEOMETRY,
  leftLeg: LEFT_LEG_GEOMETRY,
});

const SLIM_GEOMETRY: GeometryMap = Object.freeze({
  head: HEAD_GEOMETRY,
  torso: TORSO_GEOMETRY,
  rightArm: geometry(
    dimensions(3, 12, 4),
    vector(-5, 21.5, 0),
    vector(-0.5, -4, 0),
    'sleeve',
    0.25,
  ),
  leftArm: geometry(
    dimensions(3, 12, 4),
    vector(5, 21.5, 0),
    vector(0.5, -4, 0),
    'sleeve',
    0.25,
  ),
  rightLeg: RIGHT_LEG_GEOMETRY,
  leftLeg: LEFT_LEG_GEOMETRY,
});

const GEOMETRY_MAPS: Readonly<Record<SkinModel, GeometryMap>> = Object.freeze({
  classic: CLASSIC_GEOMETRY,
  slim: SLIM_GEOMETRY,
});

export const MODEL_INVARIANT_BODY_PARTS: readonly BodyPart[] = Object.freeze(
  BODY_PARTS.filter(
    (bodyPart) => bodyPart !== 'rightArm' && bodyPart !== 'leftArm',
  ),
);

export function getFaceDefinition(query: FaceRegionQuery): FaceUvDefinition {
  return UV_MAPS[query.model][query.bodyPart][query.layer][query.face];
}

export function getFaceRegion(query: FaceRegionQuery): TextureRegion {
  return getFaceDefinition(query).region;
}

export function getBodyPartRegions(
  query: BodyPartRegionsQuery,
): Readonly<Record<CubeFace, FaceUvDefinition>> {
  return UV_MAPS[query.model][query.bodyPart][query.layer];
}

export function getBodyPartGeometry(query: BodyPartQuery): BodyPartGeometry {
  return GEOMETRY_MAPS[query.model][query.bodyPart];
}
