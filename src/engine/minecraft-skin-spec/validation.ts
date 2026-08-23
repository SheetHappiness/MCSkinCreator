import {
  BODY_PARTS,
  CUBE_FACES,
  SKIN_LAYERS,
  SKIN_MODELS,
  type BodyPart,
  type CubeFace,
  type SkinLayer,
  type SkinModel,
  type TextureRegion,
} from './types';
import {
  getBodyPartGeometry,
  getBodyPartRegions,
  getFaceRegion,
  SKIN_TEXTURE_HEIGHT,
  SKIN_TEXTURE_WIDTH,
} from './MinecraftSkinSpecification';

export type SpecificationIssueCode =
  | 'invalid-region'
  | 'missing-face'
  | 'face-dimension-mismatch'
  | 'duplicate-region'
  | 'overlapping-region';

export interface SpecificationIssue {
  readonly code: SpecificationIssueCode;
  readonly message: string;
}

interface RegionEntry {
  readonly key: string;
  readonly region: TextureRegion;
}

export function validateTextureRegion(
  region: TextureRegion,
): readonly string[] {
  const errors: string[] = [];
  const fields = [region.x, region.y, region.width, region.height];

  if (!fields.every(Number.isInteger)) {
    errors.push('x, y, width, and height must all be integers.');
  }
  if (region.width <= 0 || region.height <= 0) {
    errors.push('width and height must be positive.');
  }
  if (
    region.x < 0 ||
    region.y < 0 ||
    region.x + region.width > SKIN_TEXTURE_WIDTH ||
    region.y + region.height > SKIN_TEXTURE_HEIGHT
  ) {
    errors.push('region must lie inside the 64x64 texture.');
  }

  return errors;
}

function expectedFaceDimensions(
  model: SkinModel,
  bodyPart: BodyPart,
  face: CubeFace,
): readonly [number, number] {
  const { width, height, depth } = getBodyPartGeometry({
    model,
    bodyPart,
  }).dimensions;

  switch (face) {
    case 'top':
    case 'bottom':
      return [width, depth];
    case 'front':
    case 'back':
      return [width, height];
    case 'left':
    case 'right':
      return [depth, height];
  }
}

function regionsEqual(left: TextureRegion, right: TextureRegion): boolean {
  return (
    left.x === right.x &&
    left.y === right.y &&
    left.width === right.width &&
    left.height === right.height
  );
}

function regionsOverlap(left: TextureRegion, right: TextureRegion): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

/**
 * Audits one mutually exclusive model interpretation at a time. Classic and
 * Slim intentionally reuse atlas coordinates, so cross-model overlap is not an
 * error and is deliberately outside this audit scope.
 */
export function auditCanonicalRegions(
  model: SkinModel,
): readonly SpecificationIssue[] {
  const issues: SpecificationIssue[] = [];
  const entries: RegionEntry[] = [];

  for (const bodyPart of BODY_PARTS) {
    for (const layer of SKIN_LAYERS) {
      const definitions = getBodyPartRegions({ model, bodyPart, layer });

      for (const face of CUBE_FACES) {
        const definition = definitions[face];
        const key = `${model}.${bodyPart}.${layer}.${face}`;

        if (definition === undefined) {
          issues.push({
            code: 'missing-face',
            message: `${key} is missing.`,
          });
          continue;
        }

        for (const error of validateTextureRegion(definition.region)) {
          issues.push({
            code: 'invalid-region',
            message: `${key}: ${error}`,
          });
        }

        const [expectedWidth, expectedHeight] = expectedFaceDimensions(
          model,
          bodyPart,
          face,
        );
        if (
          definition.region.width !== expectedWidth ||
          definition.region.height !== expectedHeight
        ) {
          issues.push({
            code: 'face-dimension-mismatch',
            message: `${key} is ${definition.region.width}x${definition.region.height}; expected ${expectedWidth}x${expectedHeight}.`,
          });
        }

        entries.push({ key, region: definition.region });
      }
    }
  }

  for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
    const left = entries[leftIndex]!;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < entries.length;
      rightIndex += 1
    ) {
      const right = entries[rightIndex]!;
      if (regionsEqual(left.region, right.region)) {
        issues.push({
          code: 'duplicate-region',
          message: `${left.key} and ${right.key} use the same region.`,
        });
      } else if (regionsOverlap(left.region, right.region)) {
        issues.push({
          code: 'overlapping-region',
          message: `${left.key} and ${right.key} overlap.`,
        });
      }
    }
  }

  return issues;
}

export function validateSkinSpecification(): readonly SpecificationIssue[] {
  return SKIN_MODELS.flatMap((model) => auditCanonicalRegions(model));
}

export function collectCanonicalRegions(model: SkinModel): readonly Readonly<{
  bodyPart: BodyPart;
  layer: SkinLayer;
  face: CubeFace;
  region: TextureRegion;
}>[] {
  return BODY_PARTS.flatMap((bodyPart) =>
    SKIN_LAYERS.flatMap((layer) =>
      CUBE_FACES.map((face) => ({
        bodyPart,
        layer,
        face,
        region: getFaceRegion({ model, bodyPart, layer, face }),
      })),
    ),
  );
}
