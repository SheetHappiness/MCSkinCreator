export {
  FACE_ORIENTATIONS,
  MODEL_COORDINATE_SYSTEM,
  MODEL_INVARIANT_BODY_PARTS,
  SKIN_TEXTURE_HEIGHT,
  SKIN_TEXTURE_WIDTH,
  getBodyPartGeometry,
  getBodyPartRegions,
  getFaceDefinition,
  getFaceRegion,
} from './MinecraftSkinSpecification';

export {
  DIAGNOSTIC_CORNER_COLORS,
  createDiagnosticSkinFixture,
  getDiagnosticFaceColor,
} from './diagnosticSkinFixture';

export {
  auditCanonicalRegions,
  collectCanonicalRegions,
  validateSkinSpecification,
  validateTextureRegion,
} from './validation';

export { BODY_PARTS, CUBE_FACES, SKIN_LAYERS, SKIN_MODELS } from './types';

export type {
  BodyPart,
  BodyPartGeometry,
  BodyPartQuery,
  BodyPartRegionsQuery,
  BoxDimensions,
  CubeFace,
  FaceOrientation,
  FaceRegionQuery,
  FaceUvDefinition,
  ModelDirection,
  ModelVector3,
  OuterLayerGeometry,
  OuterLayerMeaning,
  SkinLayer,
  SkinModel,
  TextureRegion,
} from './types';

export type {
  DiagnosticRgba,
  DiagnosticSkinFixture,
} from './diagnosticSkinFixture';

export type { SpecificationIssue, SpecificationIssueCode } from './validation';
