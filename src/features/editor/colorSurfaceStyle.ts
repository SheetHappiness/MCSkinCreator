import type { CSSProperties } from 'react';

import type { RgbaColor } from '../../engine/document';

const CHECKERBOARD_LAYERS = [
  'linear-gradient(45deg, #777 25%, transparent 25%) 0 0 / 8px 8px',
  'linear-gradient(45deg, transparent 75%, #777 75%) 0 0 / 8px 8px',
  'linear-gradient(45deg, transparent 75%, #777 75%) 4px -4px / 8px 8px',
  'linear-gradient(45deg, #777 25%, #999 25%) 4px 4px / 8px 8px',
].join(', ');

function rgbaCss(color: RgbaColor): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`;
}

/** Paints an exact RGBA color over a visible transparency checkerboard. */
export function rgbaSurfaceStyle(color: RgbaColor): CSSProperties {
  return {
    background: [
      `linear-gradient(${rgbaCss(color)}, ${rgbaCss(color)}) 0 0 / 100% 100% no-repeat`,
      CHECKERBOARD_LAYERS,
    ].join(', '),
  };
}

/** Paints the alpha ramp over the same checkerboard used by color swatches. */
export function alphaSliderStyle(color: RgbaColor): CSSProperties {
  const transparent = `rgba(${color.r}, ${color.g}, ${color.b}, 0)`;
  const opaque = `rgba(${color.r}, ${color.g}, ${color.b}, 1)`;
  return {
    background: [
      `linear-gradient(to right, ${transparent}, ${opaque}) 0 0 / 100% 100% no-repeat`,
      CHECKERBOARD_LAYERS,
    ].join(', '),
  };
}
