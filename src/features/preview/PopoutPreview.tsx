import { useEffect, useMemo, useRef, useState } from 'react';

import type { PopoutPreviewState } from '../../../electron/fileContract';
import { decodeSkinPng } from '../../engine/png';
import { BODY_PARTS } from '../../engine/minecraft-skin-spec';
import { SkinPreviewRenderer } from '../../renderers/three';
import {
  notifyPopoutPreviewReady,
  savePreviewSnapshot,
  subscribeToPopoutPreviewState,
} from './popoutPreviewController';

function applyVisibility(
  renderer: SkinPreviewRenderer,
  state: PopoutPreviewState,
): void {
  renderer.setBaseVisible(state.visibility.layers.base);
  renderer.setOuterVisible(state.visibility.layers.outer);
  for (const bodyPart of BODY_PARTS) {
    renderer.setBodyPartVisible(bodyPart, state.visibility.bodyParts[bodyPart]);
  }
}

function snapshotName(displayName: string): string {
  const stem = displayName.replace(/\.png$/i, '') || 'skin';
  return `${stem}-preview.png`;
}

export function PopoutPreview() {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SkinPreviewRenderer | undefined>(undefined);
  const [previewState, setPreviewState] = useState<
    PopoutPreviewState | undefined
  >(undefined);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const decodedPreview = useMemo(() => {
    if (previewState === undefined) return undefined;
    try {
      return {
        document: decodeSkinPng(previewState.pngBytes, {
          id: `popout-${previewState.documentId}`,
          model: previewState.model,
        }),
      };
    } catch {
      return {
        error: 'The bound skin could not be rendered in the pop-out preview.',
      };
    }
  }, [previewState]);

  useEffect(() => {
    const unsubscribe = subscribeToPopoutPreviewState(setPreviewState);
    notifyPopoutPreviewReady();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (previewState === undefined || decodedPreview?.document === undefined) {
      return;
    }
    const mount = mountRef.current;
    if (mount === null) return;

    let renderer = rendererRef.current;
    if (renderer === undefined) {
      renderer = new SkinPreviewRenderer(mount, decodedPreview.document);
      rendererRef.current = renderer;
    } else {
      renderer.setDocument(decodedPreview.document);
    }
    applyVisibility(renderer, previewState);
    const canvas = renderer.getCanvas();
    canvas.setAttribute(
      'aria-label',
      '3D skin preview; right drag orbits, middle drag or wheel zooms',
    );
    canvas.dataset.boundDocumentId = previewState.documentId;
    canvas.dataset.sourceRevision = String(previewState.revision);
    globalThis.document.title = `${previewState.displayName} — 3D Preview`;
  }, [decodedPreview, previewState]);

  useEffect(
    () => () => {
      rendererRef.current?.dispose();
      rendererRef.current = undefined;
    },
    [],
  );

  const handleSnapshot = async () => {
    const dataUrl = rendererRef.current?.captureSnapshot();
    if (dataUrl === undefined || previewState === undefined) {
      setNotice('The 3D preview could not produce a PNG snapshot.');
      return;
    }
    setNotice(undefined);
    const result = await savePreviewSnapshot({
      suggestedName: snapshotName(previewState.displayName),
      dataUrl,
    });
    if (result.status === 'error') setNotice(result.error.message);
    if (result.status === 'success') {
      setNotice(`Snapshot saved as ${result.displayName}.`);
    }
  };

  return (
    <main className="popout-preview-shell">
      <header className="popout-preview-header">
        <div>
          <h1>3D Preview</h1>
          <span>
            {previewState?.displayName ?? 'Waiting for the bound document…'}
          </span>
        </div>
        <button
          type="button"
          className="ts-button"
          disabled={previewState === undefined}
          onClick={() => void handleSnapshot()}
        >
          Snapshot
        </button>
      </header>
      <div ref={mountRef} className="popout-preview-mount">
        {previewState === undefined ? (
          <p className="popout-preview-placeholder">
            Waiting for the bound document…
          </p>
        ) : null}
        {decodedPreview?.error === undefined ? null : (
          <p className="popout-preview-placeholder" role="alert">
            {decodedPreview.error}
          </p>
        )}
      </div>
      <footer className="popout-preview-footer">
        <span>Right drag: orbit · wheel or middle drag: zoom</span>
        {notice === undefined ? null : <span role="status">{notice}</span>}
        <button
          type="button"
          className="ts-button"
          disabled={
            previewState === undefined || decodedPreview?.error !== undefined
          }
          onClick={() => rendererRef.current?.resetView()}
        >
          Reset view
        </button>
      </footer>
    </main>
  );
}
