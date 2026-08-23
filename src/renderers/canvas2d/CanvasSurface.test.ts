import { describe, expect, it } from 'vitest';

import {
  alignGridLine,
  configureCanvasSurface,
  getCanvasBackingStoreSize,
} from './CanvasSurface';

describe('HiDPI canvas surface', () => {
  it('calculates explicit backing dimensions for several pixel ratios', () => {
    expect(getCanvasBackingStoreSize({ width: 800, height: 500 }, 1)).toEqual({
      width: 800,
      height: 500,
    });
    expect(getCanvasBackingStoreSize({ width: 800, height: 500 }, 1.5)).toEqual(
      { width: 1200, height: 750 },
    );
    expect(getCanvasBackingStoreSize({ width: 800, height: 500 }, 2)).toEqual({
      width: 1600,
      height: 1000,
    });
  });

  it('uses actual rounded backing ratios for fractional CSS dimensions', () => {
    const canvas = { width: 0, height: 0 } as HTMLCanvasElement;
    const surface = configureCanvasSurface(
      canvas,
      { width: 333.3, height: 222.2 },
      1.5,
    );

    expect(canvas.width).toBe(500);
    expect(canvas.height).toBe(333);
    expect(surface.scaleX).toBeCloseTo(500 / 333.3);
    expect(surface.scaleY).toBeCloseTo(333 / 222.2);
  });

  it('aligns grid strokes to physical device pixels', () => {
    expect(alignGridLine(10, 1)).toBe(10.5);
    expect(alignGridLine(10, 2)).toBe(10.25);
    expect(alignGridLine(10.2, 1.5)).toBeCloseTo(10.3333333333);
  });
});
