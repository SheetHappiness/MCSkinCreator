import { describe, expect, it } from 'vitest';

import {
  PALETTE_SWATCH_SIZE,
  RECENT_COLOR_SWATCH_SIZE,
  getPaletteColumns,
  getRecentColorColumns,
  getResponsiveSwatchColumns,
} from './colorWorkspaceLayout';

describe('responsive color swatch layout', () => {
  it('keeps recent colors readable while reducing columns for narrow panels', () => {
    expect(getRecentColorColumns(180)).toBe(5);
    expect(getRecentColorColumns(140)).toBe(4);
    expect(getRecentColorColumns(104)).toBe(3);
  });

  it('prefers fewer large palette columns over tiny color chips', () => {
    expect(getPaletteColumns(300)).toBe(2);
    expect(getPaletteColumns(180)).toBe(1);
    expect(getPaletteColumns(90)).toBe(1);
    expect(PALETTE_SWATCH_SIZE).toBeGreaterThan(RECENT_COLOR_SWATCH_SIZE);
  });

  it('always returns a usable column count for invalid or narrow widths', () => {
    expect(getResponsiveSwatchColumns(0, PALETTE_SWATCH_SIZE, 8)).toBe(1);
    expect(getResponsiveSwatchColumns(Number.NaN, 38, 8)).toBe(1);
    expect(getResponsiveSwatchColumns(20, 38, 8)).toBe(1);
  });
});
