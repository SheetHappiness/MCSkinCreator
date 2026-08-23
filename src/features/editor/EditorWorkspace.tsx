import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import type { RgbaColor, SkinDocument } from '../../engine/document';
import type { DocumentHistory } from '../../engine/history';
import {
  ERASER_COLOR,
  beginPixelStroke,
  fillAt,
  samplePixel,
  type EditorTool,
  type PixelStroke,
} from '../../engine/tools';
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
import { SkinPreviewPanel } from '../preview/SkinPreviewPanel';
import { registerActiveEditorInteraction } from './activeEditorInteraction';
import {
  setActiveEditorTool,
  setSelectedEditorColor,
  useActiveEditorTool,
  useSelectedEditorColor,
} from './editorToolStore';
import {
  editorToolFromShortcut,
  getPointerAction,
  isEditableKeyboardTarget,
} from './editorShortcuts';

interface EditorWorkspaceProps {
  readonly document: SkinDocument;
  readonly history: DocumentHistory;
  readonly displayName: string;
  readonly isDirty: boolean;
}

interface PanGesture {
  readonly pointerId: number;
  readonly lastClientPoint: Point;
}

interface StrokeGesture {
  readonly pointerId: number;
  readonly stroke: PixelStroke;
}

interface ToolDefinition {
  readonly tool: EditorTool;
  readonly label: string;
  readonly shortcut: string;
}

const TOOLS: readonly ToolDefinition[] = [
  { tool: 'pencil', label: 'Pencil', shortcut: 'P' },
  { tool: 'eraser', label: 'Eraser', shortcut: 'E' },
  { tool: 'fill', label: 'Fill', shortcut: 'G' },
  { tool: 'eyedropper', label: 'Eyedropper', shortcut: 'I' },
];

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
    if (element === null) return;

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
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return event.deltaY * event.currentTarget.clientHeight;
  }
  return event.deltaY;
}

function channelToHex(channel: number): string {
  return channel.toString(16).padStart(2, '0');
}

function colorToHex(color: RgbaColor): string {
  return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`;
}

function colorFromHex(hex: string, alpha: number): RgbaColor {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
    a: alpha,
  };
}

function ToolIcon({ tool }: { readonly tool: EditorTool }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (tool === 'pencil') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path {...common} d="m4 14 1.2-4.1L13 2.1l3 3-7.8 7.8L4 14Z" />
        <path {...common} d="m11.7 3.4 3 3M5.2 10l2.9 2.9" />
      </svg>
    );
  }
  if (tool === 'eraser') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          {...common}
          d="m3.5 12.2 7.3-8.1a1.4 1.4 0 0 1 2-.1l3.1 2.8a1.4 1.4 0 0 1 .1 2l-5.2 5.8H5.7l-2.1-1.9a.4.4 0 0 1-.1-.5Z"
        />
        <path {...common} d="m7.5 8.2 4.6 4.1M10.8 14.6h5.7" />
      </svg>
    );
  }
  if (tool === 'fill') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path {...common} d="m3.5 10 6-6 6.5 6.5-6 6H3.5V10Z" />
        <path
          {...common}
          d="m3.5 10 6.5 6.5M14.5 14.5c0 1.1.9 2 2 2s2-.9 2-2c0-.8-1.3-2.4-2-3.3-.7.9-2 2.5-2 3.3Z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path
        {...common}
        d="m11.8 3.2 5 5-2.2 2.2-1.1-1.1-5.8 5.8H4.2v-3.5L10 5.8 8.9 4.7l2.9-1.5Z"
      />
      <path {...common} d="M3 17h6" />
    </svg>
  );
}

export function EditorWorkspace({
  document: skinDocument,
  history,
  displayName,
  isDirty,
}: EditorWorkspaceProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderFrameRef = useRef<number | undefined>(undefined);
  const panGestureRef = useRef<PanGesture | undefined>(undefined);
  const strokeGestureRef = useRef<StrokeGesture | undefined>(undefined);
  const spacePressedRef = useRef(false);
  const fittedDocumentIdRef = useRef<string | undefined>(undefined);
  const size = useElementSize(stageRef);
  const activeTool = useActiveEditorTool();
  const selectedColor = useSelectedEditorColor();
  const [viewport, setViewport] = useState(INITIAL_VIEWPORT);
  const [showGrid, setShowGrid] = useState(true);
  const [hoveredPixel, setHoveredPixel] = useState<
    TextureCoordinate | undefined
  >(undefined);
  const [isPanning, setIsPanning] = useState(false);

  const fitToView = useCallback(() => {
    if (size.width <= 0 || size.height <= 0) return;
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

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null || size.width <= 0 || size.height <= 0) return;
    renderSkinCanvas(canvas, skinDocument, viewport, size, {
      showGrid,
      pixelRatio: window.devicePixelRatio || 1,
    });
  }, [showGrid, size, skinDocument, viewport]);

  const invalidateCanvas = useCallback(() => {
    if (renderFrameRef.current !== undefined) return;
    renderFrameRef.current = requestAnimationFrame(() => {
      renderFrameRef.current = undefined;
      renderCanvas();
    });
  }, [renderCanvas]);

  useEffect(() => {
    invalidateCanvas();
    const unsubscribe = skinDocument.subscribeToMutations(invalidateCanvas);
    return () => {
      unsubscribe();
      if (renderFrameRef.current !== undefined) {
        cancelAnimationFrame(renderFrameRef.current);
        renderFrameRef.current = undefined;
      }
    };
  }, [invalidateCanvas, skinDocument]);

  const logicalPoint = useCallback(
    (clientX: number, clientY: number): Point | undefined => {
      const canvas = canvasRef.current;
      if (canvas === null) return undefined;
      return clientToLogicalPoint(
        { x: clientX, y: clientY },
        canvas.getBoundingClientRect(),
      );
    },
    [],
  );

  const texturePoint = useCallback(
    (clientX: number, clientY: number): TextureCoordinate | undefined => {
      const point = logicalPoint(clientX, clientY);
      return point === undefined
        ? undefined
        : screenToTexture(point, viewport, skinDocument);
    },
    [logicalPoint, skinDocument, viewport],
  );

  const updateHoveredPixel = useCallback(
    (clientX: number, clientY: number) => {
      const next = texturePoint(clientX, clientY);
      setHoveredPixel((current) =>
        current?.x === next?.x && current?.y === next?.y ? current : next,
      );
      return next;
    },
    [texturePoint],
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

  const cancelStroke = useCallback((pointerId?: number) => {
    const canvas = canvasRef.current;
    const gesture = strokeGestureRef.current;
    if (
      gesture === undefined ||
      (pointerId !== undefined && gesture.pointerId !== pointerId)
    ) {
      return;
    }
    gesture.stroke.cancel();
    if (canvas?.hasPointerCapture(gesture.pointerId)) {
      canvas.releasePointerCapture(gesture.pointerId);
    }
    strokeGestureRef.current = undefined;
  }, []);

  const finishStroke = useCallback((pointerId: number) => {
    const canvas = canvasRef.current;
    const gesture = strokeGestureRef.current;
    if (gesture?.pointerId !== pointerId) return;
    gesture.stroke.commit();
    if (canvas?.hasPointerCapture(pointerId)) {
      canvas.releasePointerCapture(pointerId);
    }
    strokeGestureRef.current = undefined;
  }, []);

  useEffect(
    () => registerActiveEditorInteraction(cancelStroke),
    [cancelStroke],
  );

  useEffect(() => {
    const handleWindowBlur = () => {
      spacePressedRef.current = false;
      finishPan();
      cancelStroke();
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [cancelStroke, finishPan]);

  const requestToolChange = useCallback(
    (tool: EditorTool) => {
      cancelStroke();
      setActiveEditorTool(tool);
    },
    [cancelStroke],
  );

  useEffect(() => {
    const handleToolShortcut = (event: KeyboardEvent) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableKeyboardTarget(event.target)
      ) {
        return;
      }
      const tool = editorToolFromShortcut(event.key);
      if (tool !== undefined) {
        event.preventDefault();
        requestToolChange(tool);
      }
    };
    window.addEventListener('keydown', handleToolShortcut);
    return () => window.removeEventListener('keydown', handleToolShortcut);
  }, [requestToolChange]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.focus({ preventScroll: true });
    const pointerAction = getPointerAction(
      event.button,
      spacePressedRef.current,
    );

    if (pointerAction === 'pan') {
      event.preventDefault();
      cancelStroke();
      event.currentTarget.setPointerCapture(event.pointerId);
      panGestureRef.current = {
        pointerId: event.pointerId,
        lastClientPoint: { x: event.clientX, y: event.clientY },
      };
      setIsPanning(true);
      return;
    }
    if (pointerAction !== 'edit') return;

    const point = updateHoveredPixel(event.clientX, event.clientY);
    if (point === undefined) return;

    event.preventDefault();
    if (activeTool === 'eyedropper') {
      setSelectedEditorColor(samplePixel(skinDocument, point));
      return;
    }
    if (activeTool === 'fill') {
      fillAt(skinDocument, history, point, selectedColor);
      return;
    }

    const color = activeTool === 'eraser' ? ERASER_COLOR : selectedColor;
    const stroke = beginPixelStroke(history, color, point);
    event.currentTarget.setPointerCapture(event.pointerId);
    strokeGestureRef.current = { pointerId: event.pointerId, stroke };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const panGesture = panGestureRef.current;
    if (panGesture?.pointerId === event.pointerId) {
      const nextClientPoint = { x: event.clientX, y: event.clientY };
      setViewport((current) =>
        panViewport(current, {
          x: nextClientPoint.x - panGesture.lastClientPoint.x,
          y: nextClientPoint.y - panGesture.lastClientPoint.y,
        }),
      );
      panGestureRef.current = {
        pointerId: panGesture.pointerId,
        lastClientPoint: nextClientPoint,
      };
      updateHoveredPixel(event.clientX, event.clientY);
      return;
    }

    const point = updateHoveredPixel(event.clientX, event.clientY);
    const strokeGesture = strokeGestureRef.current;
    if (strokeGesture?.pointerId === event.pointerId) {
      strokeGesture.stroke.extend(point);
      if (!strokeGesture.stroke.isActive) strokeGestureRef.current = undefined;
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    const anchor = logicalPoint(event.clientX, event.clientY);
    if (anchor === undefined) return;

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
  const selectedHex = colorToHex(selectedColor);

  return (
    <section className="editor-workspace" aria-label="2D editor viewport">
      <div className="editor-main">
        <aside className="tool-rail" aria-label="Painting tools">
          <div className="tool-list">
            {TOOLS.map(({ tool, label, shortcut }) => (
              <button
                key={tool}
                type="button"
                className="tool-button"
                aria-label={label}
                aria-pressed={activeTool === tool}
                title={`${label} (${shortcut})`}
                onClick={() => requestToolChange(tool)}
              >
                <ToolIcon tool={tool} />
                <span className="shortcut-hint">{shortcut}</span>
              </button>
            ))}
          </div>

          <div className="color-control" aria-label="Selected paint color">
            <label className="color-swatch" title="RGB color">
              <span className="visually-hidden">Paint color</span>
              <input
                type="color"
                aria-label="Paint color"
                value={selectedHex}
                onChange={(event) =>
                  setSelectedEditorColor(
                    colorFromHex(event.currentTarget.value, selectedColor.a),
                  )
                }
              />
            </label>
            <label className="alpha-control">
              <span>Alpha</span>
              <input
                type="number"
                aria-label="Paint alpha"
                min="0"
                max="255"
                step="1"
                value={selectedColor.a}
                onChange={(event) => {
                  const value = Number.parseInt(event.currentTarget.value, 10);
                  if (Number.isFinite(value)) {
                    setSelectedEditorColor({
                      ...selectedColor,
                      a: Math.min(255, Math.max(0, value)),
                    });
                  }
                }}
              />
            </label>
          </div>
        </aside>

        <div className="canvas-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            className={`skin-canvas${isPanning ? ' is-panning' : ''}`}
            data-tool={activeTool}
            aria-label="2D skin canvas"
            role="img"
            tabIndex={0}
            onBlur={() => {
              spacePressedRef.current = false;
              finishPan();
              cancelStroke();
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
            onPointerCancel={(event) => {
              finishPan(event.pointerId);
              cancelStroke(event.pointerId);
            }}
            onPointerDown={handlePointerDown}
            onPointerLeave={() => setHoveredPixel(undefined)}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => {
              finishPan(event.pointerId);
              finishStroke(event.pointerId);
            }}
            onWheel={handleWheel}
          />
        </div>

        <SkinPreviewPanel document={skinDocument} history={history} />
      </div>

      <footer className="editor-status-bar" aria-label="Editor status">
        <span className="document-name" title={displayName}>
          {displayName}
          {isDirty ? ' •' : ''}
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
        <output className="color-readout" aria-label="Selected RGBA color">
          {selectedHex.toUpperCase()} · A {selectedColor.a}
        </output>
      </footer>
    </section>
  );
}
