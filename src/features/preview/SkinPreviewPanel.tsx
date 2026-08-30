import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { RgbaColor, SkinDocument, SkinModel } from '../../engine/document';
import type { DocumentHistory } from '../../engine/history';
import { isAdvancedPaintTool, type EditorTool } from '../../engine/tools';
import {
  BODY_PARTS,
  type BodyPart,
  type SkinLayer,
  type SkinSemanticTarget,
} from '../../engine/minecraft-skin-spec';
import {
  SkinPreviewRenderer,
  type SkinPickResult,
} from '../../renderers/three';
import {
  cancelActiveEditorInteraction,
  registerActiveEditorInteraction,
} from '../editor/activeEditorInteraction';
import {
  setEditorColor,
  type ColorSlot,
  useActiveEditorTool,
  useActiveColorSlot,
  usePrimaryEditorColor,
  useSecondaryEditorColor,
} from '../editor/editorToolStore';
import { HistoryTimeline } from '../history/HistoryTimeline';
import { changeSkinModel } from './modelSelection';
import {
  createDefaultSkinViewState,
  isolateBodyPart,
  restoreAllVisibility,
  setBodyPartVisibility,
  setLayerVisibility,
  type SkinViewState,
} from './skinViewState';
import {
  isThreeDInspectAction,
  ThreeDToolInteraction,
} from './threeDToolInteraction';
import {
  createPopoutPreviewState,
  isPopoutBoundTo,
  openPopoutPreview,
  publishPopoutPreview,
  savePreviewSnapshot,
} from './popoutPreviewController';
import {
  DEFAULT_WORKSPACE_LAYOUT,
  WORKSPACE_SPLITTER_SIZE,
  WorkspaceSplitter,
  clampWorkspaceDimension,
  getRightInspectorHeightBounds,
  useElementSize,
} from '../workspace';

interface SkinPreviewPanelProps {
  readonly document: SkinDocument;
  readonly history: DocumentHistory;
  readonly displayName: string;
  readonly rightInspectorHeight?: number;
  readonly onInspectorHeightChange?: (value: number) => void;
  readonly onCollapse?: () => void;
  readonly canvasHoverTarget?: SkinSemanticTarget;
  readonly selectedTarget?: SkinSemanticTarget;
  readonly onSemanticHoverChange?: (
    target: SkinSemanticTarget | undefined,
  ) => void;
  readonly onSemanticFocus?: (target: SkinSemanticTarget) => void;
  readonly onSelectSemanticTarget?: (target: SkinSemanticTarget) => void;
  readonly onViewStateChange?: (state: SkinViewState) => void;
  readonly onClearSemanticState?: () => void;
}

const MODEL_OPTIONS: readonly {
  readonly model: SkinModel;
  readonly label: string;
}[] = [
  { model: 'classic', label: 'Classic' },
  { model: 'slim', label: 'Slim' },
];

const BODY_PART_LABELS: Readonly<Record<SkinPickResult['bodyPart'], string>> = {
  head: 'Head',
  torso: 'Torso',
  rightArm: 'Right Arm',
  leftArm: 'Left Arm',
  rightLeg: 'Right Leg',
  leftLeg: 'Left Leg',
};

const LAYER_LABELS: Readonly<Record<SkinPickResult['layer'], string>> = {
  base: 'Base',
  outer: 'Outer',
};

const FACE_LABELS: Readonly<Record<SkinPickResult['face'], string>> = {
  top: 'Top',
  bottom: 'Bottom',
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
};

const BODY_PART_OPTIONS: readonly BodyPart[] = BODY_PARTS;

function applyViewState(
  renderer: SkinPreviewRenderer,
  state: SkinViewState,
): void {
  renderer.setBaseVisible(state.layers.base);
  renderer.setOuterVisible(state.layers.outer);
  for (const bodyPart of BODY_PARTS) {
    renderer.setBodyPartVisible(bodyPart, state.bodyParts[bodyPart]);
  }
}

function formatPick(result: SkinPickResult | undefined): string {
  if (result === undefined) return 'Hover the model to inspect a texel';
  return `${BODY_PART_LABELS[result.bodyPart]} · ${LAYER_LABELS[result.layer]} · ${FACE_LABELS[result.face]} · X: ${result.x} Y: ${result.y}`;
}

function snapshotName(displayName: string): string {
  const stem = displayName.replace(/\.png$/i, '') || 'skin';
  return `${stem}-preview.png`;
}

export function SkinPreviewPanel({
  document,
  history,
  displayName,
  rightInspectorHeight,
  onInspectorHeightChange,
  onCollapse,
  canvasHoverTarget,
  selectedTarget,
  onSemanticHoverChange,
  onSemanticFocus,
  onSelectSemanticTarget,
  onViewStateChange,
  onClearSemanticState,
}: SkinPreviewPanelProps) {
  const panelRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SkinPreviewRenderer | undefined>(undefined);
  const panelSize = useElementSize(panelRef);
  const [localInspectorHeight, setLocalInspectorHeight] = useState(
    DEFAULT_WORKSPACE_LAYOUT.rightInspectorHeight,
  );
  const activeTool = useActiveEditorTool();
  const activeColorSlot = useActiveColorSlot();
  const primaryColor = usePrimaryEditorColor();
  const secondaryColor = useSecondaryEditorColor();
  const activeToolRef = useRef<EditorTool>(activeTool);
  const primaryColorRef = useRef<RgbaColor>(primaryColor);
  const secondaryColorRef = useRef<RgbaColor>(secondaryColor);
  const temporaryEyedropperRef = useRef(false);
  const temporaryEyedropperSlotRef = useRef<ColorSlot | undefined>(undefined);
  const interactionRef = useRef<ThreeDToolInteraction | undefined>(undefined);
  const semanticHoverChangeRef = useRef(onSemanticHoverChange);
  const semanticFocusRef = useRef(onSemanticFocus);
  const selectSemanticTargetRef = useRef(onSelectSemanticTarget);
  const viewStateChangeRef = useRef(onViewStateChange);
  const clearSemanticStateRef = useRef(onClearSemanticState);
  const defaultView = useMemo(
    () => ({
      documentId: document.id,
      state: createDefaultSkinViewState(),
    }),
    [document],
  );
  const [viewStateEntry, setViewStateEntry] = useState<{
    readonly documentId: string;
    readonly state: SkinViewState;
  }>(() => defaultView);
  const viewState =
    viewStateEntry.documentId === defaultView.documentId
      ? viewStateEntry.state
      : defaultView.state;
  const [hoveredPick, setHoveredPick] = useState<SkinPickResult | undefined>();
  const [targetLayer, setTargetLayer] = useState<SkinLayer>('base');
  const [temporaryEyedropper, setTemporaryEyedropper] = useState(false);
  const [previewNotice, setPreviewNotice] = useState<string | undefined>();
  const preferredInspectorHeight = rightInspectorHeight ?? localInspectorHeight;
  const inspectorBounds = getRightInspectorHeightBounds(panelSize.height);
  const effectiveInspectorHeight = clampWorkspaceDimension(
    preferredInspectorHeight,
    inspectorBounds,
  );

  useEffect(() => {
    activeToolRef.current = activeTool;
    primaryColorRef.current = primaryColor;
    secondaryColorRef.current = secondaryColor;
    temporaryEyedropperRef.current = temporaryEyedropper;
  }, [
    activeColorSlot,
    activeTool,
    primaryColor,
    secondaryColor,
    temporaryEyedropper,
  ]);

  useEffect(() => {
    semanticHoverChangeRef.current = onSemanticHoverChange;
    semanticFocusRef.current = onSemanticFocus;
    selectSemanticTargetRef.current = onSelectSemanticTarget;
    viewStateChangeRef.current = onViewStateChange;
    clearSemanticStateRef.current = onClearSemanticState;
  }, [
    onClearSemanticState,
    onSemanticFocus,
    onSemanticHoverChange,
    onSelectSemanticTarget,
    onViewStateChange,
  ]);

  const subscribe = useCallback(
    (notify: () => void) => document.subscribeToMutations(notify),
    [document],
  );
  const documentRevision = useSyncExternalStore(
    subscribe,
    () => document.revision,
    () => document.revision,
  );

  useEffect(() => {
    publishPopoutPreview(
      createPopoutPreviewState(document, displayName, documentRevision, {
        bodyParts: viewState.bodyParts,
        layers: viewState.layers,
      }),
    );
  }, [document, displayName, documentRevision, viewState]);

  useEffect(() => {
    const mount = mountRef.current;
    if (mount === null) return;
    const interaction = new ThreeDToolInteraction(
      document,
      history,
      setEditorColor,
    );
    interactionRef.current = interaction;
    const renderer = new SkinPreviewRenderer(mount, document, undefined, {
      onPickChange: (result) => {
        setHoveredPick(result);
        semanticHoverChangeRef.current?.(
          result === undefined
            ? undefined
            : {
                model: result.model,
                bodyPart: result.bodyPart,
                layer: result.layer,
                face: result.face,
              },
        );
      },
      onPointerDown: (event, pick) => {
        if (isThreeDInspectAction(event)) {
          interaction.cancel();
          event.preventDefault();
          if (pick !== undefined) {
            semanticFocusRef.current?.({
              model: pick.model,
              bodyPart: pick.bodyPart,
              layer: pick.layer,
              face: pick.face,
            });
          }
          return;
        }
        const tool = temporaryEyedropperRef.current
          ? 'eyedropper'
          : activeToolRef.current;
        const colorSlot: ColorSlot =
          temporaryEyedropperSlotRef.current ??
          (event.shiftKey ? 'secondary' : 'primary');
        const color =
          colorSlot === 'primary'
            ? primaryColorRef.current
            : secondaryColorRef.current;
        const handled = interaction.pointerDown(
          event.pointerId,
          event.button,
          pick,
          tool,
          color,
          colorSlot,
          {
            primary: primaryColorRef.current,
            secondary: secondaryColorRef.current,
          },
        );
        if (!handled) return;
        event.preventDefault();
        if (
          tool === 'pencil' ||
          tool === 'eraser' ||
          isAdvancedPaintTool(tool)
        ) {
          const canvas = event.currentTarget;
          if (canvas instanceof HTMLCanvasElement) {
            canvas.setPointerCapture(event.pointerId);
          }
        }
      },
      onPointerMove: (event, pick) => {
        interaction.pointerMove(event.pointerId, pick);
      },
      onPointerUp: (event) => {
        interaction.pointerUp(event.pointerId);
        const canvas = event.currentTarget;
        if (
          canvas instanceof HTMLCanvasElement &&
          canvas.hasPointerCapture(event.pointerId)
        ) {
          canvas.releasePointerCapture(event.pointerId);
        }
      },
      onPointerCancel: (event) => {
        interaction.cancel(event.pointerId);
      },
      onPointerLeave: (event) => {
        interaction.pointerMove(event.pointerId, undefined);
      },
    });
    renderer.setEditingTool(activeToolRef.current);
    applyViewState(renderer, defaultView.state);
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = undefined;
      interaction.cancel();
      renderer.cancelPointerInteractions();
      renderer.dispose();
      interactionRef.current = undefined;
      setHoveredPick(undefined);
      semanticHoverChangeRef.current?.(undefined);
    };
  }, [defaultView, document, history]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === undefined) return;
    renderer.setHighlightedTarget(canvasHoverTarget ?? hoveredPick);
  }, [canvasHoverTarget, hoveredPick]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === undefined) return;
    renderer.setSelectedTarget(selectedTarget);
  }, [selectedTarget]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer !== undefined) applyViewState(renderer, viewState);
  }, [viewState]);

  useEffect(() => {
    interactionRef.current?.cancel();
    rendererRef.current?.setEditingTool(activeTool);
  }, [activeTool]);

  useEffect(() => {
    const handleAltDown = (event: KeyboardEvent) => {
      const canvas = rendererRef.current?.getCanvas();
      if (
        event.key === 'Alt' &&
        !event.repeat &&
        (activeTool === 'pencil' || activeTool === 'eraser') &&
        globalThis.document.activeElement === canvas
      ) {
        event.preventDefault();
        interactionRef.current?.cancel();
        temporaryEyedropperRef.current = true;
        temporaryEyedropperSlotRef.current = activeColorSlot;
        setTemporaryEyedropper(true);
        rendererRef.current?.setEditingTool('eyedropper');
      }
    };
    const handleAltUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return;
      temporaryEyedropperRef.current = false;
      temporaryEyedropperSlotRef.current = undefined;
      setTemporaryEyedropper(false);
      rendererRef.current?.setEditingTool(activeToolRef.current);
    };
    window.addEventListener('keydown', handleAltDown);
    window.addEventListener('keyup', handleAltUp);
    return () => {
      window.removeEventListener('keydown', handleAltDown);
      window.removeEventListener('keyup', handleAltUp);
    };
  }, [activeColorSlot, activeTool]);

  useEffect(
    () =>
      registerActiveEditorInteraction(() => {
        interactionRef.current?.cancel();
        rendererRef.current?.cancelPointerInteractions();
      }),
    [],
  );

  const updateViewState = (update: (state: SkinViewState) => SkinViewState) => {
    cancelActiveEditorInteraction();
    clearSemanticStateRef.current?.();
    setViewStateEntry((current) => {
      const state =
        current.documentId === defaultView.documentId
          ? current.state
          : defaultView.state;
      return { documentId: defaultView.documentId, state: update(state) };
    });
  };

  useEffect(() => {
    viewStateChangeRef.current?.(viewState);
  }, [viewState]);

  const targetLayerForSelection =
    selectedTarget?.model === document.model
      ? selectedTarget.layer
      : targetLayer;

  const selectBodyPart = (bodyPart: BodyPart) => {
    selectSemanticTargetRef.current?.({
      model: document.model,
      bodyPart,
      layer: targetLayerForSelection,
      face: 'front',
    });
  };

  const selectTargetLayer = (layer: SkinLayer) => {
    setTargetLayer(layer);
    if (
      selectedTarget !== undefined &&
      selectedTarget.model === document.model
    ) {
      selectSemanticTargetRef.current?.({ ...selectedTarget, layer });
    }
  };

  const handleOpenPopout = async () => {
    setPreviewNotice(undefined);
    const result = await openPopoutPreview(
      createPopoutPreviewState(document, displayName, documentRevision, {
        bodyParts: viewState.bodyParts,
        layers: viewState.layers,
      }),
    );
    if (result.status === 'error') {
      setPreviewNotice(result.error.message);
    } else if (
      result.status === 'already_open' &&
      !isPopoutBoundTo(document.id)
    ) {
      setPreviewNotice('The pop-out is already bound to another document.');
    }
  };

  const handleSnapshot = async () => {
    setPreviewNotice(undefined);
    const dataUrl = rendererRef.current?.captureSnapshot();
    if (dataUrl === undefined) {
      setPreviewNotice('The 3D preview could not produce a PNG snapshot.');
      return;
    }
    const result = await savePreviewSnapshot({
      suggestedName: snapshotName(displayName),
      dataUrl,
    });
    if (result.status === 'error') {
      setPreviewNotice(result.error.message);
    } else if (result.status === 'success') {
      setPreviewNotice(`Snapshot saved as ${result.displayName}.`);
    }
  };

  const handleInspectorHeightChange = (value: number) => {
    if (onInspectorHeightChange === undefined) {
      setLocalInspectorHeight(value);
      return;
    }
    onInspectorHeightChange(value);
  };

  return (
    <aside
      ref={panelRef}
      id="right-preview-panel"
      className="skin-preview-panel"
      style={{
        gridTemplateRows: `${effectiveInspectorHeight}px ${WORKSPACE_SPLITTER_SIZE}px minmax(0, 1fr)`,
      }}
      aria-label="3D preview panel"
    >
      <div className="skin-preview-inspector">
        <header className="skin-preview-toolbar">
          <div className="skin-preview-toolbar__leading">
            <span className="skin-preview-title">3D Preview</span>
            {onCollapse === undefined ? null : (
              <button
                type="button"
                className="skin-preview-collapse-button"
                aria-label="Collapse 3D Preview"
                title="Collapse 3D Preview"
                onClick={onCollapse}
              >
                ›
              </button>
            )}
          </div>
          <div className="model-selector" role="group" aria-label="Skin model">
            <span className="model-selector__label">Model</span>
            {MODEL_OPTIONS.map(({ model, label }) => (
              <button
                key={model}
                type="button"
                aria-pressed={document.model === model}
                title={`${label} arm geometry`}
                onClick={() => {
                  cancelActiveEditorInteraction();
                  changeSkinModel(document, history, model);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </header>
        <section
          className="skin-preview-visibility-panel"
          aria-label="Visibility and focus"
        >
          <div
            className="skin-preview-visibility-row skin-preview-target-row"
            role="group"
            aria-label="Semantic target layer"
          >
            <span className="skin-preview-visibility-label">Target</span>
            <button
              type="button"
              aria-label="Target base layer"
              aria-pressed={targetLayerForSelection === 'base'}
              onClick={() => selectTargetLayer('base')}
            >
              Base
            </button>
            <button
              type="button"
              aria-label="Target outer layer"
              aria-pressed={targetLayerForSelection === 'outer'}
              onClick={() => selectTargetLayer('outer')}
            >
              Outer
            </button>
          </div>
          <div
            className="skin-preview-visibility-row"
            role="group"
            aria-label="Layers"
          >
            <span className="skin-preview-visibility-label">Layers</span>
            <button
              type="button"
              aria-label="Show base layer"
              aria-pressed={viewState.layers.base}
              onClick={() =>
                updateViewState((state) =>
                  setLayerVisibility(state, 'base', !state.layers.base),
                )
              }
            >
              Base
            </button>
            <button
              type="button"
              aria-label="Show outer layer"
              aria-pressed={viewState.layers.outer}
              onClick={() =>
                updateViewState((state) =>
                  setLayerVisibility(state, 'outer', !state.layers.outer),
                )
              }
            >
              Outer
            </button>
            <button
              type="button"
              aria-label="Restore all visibility"
              onClick={() => updateViewState(() => restoreAllVisibility())}
            >
              All
            </button>
          </div>
          <div
            className="skin-preview-visibility-row skin-preview-body-parts"
            role="group"
            aria-label="Body parts"
          >
            <span className="skin-preview-visibility-label">Parts</span>
            {BODY_PART_OPTIONS.map((bodyPart) => {
              const label = BODY_PART_LABELS[bodyPart];
              const visible = viewState.bodyParts[bodyPart];
              return (
                <div className="skin-preview-body-part" key={bodyPart}>
                  <button
                    type="button"
                    aria-label={`${visible ? 'Hide' : 'Show'} ${label}`}
                    aria-pressed={visible}
                    onClick={() =>
                      updateViewState((state) =>
                        setBodyPartVisibility(state, bodyPart, !visible),
                      )
                    }
                  >
                    {label}
                  </button>
                  <button
                    type="button"
                    className="skin-preview-select-button"
                    aria-label={`Select ${label}`}
                    aria-pressed={
                      selectedTarget?.model === document.model &&
                      selectedTarget.bodyPart === bodyPart
                    }
                    title={`Link ${label} to the 2D canvas`}
                    onClick={() => selectBodyPart(bodyPart)}
                  >
                    Sel
                  </button>
                  <button
                    type="button"
                    className="skin-preview-isolate-button"
                    aria-label={`Isolate ${label}`}
                    aria-pressed={viewState.isolatedBodyPart === bodyPart}
                    onClick={() => {
                      updateViewState((state) =>
                        isolateBodyPart(state, bodyPart),
                      );
                      selectBodyPart(bodyPart);
                    }}
                  >
                    Isolate
                  </button>
                </div>
              );
            })}
          </div>
        </section>
        <HistoryTimeline history={history} />
      </div>
      <WorkspaceSplitter
        axis="horizontal"
        value={effectiveInspectorHeight}
        bounds={inspectorBounds}
        label="Resize 3D controls and preview"
        controls="skin-preview-viewport"
        testId="workspace-splitter-inspector"
        onChange={handleInspectorHeightChange}
      />
      <div
        id="skin-preview-viewport"
        className={`skin-preview-viewport${previewNotice === undefined ? '' : ' has-notice'}`}
      >
        <div ref={mountRef} className="skin-preview-mount" />
        {previewNotice === undefined ? null : (
          <p className="skin-preview-notice" role="status">
            {previewNotice}
          </p>
        )}
        <footer className="skin-preview-controls">
          <output
            className="skin-preview-pick-readout"
            aria-label="3D pick"
            data-testid="preview-pick"
          >
            {formatPick(hoveredPick)}
          </output>
          <div className="skin-preview-actions">
            <button type="button" onClick={() => void handleOpenPopout()}>
              Pop Out
            </button>
            <button type="button" onClick={() => void handleSnapshot()}>
              Snapshot
            </button>
            <button
              type="button"
              title="Reset 3D camera"
              onClick={() => rendererRef.current?.resetView()}
            >
              Reset view
            </button>
          </div>
        </footer>
      </div>
    </aside>
  );
}
