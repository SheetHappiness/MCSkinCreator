import { describe, expect, it } from 'vitest';

import { SkinDocument } from '../../engine/document';
import { DocumentHistory } from '../../engine/history';
import { BODY_PARTS, SKIN_LAYERS } from '../../engine/minecraft-skin-spec';
import { SkinModelResources } from '../../renderers/three/SkinModelBuilder';
import { SkinTexture } from '../../renderers/three/SkinTexture';
import {
  createDefaultSkinViewState,
  isolateBodyPart,
  restoreAllVisibility,
  setBodyPartVisibility,
  setLayerVisibility,
} from './skinViewState';

describe('skin view state', () => {
  it('starts with every canonical part and layer visible', () => {
    const state = createDefaultSkinViewState();
    expect(Object.values(state.bodyParts)).toEqual(BODY_PARTS.map(() => true));
    expect(Object.values(state.layers)).toEqual(SKIN_LAYERS.map(() => true));
    expect(state.isolatedBodyPart).toBeUndefined();
  });

  it('isolates one explicitly named part and restores all visibility', () => {
    const isolated = isolateBodyPart(createDefaultSkinViewState(), 'leftArm');
    expect(isolated.isolatedBodyPart).toBe('leftArm');
    expect(isolated.bodyParts).toEqual({
      head: false,
      torso: false,
      rightArm: false,
      leftArm: true,
      rightLeg: false,
      leftLeg: false,
    });

    expect(restoreAllVisibility()).toEqual(createDefaultSkinViewState());
  });

  it('clears isolate mode after a manual part change but preserves layer state', () => {
    const isolated = isolateBodyPart(createDefaultSkinViewState(), 'head');
    const withOuterHidden = setLayerVisibility(isolated, 'outer', false);
    expect(withOuterHidden.isolatedBodyPart).toBe('head');
    expect(withOuterHidden.layers.outer).toBe(false);

    const changed = setBodyPartVisibility(withOuterHidden, 'torso', true);
    expect(changed.isolatedBodyPart).toBeUndefined();
    expect(changed.layers.outer).toBe(false);
    expect(changed.bodyParts.torso).toBe(true);
  });

  it('does not mutate document state when visibility is represented separately', () => {
    const document = SkinDocument.createBlank({ id: 'view-state' });
    const history = new DocumentHistory(document);
    const texture = new SkinTexture(document);
    const resources = new SkinModelResources('classic', texture.texture);
    const revision = document.revision;
    const view = setLayerVisibility(
      setBodyPartVisibility(createDefaultSkinViewState(), 'rightArm', false),
      'base',
      false,
    );

    resources.setBaseVisible(view.layers.base);
    resources.setOuterVisible(view.layers.outer);
    for (const bodyPart of BODY_PARTS) {
      resources.setBodyPartVisible(bodyPart, view.bodyParts[bodyPart]);
    }

    expect(document.revision).toBe(revision);
    expect(document.isDirty).toBe(false);
    expect(history.canUndo).toBe(false);
    resources.dispose();
    texture.dispose();
  });

  it('applies the same left/right visibility semantics to Classic and Slim meshes', () => {
    for (const model of ['classic', 'slim'] as const) {
      const document = SkinDocument.create({
        id: `view-state-${model}`,
        width: 64,
        height: 64,
        pixels: new Uint8ClampedArray(64 * 64 * 4),
        model,
      });
      const texture = new SkinTexture(document);
      const resources = new SkinModelResources(model, texture.texture);
      resources.setBodyPartVisible('rightArm', false);
      resources.setBodyPartVisible('leftArm', true);

      expect(resources.root.getObjectByName('rightArm:base')?.visible).toBe(
        false,
      );
      expect(resources.root.getObjectByName('leftArm:base')?.visible).toBe(
        true,
      );
      resources.dispose();
      texture.dispose();
    }
  });
});
