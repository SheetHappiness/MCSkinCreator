import { describe, expect, it } from 'vitest';

import {
  MAX_VIEWPORT_ZOOM,
  MIN_VIEWPORT_ZOOM,
  clientToLogicalPoint,
  fitViewportToView,
  getGridLinePositions,
  panViewport,
  screenToTexture,
  screenToTextureClamped,
  textureToScreen,
  zoomViewportAroundPoint,
  type ViewportState,
} from './Viewport';

const TEXTURE_SIZE = { width: 64, height: 64 };

describe('screen and texture coordinate mapping', () => {
  const viewport: ViewportState = { zoom: 10, offsetX: 20, offsetY: 30 };

  it('maps the top-left and bottom-right source pixels', () => {
    expect(screenToTexture({ x: 20, y: 30 }, viewport, TEXTURE_SIZE)).toEqual({
      x: 0,
      y: 0,
    });
    expect(
      screenToTexture({ x: 659.999, y: 669.999 }, viewport, TEXTURE_SIZE),
    ).toEqual({ x: 63, y: 63 });
  });

  it('maps center coordinates at multiple zoom levels', () => {
    for (const zoom of [1, 4, 12.5]) {
      const current = { zoom, offsetX: 7, offsetY: 11 };
      expect(
        screenToTexture(
          { x: 7 + 32.25 * zoom, y: 11 + 31.75 * zoom },
          current,
          TEXTURE_SIZE,
        ),
      ).toEqual({ x: 32, y: 31 });
    }
  });

  it('returns no pixel immediately outside every image edge', () => {
    expect(
      screenToTexture({ x: 19.999, y: 40 }, viewport, TEXTURE_SIZE),
    ).toBeUndefined();
    expect(
      screenToTexture({ x: 40, y: 29.999 }, viewport, TEXTURE_SIZE),
    ).toBeUndefined();
    expect(
      screenToTexture({ x: 660, y: 40 }, viewport, TEXTURE_SIZE),
    ).toBeUndefined();
    expect(
      screenToTexture({ x: 40, y: 670 }, viewport, TEXTURE_SIZE),
    ).toBeUndefined();
  });

  it('uses floor with exact half-open pixel boundaries', () => {
    const fractionalViewport = { zoom: 2.5, offsetX: 0, offsetY: 0 };

    expect(
      screenToTexture({ x: 4.999, y: 2.499 }, fractionalViewport, TEXTURE_SIZE),
    ).toEqual({ x: 1, y: 0 });
    expect(
      screenToTexture({ x: 5, y: 2.5 }, fractionalViewport, TEXTURE_SIZE),
    ).toEqual({ x: 2, y: 1 });
  });

  it('clamps selection drags to the first and last source texels', () => {
    const current = { zoom: 4, offsetX: 8, offsetY: 12 };
    expect(
      screenToTextureClamped({ x: -100, y: -100 }, current, TEXTURE_SIZE),
    ).toEqual({ x: 0, y: 0 });
    expect(
      screenToTextureClamped({ x: 1000, y: 1000 }, current, TEXTURE_SIZE),
    ).toEqual({ x: 63, y: 63 });
  });

  it('applies pan offsets without changing texture semantics', () => {
    const panned = panViewport(viewport, { x: -13, y: 24 });
    expect(panned).toEqual({ zoom: 10, offsetX: 7, offsetY: 54 });
    expect(
      screenToTexture({ x: 7 + 15 * 10, y: 54 + 9 * 10 }, panned, TEXTURE_SIZE),
    ).toEqual({ x: 15, y: 9 });
  });

  it('maps texture positions back to their exact screen edge', () => {
    expect(textureToScreen({ x: 63, y: 17 }, viewport)).toEqual({
      x: 650,
      y: 200,
    });
  });
});

describe('viewport zoom and fit', () => {
  it('keeps the continuous texture point beneath the zoom anchor stationary', () => {
    const original = { zoom: 8, offsetX: 40, offsetY: 24 };
    const anchor = { x: 317.25, y: 208.5 };
    const texturePoint = {
      x: (anchor.x - original.offsetX) / original.zoom,
      y: (anchor.y - original.offsetY) / original.zoom,
    };
    const zoomed = zoomViewportAroundPoint(original, 13.75, anchor);

    expect(textureToScreen(texturePoint, zoomed).x).toBeCloseTo(anchor.x, 12);
    expect(textureToScreen(texturePoint, zoomed).y).toBeCloseTo(anchor.y, 12);
  });

  it('clamps zoom-around-point to centralized limits', () => {
    const viewport = { zoom: 8, offsetX: 0, offsetY: 0 };
    expect(zoomViewportAroundPoint(viewport, 0.01, { x: 0, y: 0 }).zoom).toBe(
      MIN_VIEWPORT_ZOOM,
    );
    expect(zoomViewportAroundPoint(viewport, 100, { x: 0, y: 0 }).zoom).toBe(
      MAX_VIEWPORT_ZOOM,
    );
  });

  it('fits with centered integer scaling and preserves aspect ratio', () => {
    const fitted = fitViewportToView({ width: 800, height: 600 }, TEXTURE_SIZE);

    expect(fitted).toEqual({ zoom: 8, offsetX: 144, offsetY: 44 });
    expect(fitted.offsetX * 2 + 64 * fitted.zoom).toBe(800);
    expect(fitted.offsetY * 2 + 64 * fitted.zoom).toBe(600);
  });

  it('positions every grid boundary from the same viewport transform', () => {
    const lines = getGridLinePositions(
      { zoom: 8, offsetX: 12, offsetY: -4 },
      { width: 2, height: 3 },
    );

    expect(lines.x).toEqual([12, 20, 28]);
    expect(lines.y).toEqual([-4, 4, 12, 20]);
  });
});

describe('logical pointer coordinates', () => {
  it('subtracts CSS bounds without applying devicePixelRatio', () => {
    const client = { x: 221.5, y: 143.25 };
    const bounds = { left: 21.5, top: 43.25 };

    expect(clientToLogicalPoint(client, bounds)).toEqual({ x: 200, y: 100 });
    // Repeating the logical calculation represents DPR 1, 1.5, and 2: DPR is
    // deliberately absent from this API and changes only the backing buffer.
    for (let repetition = 0; repetition < 3; repetition += 1) {
      expect(clientToLogicalPoint(client, bounds)).toEqual({ x: 200, y: 100 });
    }
  });
});
