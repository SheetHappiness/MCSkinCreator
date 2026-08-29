import {
  TRANSPARENT_RGBA,
  type RgbaColor,
  type SkinDocument,
} from '../document';
import type {
  DocumentEditOperation,
  DocumentEditTransaction,
  DocumentHistory,
} from '../history';
import type { TextureCoordinate } from '../viewport';

export type EditorTool =
  | 'pencil'
  | 'eraser'
  | 'fill'
  | 'eyedropper'
  | 'lighten'
  | 'darken'
  | 'noise'
  | 'stamp';

export const ERASER_COLOR = TRANSPARENT_RGBA;

function assertIntegerCoordinate(point: TextureCoordinate): void {
  if (!Number.isInteger(point.x) || !Number.isInteger(point.y)) {
    throw new RangeError('Texture coordinates must be integers.');
  }
}

export function colorsEqual(left: RgbaColor, right: RgbaColor): boolean {
  return (
    left.r === right.r &&
    left.g === right.g &&
    left.b === right.b &&
    left.a === right.a
  );
}

/**
 * Deterministic, endpoint-inclusive integer Bresenham traversal.
 *
 * Endpoints are canonicalized before traversal so reversing the input returns
 * the exact reverse sequence, including tie cases.
 */
export function rasterizeLine(
  start: TextureCoordinate,
  end: TextureCoordinate,
): readonly TextureCoordinate[] {
  assertIntegerCoordinate(start);
  assertIntegerCoordinate(end);

  const reversed = start.x > end.x || (start.x === end.x && start.y > end.y);
  const from = reversed ? end : start;
  const to = reversed ? start : end;
  const points: TextureCoordinate[] = [];
  let x = from.x;
  let y = from.y;
  const deltaX = Math.abs(to.x - from.x);
  const stepX = from.x < to.x ? 1 : -1;
  const deltaY = -Math.abs(to.y - from.y);
  const stepY = from.y < to.y ? 1 : -1;
  let error = deltaX + deltaY;

  while (true) {
    points.push({ x, y });
    if (x === to.x && y === to.y) {
      break;
    }

    const doubledError = error * 2;
    if (doubledError >= deltaY) {
      error += deltaY;
      x += stepX;
    }
    if (doubledError <= deltaX) {
      error += deltaX;
      y += stepY;
    }
  }

  return reversed ? points.reverse() : points;
}

/** One live, 1-texel stroke backed by exactly one M4 history transaction. */
export class PixelStroke {
  private previous: TextureCoordinate | undefined;

  constructor(
    private readonly transaction: DocumentEditTransaction,
    private readonly color: RgbaColor,
    start: TextureCoordinate,
  ) {
    this.extend(start);
  }

  get isActive(): boolean {
    return this.transaction.isActive;
  }

  /**
   * Undefined represents the pointer being outside the texture. Re-entry
   * starts a fresh in-bounds segment instead of painting across outside space.
   */
  extend(point: TextureCoordinate | undefined): void {
    if (!this.transaction.isActive) {
      this.previous = undefined;
      return;
    }

    if (point === undefined) {
      this.previous = undefined;
      return;
    }

    const points =
      this.previous === undefined
        ? [point]
        : rasterizeLine(this.previous, point);
    for (const coordinate of points) {
      this.transaction.writePixel(coordinate.x, coordinate.y, this.color);
    }
    this.previous = point;
  }

  commit(): DocumentEditOperation | undefined {
    if (!this.transaction.isActive) {
      return undefined;
    }
    return this.transaction.commit();
  }

  cancel(): void {
    if (this.transaction.isActive) {
      this.transaction.cancel();
    }
    this.previous = undefined;
  }
}

export function beginPixelStroke(
  history: DocumentHistory,
  color: RgbaColor,
  start: TextureCoordinate,
  label = 'Pencil Stroke',
): PixelStroke {
  return new PixelStroke(history.beginTransaction(label), color, start);
}

/** Finds the exact 4-connected region containing seed without mutating it. */
export function findFloodFillRegion(
  document: SkinDocument,
  seed: TextureCoordinate,
): readonly TextureCoordinate[] {
  const target = document.readPixel(seed.x, seed.y);
  const visited = new Uint8Array(document.width * document.height);
  const stack: TextureCoordinate[] = [seed];
  const region: TextureCoordinate[] = [];

  while (stack.length > 0) {
    const point = stack.pop()!;
    const index = point.y * document.width + point.x;
    if (visited[index] === 1) {
      continue;
    }
    visited[index] = 1;

    if (!colorsEqual(document.readPixel(point.x, point.y), target)) {
      continue;
    }

    region.push(point);
    if (point.x > 0) stack.push({ x: point.x - 1, y: point.y });
    if (point.x + 1 < document.width)
      stack.push({ x: point.x + 1, y: point.y });
    if (point.y > 0) stack.push({ x: point.x, y: point.y - 1 });
    if (point.y + 1 < document.height)
      stack.push({ x: point.x, y: point.y + 1 });
  }

  return region;
}

/** Applies one exact, contiguous fill as one atomic history operation. */
export function fillAt(
  document: SkinDocument,
  history: DocumentHistory,
  seed: TextureCoordinate,
  replacement: RgbaColor,
  label = 'Fill',
): DocumentEditOperation | undefined {
  if (colorsEqual(document.readPixel(seed.x, seed.y), replacement)) {
    return undefined;
  }

  const region = findFloodFillRegion(document, seed);
  const transaction = history.beginTransaction(label);
  try {
    for (const point of region) {
      transaction.writePixel(point.x, point.y, replacement);
    }
    return transaction.commit();
  } catch (error) {
    if (transaction.isActive) {
      transaction.cancel();
    }
    throw error;
  }
}

export function samplePixel(
  document: SkinDocument,
  point: TextureCoordinate,
): RgbaColor {
  return document.readPixel(point.x, point.y);
}
