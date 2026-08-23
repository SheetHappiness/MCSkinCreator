import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import type { SkinDocument } from '../../engine/document';
import {
  VIEWPORT_ZOOM_BUTTON_FACTOR,
  clientToLogicalPoint,
  fitViewportToView,
  panViewport,
  screenToTexture,
  zoomViewportAroundPoint,
  type Point,
  type Size,
  type TextureCoordinate,
  type ViewportState,
} from '../../engine/viewport';
import { renderSkinCanvas } from '../../renderers/canvas2d';

interface EditorWorkspaceProps {
  readonly document: SkinDocument;
  readonly displayName: string;
}

interface PanGesture {
  readonly pointerId: number;
  readonly lastClientPoint: Point;
}

const EMPTY_SIZE: Size = { width: 0, height: 0 };
const INITIAL_VIEWPORT: ViewportState = { zoom: 1, offsetX: 0, offsetY: 0 };
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

function getElementSize(element: HTMLElement): Size {
  const bounds = element.getBoundingClientRect();
  return { width: bounds.width, height: bounds.height };
}

function useElementSize(elementRef: React.RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>(EMPTY_SIZE);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (element === null) {
      return;
    }

    const updateSize = () => {
      const next = getElementSize(element);
      setSize((current) =>
        current.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [elementRef]);

  return size;
}

function normalizeWheelDelta(event: ReactWheelEvent): number {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return event.deltaY * 16;
  }
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * event.currentTarget.clientHeight;
  }
  return event.deltaY;
}

export function EditorWorkspace({
  document: skinDocument,
  displayName,
}: EditorWorkspaceProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panGestureRef = useRef<PanGesture | undefined>(undefined);
  const spacePressedRef = useRef(false);
  const fittedDocumentIdRef = useRef<string | undefined>(undefined);
  const size = useElementSize(stageRef);
  const [viewport, setViewport] = useState(INITIAL_VIEWPORT);
  const [showGrid, setShowGrid] = useState(true);
  const [hoveredPixel, setHoveredPixel] = useState<
    TextureCoordinate | undefined
  >(undefined);
  const [isPanning, setIsPanning] = useState(false);

  const fitToView = useCallback(() => {
    if (size.width <= 0 || size.height <= 0) {
      return;
    }

    setViewport(fitViewportToView(size, skinDocument));
    setHoveredPixel(undefined);
  }, [size, skinDocument]);

  useLayoutEffect(() => {
    if (
      size.width > 0 &&
      size.height > 0 &&
      fittedDocumentIdRef.current !== skinDocument.id
    ) {
      fittedDocumentIdRef.current = skinDocument.id;
      setViewport(fitViewportToView(size, skinDocument));
      setHoveredPixel(undefined);
    }
  }, [size, skinDocument]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || size.width <= 0 || size.height <= 0) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      renderSkinCanvas(canvas, skinDocument, viewport, size, {
        showGrid,
        pixelRatio: window.devicePixelRatio || 1,
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [showGrid, size, skinDocument, skinDocument.revision, viewport]);

  const logicalPoint = useCallback(
    (clientX: number, clientY: number): Point | undefined => {
      const canvas = canvasRef.current;
      if (canvas === null) {
        return undefined;
      }
      return clientToLogicalPoint(
        { x: clientX, y: clientY },
        canvas.getBoundingClientRect(),
      );
    },
    [],
  );

  const updateHoveredPixel = useCallback(
    (clientX: number, clientY: number) => {
      const point = logicalPoint(clientX, clientY);
      const next =
        point === undefined
          ? undefined
          : screenToTexture(point, viewport, skinDocument);

      setHoveredPixel((current) =>
        current?.x === next?.x && current?.y === next?.y ? current : next,
      );
    },
    [logicalPoint, skinDocument, viewport],
  );

  const finishPan = useCallback((pointerId?: number) => {
    const canvas = canvasRef.current;
    const gesture = panGestureRef.current;
    if (
      gesture === undefined ||
      (pointerId !== undefined && gesture.pointerId !== pointerId)
    ) {
      return;
    }

    if (canvas?.hasPointerCapture(gesture.pointerId)) {
      canvas.releasePointerCapture(gesture.pointerId);
    }
    panGestureRef.current = undefined;
    setIsPanning(false);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    const isPanStart =
      event.button === 1 || (event.button === 0 && spacePressedRef.current);

    if (!isPanStart) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    panGestureRef.current = {
      pointerId: event.pointerId,
      lastClientPoint: { x: event.clientX, y: event.clientY },
    };
    setIsPanning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const gesture = panGestureRef.current;

    if (gesture?.pointerId === event.pointerId) {
      const nextClientPoint = { x: event.clientX, y: event.clientY };
      setViewport((current) =>
        panViewport(current, {
          x: nextClientPoint.x - gesture.lastClientPoint.x,
          y: nextClientPoint.y - gesture.lastClientPoint.y,
        }),
      );
      panGestureRef.current = {
        pointerId: gesture.pointerId,
        lastClientPoint: nextClientPoint,
      };
    }

    updateHoveredPixel(event.clientX, event.clientY);
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    const anchor = logicalPoint(event.clientX, event.clientY);
    if (anchor === undefined) {
      return;
    }

    event.preventDefault();
    const factor = Math.exp(
      -normalizeWheelDelta(event) * WHEEL_ZOOM_SENSITIVITY,
    );
    setViewport((current) =>
      zoomViewportAroundPoint(current, current.zoom * factor, anchor),
    );
    setHoveredPixel(screenToTexture(anchor, viewport, skinDocument));
  };

  const zoomFromCenter = (factor: number) => {
    const anchor = { x: size.width / 2, y: size.height / 2 };
    setViewport((current) =>
      zoomViewportAroundPoint(current, current.zoom * factor, anchor),
    );
    setHoveredPixel(undefined);
  };

  const zoomPercent = Math.round(viewport.zoom * 100);

  return (
    <section className="editor-workspace" aria-label="2D editor viewport">
      <div className="canvas-stage" ref={stageRef}>
        <canvas
          ref={canvasRef}
          className={`skin-canvas${isPanning ? ' is-panning' : ''}`}
          aria-label="2D skin canvas"
          role="img"
          tabIndex={0}
          onBlur={() => {
            spacePressedRef.current = false;
            finishPan();
          }}
          onKeyDown={(event) => {
            if (event.code === 'Space' && !event.repeat) {
              event.preventDefault();
              spacePressedRef.current = true;
            }
          }}
          onKeyUp={(event) => {
            if (event.code === 'Space') {
              event.preventDefault();
              spacePressedRef.current = false;
            }
          }}
          onPointerCancel={(event) => finishPan(event.pointerId)}
          onPointerDown={handlePointerDown}
          onPointerLeave={() => {
            if (panGestureRef.current === undefined) {
              setHoveredPixel(undefined);
            }
          }}
          onPointerMove={handlePointerMove}
          onPointerUp={(event) => finishPan(event.pointerId)}
          onWheel={handleWheel}
        />
      </div>

      <footer className="editor-status-bar" aria-label="Editor status">
        <span className="document-name" title={displayName}>
          {displayName}
        </span>
        <span>64×64</span>
        <div className="viewport-controls" aria-label="Viewport controls">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomFromCenter(1 / VIEWPORT_ZOOM_BUTTON_FACTOR)}
          >
            −
          </button>
          <output aria-label="Current zoom" data-testid="zoom-value">
            {zoomPercent}%
          </output>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomFromCenter(VIEWPORT_ZOOM_BUTTON_FACTOR)}
          >
            +
          </button>
          <button type="button" onClick={fitToView}>
            Fit
          </button>
          <button
            type="button"
            aria-pressed={showGrid}
            onClick={() => setShowGrid((current) => !current)}
          >
            Grid
          </button>
        </div>
        <output className="coordinate-readout" aria-label="Texture coordinates">
          X: {hoveredPixel?.x ?? '—'}&nbsp;&nbsp; Y: {hoveredPixel?.y ?? '—'}
        </output>
      </footer>
    </section>
  );
}
