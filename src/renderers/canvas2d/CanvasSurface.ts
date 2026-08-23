import type { Size } from '../../engine/viewport';

export interface CanvasSurface {
  readonly logicalSize: Size;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly pixelRatio: number;
}

export interface CanvasBackingStoreSize {
  readonly width: number;
  readonly height: number;
}

export function getCanvasBackingStoreSize(
  logicalSize: Size,
  pixelRatio: number,
): CanvasBackingStoreSize {
  if (
    !Number.isFinite(logicalSize.width) ||
    !Number.isFinite(logicalSize.height) ||
    logicalSize.width <= 0 ||
    logicalSize.height <= 0
  ) {
    throw new RangeError('Canvas logical dimensions must be positive.');
  }

  if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) {
    throw new RangeError('Canvas pixel ratio must be positive.');
  }

  return {
    width: Math.max(1, Math.round(logicalSize.width * pixelRatio)),
    height: Math.max(1, Math.round(logicalSize.height * pixelRatio)),
  };
}

export function configureCanvasSurface(
  canvas: HTMLCanvasElement,
  logicalSize: Size,
  pixelRatio: number,
): CanvasSurface {
  const backingStore = getCanvasBackingStoreSize(logicalSize, pixelRatio);

  if (canvas.width !== backingStore.width) {
    canvas.width = backingStore.width;
  }
  if (canvas.height !== backingStore.height) {
    canvas.height = backingStore.height;
  }

  return {
    logicalSize,
    scaleX: backingStore.width / logicalSize.width,
    scaleY: backingStore.height / logicalSize.height,
    pixelRatio,
  };
}

/** Aligns a one-device-pixel stroke to the physical backing-store grid. */
export function alignGridLine(position: number, pixelRatio: number): number {
  return (Math.round(position * pixelRatio) + 0.5) / pixelRatio;
}
