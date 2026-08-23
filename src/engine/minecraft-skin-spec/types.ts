export const SKIN_MODELS = ['classic', 'slim'] as const;
export type SkinModel = (typeof SKIN_MODELS)[number];

export const SKIN_LAYERS = ['base', 'outer'] as const;
export type SkinLayer = (typeof SKIN_LAYERS)[number];

export const BODY_PARTS = [
  'head',
  'torso',
  'rightArm',
  'leftArm',
  'rightLeg',
  'leftLeg',
] as const;
export type BodyPart = (typeof BODY_PARTS)[number];

export const CUBE_FACES = [
  'top',
  'bottom',
  'front',
  'back',
  'left',
  'right',
] as const;
export type CubeFace = (typeof CUBE_FACES)[number];

/**
 * A half-open rectangle of source texels in a 64x64 skin PNG.
 *
 * The texture origin is top-left. x increases rightward, y increases
 * downward, and the covered bounds are [x, x + width) x [y, y + height).
 */
export interface TextureRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type ModelDirection =
  | 'positiveX'
  | 'negativeX'
  | 'positiveY'
  | 'negativeY'
  | 'positiveZ'
  | 'negativeZ';

/** Maps increasing texture U and V to the renderer-independent model axes. */
export interface FaceOrientation {
  readonly uDirection: ModelDirection;
  readonly vDirection: ModelDirection;
}

export interface FaceUvDefinition {
  readonly region: TextureRegion;
  readonly orientation: FaceOrientation;
}

export interface FaceRegionQuery {
  readonly model: SkinModel;
  readonly bodyPart: BodyPart;
  readonly layer: SkinLayer;
  readonly face: CubeFace;
}

export interface BodyPartQuery {
  readonly model: SkinModel;
  readonly bodyPart: BodyPart;
}

export interface BodyPartRegionsQuery extends BodyPartQuery {
  readonly layer: SkinLayer;
}

export interface ModelVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BoxDimensions {
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}

export type OuterLayerMeaning = 'hat' | 'jacket' | 'sleeve' | 'pants';

export interface OuterLayerGeometry {
  readonly meaning: OuterLayerMeaning;
  /** Expansion, in model units, applied independently to every box side. */
  readonly expansion: number;
}

export interface BodyPartGeometry {
  readonly dimensions: BoxDimensions;
  /** Neutral joint position in the canonical model coordinate system. */
  readonly pivot: ModelVector3;
  /** Center of the base-layer box relative to its pivot. */
  readonly cubeOffset: ModelVector3;
  readonly outerLayer: OuterLayerGeometry;
}
