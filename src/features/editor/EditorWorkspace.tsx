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
import {
  cancelActiveEditorInteraction,
  registerActiveEditorInteraction,
} from './activeEditorInteraction';
import { ColorFields } from './ColorFields';
import { ColorControls } from './ColorControls';
import { colorToHex } from './colorHex';
import {
  resetEditorColors,
  setActiveColorSlot,
  setEditorColor,
  setActiveEditorTool,
  swapEditorColors,
  useActiveEditorTool,
  useActiveColorSlot,
  usePrimaryEditorColor,
  useSecondaryEditorColor,
} from './editorToolStore';
import {
  getColorShortcutAction,
  getEditorToolShortcut,
  getPointerAction,
} from './editorShortcuts';
import { getToolOptions } from './toolOptions';

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
  const temporaryEyedropperSlotRef = useRef<
    'primary' | 'secondary' | undefined
  >(undefined);
  const fittedDocumentIdRef = useRef<string | undefined>(undefined);
  const size = useElementSize(stageRef);
  const activeTool = useActiveEditorTool();
  const activeColorSlot = useActiveColorSlot();
  const primaryColor = usePrimaryEditorColor();
  const secondaryColor = useSecondaryEditorColor();
  const selectedColor =
    activeColorSlot === 'primary' ? primaryColor : secondaryColor;
  const [viewport, setViewport] = useState(INITIAL_VIEWPORT);
  const [showGrid, setShowGrid] = useState(true);
  const [hoveredPixel, setHoveredPixel] = useState<
    TextureCoordinate | undefined
  >(undefined);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [temporaryEyedropper, setTemporaryEyedropper] = useState(false);

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

  const cancelInteraction = useCallback(() => {
    finishPan();
    cancelStroke();
    spacePressedRef.current = false;
    setIsSpacePressed(false);
    temporaryEyedropperSlotRef.current = undefined;
    setTemporaryEyedropper(false);
  }, [cancelStroke, finishPan]);

  useEffect(
    () => registerActiveEditorInteraction(cancelInteraction),
    [cancelInteraction],
  );

  useEffect(() => {
    const handleWindowBlur = () => {
      spacePressedRef.current = false;
      cancelInteraction();
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [cancelInteraction]);

  const requestToolChange = useCallback((tool: EditorTool) => {
    cancelActiveEditorInteraction();
    setActiveEditorTool(tool);
  }, []);

  useEffect(() => {
    const handleToolShortcut = (event: KeyboardEvent) => {
      const tool = getEditorToolShortcut(event);
      if (tool !== undefined) {
        event.preventDefault();
        requestToolChange(tool);
      }
    };
    window.addEventListener('keydown', handleToolShortcut);
    return () => window.removeEventListener('keydown', handleToolShortcut);
  }, [requestToolChange]);

  useEffect(() => {
    const handleColorShortcut = (event: KeyboardEvent) => {
      const action = getColorShortcutAction(event);
      if (action === undefined) return;
      event.preventDefault();
      if (action === 'swap') {
        swapEditorColors();
      } else {
        resetEditorColors();
      }
    };
    window.addEventListener('keydown', handleColorShortcut);
    return () => window.removeEventListener('keydown', handleColorShortcut);
  }, []);

  useEffect(() => {
    const handleAltDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Alt' &&
        !event.repeat &&
        (activeTool === 'pencil' || activeTool === 'eraser') &&
        document.activeElement === canvasRef.current
      ) {
        event.preventDefault();
        cancelStroke();
        temporaryEyedropperSlotRef.current = activeColorSlot;
        setTemporaryEyedropper(true);
      }
    };
    const handleAltUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        temporaryEyedropperSlotRef.current = undefined;
        setTemporaryEyedropper(false);
      }
    };
    window.addEventListener('keydown', handleAltDown);
    window.addEventListener('keyup', handleAltUp);
    return () => {
      window.removeEventListener('keydown', handleAltDown);
      window.removeEventListener('keyup', handleAltUp);
    };
  }, [activeColorSlot, activeTool, cancelStroke]);

  const effectiveTool: EditorTool = temporaryEyedropper
    ? 'eyedropper'
    : activeTool;

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
    if (
      pointerAction !== 'edit-primary' &&
      pointerAction !== 'edit-secondary'
    ) {
      return;
    }

    const pointerColorSlot =
      pointerAction === 'edit-primary' ? 'primary' : 'secondary';

    const point = updateHoveredPixel(event.clientX, event.clientY);
    if (point === undefined) return;

    event.preventDefault();
    const colorSlot =
      effectiveTool === 'eyedropper'
        ? (temporaryEyedropperSlotRef.current ?? pointerColorSlot)
        : pointerColorSlot;
    const color = colorSlot === 'primary' ? primaryColor : secondaryColor;
    if (effectiveTool === 'eyedropper') {
      const options = getToolOptions('eyedropper');
      if (
        options.sample === 'single-texel' &&
        options.target === 'active-color'
      ) {
        setEditorColor(colorSlot, samplePixel(skinDocument, point));
      }
      return;
    }
    if (effectiveTool === 'fill') {
      const options = getToolOptions('fill');
      if (options.mode === 'contiguous' && options.match === 'exact-rgba') {
        fillAt(skinDocument, history, point, color);
      }
      return;
    }

    const strokeColor =
      effectiveTool === 'eraser' &&
      getToolOptions('eraser').output === 'transparent'
        ? ERASER_COLOR
        : color;
    const stroke = beginPixelStroke(history, strokeColor, point);
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
                aria-keyshortcuts={shortcut}
                data-tooltip={`${label}\n${shortcut}`}
                onClick={() => requestToolChange(tool)}
              >
                <ToolIcon tool={tool} />
                <span className="shortcut-hint">{shortcut}</span>
              </button>
            ))}
          </div>

          <ColorControls
            primaryColor={primaryColor}
            secondaryColor={secondaryColor}
            activeSlot={activeColorSlot}
            onSelectSlot={setActiveColorSlot}
            onChange={setEditorColor}
            onSwap={swapEditorColors}
            onReset={resetEditorColors}
          />
        </aside>

        <div className="canvas-stage" ref={stageRef}>
          <canvas
            ref={canvasRef}
            className={`skin-canvas${isSpacePressed ? ' is-pan-ready' : ''}${isPanning ? ' is-panning' : ''}`}
            data-tool={effectiveTool}
            aria-label="2D skin canvas"
            role="img"
            tabIndex={0}
            onContextMenu={(event) => event.preventDefault()}
            onBlur={() => {
              cancelInteraction();
            }}
            onKeyDown={(event) => {
              if (event.code === 'Space' && !event.repeat) {
                event.preventDefault();
                spacePressedRef.current = true;
                setIsSpacePressed(true);
              }
            }}
            onKeyUp={(event) => {
              if (event.code === 'Space') {
                event.preventDefault();
                spacePressedRef.current = false;
                setIsSpacePressed(false);
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
        <ColorFields
          color={selectedColor}
          colorSlot={activeColorSlot === 'primary' ? 'Primary' : 'Secondary'}
          onChange={(color) => setEditorColor(activeColorSlot, color)}
        />
        <output className="visually-hidden" aria-label="Selected RGBA color">
          {selectedHex.toUpperCase()} · A {selectedColor.a}
        </output>
      </footer>
    </section>
  );
}
