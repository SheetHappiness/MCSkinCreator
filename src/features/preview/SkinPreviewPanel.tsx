import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import type { SkinDocument, SkinModel } from '../../engine/document';
import type { DocumentHistory } from '../../engine/history';
import { SkinPreviewRenderer } from '../../renderers/three';
import { changeSkinModel } from './modelSelection';

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

export function SkinPreviewPanel({ document, history }: SkinPreviewPanelProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SkinPreviewRenderer | undefined>(undefined);
  const outerVisibleRef = useRef(true);
  const [outerVisible, setOuterVisible] = useState(true);
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
    const renderer = new SkinPreviewRenderer(mount, document);
    renderer.setOuterVisible(outerVisibleRef.current);
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = undefined;
      renderer.dispose();
    };
  }, [document]);

  const toggleOuterLayer = () => {
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
              onClick={() => changeSkinModel(document, history, model)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <div ref={mountRef} className="skin-preview-mount" />
      <footer className="skin-preview-controls">
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
