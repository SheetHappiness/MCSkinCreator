import { describe, expect, it } from 'vitest';

import {
  COLOR_TRIANGLE_VERTICES,
  hsvFromTrianglePoint,
  hueFromNormalizedPoint,
  normalizedPointFromHue,
  trianglePointFromHsv,
} from './colorPickerGeometry';

describe('color picker geometry', () => {
  it('maps the hue wheel clockwise from red at the top', () => {
    expect(hueFromNormalizedPoint({ x: 0.5, y: 0.08 })).toBe(0);
    expect(hueFromNormalizedPoint({ x: 0.92, y: 0.5 })).toBe(90);
    expect(hueFromNormalizedPoint({ x: 0.5, y: 0.92 })).toBe(180);
    expect(hueFromNormalizedPoint({ x: 0.08, y: 0.5 })).toBe(270);
  });

  it('keeps hue handles on the same radial axis', () => {
    expect(normalizedPointFromHue(0).x).toBeCloseTo(0.5);
    expect(normalizedPointFromHue(0).y).toBeLessThan(0.5);
    expect(normalizedPointFromHue(90).x).toBeGreaterThan(0.5);
    expect(normalizedPointFromHue(90).y).toBeCloseTo(0.5);
  });

  it('maps triangle vertices to saturated hue, white, and black', () => {
    expect(hsvFromTrianglePoint(COLOR_TRIANGLE_VERTICES.hue, 210)).toEqual({
      h: 210,
      s: 100,
      v: 100,
    });
    expect(hsvFromTrianglePoint(COLOR_TRIANGLE_VERTICES.white, 210)).toEqual({
      h: 210,
      s: 0,
      v: 100,
    });
    expect(hsvFromTrianglePoint(COLOR_TRIANGLE_VERTICES.black, 210)).toEqual({
      h: 210,
      s: 0,
      v: 0,
    });
  });

  it('round-trips HSV saturation and value through the triangle', () => {
    const hsv = { h: 37, s: 64, v: 82 } as const;
    const roundTripped = hsvFromTrianglePoint(trianglePointFromHsv(hsv), hsv.h);
    expect(roundTripped.h).toBe(hsv.h);
    expect(roundTripped.s).toBeCloseTo(hsv.s);
    expect(roundTripped.v).toBeCloseTo(hsv.v);
  });
});
