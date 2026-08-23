import type { SkinDocument } from '../../engine/document';
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
const CHECKER_LIGHT = '#9b9da1';
const CHECKER_DARK = '#85878b';
const GRID_COLOR = 'rgba(12, 13, 15, 0.34)';

export interface SkinCanvasRenderOptions {
  readonly showGrid: boolean;
  readonly pixelRatio: number;
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

  if (shouldRenderPixelGrid(options.showGrid, viewport.zoom)) {
    drawPixelGrid(context, viewport, skinDocument, surface);
  }
}
