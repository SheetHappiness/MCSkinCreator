import type { SkinDocument } from '../../engine/document';
import {
  BODY_PARTS,
  CUBE_FACES,
  getBodyPartRegions,
  type SkinLayer,
  type SkinModel,
  type TextureLayerFilter,
  type TextureRegion,
} from '../../engine/minecraft-skin-spec';
import {
  clipPixelRegion,
  type PixelRegion,
  type SelectionState,
} from '../../engine/selection';
import {
  PIXEL_GRID_ZOOM_THRESHOLD,
  getGridLinePositions,
  type Size,
  type ViewportState,
} from '../../engine/viewport';
import {
  alignGridLine,
  configureCanvasSurface,
  type CanvasSurface,
} from './CanvasSurface';
import { createSkinBitmapData, writeSkinBitmap } from './SkinBitmap';

const CHECKER_SIZE = 8;
const CHECKER_LIGHT = '#85878d';
const CHECKER_DARK = '#777a80';
const GRID_COLOR = 'rgba(10, 12, 15, 0.26)';
const TEXTURE_BOUNDARY_COLOR = 'rgba(225, 229, 235, 0.32)';
const UV_BASE_BOUNDARY_COLOR = 'rgba(221, 230, 240, 0.42)';
const UV_OUTER_BOUNDARY_COLOR = 'rgba(184, 202, 221, 0.46)';

export interface SkinCanvasRenderOptions {
  readonly showGrid: boolean;
  readonly pixelRatio: number;
  readonly selection?: SelectionState;
  /** The UV overlay is view-only and rendered into this same canvas. */
  readonly uvOverlay?: {
    readonly layer: TextureLayerFilter;
  };
}

function drawTransparencySurface(
  context: CanvasRenderingContext2D,
  viewport: ViewportState,
  textureSize: Size,
): void {
  const width = textureSize.width * viewport.zoom;
  const height = textureSize.height * viewport.zoom;

  context.save();
  context.beginPath();
  context.rect(viewport.offsetX, viewport.offsetY, width, height);
  context.clip();

  for (let y = 0; y < height; y += CHECKER_SIZE) {
    for (let x = 0; x < width; x += CHECKER_SIZE) {
      const column = Math.floor(x / CHECKER_SIZE);
      const row = Math.floor(y / CHECKER_SIZE);
      context.fillStyle =
        (column + row) % 2 === 0 ? CHECKER_LIGHT : CHECKER_DARK;
      context.fillRect(
        viewport.offsetX + x,
        viewport.offsetY + y,
        CHECKER_SIZE,
        CHECKER_SIZE,
      );
    }
  }

  context.restore();
}

function drawTransparencyRegion(
  context: CanvasRenderingContext2D,
  viewport: ViewportState,
  textureSize: Size,
  region: PixelRegion,
): void {
  const clipped = clipPixelRegion(region, textureSize);
  if (clipped === undefined) return;

  const left = viewport.offsetX + clipped.x * viewport.zoom;
  const top = viewport.offsetY + clipped.y * viewport.zoom;
  const right = viewport.offsetX + (clipped.x + clipped.width) * viewport.zoom;
  const bottom =
    viewport.offsetY + (clipped.y + clipped.height) * viewport.zoom;
  const firstColumn = Math.floor((left - viewport.offsetX) / CHECKER_SIZE);
  const firstRow = Math.floor((top - viewport.offsetY) / CHECKER_SIZE);
  const startX = viewport.offsetX + firstColumn * CHECKER_SIZE;
  const startY = viewport.offsetY + firstRow * CHECKER_SIZE;

  context.save();
  context.beginPath();
  context.rect(left, top, right - left, bottom - top);
  context.clip();
  for (
    let y = startY, row = firstRow;
    y < bottom;
    y += CHECKER_SIZE, row += 1
  ) {
    for (
      let x = startX, column = firstColumn;
      x < right;
      x += CHECKER_SIZE, column += 1
    ) {
      context.fillStyle =
        (column + row) % 2 === 0 ? CHECKER_LIGHT : CHECKER_DARK;
      context.fillRect(x, y, CHECKER_SIZE, CHECKER_SIZE);
    }
  }
  context.restore();
}

function drawFloatingSelection(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  skinDocument: SkinDocument,
  viewport: ViewportState,
  floating: NonNullable<SelectionState['floating']>,
): void {
  if (floating.kind === 'move' && floating.sourceRect !== undefined) {
    drawTransparencyRegion(
      context,
      viewport,
      skinDocument,
      floating.sourceRect,
    );
  }
  drawTransparencyRegion(context, viewport, skinDocument, floating.rect);

  const visible = clipPixelRegion(floating.rect, skinDocument);
  if (visible === undefined) return;

  const sourceCanvas = canvas.ownerDocument.createElement('canvas');
  sourceCanvas.width = floating.rect.width;
  sourceCanvas.height = floating.rect.height;
  const sourceContext = sourceCanvas.getContext('2d', { alpha: true });
  if (sourceContext === null) {
    throw new Error('Canvas 2D floating-selection rendering is unavailable.');
  }
  sourceContext.imageSmoothingEnabled = false;
  const imageData = sourceContext.createImageData(
    floating.rect.width,
    floating.rect.height,
  );
  imageData.data.set(floating.data);
  sourceContext.putImageData(imageData, 0, 0);

  const sourceX = visible.x - floating.rect.x;
  const sourceY = visible.y - floating.rect.y;
  const destinationX = viewport.offsetX + visible.x * viewport.zoom;
  const destinationY = viewport.offsetY + visible.y * viewport.zoom;
  context.save();
  context.beginPath();
  context.rect(
    viewport.offsetX,
    viewport.offsetY,
    skinDocument.width * viewport.zoom,
    skinDocument.height * viewport.zoom,
  );
  context.clip();
  context.drawImage(
    sourceCanvas,
    sourceX,
    sourceY,
    visible.width,
    visible.height,
    destinationX,
    destinationY,
    visible.width * viewport.zoom,
    visible.height * viewport.zoom,
  );
  context.restore();
}

function drawSelectionOverlay(
  context: CanvasRenderingContext2D,
  viewport: ViewportState,
  skinDocument: SkinDocument,
  surface: CanvasSurface,
  selection: SelectionState | undefined,
): void {
  if (selection === undefined) return;
  const region =
    selection.floating?.rect ?? selection.draft ?? selection.selection;
  if (region === undefined) return;
  const visible = clipPixelRegion(region, skinDocument);
  if (visible === undefined) return;

  const left = viewport.offsetX + visible.x * viewport.zoom;
  const top = viewport.offsetY + visible.y * viewport.zoom;
  const width = visible.width * viewport.zoom;
  const height = visible.height * viewport.zoom;
  const lineWidth = 1 / surface.pixelRatio;
  const inset = lineWidth / 2;

  context.save();
  context.beginPath();
  context.rect(
    left + inset,
    top + inset,
    Math.max(0, width - lineWidth),
    Math.max(0, height - lineWidth),
  );
  context.lineWidth = lineWidth;
  context.setLineDash([4, 4]);
  context.lineDashOffset = 0;
  context.strokeStyle = '#111419';
  context.stroke();
  context.lineDashOffset = 4;
  context.strokeStyle = '#f2f5f8';
  context.stroke();
  context.setLineDash([]);
  context.restore();
}

export function shouldRenderPixelGrid(
  showGrid: boolean,
  zoom: number,
): boolean {
  return showGrid && zoom >= PIXEL_GRID_ZOOM_THRESHOLD;
}

function drawPixelGrid(
  context: CanvasRenderingContext2D,
  viewport: ViewportState,
  textureSize: Size,
  surface: CanvasSurface,
): void {
  const positions = getGridLinePositions(viewport, textureSize);
  const left = viewport.offsetX;
  const top = viewport.offsetY;
  const right = left + textureSize.width * viewport.zoom;
  const bottom = top + textureSize.height * viewport.zoom;

  context.save();
  context.strokeStyle = GRID_COLOR;
  context.lineWidth = 1 / surface.pixelRatio;
  context.beginPath();

  for (const x of positions.x) {
    const alignedX = alignGridLine(x, surface.pixelRatio);
    context.moveTo(alignedX, top);
    context.lineTo(alignedX, bottom);
  }

  for (const y of positions.y) {
    const alignedY = alignGridLine(y, surface.pixelRatio);
    context.moveTo(left, alignedY);
    context.lineTo(right, alignedY);
  }

  context.stroke();
  context.restore();
}

function drawTextureBoundary(
  context: CanvasRenderingContext2D,
  viewport: ViewportState,
  textureSize: Size,
  surface: CanvasSurface,
): void {
  const left = alignGridLine(viewport.offsetX, surface.pixelRatio);
  const top = alignGridLine(viewport.offsetY, surface.pixelRatio);
  const right = alignGridLine(
    viewport.offsetX + textureSize.width * viewport.zoom,
    surface.pixelRatio,
  );
  const bottom = alignGridLine(
    viewport.offsetY + textureSize.height * viewport.zoom,
    surface.pixelRatio,
  );

  context.save();
  context.strokeStyle = TEXTURE_BOUNDARY_COLOR;
  context.lineWidth = 1 / surface.pixelRatio;
  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(right, top);
  context.lineTo(right, bottom);
  context.lineTo(left, bottom);
  context.lineTo(left, top);
  context.stroke();
  context.restore();
}

function alignUvBoundary(position: number, scale: number): number {
  return (Math.round(position * scale) + 0.5) / scale;
}

function drawUvRegionPath(
  context: CanvasRenderingContext2D,
  viewport: ViewportState,
  region: TextureRegion,
  surface: CanvasSurface,
): void {
  const left = alignUvBoundary(
    viewport.offsetX + region.x * viewport.zoom,
    surface.scaleX,
  );
  const top = alignUvBoundary(
    viewport.offsetY + region.y * viewport.zoom,
    surface.scaleY,
  );
  const right = alignUvBoundary(
    viewport.offsetX + (region.x + region.width) * viewport.zoom,
    surface.scaleX,
  );
  const bottom = alignUvBoundary(
    viewport.offsetY + (region.y + region.height) * viewport.zoom,
    surface.scaleY,
  );

  context.moveTo(left, top);
  context.lineTo(right, top);
  context.lineTo(right, bottom);
  context.lineTo(left, bottom);
  context.lineTo(left, top);
}

function layersForOverlay(layer: TextureLayerFilter): readonly SkinLayer[] {
  return layer === 'both' ? ['base', 'outer'] : [layer];
}

/** Draws canonical face boundaries without creating a pointer-intercepting DOM layer. */
function drawUvBoundaryOverlay(
  context: CanvasRenderingContext2D,
  viewport: ViewportState,
  model: SkinModel,
  layer: TextureLayerFilter,
  surface: CanvasSurface,
): void {
  context.save();
  context.lineWidth = 1 / surface.pixelRatio;

  for (const currentLayer of layersForOverlay(layer)) {
    context.strokeStyle =
      currentLayer === 'base'
        ? UV_BASE_BOUNDARY_COLOR
        : UV_OUTER_BOUNDARY_COLOR;
    context.setLineDash(currentLayer === 'outer' ? [4, 3] : []);
    context.beginPath();

    for (const bodyPart of BODY_PARTS) {
      const definitions = getBodyPartRegions({
        model,
        bodyPart,
        layer: currentLayer,
      });
      for (const face of CUBE_FACES) {
        drawUvRegionPath(context, viewport, definitions[face].region, surface);
      }
    }

    context.stroke();
  }

  context.setLineDash([]);
  context.restore();
}

export function renderSkinCanvas(
  canvas: HTMLCanvasElement,
  skinDocument: SkinDocument,
  viewport: ViewportState,
  logicalSize: Size,
  options: SkinCanvasRenderOptions,
): void {
  const surface = configureCanvasSurface(
    canvas,
    logicalSize,
    options.pixelRatio,
  );
  const context = canvas.getContext('2d', { alpha: true });

  if (context === null) {
    throw new Error('Canvas 2D rendering is unavailable.');
  }

  context.setTransform(surface.scaleX, 0, 0, surface.scaleY, 0, 0);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, logicalSize.width, logicalSize.height);
  drawTransparencySurface(context, viewport, skinDocument);

  const sourceCanvas = canvas.ownerDocument.createElement('canvas');
  sourceCanvas.width = skinDocument.width;
  sourceCanvas.height = skinDocument.height;
  const sourceContext = sourceCanvas.getContext('2d', { alpha: true });

  if (sourceContext === null) {
    throw new Error('Canvas 2D source rendering is unavailable.');
  }

  sourceContext.imageSmoothingEnabled = false;
  writeSkinBitmap(sourceContext, createSkinBitmapData(skinDocument));
  context.drawImage(
    sourceCanvas,
    0,
    0,
    skinDocument.width,
    skinDocument.height,
    viewport.offsetX,
    viewport.offsetY,
    skinDocument.width * viewport.zoom,
    skinDocument.height * viewport.zoom,
  );

  if (options.selection?.floating !== undefined) {
    drawFloatingSelection(
      context,
      canvas,
      skinDocument,
      viewport,
      options.selection.floating,
    );
  }

  drawTextureBoundary(context, viewport, skinDocument, surface);

  if (options.uvOverlay !== undefined) {
    drawUvBoundaryOverlay(
      context,
      viewport,
      skinDocument.model,
      options.uvOverlay.layer,
      surface,
    );
  }

  if (shouldRenderPixelGrid(options.showGrid, viewport.zoom)) {
    drawPixelGrid(context, viewport, skinDocument, surface);
  }
  drawSelectionOverlay(
    context,
    viewport,
    skinDocument,
    surface,
    options.selection,
  );
}
