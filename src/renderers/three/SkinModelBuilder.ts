import {
  DoubleSide,
  FrontSide,
  type BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type DataTexture,
} from 'three';

import {
  BODY_PARTS,
  getFaceDefinition,
  getBodyPartGeometry,
  skinSemanticTargetKey,
  type SkinSemanticTarget,
  type BodyPart,
  type BoxDimensions,
  type ModelVector3,
  type SkinModel,
} from '../../engine/minecraft-skin-spec';
import { registerSkinMeshPickMetadata } from './SkinPicking';
import {
  createSkinCuboidGeometry,
  createSkinFaceHighlightGeometry,
} from './ThreeUvMapper';

export interface SkinPartDescriptor {
  readonly bodyPart: BodyPart;
  readonly pivot: ModelVector3;
  readonly cubeOffset: ModelVector3;
  readonly baseDimensions: BoxDimensions;
  readonly outerDimensions: BoxDimensions;
  readonly outerExpansion: number;
}

export function createSkinModelDescriptor(
  model: SkinModel,
): readonly SkinPartDescriptor[] {
  return BODY_PARTS.map((bodyPart) => {
    const geometry = getBodyPartGeometry({ model, bodyPart });
    const expansion = geometry.outerLayer.expansion;
    return {
      bodyPart,
      pivot: geometry.pivot,
      cubeOffset: geometry.cubeOffset,
      baseDimensions: geometry.dimensions,
      outerDimensions: {
        width: geometry.dimensions.width + expansion * 2,
        height: geometry.dimensions.height + expansion * 2,
        depth: geometry.dimensions.depth + expansion * 2,
      },
      outerExpansion: expansion,
    };
  });
}

function createSkinMaterial(
  texture: DataTexture,
  name: string,
): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 1 / 255,
    depthWrite: true,
    side: FrontSide,
    toneMapped: false,
  });
  material.name = name;
  return material;
}

function createSemanticMaterial(
  name: string,
  color: number,
  opacity: number,
): MeshBasicMaterial {
  const material = new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    side: DoubleSide,
    toneMapped: false,
  });
  material.name = name;
  return material;
}

interface SemanticOverlay {
  readonly target: SkinSemanticTarget;
  readonly mesh: Mesh;
}

export class SkinModelResources {
  readonly root: Group;
  private readonly baseMaterial: MeshBasicMaterial;
  private readonly outerMaterial: MeshBasicMaterial;
  private readonly geometries: BufferGeometry[] = [];
  private readonly outerMeshes: Mesh[] = [];
  private readonly pickableMeshes: Mesh[] = [];
  private readonly meshesByBodyPart = new Map<
    BodyPart,
    { readonly base: Mesh; readonly outer: Mesh }
  >();
  private readonly bodyPartVisibility = new Map<BodyPart, boolean>();
  private readonly selectionMaterial: MeshBasicMaterial;
  private readonly highlightMaterial: MeshBasicMaterial;
  private selectionOverlay: SemanticOverlay | undefined;
  private highlightOverlay: SemanticOverlay | undefined;
  private readonly model: SkinModel;
  private baseVisible = true;
  private outerVisible = true;

  constructor(model: SkinModel, texture: DataTexture) {
    this.model = model;
    this.root = new Group();
    this.root.name = `skin-model:${model}`;
    this.baseMaterial = createSkinMaterial(texture, 'skin-base');
    this.outerMaterial = createSkinMaterial(texture, 'skin-outer');
    this.selectionMaterial = createSemanticMaterial(
      'skin-semantic-selection',
      0xf0c76f,
      0.2,
    );
    this.highlightMaterial = createSemanticMaterial(
      'skin-semantic-highlight',
      0x70c9ff,
      0.32,
    );

    for (const descriptor of createSkinModelDescriptor(model)) {
      const part = new Group();
      part.name = descriptor.bodyPart;
      part.position.set(
        descriptor.pivot.x,
        descriptor.pivot.y,
        descriptor.pivot.z,
      );

      const baseGeometry = createSkinCuboidGeometry({
        model,
        bodyPart: descriptor.bodyPart,
        layer: 'base',
        dimensions: descriptor.baseDimensions,
      });
      const baseMesh = new Mesh(baseGeometry, this.baseMaterial);
      baseMesh.name = `${descriptor.bodyPart}:base`;
      baseMesh.position.set(
        descriptor.cubeOffset.x,
        descriptor.cubeOffset.y,
        descriptor.cubeOffset.z,
      );

      const outerGeometry = createSkinCuboidGeometry({
        model,
        bodyPart: descriptor.bodyPart,
        layer: 'outer',
        dimensions: descriptor.outerDimensions,
      });
      const outerMesh = new Mesh(outerGeometry, this.outerMaterial);
      outerMesh.name = `${descriptor.bodyPart}:outer`;
      outerMesh.position.copy(baseMesh.position);
      outerMesh.renderOrder = 1;

      registerSkinMeshPickMetadata(baseMesh, {
        model,
        bodyPart: descriptor.bodyPart,
        layer: 'base',
      });
      registerSkinMeshPickMetadata(outerMesh, {
        model,
        bodyPart: descriptor.bodyPart,
        layer: 'outer',
      });

      this.geometries.push(baseGeometry, outerGeometry);
      this.outerMeshes.push(outerMesh);
      this.pickableMeshes.push(baseMesh, outerMesh);
      this.meshesByBodyPart.set(descriptor.bodyPart, {
        base: baseMesh,
        outer: outerMesh,
      });
      this.bodyPartVisibility.set(descriptor.bodyPart, true);
      part.add(baseMesh, outerMesh);
      this.root.add(part);
    }
  }

  setOuterVisible(visible: boolean): void {
    this.outerVisible = visible;
    for (const bodyPart of BODY_PARTS) {
      this.updateBodyPartVisibility(bodyPart);
    }
    this.syncSemanticOverlayVisibility();
  }

  setBaseVisible(visible: boolean): void {
    this.baseVisible = visible;
    for (const bodyPart of BODY_PARTS) {
      this.updateBodyPartVisibility(bodyPart);
    }
    this.syncSemanticOverlayVisibility();
  }

  setBodyPartVisible(bodyPart: BodyPart, visible: boolean): void {
    this.bodyPartVisibility.set(bodyPart, visible);
    this.updateBodyPartVisibility(bodyPart);
    this.syncSemanticOverlayVisibility();
  }

  getPickableMeshes(): readonly Mesh[] {
    return this.pickableMeshes;
  }

  setHighlightedTarget(target: SkinSemanticTarget | undefined): void {
    this.highlightOverlay = this.replaceSemanticOverlay(
      this.highlightOverlay,
      target,
      this.highlightMaterial,
      'skin-semantic-highlight-face',
      2,
    );
  }

  setSelectedTarget(target: SkinSemanticTarget | undefined): void {
    this.selectionOverlay = this.replaceSemanticOverlay(
      this.selectionOverlay,
      target,
      this.selectionMaterial,
      'skin-semantic-selected-face',
      3,
    );
  }

  isTargetVisible(target: SkinSemanticTarget | undefined): boolean {
    if (target === undefined || target.model !== this.model) return false;
    return (
      this.meshesByBodyPart.get(target.bodyPart)?.[target.layer].visible ??
      false
    );
  }

  private updateBodyPartVisibility(bodyPart: BodyPart): void {
    const meshes = this.meshesByBodyPart.get(bodyPart);
    if (meshes === undefined) return;
    const partVisible = this.bodyPartVisibility.get(bodyPart) ?? true;
    meshes.base.visible = partVisible && this.baseVisible;
    meshes.outer.visible = partVisible && this.outerVisible;
  }

  dispose(): void {
    this.root.removeFromParent();
    this.selectionOverlay = this.disposeSemanticOverlay(this.selectionOverlay);
    this.highlightOverlay = this.disposeSemanticOverlay(this.highlightOverlay);
    for (const geometry of this.geometries) geometry.dispose();
    this.baseMaterial.dispose();
    this.outerMaterial.dispose();
    this.selectionMaterial.dispose();
    this.highlightMaterial.dispose();
  }

  private replaceSemanticOverlay(
    previous: SemanticOverlay | undefined,
    target: SkinSemanticTarget | undefined,
    material: MeshBasicMaterial,
    name: string,
    renderOrder: number,
  ): SemanticOverlay | undefined {
    if (
      previous !== undefined &&
      target !== undefined &&
      skinSemanticTargetKey(previous.target) === skinSemanticTargetKey(target)
    ) {
      previous.mesh.visible = this.isTargetVisible(target);
      return previous;
    }

    this.disposeSemanticOverlay(previous);
    if (target === undefined || target.model !== this.model) return undefined;

    const descriptor = getBodyPartGeometry({
      model: this.model,
      bodyPart: target.bodyPart,
    });
    const dimensions =
      target.layer === 'base'
        ? descriptor.dimensions
        : {
            width:
              descriptor.dimensions.width + descriptor.outerLayer.expansion * 2,
            height:
              descriptor.dimensions.height +
              descriptor.outerLayer.expansion * 2,
            depth:
              descriptor.dimensions.depth + descriptor.outerLayer.expansion * 2,
          };
    const geometry = createSkinFaceHighlightGeometry(
      target.face,
      dimensions,
      getFaceDefinition(target),
    );
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.position.set(
      descriptor.cubeOffset.x,
      descriptor.cubeOffset.y,
      descriptor.cubeOffset.z,
    );
    mesh.renderOrder = renderOrder;
    const part = this.root.getObjectByName(target.bodyPart);
    if (part === undefined) {
      geometry.dispose();
      return undefined;
    }
    part.add(mesh);
    mesh.visible = this.isTargetVisible(target);
    return { target, mesh };
  }

  private disposeSemanticOverlay(
    overlay: SemanticOverlay | undefined,
  ): undefined {
    if (overlay === undefined) return undefined;
    overlay.mesh.removeFromParent();
    overlay.mesh.geometry.dispose();
    return undefined;
  }

  private syncSemanticOverlayVisibility(): void {
    if (this.highlightOverlay !== undefined) {
      this.highlightOverlay.mesh.visible = this.isTargetVisible(
        this.highlightOverlay.target,
      );
    }
    if (this.selectionOverlay !== undefined) {
      this.selectionOverlay.mesh.visible = this.isTargetVisible(
        this.selectionOverlay.target,
      );
    }
  }
}
