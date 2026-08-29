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
import type { EditorTool } from '../../engine/tools';
import { BODY_PARTS, type BodyPart } from '../../engine/minecraft-skin-spec';
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
import { ToolOptionsInspector } from '../editor/ToolOptionsInspector';
import { changeSkinModel } from './modelSelection';
import {
  createDefaultSkinViewState,
  isolateBodyPart,
  restoreAllVisibility,
  setBodyPartVisibility,
  setLayerVisibility,
  type SkinViewState,
} from './skinViewState';
import { ThreeDToolInteraction } from './threeDToolInteraction';

interface SkinPreviewPanelProps {
  readonly document: SkinDocument;
  readonly history: DocumentHistory;
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

export function SkinPreviewPanel({ document, history }: SkinPreviewPanelProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SkinPreviewRenderer | undefined>(undefined);
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
  const [temporaryEyedropper, setTemporaryEyedropper] = useState(false);

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

  const subscribe = useCallback(
    (notify: () => void) => document.subscribeToMutations(notify),
    [document],
  );
  useSyncExternalStore(
    subscribe,
    () => document.revision,
    () => document.revision,
  );

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
      onPickChange: setHoveredPick,
      onPointerDown: (event, pick) => {
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
        if (tool === 'pencil' || tool === 'eraser') {
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
    };
  }, [defaultView, document, history]);

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
    setViewStateEntry((current) => {
      const state =
        current.documentId === defaultView.documentId
          ? current.state
          : defaultView.state;
      return { documentId: defaultView.documentId, state: update(state) };
    });
  };

  return (
    <aside className="skin-preview-panel" aria-label="3D preview panel">
      <header className="skin-preview-toolbar">
        <span className="skin-preview-title">3D Preview</span>
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
                  className="skin-preview-isolate-button"
                  aria-label={`Isolate ${label}`}
                  aria-pressed={viewState.isolatedBodyPart === bodyPart}
                  onClick={() =>
                    updateViewState((state) => isolateBodyPart(state, bodyPart))
                  }
                >
                  Isolate
                </button>
              </div>
            );
          })}
        </div>
      </section>
      <ToolOptionsInspector activeTool={activeTool} />
      <div ref={mountRef} className="skin-preview-mount" />
      <footer className="skin-preview-controls">
        <output
          className="skin-preview-pick-readout"
          aria-label="3D pick"
          data-testid="preview-pick"
        >
          {formatPick(hoveredPick)}
        </output>
        <button
          type="button"
          title="Reset 3D camera"
          onClick={() => rendererRef.current?.resetView()}
        >
          Reset view
        </button>
      </footer>
    </aside>
  );
}
