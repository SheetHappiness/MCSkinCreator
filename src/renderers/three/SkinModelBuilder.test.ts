import { describe, expect, it } from 'vitest';
import { Mesh, MeshBasicMaterial } from 'three';

import { SkinDocument } from '../../engine/document';
import { BODY_PARTS } from '../../engine/minecraft-skin-spec';
import { SkinTexture } from './SkinTexture';
import {
  SkinModelResources,
  createSkinModelDescriptor,
} from './SkinModelBuilder';

describe('Minecraft model construction', () => {
  it('describes six canonical parts, pivots, arm widths, and outer expansion', () => {
    const classic = createSkinModelDescriptor('classic');
    const slim = createSkinModelDescriptor('slim');

    expect(classic.map(({ bodyPart }) => bodyPart)).toEqual(BODY_PARTS);
    expect(slim.map(({ bodyPart }) => bodyPart)).toEqual(BODY_PARTS);

    const classicRightArm = classic.find(
      ({ bodyPart }) => bodyPart === 'rightArm',
    )!;
    const slimRightArm = slim.find(({ bodyPart }) => bodyPart === 'rightArm')!;
    expect(classicRightArm.baseDimensions.width).toBe(4);
    expect(slimRightArm.baseDimensions.width).toBe(3);
    expect(classicRightArm.pivot).toEqual({ x: -5, y: 22, z: 0 });
    expect(slimRightArm.pivot).toEqual({ x: -5, y: 21.5, z: 0 });
    expect(classicRightArm.outerDimensions).toEqual({
      width: 4.5,
      height: 12.5,
      depth: 4.5,
    });
    expect(slimRightArm.outerDimensions).toEqual({
      width: 3.5,
      height: 12.5,
      depth: 4.5,
    });

    expect(
      classic.find(({ bodyPart }) => bodyPart === 'rightLeg')!.pivot.x,
    ).toBe(-1.9);
    expect(
      classic.find(({ bodyPart }) => bodyPart === 'leftLeg')!.pivot.x,
    ).toBe(1.9);
  });

  it('builds separate base and transparent outer meshes for every part', () => {
    const document = SkinDocument.createBlank({ id: 'model-test' });
    const texture = new SkinTexture(document);
    const model = new SkinModelResources('classic', texture.texture);

    expect(model.root.children).toHaveLength(6);
    for (const bodyPart of BODY_PARTS) {
      const part = model.root.getObjectByName(bodyPart)!;
      const base = part.getObjectByName(`${bodyPart}:base`) as Mesh;
      const outer = part.getObjectByName(`${bodyPart}:outer`) as Mesh;
      expect(base).toBeInstanceOf(Mesh);
      expect(outer).toBeInstanceOf(Mesh);
      expect(base.geometry).not.toBe(outer.geometry);
      expect(base.material).not.toBe(outer.material);
      const outerMaterial = outer.material as MeshBasicMaterial;
      expect(outerMaterial.transparent).toBe(true);
      expect(outerMaterial.alphaTest).toBe(1 / 255);
      expect(outerMaterial.depthWrite).toBe(true);
    }

    const revision = document.revision;
    model.setOuterVisible(false);
    expect(
      BODY_PARTS.every(
        (bodyPart) =>
          model.root.getObjectByName(`${bodyPart}:outer`)!.visible === false,
      ),
    ).toBe(true);
    expect(document.revision).toBe(revision);

    model.dispose();
    texture.dispose();
  });

  it('keeps semantic face highlights view-only and visibility-aware', () => {
    const document = SkinDocument.createBlank({ id: 'semantic-model' });
    const texture = new SkinTexture(document);
    const model = new SkinModelResources('classic', texture.texture);
    const selectedTarget = {
      model: 'classic' as const,
      bodyPart: 'head' as const,
      layer: 'outer' as const,
      face: 'front' as const,
    };
    const highlightedTarget = {
      model: 'classic' as const,
      bodyPart: 'torso' as const,
      layer: 'base' as const,
      face: 'front' as const,
    };
    const revision = document.revision;

    model.setSelectedTarget(selectedTarget);
    model.setHighlightedTarget(highlightedTarget);

    expect(model.getPickableMeshes()).toHaveLength(12);
    expect(
      model.root
        .getObjectByName('head')
        ?.getObjectByName('skin-semantic-selected-face')?.visible,
    ).toBe(true);
    expect(
      model.root
        .getObjectByName('torso')
        ?.getObjectByName('skin-semantic-highlight-face')?.visible,
    ).toBe(true);
    expect(model.isTargetVisible(highlightedTarget)).toBe(true);

    model.setBaseVisible(false);
    expect(model.isTargetVisible(highlightedTarget)).toBe(false);
    expect(
      model.root
        .getObjectByName('torso')
        ?.getObjectByName('skin-semantic-highlight-face')?.visible,
    ).toBe(false);
    model.setBaseVisible(true);
    model.setOuterVisible(false);
    expect(model.isTargetVisible(selectedTarget)).toBe(false);
    expect(document.revision).toBe(revision);

    model.dispose();
    texture.dispose();
  });
});
