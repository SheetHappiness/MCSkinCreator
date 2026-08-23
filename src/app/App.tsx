import { useEffect } from 'react';

import {
  documentSessionController,
  useDocumentSessionState,
} from '../features/file-management/fileLifecycleStore';
import { EditorWorkspace } from '../features/editor/EditorWorkspace';

export function App() {
  const { session, error, isBusy } = useDocumentSessionState();
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

  return (
    <div className="application-shell">
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
    </div>
  );
}
