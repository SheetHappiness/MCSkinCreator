export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface TextureCoordinate {
  readonly x: number;
  readonly y: number;
}

export interface ViewportState {
  /** Logical CSS pixels occupied by one source texture pixel. */
  readonly zoom: number;
  /** Logical CSS position of the texture's top-left corner. */
  readonly offsetX: number;
  readonly offsetY: number;
}

export const MIN_VIEWPORT_ZOOM = 0.5;
export const MAX_VIEWPORT_ZOOM = 64;
export const VIEWPORT_FIT_PADDING = 32;
export const VIEWPORT_ZOOM_BUTTON_FACTOR = 1.25;
export const PIXEL_GRID_ZOOM_THRESHOLD = 8;

function assertPositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive finite number.`);
  }
}

export function clampViewportZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    throw new RangeError('Viewport zoom must be finite.');
  }

  return Math.min(MAX_VIEWPORT_ZOOM, Math.max(MIN_VIEWPORT_ZOOM, zoom));
}

/**
 * Maps a logical screen position to a source pixel.
 *
 * Each source pixel owns the half-open interval [edge, next edge), so floor is
 * intentional: the left/top edge belongs to the pixel and the right/bottom
 * image edge is outside the texture. This removes boundary ambiguity.
 */
export function screenToTexture(
  point: Point,
  viewport: ViewportState,
  textureSize: Size,
): TextureCoordinate | undefined {
  assertPositive(viewport.zoom, 'Viewport zoom');
  assertPositive(textureSize.width, 'Texture width');
  assertPositive(textureSize.height, 'Texture height');

  const localX = point.x - viewport.offsetX;
  const localY = point.y - viewport.offsetY;
  const renderedWidth = textureSize.width * viewport.zoom;
  const renderedHeight = textureSize.height * viewport.zoom;

  if (
    localX < 0 ||
    localY < 0 ||
    localX >= renderedWidth ||
    localY >= renderedHeight
  ) {
    return undefined;
  }

  return {
    x: Math.floor(localX / viewport.zoom),
    y: Math.floor(localY / viewport.zoom),
  };
}

/** Returns the logical screen position of a texture coordinate's top-left edge. */
export function textureToScreen(point: Point, viewport: ViewportState): Point {
  assertPositive(viewport.zoom, 'Viewport zoom');

  return {
    x: viewport.offsetX + point.x * viewport.zoom,
    y: viewport.offsetY + point.y * viewport.zoom,
  };
}

export function zoomViewportAroundPoint(
  viewport: ViewportState,
  requestedZoom: number,
  anchor: Point,
): ViewportState {
  assertPositive(viewport.zoom, 'Viewport zoom');

  const zoom = clampViewportZoom(requestedZoom);
  const textureX = (anchor.x - viewport.offsetX) / viewport.zoom;
  const textureY = (anchor.y - viewport.offsetY) / viewport.zoom;

  return {
    zoom,
    offsetX: anchor.x - textureX * zoom,
    offsetY: anchor.y - textureY * zoom,
  };
}

export function panViewport(
  viewport: ViewportState,
  delta: Point,
): ViewportState {
  return {
    ...viewport,
    offsetX: viewport.offsetX + delta.x,
    offsetY: viewport.offsetY + delta.y,
  };
}

export function fitViewportToView(
  viewSize: Size,
  textureSize: Size,
  padding = VIEWPORT_FIT_PADDING,
): ViewportState {
  assertPositive(viewSize.width, 'View width');
  assertPositive(viewSize.height, 'View height');
  assertPositive(textureSize.width, 'Texture width');
  assertPositive(textureSize.height, 'Texture height');

  if (!Number.isFinite(padding) || padding < 0) {
    throw new RangeError('Viewport padding must be a non-negative number.');
  }

  const availableWidth = Math.max(1, viewSize.width - padding * 2);
  const availableHeight = Math.max(1, viewSize.height - padding * 2);
  const rawZoom = Math.min(
    availableWidth / textureSize.width,
    availableHeight / textureSize.height,
  );
  // Integer display scaling keeps fit-to-view source pixels equally sized when
  // the workspace can show every source pixel at one or more logical pixels.
  const practicalZoom = rawZoom >= 1 ? Math.floor(rawZoom) : rawZoom;
  const zoom = clampViewportZoom(practicalZoom);
  const renderedWidth = textureSize.width * zoom;
  const renderedHeight = textureSize.height * zoom;

  return {
    zoom,
    offsetX: (viewSize.width - renderedWidth) / 2,
    offsetY: (viewSize.height - renderedHeight) / 2,
  };
}

export function getGridLinePositions(
  viewport: ViewportState,
  textureSize: Size,
): { readonly x: readonly number[]; readonly y: readonly number[] } {
  assertPositive(viewport.zoom, 'Viewport zoom');
  assertPositive(textureSize.width, 'Texture width');
  assertPositive(textureSize.height, 'Texture height');

  return {
    x: Array.from(
      { length: textureSize.width + 1 },
      (_, index) => viewport.offsetX + index * viewport.zoom,
    ),
    y: Array.from(
      { length: textureSize.height + 1 },
      (_, index) => viewport.offsetY + index * viewport.zoom,
    ),
  };
}

export function clientToLogicalPoint(
  client: Point,
  bounds: Pick<DOMRect, 'left' | 'top'>,
): Point {
  return {
    x: client.x - bounds.left,
    y: client.y - bounds.top,
  };
}
