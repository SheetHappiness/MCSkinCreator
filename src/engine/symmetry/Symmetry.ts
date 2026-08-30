import {
  BODY_PARTS,
  CUBE_FACES,
  SKIN_LAYERS,
  getFaceDefinition,
  getFaceRegion,
  SKIN_TEXTURE_HEIGHT,
  SKIN_TEXTURE_WIDTH,
  type BodyPart,
  type CubeFace,
  type ModelDirection,
  type SkinSemanticTarget,
  type SkinModel,
} from '../minecraft-skin-spec';
import type { TextureCoordinate } from '../viewport';

export const SYMMETRY_MODES = ['off', 'mirror', 'body-pair'] as const;
export type SymmetryMode = (typeof SYMMETRY_MODES)[number];

export const SYMMETRY_MODE_LABELS: Readonly<Record<SymmetryMode, string>> =
  Object.freeze({
    off: 'Off',
    mirror: 'Mirror',
    'body-pair': 'Body Pair',
  });

export type SymmetrySurface = SkinSemanticTarget;

export interface SymmetrySource extends TextureCoordinate {
  readonly surface?: SymmetrySurface;
}

export interface SymmetryEditOptions {
  readonly mode: SymmetryMode;
  readonly model: SkinModel;
}

const PAIRED_BODY_PARTS: Readonly<Partial<Record<BodyPart, BodyPart>>> =
  Object.freeze({
    rightArm: 'leftArm',
    leftArm: 'rightArm',
    rightLeg: 'leftLeg',
    leftLeg: 'rightLeg',
  });

const PAIRED_FACES: Readonly<Record<CubeFace, CubeFace>> = Object.freeze({
  top: 'top',
  bottom: 'bottom',
  front: 'front',
  back: 'back',
  left: 'right',
  right: 'left',
});

function assertTextureCoordinate(point: TextureCoordinate): void {
  if (
    !Number.isInteger(point.x) ||
    point.x < 0 ||
    point.x >= SKIN_TEXTURE_WIDTH ||
    !Number.isInteger(point.y) ||
    point.y < 0 ||
    point.y >= SKIN_TEXTURE_HEIGHT
  ) {
    throw new RangeError(
      `Texture coordinates must be integers inside ${SKIN_TEXTURE_WIDTH}x${SKIN_TEXTURE_HEIGHT}.`,
    );
  }
}

function contains(
  region: ReturnType<typeof getFaceRegion>,
  point: TextureCoordinate,
): boolean {
  return (
    point.x >= region.x &&
    point.x < region.x + region.width &&
    point.y >= region.y &&
    point.y < region.y + region.height
  );
}

function reflectDirection(direction: ModelDirection): ModelDirection {
  switch (direction) {
    case 'positiveX':
      return 'negativeX';
    case 'negativeX':
      return 'positiveX';
    default:
      return direction;
  }
}

function mapLocalCoordinate(
  value: number,
  sourceDirection: ModelDirection,
  targetDirection: ModelDirection,
  sourceSize: number,
  targetSize: number,
): number | undefined {
  if (sourceSize !== targetSize) return undefined;

  const reflectedSourceDirection = reflectDirection(sourceDirection);
  if (reflectedSourceDirection === targetDirection) return value;
  return targetSize - 1 - value;
}

/** Returns the corresponding texel across the generic vertical canvas axis. */
export function mirrorTextureCoordinate(
  point: TextureCoordinate,
): TextureCoordinate {
  assertTextureCoordinate(point);
  return {
    x: SKIN_TEXTURE_WIDTH - 1 - point.x,
    y: point.y,
  };
}

/** Resolves a 2D atlas texel to its canonical body/face/layer surface. */
export function resolveSymmetrySurface(
  model: SkinModel,
  point: TextureCoordinate,
): SymmetrySurface | undefined {
  assertTextureCoordinate(point);

  for (const bodyPart of BODY_PARTS) {
    for (const layer of SKIN_LAYERS) {
      for (const face of CUBE_FACES) {
        if (contains(getFaceRegion({ model, bodyPart, layer, face }), point)) {
          return { model, bodyPart, layer, face };
        }
      }
    }
  }

  return undefined;
}

/**
 * Maps one canonical limb surface texel to its character-relative partner.
 * The local U/V direction comparison preserves the face's model-space
 * orientation for both Classic and Slim arm rectangles.
 */
export function mapBodyPairTexel(
  source: SymmetrySource,
  model: SkinModel,
): TextureCoordinate {
  assertTextureCoordinate(source);

  const hintedSurface = source.surface;
  const surface =
    hintedSurface !== undefined &&
    contains(
      getFaceRegion({
        model: hintedSurface.model,
        bodyPart: hintedSurface.bodyPart,
        layer: hintedSurface.layer,
        face: hintedSurface.face,
      }),
      source,
    )
      ? hintedSurface
      : resolveSymmetrySurface(model, source);
  if (surface === undefined) return { x: source.x, y: source.y };

  const targetBodyPart = PAIRED_BODY_PARTS[surface.bodyPart];
  if (targetBodyPart === undefined) return { x: source.x, y: source.y };

  const targetFace = PAIRED_FACES[surface.face];
  const sourceQuery = {
    model: surface.model,
    bodyPart: surface.bodyPart,
    layer: surface.layer,
    face: surface.face,
  } as const;
  const targetQuery = {
    model: surface.model,
    bodyPart: targetBodyPart,
    layer: surface.layer,
    face: targetFace,
  } as const;
  const sourceRegion = getFaceRegion(sourceQuery);
  const targetRegion = getFaceRegion(targetQuery);

  if (!contains(sourceRegion, source)) return { x: source.x, y: source.y };

  const sourceDefinition = getFaceDefinition(sourceQuery);
  const targetDefinition = getFaceDefinition(targetQuery);
  const mappedU = mapLocalCoordinate(
    source.x - sourceRegion.x,
    sourceDefinition.orientation.uDirection,
    targetDefinition.orientation.uDirection,
    sourceRegion.width,
    targetRegion.width,
  );
  const mappedV = mapLocalCoordinate(
    source.y - sourceRegion.y,
    sourceDefinition.orientation.vDirection,
    targetDefinition.orientation.vDirection,
    sourceRegion.height,
    targetRegion.height,
  );

  if (mappedU === undefined || mappedV === undefined) {
    return { x: source.x, y: source.y };
  }

  return {
    x: targetRegion.x + mappedU,
    y: targetRegion.y + mappedV,
  };
}

function coordinateKey(point: TextureCoordinate): string {
  return `${point.x},${point.y}`;
}

/**
 * Expands one source texel into the exact document targets for a paint
 * mutation. Targets are deduplicated by target coordinate, so identity maps
 * and overlapping semantic interpretations never write twice.
 */
export function expandSymmetryTargets(
  source: SymmetrySource,
  options: SymmetryEditOptions,
): readonly TextureCoordinate[] {
  assertTextureCoordinate(source);

  const mirrored =
    options.mode === 'off'
      ? { x: source.x, y: source.y }
      : options.mode === 'mirror'
        ? mirrorTextureCoordinate(source)
        : mapBodyPairTexel(source, options.model);

  const targets = [{ x: source.x, y: source.y }, mirrored];
  const seen = new Set<string>();
  return targets.filter((target) => {
    const key = coordinateKey(target);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
