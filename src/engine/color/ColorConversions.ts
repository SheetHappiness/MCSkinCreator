import type { RgbaColor } from '../document';

export interface HsvColor {
  readonly h: number;
  readonly s: number;
  readonly v: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function normalizedHue(value: number): number {
  const hue = value % 360;
  return hue < 0 ? hue + 360 : hue;
}

/** Rounds/clamps UI values at the boundary before they enter exact state. */
export function canonicalizeRgba(color: RgbaColor): RgbaColor {
  return {
    r: byte(color.r),
    g: byte(color.g),
    b: byte(color.b),
    a: byte(color.a),
  };
}

/** Converts exact RGB bytes to HSV degrees and percentages. */
export function rgbaToHsv(color: RgbaColor): HsvColor {
  const red = clamp(color.r, 0, 255) / 255;
  const green = clamp(color.g, 0, 255) / 255;
  const blue = clamp(color.b, 0, 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;

  let hue = 0;
  if (delta !== 0) {
    if (maximum === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (maximum === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  if (hue < 0) hue += 360;

  return {
    h: hue,
    s: maximum === 0 ? 0 : (delta / maximum) * 100,
    v: maximum * 100,
  };
}

/** Converts HSV UI values to exact RGB bytes while preserving alpha. */
export function hsvToRgba(hsv: HsvColor, alpha: number): RgbaColor {
  const hue = normalizedHue(hsv.h);
  const saturation = clamp(hsv.s, 0, 100) / 100;
  const value = clamp(hsv.v, 0, 100) / 100;
  const chroma = value * saturation;
  const hueSector = hue / 60;
  const second = chroma * (1 - Math.abs((hueSector % 2) - 1));
  const match = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;
  if (hueSector < 1) {
    red = chroma;
    green = second;
  } else if (hueSector < 2) {
    red = second;
    green = chroma;
  } else if (hueSector < 3) {
    green = chroma;
    blue = second;
  } else if (hueSector < 4) {
    green = second;
    blue = chroma;
  } else if (hueSector < 5) {
    red = second;
    blue = chroma;
  } else {
    red = chroma;
    blue = second;
  }

  return canonicalizeRgba({
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
    a: alpha,
  });
}
