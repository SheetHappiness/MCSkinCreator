import { describe, expect, it, vi } from 'vitest';

import { SkinDocument } from '../../engine/document';
import { PIXEL_GRID_ZOOM_THRESHOLD } from '../../engine/viewport';
import { renderSkinCanvas, shouldRenderPixelGrid } from './SkinCanvasRenderer';

function createContext() {
  return {
    imageSmoothingEnabled: true,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    lineDashOffset: 0,
    createImageData: vi.fn((width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    })),
    putImageData: vi.fn(),
  };
}

describe('Canvas 2D skin rendering', () => {
  it('disables smoothing, preserves source dimensions, and leaves the document unchanged', () => {
    const destinationContext = createContext();
    const sourceContext = createContext();
    const sourceCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => sourceContext),
    };
    const canvas = {
      width: 0,
      height: 0,
      ownerDocument: { createElement: vi.fn(() => sourceCanvas) },
      getContext: vi.fn(() => destinationContext),
    } as unknown as HTMLCanvasElement;
    const document = SkinDocument.createBlank({ id: 'render' });
    document.writePixel(4, 5, { r: 9, g: 8, b: 7, a: 6 });
    const before = document.copyPixelData();
    const revision = document.revision;

    renderSkinCanvas(
      canvas,
      document,
      { zoom: 8, offsetX: 20, offsetY: 30 },
      { width: 640, height: 480 },
      { showGrid: true, pixelRatio: 2 },
    );

    expect(canvas.width).toBe(1280);
    expect(canvas.height).toBe(960);
    expect(destinationContext.imageSmoothingEnabled).toBe(false);
    expect(sourceContext.imageSmoothingEnabled).toBe(false);
    expect(sourceCanvas.width).toBe(64);
    expect(sourceCanvas.height).toBe(64);
    expect(destinationContext.drawImage).toHaveBeenCalledWith(
      sourceCanvas,
      0,
      0,
      64,
      64,
      20,
      30,
      512,
      512,
    );
    expect(document.copyPixelData()).toEqual(before);
    expect(document.revision).toBe(revision);
  });

  it('only enables the optional grid at the centralized threshold', () => {
    expect(shouldRenderPixelGrid(true, PIXEL_GRID_ZOOM_THRESHOLD - 0.01)).toBe(
      false,
    );
    expect(shouldRenderPixelGrid(true, PIXEL_GRID_ZOOM_THRESHOLD)).toBe(true);
    expect(shouldRenderPixelGrid(false, PIXEL_GRID_ZOOM_THRESHOLD + 10)).toBe(
      false,
    );
  });

  it('draws a DPR-aware selection outline in texture coordinates above the bitmap', () => {
    const destinationContext = createContext();
    const sourceContext = createContext();
    const sourceCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => sourceContext),
    };
    const canvas = {
      width: 0,
      height: 0,
      ownerDocument: { createElement: vi.fn(() => sourceCanvas) },
      getContext: vi.fn(() => destinationContext),
    } as unknown as HTMLCanvasElement;
    const document = SkinDocument.createBlank({ id: 'selection-render' });

    renderSkinCanvas(
      canvas,
      document,
      { zoom: 8, offsetX: 20, offsetY: 30 },
      { width: 640, height: 480 },
      {
        showGrid: false,
        pixelRatio: 2,
        selection: {
          selection: { x: 2, y: 3, width: 4, height: 5 },
          draft: undefined,
          floating: undefined,
        },
      },
    );

    expect(destinationContext.setLineDash).toHaveBeenCalledWith([4, 4]);
    expect(destinationContext.rect).toHaveBeenCalledWith(
      36.25,
      54.25,
      31.5,
      39.5,
    );
    expect(destinationContext.stroke).toHaveBeenCalledTimes(3);
  });

  it('draws canonical UV boundaries with the same pan, zoom, and DPR transform', () => {
    const destinationContext = createContext();
    const sourceContext = createContext();
    const sourceCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => sourceContext),
    };
    const canvas = {
      width: 0,
      height: 0,
      ownerDocument: { createElement: vi.fn(() => sourceCanvas) },
      getContext: vi.fn(() => destinationContext),
    } as unknown as HTMLCanvasElement;
    const document = SkinDocument.createBlank({ id: 'uv-render' });
    const before = document.copyPixelData();
    const revision = document.revision;

    renderSkinCanvas(
      canvas,
      document,
      { zoom: 8, offsetX: 20, offsetY: 30 },
      { width: 640, height: 480 },
      {
        showGrid: false,
        pixelRatio: 2,
        uvOverlay: { layer: 'base' },
      },
    );

    // The first canonical head-top rectangle is [8, 0)×[16, 8), projected
    // through the same logical viewport and aligned to the two-device-pixel
    // backing store.
    expect(destinationContext.moveTo).toHaveBeenCalledWith(84.25, 30.25);
    expect(destinationContext.lineTo).toHaveBeenCalledWith(148.25, 30.25);
    expect(destinationContext.lineTo).toHaveBeenCalledWith(148.25, 94.25);
    expect(destinationContext.stroke).toHaveBeenCalledTimes(2);
    expect(document.copyPixelData()).toEqual(before);
    expect(document.revision).toBe(revision);
  });

  it('uses a distinct dashed path for outer-layer boundaries', () => {
    const destinationContext = createContext();
    const sourceContext = createContext();
    const sourceCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => sourceContext),
    };
    const canvas = {
      width: 0,
      height: 0,
      ownerDocument: { createElement: vi.fn(() => sourceCanvas) },
      getContext: vi.fn(() => destinationContext),
    } as unknown as HTMLCanvasElement;

    renderSkinCanvas(
      canvas,
      SkinDocument.createBlank({ id: 'outer-uv-render' }),
      { zoom: 8, offsetX: 20, offsetY: 30 },
      { width: 640, height: 480 },
      {
        showGrid: false,
        pixelRatio: 2,
        uvOverlay: { layer: 'outer' },
      },
    );

    expect(destinationContext.setLineDash).toHaveBeenCalledWith([4, 3]);
    expect(destinationContext.stroke).toHaveBeenCalledTimes(2);
  });

  it('draws a view-only semantic highlight from a canonical face target', () => {
    const destinationContext = createContext();
    const sourceContext = createContext();
    const sourceCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => sourceContext),
    };
    const canvas = {
      width: 0,
      height: 0,
      ownerDocument: { createElement: vi.fn(() => sourceCanvas) },
      getContext: vi.fn(() => destinationContext),
    } as unknown as HTMLCanvasElement;
    const document = SkinDocument.createBlank({ id: 'semantic-highlight' });
    const before = document.copyPixelData();
    const revision = document.revision;

    renderSkinCanvas(
      canvas,
      document,
      { zoom: 8, offsetX: 20, offsetY: 30 },
      { width: 640, height: 480 },
      {
        showGrid: false,
        pixelRatio: 2,
        semanticHighlight: {
          model: 'classic',
          bodyPart: 'torso',
          layer: 'base',
          face: 'front',
        },
      },
    );

    expect(destinationContext.fillRect).toHaveBeenCalledWith(180, 190, 64, 96);
    expect(destinationContext.stroke).toHaveBeenCalledTimes(2);
    expect(document.copyPixelData()).toEqual(before);
    expect(document.revision).toBe(revision);
  });

  it('dims unrelated canonical regions for view-only isolation', () => {
    const destinationContext = createContext();
    const sourceContext = createContext();
    const sourceCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => sourceContext),
    };
    const canvas = {
      width: 0,
      height: 0,
      ownerDocument: { createElement: vi.fn(() => sourceCanvas) },
      getContext: vi.fn(() => destinationContext),
    } as unknown as HTMLCanvasElement;

    renderSkinCanvas(
      canvas,
      SkinDocument.createBlank({ id: 'semantic-isolation' }),
      { zoom: 4, offsetX: 12, offsetY: 16 },
      { width: 640, height: 480 },
      {
        showGrid: false,
        pixelRatio: 1,
        isolatedBodyPart: 'head',
      },
    );

    // The torso base front [20,20)×[20,32) is dimmed; the isolated head is
    // intentionally absent from the isolation fill calls.
    expect(destinationContext.fillRect).toHaveBeenCalledWith(92, 96, 32, 48);
    expect(destinationContext.fillRect).not.toHaveBeenCalledWith(
      44,
      16,
      32,
      32,
    );
  });
});
