import type { HsvColor } from './colorConversions';

export interface NormalizedPoint {
  readonly x: number;
  readonly y: number;
}

/** Vertices for the HSV triangle: saturated hue, white, and black. */
export const COLOR_TRIANGLE_VERTICES = Object.freeze({
  hue: Object.freeze({ x: 0.5, y: 0.08 }),
  white: Object.freeze({ x: 0.08, y: 0.86 }),
  black: Object.freeze({ x: 0.92, y: 0.86 }),
});

const HUE_WHEEL_HANDLE_RADIUS = 0.42;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizedHue(value: number): number {
  const hue = value % 360;
  return hue < 0 ? hue + 360 : hue;
}

/** Converts a pointer position in an element to a unit-square coordinate. */
export function normalizedPointFromPointer(
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
  clientX: number,
  clientY: number,
): NormalizedPoint {
  if (bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp((clientX - bounds.left) / bounds.width, 0, 1),
    y: clamp((clientY - bounds.top) / bounds.height, 0, 1),
  };
}

/** Maps the wheel position clockwise from red at the top to a hue in degrees. */
export function hueFromNormalizedPoint(point: NormalizedPoint): number {
  const angle = (Math.atan2(point.x - 0.5, 0.5 - point.y) * 180) / Math.PI;
  return Math.round(normalizedHue(angle));
}

/** Returns the position of the hue handle on the wheel. */
export function normalizedPointFromHue(hue: number): NormalizedPoint {
  const angle = (normalizedHue(hue) * Math.PI) / 180;
  return {
    x: 0.5 + Math.sin(angle) * HUE_WHEEL_HANDLE_RADIUS,
    y: 0.5 - Math.cos(angle) * HUE_WHEEL_HANDLE_RADIUS,
  };
}

function barycentricWeights(point: NormalizedPoint) {
  const { hue, white, black } = COLOR_TRIANGLE_VERTICES;
  const denominator =
    (white.y - black.y) * (hue.x - black.x) +
    (black.x - white.x) * (hue.y - black.y);
  const hueWeight =
    ((white.y - black.y) * (point.x - black.x) +
      (black.x - white.x) * (point.y - black.y)) /
    denominator;
  const whiteWeight =
    ((black.y - hue.y) * (point.x - black.x) +
      (hue.x - black.x) * (point.y - black.y)) /
    denominator;
  const blackWeight = 1 - hueWeight - whiteWeight;
  return [hueWeight, whiteWeight, blackWeight].map((weight) =>
    clamp(weight, 0, 1),
  );
}

/** Converts a point in the triangle to HSV while preserving the current hue. */
export function hsvFromTrianglePoint(
  point: NormalizedPoint,
  hue: number,
): HsvColor {
  const [hueWeight, whiteWeight] = barycentricWeights(point);
  const value = (hueWeight ?? 0) + (whiteWeight ?? 0);
  const saturation = value === 0 ? 0 : (hueWeight ?? 0) / value;
  return {
    h: hue,
    s: clamp(saturation * 100, 0, 100),
    v: clamp(value * 100, 0, 100),
  };
}

/** Returns the exact triangle position for the supplied HSV saturation/value. */
export function trianglePointFromHsv(hsv: HsvColor): NormalizedPoint {
  const saturation = clamp(hsv.s, 0, 100) / 100;
  const value = clamp(hsv.v, 0, 100) / 100;
  const hueWeight = value * saturation;
  const whiteWeight = value * (1 - saturation);
  const blackWeight = 1 - value;
  const { hue, white, black } = COLOR_TRIANGLE_VERTICES;
  return {
    x: hue.x * hueWeight + white.x * whiteWeight + black.x * blackWeight,
    y: hue.y * hueWeight + white.y * whiteWeight + black.y * blackWeight,
  };
}
