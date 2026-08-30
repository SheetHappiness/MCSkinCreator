export const RECENT_COLOR_SWATCH_SIZE = 30;
export const PALETTE_SWATCH_SIZE = 40;
export const RECENT_COLOR_SWATCH_GAP = 6;
export const PALETTE_SWATCH_GAP = 8;
export const PALETTE_ITEM_MIN_WIDTH = 128;

/**
 * Computes columns for a swatch grid without ever making the requested
 * swatches smaller than their artist-facing minimum size.
 */
export function getResponsiveSwatchColumns(
  availableWidth: number,
  swatchSize: number,
  gap: number,
): number {
  if (
    !Number.isFinite(availableWidth) ||
    !Number.isFinite(swatchSize) ||
    !Number.isFinite(gap) ||
    swatchSize <= 0 ||
    gap < 0
  ) {
    return 1;
  }

  return Math.max(
    1,
    Math.floor((Math.max(0, availableWidth) + gap) / (swatchSize + gap)),
  );
}

export function getRecentColorColumns(availableWidth: number): number {
  return getResponsiveSwatchColumns(
    availableWidth,
    RECENT_COLOR_SWATCH_SIZE,
    RECENT_COLOR_SWATCH_GAP,
  );
}

export function getPaletteColumns(availableWidth: number): number {
  return getResponsiveSwatchColumns(
    availableWidth,
    PALETTE_ITEM_MIN_WIDTH,
    PALETTE_SWATCH_GAP,
  );
}
