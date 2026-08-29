import { useEffect, useRef, useState, type DragEvent } from 'react';

import {
  closeNewSkinDialog,
  documentSessionController,
  requestNewSkin,
  useNewSkinDialogOpen,
  useDocumentSessionState,
} from '../features/file-management/fileLifecycleStore';
import { EditorWorkspace } from '../features/editor/EditorWorkspace';
import { NewSkinDialog } from '../features/file-management/NewSkinDialog';
import type { SkinModel } from '../engine/document';

function isFileDrag(event: DragEvent<HTMLElement>): boolean {
  return Array.from(event.dataTransfer.types).includes('Files');
}

function getDroppedFilePath(file: File): string | undefined {
  try {
    const resolved = window.skinFiles?.getPathForDroppedFile?.(file);
    if (typeof resolved === 'string' && resolved.length > 0) {
      return resolved;
    }
  } catch {
    // A browser-constructed File is not backed by a filesystem path.
  }

  const legacyPath = (file as File & { readonly path?: unknown }).path;
  return typeof legacyPath === 'string' && legacyPath.length > 0
    ? legacyPath
    : undefined;
}

export function App() {
  const { session, error, isBusy } = useDocumentSessionState();
  const isNewSkinDialogOpen = useNewSkinDialogOpen();
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropNotice, setDropNotice] = useState<string | undefined>(undefined);
  const dragDepthRef = useRef(0);
  const documentStatus =
    session === undefined
      ? 'No document open'
      : `${session.displayName}${session.document.isDirty ? ' •' : ''}`;

  useEffect(() => {
    document.title =
      session === undefined
        ? 'Minecraft Skin Editor'
        : `${session.displayName}${session.document.isDirty ? ' •' : ''} — Minecraft Skin Editor`;
  }, [session, session?.document.isDirty]);

  const handleNewSkin = async (model: SkinModel) => {
    const outcome = await documentSessionController.newSkin(model);
    if (outcome.status === 'success') closeNewSkinDialog();
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    dragDepthRef.current = 0;
    setIsDragOver(false);
    setDropNotice(undefined);

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;
    const pngFile =
      files.find((file) => file.name.toLowerCase().endsWith('.png')) ??
      files[0]!;
    if (files.length > 1) {
      setDropNotice(
        'Only one dropped file is considered; multiple documents require the library stage.',
      );
    }

    void documentSessionController.openDroppedPng({
      displayName: pngFile.name,
      filePath: getDroppedFilePath(pngFile),
      readBytes: async () => new Uint8Array(await pngFile.arrayBuffer()),
    });
  };

  return (
    <div
      className={`application-shell${isDragOver ? ' is-drag-over' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="title-bar">
        <h1>Minecraft Skin Editor</h1>
        <div className="title-bar__actions">
          {session === undefined ? null : (
            <>
              <button
                type="button"
                disabled={isBusy || !session.document.isDirty}
                title="Save (Ctrl+S)"
                onClick={() => void documentSessionController.save()}
              >
                Save
              </button>
              <button
                type="button"
                disabled={isBusy}
                title="Save As (Ctrl+Shift+S)"
                onClick={() => void documentSessionController.saveAs()}
              >
                Save As…
              </button>
            </>
          )}
        </div>
      </header>

      <main
        className={`workspace${session === undefined ? ' is-empty' : ''}`}
        aria-label="Application workspace"
      >
        {session === undefined ? (
          <>
            <section className="workspace-placeholder">
              <h2>Open a 64×64 Minecraft skin to begin</h2>
              <p>PNG · Classic or Slim model</p>
              <div className="file-actions" aria-label="File actions">
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={requestNewSkin}
                >
                  New Skin
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void documentSessionController.open()}
                >
                  Open PNG
                </button>
                <kbd>Ctrl+O</kbd>
              </div>
              {isBusy ? <p className="operation-status">Working…</p> : null}
              {error === undefined ? null : (
                <p className="file-error" role="alert">
                  {error.message}
                </p>
              )}
            </section>
            <footer className="status-bar" aria-label="Application status">
              {documentStatus}
            </footer>
          </>
        ) : (
          <>
            <EditorWorkspace
              document={session.document}
              history={session.history}
              displayName={session.displayName}
              isDirty={session.document.isDirty}
            />
            {error === undefined ? null : (
              <p className="workspace-error" role="alert">
                {error.message}
              </p>
            )}
          </>
        )}
      </main>
      {dropNotice === undefined ? null : (
        <p className="drop-notice" role="status">
          {dropNotice}
        </p>
      )}
      {isDragOver ? (
        <div className="drop-target-feedback" role="status">
          Release to open a 64×64 PNG skin
        </div>
      ) : null}
      <NewSkinDialog
        key={isNewSkinDialogOpen ? 'open' : 'closed'}
        isOpen={isNewSkinDialogOpen}
        isBusy={isBusy}
        onCancel={closeNewSkinDialog}
        onCreate={(model) => void handleNewSkin(model)}
      />
    </div>
  );
}
