import {
  Raycaster,
  Vector2,
  type Camera,
  type Intersection,
  type Mesh,
  type Object3D,
} from 'three';

import {
  SKIN_TEXTURE_HEIGHT,
  SKIN_TEXTURE_WIDTH,
  type BodyPart,
  type CubeFace,
  type SkinLayer,
  type SkinModel,
} from '../../engine/minecraft-skin-spec';
import {
  getSkinCuboidGeometryMetadata,
  getSkinTriangleMetadata,
} from './ThreeUvMapper';

export interface SkinPickUv {
  readonly u: number;
  readonly v: number;
}

export interface SkinPickPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * A renderer-independent description of the source texel under a 3D hit.
 * Three.js objects and mutable vectors are intentionally not exposed here.
 */
export interface SkinPickResult {
  readonly model: SkinModel;
  readonly bodyPart: BodyPart;
  readonly layer: SkinLayer;
  readonly face: CubeFace;
  readonly x: number;
  readonly y: number;
  readonly uv: SkinPickUv;
  readonly point: SkinPickPoint;
  readonly distance: number;
  readonly triangle: 0 | 1;
}

export interface SkinMeshPickMetadata {
  readonly model: SkinModel;
  readonly bodyPart: BodyPart;
  readonly layer: SkinLayer;
}

const MESH_METADATA = new WeakMap<Mesh, SkinMeshPickMetadata>();

export function registerSkinMeshPickMetadata(
  mesh: Mesh,
  metadata: SkinMeshPickMetadata,
): void {
  MESH_METADATA.set(mesh, metadata);
}

export function getSkinMeshPickMetadata(
  mesh: Mesh,
): SkinMeshPickMetadata | undefined {
  return MESH_METADATA.get(mesh);
}

function clampTexel(value: number, limit: number): number {
  return Math.min(limit - 1, Math.max(0, Math.floor(value)));
}

/** Converts normalized UV into a texel using the canonical half-open bounds. */
export function textureTexelFromUv(
  uv: SkinPickUv,
): { readonly x: number; readonly y: number } | undefined {
  if (!Number.isFinite(uv.u) || !Number.isFinite(uv.v)) return undefined;

  return {
    x: clampTexel(uv.u * SKIN_TEXTURE_WIDTH, SKIN_TEXTURE_WIDTH),
    y: clampTexel(uv.v * SKIN_TEXTURE_HEIGHT, SKIN_TEXTURE_HEIGHT),
  };
}

export function mapSkinIntersectionToResult(
  intersection: Intersection<Object3D>,
): SkinPickResult | undefined {
  const mesh = intersection.object as Mesh;
  if (!mesh.isMesh) return undefined;

  const meshMetadata = getSkinMeshPickMetadata(mesh);
  if (meshMetadata === undefined || !mesh.visible) return undefined;

  const faceIndex = intersection.faceIndex;
  const uv = intersection.uv;
  if (faceIndex === undefined || faceIndex === null || uv === undefined) {
    return undefined;
  }

  const geometryMetadata = getSkinCuboidGeometryMetadata(mesh.geometry);
  const triangleMetadata = getSkinTriangleMetadata(mesh.geometry, faceIndex);
  if (
    geometryMetadata === undefined ||
    triangleMetadata === undefined ||
    geometryMetadata.model !== meshMetadata.model ||
    geometryMetadata.bodyPart !== meshMetadata.bodyPart ||
    geometryMetadata.layer !== meshMetadata.layer
  ) {
    return undefined;
  }

  const pickUv = { u: uv.x, v: uv.y };
  const texel = textureTexelFromUv(pickUv);
  if (texel === undefined) return undefined;

  return {
    model: meshMetadata.model,
    bodyPart: meshMetadata.bodyPart,
    layer: meshMetadata.layer,
    face: triangleMetadata.face,
    x: texel.x,
    y: texel.y,
    uv: pickUv,
    point: {
      x: intersection.point.x,
      y: intersection.point.y,
      z: intersection.point.z,
    },
    distance: intersection.distance,
    triangle: triangleMetadata.triangle,
  };
}

export interface SkinPickingContext {
  readonly canvas: HTMLCanvasElement;
  readonly camera: Camera;
  readonly meshes: readonly Mesh[];
}

function pointerToNdc(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { readonly x: number; readonly y: number } | undefined {
  const bounds = canvas.getBoundingClientRect();
  const left = Number.isFinite(bounds.left) ? bounds.left : 0;
  const top = Number.isFinite(bounds.top) ? bounds.top : 0;
  const right = Number.isFinite(bounds.right)
    ? bounds.right
    : left + bounds.width;
  const bottom = Number.isFinite(bounds.bottom)
    ? bounds.bottom
    : top + bounds.height;
  if (
    bounds.width <= 0 ||
    bounds.height <= 0 ||
    clientX < left ||
    clientX >= right ||
    clientY < top ||
    clientY >= bottom
  ) {
    return undefined;
  }

  return {
    x: ((clientX - left) / bounds.width) * 2 - 1,
    y: -((clientY - top) / bounds.height) * 2 + 1,
  };
}

/**
 * Raycasts only the registered skin meshes. CSS coordinates are converted to
 * NDC using the logical canvas bounds, so backing-store DPR does not affect
 * picking.
 */
export function pickSkinAtClientPoint(
  context: SkinPickingContext,
  clientX: number,
  clientY: number,
  raycaster: Raycaster,
): SkinPickResult | undefined {
  const ndc = pointerToNdc(context.canvas, clientX, clientY);
  if (ndc === undefined) return undefined;

  for (const mesh of context.meshes) {
    mesh.updateWorldMatrix(true, false);
  }
  context.camera.updateMatrixWorld();
  raycaster.setFromCamera(new Vector2(ndc.x, ndc.y), context.camera);

  const intersections = raycaster.intersectObjects(
    [...context.meshes] as Object3D[],
    false,
  );
  for (const intersection of intersections) {
    const result = mapSkinIntersectionToResult(intersection);
    if (result !== undefined) return result;
  }

  return undefined;
}
