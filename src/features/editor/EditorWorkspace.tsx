import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';

import type { SkinDocument } from '../../engine/document';
import type { DocumentHistory } from '../../engine/history';
import type { SymmetryEditOptions } from '../../engine/symmetry';
import {
  SelectionController,
  selectionRectContainsPoint,
  type BodyPartTransferRequest,
  type SelectionState,
} from '../../engine/selection';
import {
  formatTextureSemantic,
  getBodyPartTextureBounds,
  getFaceRegion,
  getTextureFocusBounds,
  queryTextureSemantic,
  sameSkinSemanticTarget,
  skinSemanticTargetKey,
  type BodyPart,
  type SkinLayer,
  type SkinSemanticTarget,
  type TextureFocusTarget,
  type TextureLayerFilter,
} from '../../engine/minecraft-skin-spec';
import {
  beginAdvancedPaintStroke,
  ERASER_COLOR,
  beginPixelStroke,
  fillAt,
  isAdvancedPaintTool,
  samplePixel,
  type AdvancedPaintStroke,
  type EditorTool,
  type PixelStroke,
} from '../../engine/tools';
import {
  VIEWPORT_ZOOM_BUTTON_FACTOR,
  clientToLogicalPoint,
  fitViewportToRegion,
  fitViewportToView,
  panViewport,
  screenToTexture,
  screenToTextureClamped,
  zoomViewportAroundPoint,
  type Point,
  type TextureCoordinate,
  type ViewportState,
} from '../../engine/viewport';
import { renderSkinCanvas } from '../../renderers/canvas2d';
import { SkinPreviewPanel } from '../preview/SkinPreviewPanel';
import type { SkinViewState } from '../preview/skinViewState';
import {
  COLLAPSED_PANEL_SIZE,
  CollapsedWorkspacePanel,
  DEFAULT_WORKSPACE_LAYOUT,
  TOOL_RAIL_WIDTH,
  WORKSPACE_SPLITTER_SIZE,
  WorkspaceSplitter,
  clampWorkspaceDimension,
  getRightPanelWidthBounds,
  useElementSize,
} from '../workspace';
import {
  cancelActiveEditorInteraction,
  registerActiveEditorCommandHandler,
  registerActiveEditorInteraction,
  type ActiveEditorCommand,
} from './activeEditorInteraction';
import { ColorFields } from './ColorFields';
import { colorToHex } from './colorHex';
import {
  resetEditorColors,
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
import { getSymmetryMode } from './symmetryStore';
import { UvCanvasControls } from './UvCanvasControls';

interface EditorWorkspaceProps {
  readonly document: SkinDocument;
  readonly history: DocumentHistory;
  readonly displayName: string;
  readonly isDirty: boolean;
  readonly rightPanelWidth?: number;
  readonly rightPanelCollapsed?: boolean;
  readonly rightInspectorHeight?: number;
  readonly onRightPanelWidthChange?: (value: number) => void;
  readonly onRightPanelCollapse?: () => void;
  readonly onRightPanelRestore?: () => void;
  readonly onRightInspectorHeightChange?: (value: number) => void;
}

interface PanGesture {
  readonly pointerId: number;
  readonly lastClientPoint: Point;
}

interface StrokeGesture {
  readonly pointerId: number;
  readonly stroke: PixelStroke | AdvancedPaintStroke;
}

interface SelectionGesture {
  readonly pointerId: number;
  readonly mode: 'select' | 'move';
}

interface ToolDefinition {
  readonly tool: EditorTool;
  readonly label: string;
  readonly shortcut: string;
}

const TOOLS: readonly ToolDefinition[] = [
  { tool: 'selection', label: 'Selection', shortcut: 'S' },
  { tool: 'pencil', label: 'Pencil', shortcut: 'P' },
  { tool: 'eraser', label: 'Eraser', shortcut: 'E' },
  { tool: 'fill', label: 'Fill', shortcut: 'G' },
  { tool: 'eyedropper', label: 'Eyedropper', shortcut: 'I' },
  { tool: 'lighten', label: 'Lighten', shortcut: 'L' },
  { tool: 'darken', label: 'Darken', shortcut: 'K' },
  { tool: 'noise', label: 'Noise', shortcut: 'N' },
  { tool: 'stamp', label: 'Stamp', shortcut: 'T' },
];

const INITIAL_VIEWPORT: ViewportState = { zoom: 1, offsetX: 0, offsetY: 0 };
const WHEEL_ZOOM_SENSITIVITY = 0.0015;

function symmetryOptions(document: SkinDocument): SymmetryEditOptions {
  return { mode: getSymmetryMode(), model: document.model };
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

  if (tool === 'selection') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path {...common} d="M3.5 3.5h13v13h-13z" />
        <path
          {...common}
          d="M6.5 3.5v-1M10 3.5v-1M13.5 3.5v-1M6.5 16.5v1M10 16.5v1M13.5 16.5v1M3.5 6.5h-1M3.5 10h-1M3.5 13.5h-1M16.5 6.5h1M16.5 10h1M16.5 13.5h1"
        />
      </svg>
    );
  }
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
  if (tool === 'eyedropper') {
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
  if (tool === 'lighten') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle {...common} cx="10" cy="10" r="3.2" />
        <path
          {...common}
          d="M10 1.8v2.4M10 15.8v2.4M1.8 10h2.4M15.8 10h2.4M4.2 4.2l1.7 1.7M14.1 14.1l1.7 1.7M15.8 4.2l-1.7 1.7M5.9 14.1l-1.7 1.7"
        />
      </svg>
    );
  }
  if (tool === 'darken') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          {...common}
          d="M14.8 3.3A6.7 6.7 0 1 0 16.7 14 6.7 6.7 0 0 1 14.8 3.3Z"
        />
        <path {...common} d="M4.1 15.9 2.7 17.3" />
      </svg>
    );
  }
  if (tool === 'noise') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          {...common}
          d="M4 4h2v2H4zM9 8h2v2H9zM14 4h2v2h-2zM4 14h2v2H4zM14 14h2v2h-2z"
        />
      </svg>
    );
  }
  if (tool === 'stamp') {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          {...common}
          d="M6 3.5h8v4.2l1.8 2.2v2.1H4.2V9.9L6 7.7V3.5ZM3 16.5h14M6.5 12v2.1M13.5 12v2.1"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path {...common} d="M4 4h12v12H4zM4 8h12M8 4v12" />
    </svg>
  );
}

interface BodyTransferOption {
  readonly value: string;
  readonly label: string;
  readonly source: BodyPartTransferRequest['source'];
  readonly target: BodyPartTransferRequest['target'];
}

const BODY_TRANSFER_OPTIONS: readonly BodyTransferOption[] = [
  {
    value: 'right-arm-to-left-arm',
    label: 'Right Arm → Left Arm',
    source: 'rightArm',
    target: 'leftArm',
  },
  {
    value: 'left-arm-to-right-arm',
    label: 'Left Arm → Right Arm',
    source: 'leftArm',
    target: 'rightArm',
  },
  {
    value: 'right-leg-to-left-leg',
    label: 'Right Leg → Left Leg',
    source: 'rightLeg',
    target: 'leftLeg',
  },
  {
    value: 'left-leg-to-right-leg',
    label: 'Left Leg → Right Leg',
    source: 'leftLeg',
    target: 'rightLeg',
  },
];

type BodyTransferOptionValue = (typeof BODY_TRANSFER_OPTIONS)[number]['value'];

interface SelectionTransformMenuProps {
  readonly controller: SelectionController;
  readonly selectionState: SelectionState;
}

function SelectionTransformMenu({
  controller,
  selectionState,
}: SelectionTransformMenuProps) {
  const [transferLayer, setTransferLayer] = useState<SkinLayer>('base');
  const [transferOptionValue, setTransferOptionValue] =
    useState<BodyTransferOptionValue>(BODY_TRANSFER_OPTIONS[0]!.value);

  if (
    (selectionState.selection === undefined &&
      selectionState.floating === undefined) ||
    selectionState.draft !== undefined
  ) {
    return null;
  }

  const isFloating = selectionState.floating !== undefined;
  const transferOption = BODY_TRANSFER_OPTIONS.find(
    (option) => option.value === transferOptionValue,
  )!;

  return (
    <div
      className="selection-transform-menu"
      data-testid="selection-transform-menu"
      role="group"
      aria-label="Selection transformations"
    >
      <span className="selection-transform-menu__label">
        {isFloating ? 'Floating' : 'Selection'}
      </span>
      <button
        type="button"
        aria-label="Flip Horizontal"
        title="Flip selection horizontally"
        onClick={() => controller.flipHorizontal()}
      >
        Flip H
      </button>
      <button
        type="button"
        aria-label="Flip Vertical"
        title="Flip selection vertically"
        onClick={() => controller.flipVertical()}
      >
        Flip V
      </button>
      {isFloating ? null : (
        <>
          <button
            type="button"
            aria-label="Duplicate selection"
            title="Duplicate selection as a movable copy"
            aria-keyshortcuts="Control+D"
            onClick={() => controller.beginDuplicate()}
          >
            Duplicate
          </button>
          <details className="selection-transform-menu__transfer">
            <summary>Transfer</summary>
            <div className="selection-transform-menu__transfer-panel">
              <label>
                <span>Layer</span>
                <select
                  aria-label="Transfer layer"
                  value={transferLayer}
                  onChange={(event) => {
                    const layer = event.currentTarget.value;
                    if (layer === 'base' || layer === 'outer') {
                      setTransferLayer(layer);
                    }
                  }}
                >
                  <option value="base">Base only</option>
                  <option value="outer">Outer only</option>
                </select>
              </label>
              <label>
                <span>Pair</span>
                <select
                  aria-label="Body transfer pair"
                  value={transferOptionValue}
                  onChange={(event) => {
                    const value = event.currentTarget
                      .value as BodyTransferOptionValue;
                    if (
                      BODY_TRANSFER_OPTIONS.some(
                        (option) => option.value === value,
                      )
                    ) {
                      setTransferOptionValue(value);
                    }
                  }}
                >
                  {BODY_TRANSFER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                aria-label={`Transfer ${transferOption.label}`}
                onClick={() =>
                  controller.transferBodyPart({
                    source: transferOption.source,
                    target: transferOption.target,
                    layer: transferLayer,
                  })
                }
              >
                Apply
              </button>
            </div>
          </details>
        </>
      )}
    </div>
  );
}

export function EditorWorkspace({
  document: skinDocument,
  history,
  displayName,
  isDirty,
  rightPanelWidth = DEFAULT_WORKSPACE_LAYOUT.rightPanelWidth,
  rightPanelCollapsed = DEFAULT_WORKSPACE_LAYOUT.rightCollapsed,
  rightInspectorHeight = DEFAULT_WORKSPACE_LAYOUT.rightInspectorHeight,
  onRightPanelWidthChange,
  onRightPanelCollapse,
  onRightPanelRestore,
  onRightInspectorHeightChange,
}: EditorWorkspaceProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const editorMainRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderFrameRef = useRef<number | undefined>(undefined);
  const panGestureRef = useRef<PanGesture | undefined>(undefined);
  const strokeGestureRef = useRef<StrokeGesture | undefined>(undefined);
  const selectionGestureRef = useRef<SelectionGesture | undefined>(undefined);
  const spacePressedRef = useRef(false);
  const temporaryEyedropperSlotRef = useRef<
    'primary' | 'secondary' | undefined
  >(undefined);
  const fittedDocumentIdRef = useRef<string | undefined>(undefined);
  const selectionController = useMemo(
    () => new SelectionController(skinDocument, history),
    [history, skinDocument],
  );
  const selectionState = useSyncExternalStore(
    (listener) => selectionController.subscribe(listener),
    () => selectionController.getState(),
    () => selectionController.getState(),
  );
  const size = useElementSize(stageRef);
  const editorMainSize = useElementSize(editorMainRef);
  const activeTool = useActiveEditorTool();
  const activeColorSlot = useActiveColorSlot();
  const primaryColor = usePrimaryEditorColor();
  const secondaryColor = useSecondaryEditorColor();
  const selectedColor =
    activeColorSlot === 'primary' ? primaryColor : secondaryColor;
  const [viewport, setViewport] = useState(INITIAL_VIEWPORT);
  const [showGrid, setShowGrid] = useState(true);
  const [showUvOverlay, setShowUvOverlay] = useState(false);
  const [uvLayer, setUvLayer] = useState<TextureLayerFilter>('both');
  const [focusTarget, setFocusTarget] = useState<TextureFocusTarget>('whole');
  const [hoveredPixel, setHoveredPixel] = useState<
    TextureCoordinate | undefined
  >(undefined);
  const [hovered3DTarget, setHovered3DTarget] = useState<
    SkinSemanticTarget | undefined
  >(undefined);
  const [selectedSemanticTarget, setSelectedSemanticTarget] = useState<
    SkinSemanticTarget | undefined
  >(undefined);
  const [isolatedBodyPart, setIsolatedBodyPart] = useState<
    BodyPart | undefined
  >(undefined);
  const isolatedBodyPartRef = useRef<BodyPart | undefined>(undefined);
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const [temporaryEyedropper, setTemporaryEyedropper] = useState(false);

  const handleSemanticHoverChange = useCallback(
    (target: SkinSemanticTarget | undefined) => {
      setHovered3DTarget((current) =>
        sameSkinSemanticTarget(current, target) ? current : target,
      );
    },
    [],
  );
  const rightPanelBounds = getRightPanelWidthBounds(editorMainSize.width);
  const effectiveRightPanelWidth = rightPanelCollapsed
    ? COLLAPSED_PANEL_SIZE
    : clampWorkspaceDimension(rightPanelWidth, rightPanelBounds);

  const fitToView = useCallback(() => {
    if (size.width <= 0 || size.height <= 0) return;
    setViewport(fitViewportToView(size, skinDocument));
    setFocusTarget('whole');
    setHoveredPixel(undefined);
  }, [size, skinDocument]);

  const focusCanvas = useCallback(
    (target: TextureFocusTarget, layer: TextureLayerFilter = uvLayer) => {
      cancelActiveEditorInteraction();
      setFocusTarget(target);
      setHoveredPixel(undefined);
      if (
        target === 'head' ||
        target === 'torso' ||
        target === 'rightArm' ||
        target === 'leftArm' ||
        target === 'rightLeg' ||
        target === 'leftLeg'
      ) {
        setSelectedSemanticTarget({
          model: skinDocument.model,
          bodyPart: target,
          layer: layer === 'outer' ? 'outer' : 'base',
          face: 'front',
        });
      } else {
        setSelectedSemanticTarget(undefined);
      }
      if (size.width <= 0 || size.height <= 0) return;
      setViewport(
        fitViewportToRegion(
          size,
          getTextureFocusBounds({
            model: skinDocument.model,
            target,
            layer,
          }),
        ),
      );
    },
    [size, skinDocument.model, uvLayer],
  );

  const focusSemanticTarget = useCallback(
    (target: SkinSemanticTarget) => {
      if (target.model !== skinDocument.model) return;
      cancelActiveEditorInteraction();
      setSelectedSemanticTarget(target);
      setFocusTarget(target.bodyPart);
      setUvLayer(target.layer);
      setHoveredPixel(undefined);
      if (size.width <= 0 || size.height <= 0) return;
      setViewport(fitViewportToRegion(size, getFaceRegion(target)));
    },
    [size, skinDocument.model],
  );

  const handlePreviewViewStateChange = useCallback(
    (state: SkinViewState) => {
      const previous = isolatedBodyPartRef.current;
      isolatedBodyPartRef.current = state.isolatedBodyPart;
      setIsolatedBodyPart(state.isolatedBodyPart);
      if (previous === state.isolatedBodyPart) return;

      setHoveredPixel(undefined);
      setHovered3DTarget(undefined);
      if (state.isolatedBodyPart === undefined) {
        setSelectedSemanticTarget(undefined);
        setFocusTarget('whole');
        if (size.width > 0 && size.height > 0) {
          setViewport(fitViewportToView(size, skinDocument));
        }
        return;
      }

      const layer: SkinLayer = state.layers.outer ? 'outer' : 'base';
      setSelectedSemanticTarget({
        model: skinDocument.model,
        bodyPart: state.isolatedBodyPart,
        layer,
        face: 'front',
      });
      setFocusTarget(state.isolatedBodyPart);
      setUvLayer(layer);
      if (size.width > 0 && size.height > 0) {
        setViewport(
          fitViewportToRegion(
            size,
            getBodyPartTextureBounds({
              model: skinDocument.model,
              bodyPart: state.isolatedBodyPart,
              layer,
            }),
          ),
        );
      }
    },
    [size, skinDocument],
  );

  const clearSemanticState = useCallback(() => {
    setHoveredPixel(undefined);
    setHovered3DTarget(undefined);
    setSelectedSemanticTarget(undefined);
  }, []);

  const handleUvLayerChange = useCallback(
    (layer: TextureLayerFilter) => {
      setUvLayer(layer);
      focusCanvas(focusTarget, layer);
    },
    [focusCanvas, focusTarget],
  );

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

  const hoveredSemantic =
    hoveredPixel === undefined
      ? undefined
      : queryTextureSemantic({
          model: skinDocument.model,
          x: hoveredPixel.x,
          y: hoveredPixel.y,
          layer: 'both',
        });

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (canvas === null || size.width <= 0 || size.height <= 0) return;
    renderSkinCanvas(canvas, skinDocument, viewport, size, {
      showGrid,
      pixelRatio: window.devicePixelRatio || 1,
      selection: selectionState,
      uvOverlay: showUvOverlay ? { layer: uvLayer } : undefined,
      semanticHighlight: hovered3DTarget,
      semanticSelection: selectedSemanticTarget,
      isolatedBodyPart,
    });
  }, [
    selectionState,
    showGrid,
    showUvOverlay,
    size,
    skinDocument,
    hovered3DTarget,
    isolatedBodyPart,
    selectedSemanticTarget,
    uvLayer,
    viewport,
  ]);

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

  const clampedTexturePoint = useCallback(
    (clientX: number, clientY: number): TextureCoordinate | undefined => {
      const point = logicalPoint(clientX, clientY);
      return point === undefined
        ? undefined
        : screenToTextureClamped(point, viewport, skinDocument);
    },
    [logicalPoint, skinDocument, viewport],
  );

  const updateHoveredPixel = useCallback(
    (clientX: number, clientY: number) => {
      const next = texturePoint(clientX, clientY);
      setHovered3DTarget((current) =>
        current === undefined ? current : undefined,
      );
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

  const finishSelection = useCallback(
    (pointerId: number) => {
      const canvas = canvasRef.current;
      const gesture = selectionGestureRef.current;
      if (gesture?.pointerId !== pointerId) return;
      if (gesture.mode === 'select') selectionController.commitSelection();
      if (canvas?.hasPointerCapture(pointerId)) {
        canvas.releasePointerCapture(pointerId);
      }
      selectionGestureRef.current = undefined;
    },
    [selectionController],
  );

  const cancelSelectionGesture = useCallback(
    (pointerId?: number) => {
      const canvas = canvasRef.current;
      const gesture = selectionGestureRef.current;
      if (
        gesture === undefined ||
        (pointerId !== undefined && gesture.pointerId !== pointerId)
      ) {
        return;
      }
      if (gesture.mode === 'select') {
        selectionController.cancelSelection();
      } else {
        selectionController.cancelFloating();
      }
      if (canvas?.hasPointerCapture(gesture.pointerId)) {
        canvas.releasePointerCapture(gesture.pointerId);
      }
      selectionGestureRef.current = undefined;
    },
    [selectionController],
  );

  const cancelInteraction = useCallback(() => {
    finishPan();
    cancelStroke();
    cancelSelectionGesture();
    selectionController.cancelTransient();
    setHoveredPixel(undefined);
    spacePressedRef.current = false;
    setIsSpacePressed(false);
    temporaryEyedropperSlotRef.current = undefined;
    setTemporaryEyedropper(false);
  }, [cancelSelectionGesture, cancelStroke, finishPan, selectionController]);

  useEffect(
    () => registerActiveEditorInteraction(cancelInteraction),
    [cancelInteraction],
  );

  const executeSelectionCommand = useCallback(
    (command: ActiveEditorCommand) => {
      if (command === 'copy') {
        selectionController.copy();
      } else if (command === 'cut') {
        selectionController.cut();
      } else if (command === 'paste') {
        selectionController.beginPaste();
      } else {
        selectionController.delete();
      }
    },
    [selectionController],
  );

  useEffect(
    () => registerActiveEditorCommandHandler(executeSelectionCommand),
    [executeSelectionCommand],
  );

  useEffect(() => () => selectionController.clear(), [selectionController]);

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

  const handleCanvasKeyDown = (
    event: ReactKeyboardEvent<HTMLCanvasElement>,
  ) => {
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      spacePressedRef.current = true;
      setIsSpacePressed(true);
      return;
    }

    const hasSelection =
      selectionState.selection !== undefined ||
      selectionState.draft !== undefined ||
      selectionState.floating !== undefined;
    const commandKey = event.key.toLowerCase();
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      (commandKey === 'c' || commandKey === 'x' || commandKey === 'v')
    ) {
      const command: ActiveEditorCommand =
        commandKey === 'c' ? 'copy' : commandKey === 'x' ? 'cut' : 'paste';
      if (command !== 'paste' ? hasSelection : selectionController.canPaste()) {
        event.preventDefault();
        executeSelectionCommand(command);
      }
      return;
    }

    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      commandKey === 'd' &&
      selectionState.selection !== undefined &&
      selectionState.draft === undefined &&
      selectionState.floating === undefined
    ) {
      event.preventDefault();
      selectionController.beginDuplicate();
      return;
    }

    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key === 'Delete' &&
      hasSelection
    ) {
      event.preventDefault();
      executeSelectionCommand('delete');
      return;
    }

    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key === 'Escape' &&
      (selectionState.draft !== undefined ||
        selectionState.floating !== undefined)
    ) {
      event.preventDefault();
      selectionController.cancelTransient();
      return;
    }

    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      event.key === 'Enter' &&
      selectionState.floating !== undefined
    ) {
      event.preventDefault();
      selectionController.commitFloating();
      return;
    }

    if (
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      selectionState.floating !== undefined
    ) {
      const delta =
        event.key === 'ArrowLeft'
          ? { x: -1, y: 0 }
          : event.key === 'ArrowRight'
            ? { x: 1, y: 0 }
            : event.key === 'ArrowUp'
              ? { x: 0, y: -1 }
              : event.key === 'ArrowDown'
                ? { x: 0, y: 1 }
                : undefined;
      if (delta !== undefined) {
        event.preventDefault();
        selectionController.moveFloatingBy(delta);
      }
    }
  };

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

    if (effectiveTool === 'selection') {
      if (pointerAction !== 'edit-primary') return;
      const point = clampedTexturePoint(event.clientX, event.clientY);
      if (point === undefined) return;
      updateHoveredPixel(event.clientX, event.clientY);

      event.preventDefault();
      let mode: SelectionGesture['mode'] = 'select';
      if (selectionState.floating !== undefined) {
        if (
          selectionRectContainsPoint(selectionState.floating.rect, point) &&
          selectionController.beginFloatingDrag(point)
        ) {
          mode = 'move';
        } else {
          selectionController.commitFloating();
          selectionController.beginSelection(point);
        }
      } else if (
        selectionState.selection !== undefined &&
        selectionRectContainsPoint(selectionState.selection, point) &&
        selectionController.beginMove(point)
      ) {
        mode = 'move';
      } else {
        selectionController.beginSelection(point);
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      selectionGestureRef.current = { pointerId: event.pointerId, mode };
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
        fillAt(
          skinDocument,
          history,
          point,
          color,
          'Fill',
          symmetryOptions(skinDocument),
        );
      }
      return;
    }

    if (isAdvancedPaintTool(effectiveTool)) {
      const stroke = beginAdvancedPaintStroke(
        skinDocument,
        history,
        effectiveTool,
        getToolOptions(effectiveTool),
        { primary: primaryColor, secondary: secondaryColor },
        point,
        undefined,
        symmetryOptions(skinDocument),
      );
      event.currentTarget.setPointerCapture(event.pointerId);
      strokeGestureRef.current = { pointerId: event.pointerId, stroke };
      return;
    }

    const strokeColor =
      effectiveTool === 'eraser' &&
      getToolOptions('eraser').output === 'transparent'
        ? ERASER_COLOR
        : color;
    const stroke = beginPixelStroke(
      history,
      strokeColor,
      point,
      effectiveTool === 'eraser' ? 'Eraser Stroke' : 'Pencil Stroke',
      symmetryOptions(skinDocument),
    );
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
    const selectionGesture = selectionGestureRef.current;
    if (selectionGesture?.pointerId === event.pointerId) {
      const dragPoint = clampedTexturePoint(event.clientX, event.clientY);
      if (dragPoint !== undefined) {
        if (selectionGesture.mode === 'select') {
          selectionController.updateSelection(dragPoint);
        } else {
          selectionController.moveFloatingFromPointer(dragPoint);
        }
      }
      return;
    }
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
  const semanticReadout =
    hoveredPixel === undefined ? '—' : formatTextureSemantic(hoveredSemantic);
  const visibleSelection =
    selectionState.floating?.rect ??
    selectionState.draft ??
    selectionState.selection;
  const selectionRectAttribute =
    visibleSelection === undefined
      ? undefined
      : `${visibleSelection.x},${visibleSelection.y},${visibleSelection.width},${visibleSelection.height}`;

  return (
    <section className="editor-workspace" aria-label="2D editor viewport">
      <div
        ref={editorMainRef}
        className="editor-main"
        style={{
          gridTemplateColumns: `${TOOL_RAIL_WIDTH}px minmax(0, 1fr) ${WORKSPACE_SPLITTER_SIZE}px ${effectiveRightPanelWidth}px`,
        }}
      >
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
        </aside>

        <div className="canvas-stage" ref={stageRef}>
          <UvCanvasControls
            showUvOverlay={showUvOverlay}
            layer={uvLayer}
            focusTarget={focusTarget}
            onToggleUvOverlay={() => setShowUvOverlay((current) => !current)}
            onLayerChange={handleUvLayerChange}
            onFocusChange={focusCanvas}
          />
          <canvas
            ref={canvasRef}
            className={`skin-canvas${isSpacePressed ? ' is-pan-ready' : ''}${isPanning ? ' is-panning' : ''}`}
            data-tool={effectiveTool}
            data-uv-overlay={showUvOverlay ? 'visible' : 'hidden'}
            data-uv-layer={uvLayer}
            data-focus-target={focusTarget}
            data-semantic-highlight={
              hovered3DTarget === undefined
                ? undefined
                : skinSemanticTargetKey(hovered3DTarget)
            }
            data-semantic-selection={
              selectedSemanticTarget === undefined
                ? undefined
                : skinSemanticTargetKey(selectedSemanticTarget)
            }
            data-isolated-body-part={isolatedBodyPart}
            data-selection-rect={selectionRectAttribute}
            data-selection-state={
              selectionState.floating !== undefined
                ? 'floating'
                : selectionState.draft !== undefined
                  ? 'selecting'
                  : selectionState.selection === undefined
                    ? 'empty'
                    : 'selected'
            }
            aria-label="2D skin canvas"
            role="img"
            tabIndex={0}
            onContextMenu={(event) => event.preventDefault()}
            onBlur={(event) => {
              const nextFocused = event.relatedTarget;
              if (
                nextFocused instanceof Node &&
                event.currentTarget.parentElement?.contains(nextFocused)
              ) {
                return;
              }
              cancelInteraction();
            }}
            onKeyDown={handleCanvasKeyDown}
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
              cancelSelectionGesture(event.pointerId);
            }}
            onPointerDown={handlePointerDown}
            onPointerLeave={() => setHoveredPixel(undefined)}
            onPointerMove={handlePointerMove}
            onPointerUp={(event) => {
              finishPan(event.pointerId);
              finishStroke(event.pointerId);
              finishSelection(event.pointerId);
            }}
            onWheel={handleWheel}
          />
          <SelectionTransformMenu
            controller={selectionController}
            selectionState={selectionState}
          />
          {selectionState.floating === undefined ? null : (
            <div
              className="selection-floating-actions"
              data-testid="selection-floating-actions"
              role="group"
              aria-label="Floating selection actions"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  selectionController.cancelFloating();
                }
              }}
            >
              <span>
                {selectionState.floating.kind === 'move'
                  ? 'Moving selection'
                  : selectionState.floating.kind === 'duplicate'
                    ? 'Duplicated selection'
                    : 'Pasted selection'}{' '}
                · {selectionState.floating.rect.width}×
                {selectionState.floating.rect.height}
              </span>
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => selectionController.commitFloating()}
              >
                Commit
              </button>
              <button
                type="button"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => selectionController.cancelFloating()}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        <WorkspaceSplitter
          axis="vertical"
          value={effectiveRightPanelWidth}
          bounds={rightPanelBounds}
          deltaSign={-1}
          label="Resize 3D Preview"
          controls="right-preview-panel"
          disabled={rightPanelCollapsed}
          testId="workspace-splitter-right"
          onChange={(value) => onRightPanelWidthChange?.(value)}
        />

        <div
          className={`workspace-side-slot workspace-side-slot--right${rightPanelCollapsed ? ' is-collapsed' : ''}`}
        >
          <SkinPreviewPanel
            document={skinDocument}
            history={history}
            displayName={displayName}
            rightInspectorHeight={rightInspectorHeight}
            onInspectorHeightChange={onRightInspectorHeightChange}
            onCollapse={onRightPanelCollapse}
            canvasHoverTarget={hoveredSemantic}
            selectedTarget={selectedSemanticTarget}
            onSemanticHoverChange={handleSemanticHoverChange}
            onSemanticFocus={focusSemanticTarget}
            onSelectSemanticTarget={focusSemanticTarget}
            onViewStateChange={handlePreviewViewStateChange}
            onClearSemanticState={clearSemanticState}
          />
          <CollapsedWorkspacePanel
            side="right"
            panelLabel="3D Preview"
            shortLabel="3D"
            onRestore={() => onRightPanelRestore?.()}
          />
        </div>
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
        <div className="canvas-status-readout">
          <output
            className="coordinate-readout"
            aria-label="Texture coordinates"
          >
            X: {hoveredPixel?.x ?? '—'}&nbsp;&nbsp; Y: {hoveredPixel?.y ?? '—'}
          </output>
          <output
            className="semantic-readout"
            aria-label="Canvas semantic"
            data-testid="canvas-semantic"
          >
            {semanticReadout}
          </output>
        </div>
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
