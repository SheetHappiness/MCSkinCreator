import {
  BODY_PARTS,
  SKIN_LAYERS,
  type BodyPart,
  type SkinLayer,
} from '../../engine/minecraft-skin-spec';

export interface SkinViewState {
  readonly bodyParts: Readonly<Record<BodyPart, boolean>>;
  readonly layers: Readonly<Record<SkinLayer, boolean>>;
  readonly isolatedBodyPart: BodyPart | undefined;
}

function allBodyPartsVisible(): Record<BodyPart, boolean> {
  return Object.fromEntries(
    BODY_PARTS.map((bodyPart) => [bodyPart, true]),
  ) as Record<BodyPart, boolean>;
}

function allLayersVisible(): Record<SkinLayer, boolean> {
  return Object.fromEntries(
    SKIN_LAYERS.map((layer) => [layer, true]),
  ) as Record<SkinLayer, boolean>;
}

export function createDefaultSkinViewState(): SkinViewState {
  return {
    bodyParts: allBodyPartsVisible(),
    layers: allLayersVisible(),
    isolatedBodyPart: undefined,
  };
}

export function setBodyPartVisibility(
  state: SkinViewState,
  bodyPart: BodyPart,
  visible: boolean,
): SkinViewState {
  return {
    bodyParts: { ...state.bodyParts, [bodyPart]: visible },
    layers: state.layers,
    isolatedBodyPart: undefined,
  };
}

export function setLayerVisibility(
  state: SkinViewState,
  layer: SkinLayer,
  visible: boolean,
): SkinViewState {
  return {
    bodyParts: state.bodyParts,
    layers: { ...state.layers, [layer]: visible },
    isolatedBodyPart: state.isolatedBodyPart,
  };
}

export function isolateBodyPart(
  state: SkinViewState,
  bodyPart: BodyPart,
): SkinViewState {
  return {
    bodyParts: Object.fromEntries(
      BODY_PARTS.map((part) => [part, part === bodyPart]),
    ) as Record<BodyPart, boolean>,
    layers: state.layers,
    isolatedBodyPart: bodyPart,
  };
}

export function restoreAllVisibility(): SkinViewState {
  return createDefaultSkinViewState();
}
