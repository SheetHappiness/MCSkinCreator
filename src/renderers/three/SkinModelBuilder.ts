import {
  FrontSide,
  type BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type DataTexture,
} from 'three';

import {
  BODY_PARTS,
  getBodyPartGeometry,
  type BodyPart,
  type BoxDimensions,
  type ModelVector3,
  type SkinModel,
} from '../../engine/minecraft-skin-spec';
import { registerSkinMeshPickMetadata } from './SkinPicking';
import { createSkinCuboidGeometry } from './ThreeUvMapper';

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
  private baseVisible = true;
  private outerVisible = true;

  constructor(model: SkinModel, texture: DataTexture) {
    this.root = new Group();
    this.root.name = `skin-model:${model}`;
    this.baseMaterial = createSkinMaterial(texture, 'skin-base');
    this.outerMaterial = createSkinMaterial(texture, 'skin-outer');

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
  }

  setBaseVisible(visible: boolean): void {
    this.baseVisible = visible;
    for (const bodyPart of BODY_PARTS) {
      this.updateBodyPartVisibility(bodyPart);
    }
  }

  setBodyPartVisible(bodyPart: BodyPart, visible: boolean): void {
    this.bodyPartVisibility.set(bodyPart, visible);
    this.updateBodyPartVisibility(bodyPart);
  }

  getPickableMeshes(): readonly Mesh[] {
    return this.pickableMeshes;
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
    for (const geometry of this.geometries) geometry.dispose();
    this.baseMaterial.dispose();
    this.outerMaterial.dispose();
  }
}
