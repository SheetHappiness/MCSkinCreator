import {
  BODY_PARTS,
  CUBE_FACES,
  SKIN_LAYERS,
  type BodyPart,
  type CubeFace,
  type SkinLayer,
  type SkinSemanticTarget,
  type SkinModel,
  type TextureRegion,
} from './types';
import {
  getFaceRegion,
  SKIN_TEXTURE_HEIGHT,
  SKIN_TEXTURE_WIDTH,
} from './MinecraftSkinSpecification';

export const TEXTURE_LAYER_FILTERS = ['base', 'outer', 'both'] as const;
export type TextureLayerFilter = (typeof TEXTURE_LAYER_FILTERS)[number];

export const TEXTURE_FOCUS_TARGETS = [
  'whole',
  'head',
  'torso',
  'rightArm',
  'leftArm',
  'arms',
  'rightLeg',
  'leftLeg',
  'legs',
] as const;
export type TextureFocusTarget = (typeof TEXTURE_FOCUS_TARGETS)[number];

export interface TexelSemanticQuery {
  readonly model: SkinModel;
  readonly x: number;
  readonly y: number;
  /** Defaults to both layers. */
  readonly layer?: TextureLayerFilter;
}

export interface TextureSemantic extends SkinSemanticTarget {
  readonly region: TextureRegion;
}

export interface BodyPartTextureBoundsQuery {
  readonly model: SkinModel;
  readonly bodyPart: BodyPart;
  readonly layer?: TextureLayerFilter;
}

export interface TextureFocusBoundsQuery {
  readonly model: SkinModel;
  readonly target: TextureFocusTarget;
  readonly layer?: TextureLayerFilter;
}

const BODY_PART_LABELS: Readonly<Record<BodyPart, string>> = {
  head: 'Head',
  torso: 'Torso',
  rightArm: 'Right Arm',
  leftArm: 'Left Arm',
  rightLeg: 'Right Leg',
  leftLeg: 'Left Leg',
};

const LAYER_LABELS: Readonly<Record<SkinLayer, string>> = {
  base: 'Base',
  outer: 'Outer',
};

const FACE_LABELS: Readonly<Record<CubeFace, string>> = {
  top: 'Top',
  bottom: 'Bottom',
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
};

const ARM_BODY_PARTS: readonly BodyPart[] = ['rightArm', 'leftArm'];
const LEG_BODY_PARTS: readonly BodyPart[] = ['rightLeg', 'leftLeg'];

function layersForFilter(
  filter: TextureLayerFilter = 'both',
): readonly SkinLayer[] {
  return filter === 'both' ? SKIN_LAYERS : [filter];
}

function containsTexel(x: number, y: number, region: TextureRegion): boolean {
  return (
    x >= region.x &&
    x < region.x + region.width &&
    y >= region.y &&
    y < region.y + region.height
  );
}

function isTextureTexel(x: number, y: number): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    x < SKIN_TEXTURE_WIDTH &&
    y >= 0 &&
    y < SKIN_TEXTURE_HEIGHT
  );
}

/**
 * Returns every canonical face containing a texel in deterministic order.
 * Base precedes outer, then canonical body-part and face order. An uncovered
 * or out-of-bounds coordinate returns an empty array.
 */
export function queryTextureSemantics(
  query: TexelSemanticQuery,
): readonly TextureSemantic[] {
  if (!isTextureTexel(query.x, query.y)) return [];

  const matches: TextureSemantic[] = [];
  for (const layer of layersForFilter(query.layer)) {
    for (const bodyPart of BODY_PARTS) {
      for (const face of CUBE_FACES) {
        const region = getFaceRegion({
          model: query.model,
          bodyPart,
          layer,
          face,
        });
        if (containsTexel(query.x, query.y, region)) {
          matches.push({
            model: query.model,
            bodyPart,
            layer,
            face,
            region,
          });
        }
      }
    }
  }

  return Object.freeze(matches);
}

/** Returns the first canonical match, or undefined for an unused texel. */
export function queryTextureSemantic(
  query: TexelSemanticQuery,
): TextureSemantic | undefined {
  return queryTextureSemantics(query)[0];
}

function unionTextureRegions(regions: readonly TextureRegion[]): TextureRegion {
  if (regions.length === 0) {
    throw new RangeError('Cannot calculate bounds for no texture regions.');
  }

  let left = regions[0]!.x;
  let top = regions[0]!.y;
  let right = regions[0]!.x + regions[0]!.width;
  let bottom = regions[0]!.y + regions[0]!.height;

  for (const region of regions.slice(1)) {
    left = Math.min(left, region.x);
    top = Math.min(top, region.y);
    right = Math.max(right, region.x + region.width);
    bottom = Math.max(bottom, region.y + region.height);
  }

  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Returns the canonical UV bounding box for one body part and selected layer.
 * The result intentionally includes gaps between that cuboid's face regions.
 */
export function getBodyPartTextureBounds(
  query: BodyPartTextureBoundsQuery,
): TextureRegion {
  const regions = layersForFilter(query.layer).flatMap((layer) =>
    CUBE_FACES.map((face) =>
      getFaceRegion({
        model: query.model,
        bodyPart: query.bodyPart,
        layer,
        face,
      }),
    ),
  );
  return unionTextureRegions(regions);
}

/** Returns canonical UV bounds for a whole-texture or body-part focus target. */
export function getTextureFocusBounds(
  query: TextureFocusBoundsQuery,
): TextureRegion {
  if (query.target === 'whole') {
    return {
      x: 0,
      y: 0,
      width: SKIN_TEXTURE_WIDTH,
      height: SKIN_TEXTURE_HEIGHT,
    };
  }

  const bodyParts: readonly BodyPart[] =
    query.target === 'arms'
      ? ARM_BODY_PARTS
      : query.target === 'legs'
        ? LEG_BODY_PARTS
        : [query.target];

  return unionTextureRegions(
    bodyParts.map((bodyPart) =>
      getBodyPartTextureBounds({
        model: query.model,
        bodyPart,
        layer: query.layer,
      }),
    ),
  );
}

export function formatTextureSemantic(
  semantic: TextureSemantic | undefined,
): string {
  if (semantic === undefined) return 'Unused texel';
  return `${BODY_PART_LABELS[semantic.bodyPart]} · ${FACE_LABELS[semantic.face]} · ${LAYER_LABELS[semantic.layer]}`;
}
