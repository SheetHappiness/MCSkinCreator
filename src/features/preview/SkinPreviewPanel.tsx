import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { RgbaColor, SkinDocument, SkinModel } from '../../engine/document';
import type { DocumentHistory } from '../../engine/history';
import type { EditorTool } from '../../engine/tools';
import {
  SkinPreviewRenderer,
  type SkinPickResult,
} from '../../renderers/three';
import {
  cancelActiveEditorInteraction,
  registerActiveEditorInteraction,
} from '../editor/activeEditorInteraction';
import {
  setSelectedEditorColor,
  useActiveEditorTool,
  useSelectedEditorColor,
} from '../editor/editorToolStore';
import { changeSkinModel } from './modelSelection';
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

function formatPick(result: SkinPickResult | undefined): string {
  if (result === undefined) return 'Hover the model to inspect a texel';
  return `${BODY_PART_LABELS[result.bodyPart]} · ${LAYER_LABELS[result.layer]} · ${FACE_LABELS[result.face]} · X: ${result.x} Y: ${result.y}`;
}

export function SkinPreviewPanel({ document, history }: SkinPreviewPanelProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SkinPreviewRenderer | undefined>(undefined);
  const outerVisibleRef = useRef(true);
  const activeTool = useActiveEditorTool();
  const selectedColor = useSelectedEditorColor();
  const activeToolRef = useRef<EditorTool>(activeTool);
  const selectedColorRef = useRef<RgbaColor>(selectedColor);
  const temporaryEyedropperRef = useRef(false);
  const interactionRef = useRef<ThreeDToolInteraction | undefined>(undefined);
  const [outerVisible, setOuterVisible] = useState(true);
  const [hoveredPick, setHoveredPick] = useState<SkinPickResult | undefined>();
  const [temporaryEyedropper, setTemporaryEyedropper] = useState(false);

  useEffect(() => {
    activeToolRef.current = activeTool;
    selectedColorRef.current = selectedColor;
    temporaryEyedropperRef.current = temporaryEyedropper;
  }, [activeTool, selectedColor, temporaryEyedropper]);

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
      setSelectedEditorColor,
    );
    interactionRef.current = interaction;
    const renderer = new SkinPreviewRenderer(mount, document, undefined, {
      onPickChange: setHoveredPick,
      onPointerDown: (event, pick) => {
        const tool = temporaryEyedropperRef.current
          ? 'eyedropper'
          : activeToolRef.current;
        const handled = interaction.pointerDown(
          event.pointerId,
          event.button,
          pick,
          tool,
          selectedColorRef.current,
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
    renderer.setOuterVisible(outerVisibleRef.current);
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = undefined;
      interaction.cancel();
      renderer.cancelPointerInteractions();
      renderer.dispose();
      interactionRef.current = undefined;
      setHoveredPick(undefined);
    };
  }, [document, history]);

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
        setTemporaryEyedropper(true);
        rendererRef.current?.setEditingTool('eyedropper');
      }
    };
    const handleAltUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return;
      temporaryEyedropperRef.current = false;
      setTemporaryEyedropper(false);
      rendererRef.current?.setEditingTool(activeToolRef.current);
    };
    window.addEventListener('keydown', handleAltDown);
    window.addEventListener('keyup', handleAltUp);
    return () => {
      window.removeEventListener('keydown', handleAltDown);
      window.removeEventListener('keyup', handleAltUp);
    };
  }, [activeTool]);

  useEffect(
    () =>
      registerActiveEditorInteraction(() => {
        interactionRef.current?.cancel();
        rendererRef.current?.cancelPointerInteractions();
      }),
    [],
  );

  const toggleOuterLayer = () => {
    cancelActiveEditorInteraction();
    setOuterVisible((current) => {
      const next = !current;
      outerVisibleRef.current = next;
      rendererRef.current?.setOuterVisible(next);
      return next;
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
          aria-label="Show outer layer"
          aria-pressed={outerVisible}
          onClick={toggleOuterLayer}
        >
          Outer
        </button>
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
