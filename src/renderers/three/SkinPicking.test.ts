import { describe, expect, it } from 'vitest';
import {
  Mesh,
  PerspectiveCamera,
  Raycaster,
  Vector2,
  Vector3,
  type Intersection,
} from 'three';

import { SkinDocument } from '../../engine/document';
import {
  BODY_PARTS,
  CUBE_FACES,
  DIAGNOSTIC_CORNER_COLORS,
  SKIN_LAYERS,
  SKIN_MODELS,
  createDiagnosticSkinFixture,
  getBodyPartGeometry,
  getFaceDefinition,
  type BodyPart,
  type CubeFace,
  type SkinLayer,
  type SkinModel,
} from '../../engine/minecraft-skin-spec';
import { SkinModelResources } from './SkinModelBuilder';
import {
  mapSkinIntersectionToResult,
  pickSkinAtClientPoint,
  registerSkinMeshPickMetadata,
  textureTexelFromUv,
} from './SkinPicking';
import { SkinTexture } from './SkinTexture';
import {
  getSkinTriangleMetadata,
  mapFaceDefinitionToThreeQuad,
} from './ThreeUvMapper';

function readPixel(
  pixels: Uint8ClampedArray,
  x: number,
  y: number,
): readonly number[] {
  const offset = (y * 64 + x) * 4;
  return Array.from(pixels.slice(offset, offset + 4));
}

function intersectionFor(
  mesh: Mesh,
  faceIndex: number,
  u: number,
  v: number,
): Intersection {
  return {
    distance: 1,
    point: new Vector3(),
    object: mesh,
    faceIndex,
    uv: new Vector2(u, v),
  } as Intersection;
}

function meshFor(
  resources: SkinModelResources,
  bodyPart: BodyPart,
  layer: SkinLayer,
): Mesh {
  return resources.root.getObjectByName(`${bodyPart}:${layer}`) as Mesh;
}

function sourceCornerUv(
  model: SkinModel,
  bodyPart: BodyPart,
  layer: SkinLayer,
  face: CubeFace,
): readonly { readonly u: number; readonly v: number }[] {
  const region = getFaceDefinition({ model, bodyPart, layer, face }).region;
  return [
    { u: (region.x + 0.5) / 64, v: (region.y + 0.5) / 64 },
    {
      u: (region.x + region.width - 0.5) / 64,
      v: (region.y + 0.5) / 64,
    },
    {
      u: (region.x + region.width - 0.5) / 64,
      v: (region.y + region.height - 0.5) / 64,
    },
    {
      u: (region.x + 0.5) / 64,
      v: (region.y + region.height - 0.5) / 64,
    },
  ];
}

describe('3D skin picking', () => {
  it('converts normalized UV to exact half-open texture texels', () => {
    expect(textureTexelFromUv({ u: 0, v: 0 })).toEqual({ x: 0, y: 0 });
    expect(textureTexelFromUv({ u: 15.999 / 64, v: 31.999 / 64 })).toEqual({
      x: 15,
      y: 31,
    });
    expect(textureTexelFromUv({ u: 16 / 64, v: 32 / 64 })).toEqual({
      x: 16,
      y: 32,
    });
    expect(textureTexelFromUv({ u: 1, v: 1 })).toEqual({ x: 63, y: 63 });
    expect(textureTexelFromUv({ u: -1, v: 2 })).toEqual({ x: 0, y: 63 });
  });

  it('maps every face, layer, model, and diagnostic corner through explicit triangle metadata', () => {
    for (const model of SKIN_MODELS) {
      const fixture = createDiagnosticSkinFixture(model);
      const fixtureDocument = SkinDocument.create({
        id: `picking-fixture-${model}`,
        width: 64,
        height: 64,
        pixels: fixture.pixels,
        model,
      });
      const texture = new SkinTexture(fixtureDocument);
      const resources = new SkinModelResources(model, texture.texture);

      for (const bodyPart of BODY_PARTS) {
        for (const layer of SKIN_LAYERS) {
          const mesh = meshFor(resources, bodyPart, layer);
          for (const face of CUBE_FACES) {
            const faceIndex = CUBE_FACES.indexOf(face) * 2;
            expect(getSkinTriangleMetadata(mesh.geometry, faceIndex)).toEqual({
              face,
              triangle: 0,
            });

            const definition = getFaceDefinition({
              model,
              bodyPart,
              layer,
              face,
            });
            const dimensions = getBodyPartGeometry({
              model,
              bodyPart,
            }).dimensions;
            const quad = mapFaceDefinitionToThreeQuad(
              face,
              dimensions,
              definition,
            );
            expect(quad.textureCoordinates).toHaveLength(4);

            for (const [cornerIndex, uv] of sourceCornerUv(
              model,
              bodyPart,
              layer,
              face,
            ).entries()) {
              const result = mapSkinIntersectionToResult(
                intersectionFor(mesh, faceIndex, uv.u, uv.v),
              );
              const region = definition.region;
              const corner = [
                { x: region.x, y: region.y },
                { x: region.x + region.width - 1, y: region.y },
                {
                  x: region.x + region.width - 1,
                  y: region.y + region.height - 1,
                },
                { x: region.x, y: region.y + region.height - 1 },
              ][cornerIndex]!;

              expect(
                result,
                `${model}/${bodyPart}/${layer}/${face}`,
              ).toMatchObject({
                model,
                bodyPart,
                layer,
                face,
                x: corner.x,
                y: corner.y,
              });

              expect(
                readPixel(fixture.pixels, result!.x, result!.y),
                `${model}/${bodyPart}/${layer}/${face}/${cornerIndex}`,
              ).toEqual(
                DIAGNOSTIC_CORNER_COLORS[
                  ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'][
                    cornerIndex
                  ] as keyof typeof DIAGNOSTIC_CORNER_COLORS
                ],
              );
            }
          }
        }
      }

      resources.dispose();
      texture.dispose();
    }
  });

  it('raycasts in logical CSS coordinates, respects outer visibility, and misses outside the preview', () => {
    const document = SkinDocument.createBlank({ id: 'picking' });
    const texture = new SkinTexture(document);
    const resources = new SkinModelResources('classic', texture.texture);
    const camera = new PerspectiveCamera(32, 1, 0.1, 200);
    camera.position.set(0, 16, 80);
    camera.lookAt(0, 16, 0);
    camera.updateProjectionMatrix();

    const canvas = globalThis.document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({
        left: 10,
        top: 20,
        right: 210,
        bottom: 220,
        width: 200,
        height: 200,
      }) as DOMRect;
    const raycaster = new Raycaster();
    const context = {
      canvas,
      camera,
      meshes: resources.getPickableMeshes(),
    } as const;

    const outerHit = pickSkinAtClientPoint(context, 110, 120, raycaster);
    expect(outerHit).toMatchObject({
      bodyPart: 'torso',
      layer: 'outer',
      face: 'front',
    });

    resources.setOuterVisible(false);
    const baseHit = pickSkinAtClientPoint(context, 110, 120, raycaster);
    expect(baseHit).toMatchObject({
      bodyPart: 'torso',
      layer: 'base',
      face: 'front',
    });
    resources.setBodyPartVisible('torso', false);
    expect(pickSkinAtClientPoint(context, 110, 120, raycaster)).toBeUndefined();
    resources.setBodyPartVisible('torso', true);
    expect(pickSkinAtClientPoint(context, 9, 120, raycaster)).toBeUndefined();
    expect(pickSkinAtClientPoint(context, 110, 220, raycaster)).toBeUndefined();

    const revision = document.revision;
    expect(document.isDirty).toBe(false);
    expect(revision).toBe(0);
    resources.dispose();
    texture.dispose();
  });

  it('keeps the same hit for the same logical pointer after a DPR change', () => {
    const document = SkinDocument.createBlank({ id: 'picking-dpr' });
    const texture = new SkinTexture(document);
    const resources = new SkinModelResources('slim', texture.texture);
    const camera = new PerspectiveCamera(32, 1, 0.1, 200);
    camera.position.set(0, 16, 80);
    camera.lookAt(0, 16, 0);
    camera.updateProjectionMatrix();
    const canvas = globalThis.document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 240,
        bottom: 240,
        width: 240,
        height: 240,
      }) as DOMRect;
    const context = {
      canvas,
      camera,
      meshes: resources.getPickableMeshes(),
    } as const;
    const raycaster = new Raycaster();

    const logicalHit = pickSkinAtClientPoint(context, 120, 120, raycaster);
    const highDprLogicalHit = pickSkinAtClientPoint(
      context,
      120,
      120,
      raycaster,
    );
    expect(highDprLogicalHit).toEqual(logicalHit);
    resources.dispose();
    texture.dispose();
  });

  it('ignores unregistered meshes and never mutates the canonical document', () => {
    const document = SkinDocument.createBlank({ id: 'picking-no-mutation' });
    const texture = new SkinTexture(document);
    const resources = new SkinModelResources('classic', texture.texture);
    const unrelatedMesh = new Mesh();
    registerSkinMeshPickMetadata(unrelatedMesh, {
      model: 'classic',
      bodyPart: 'head',
      layer: 'base',
    });

    const camera = new PerspectiveCamera();
    const canvas = globalThis.document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 10,
        bottom: 10,
        width: 10,
        height: 10,
      }) as DOMRect;
    const before = document.copyPixelData();
    const result = pickSkinAtClientPoint(
      { canvas, camera, meshes: [unrelatedMesh] },
      5,
      5,
      new Raycaster(),
    );

    expect(result).toBeUndefined();
    expect(document.revision).toBe(0);
    expect(document.isDirty).toBe(false);
    expect(document.copyPixelData()).toEqual(before);
    resources.dispose();
    texture.dispose();
  });
});
