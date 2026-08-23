import {
  documentSessionController,
  useDocumentSessionState,
} from '../features/file-management/fileLifecycleStore';

export function App() {
  const { session, error, isBusy } = useDocumentSessionState();
  const documentStatus =
    session === undefined
      ? 'No document open'
      : `${session.displayName}${session.document.isDirty ? ' •' : ''}`;

  return (
    <div className="application-shell">
      <header className="title-bar">
        <h1>Minecraft Skin Editor</h1>
        <span className="milestone">M2</span>
      </header>

      <main className="workspace" aria-label="Application workspace">
        <section className="workspace-placeholder">
          <h2>
            {session === undefined ? 'No document open' : session.displayName}
          </h2>
          <p>
            {session === undefined
              ? 'Use File → Open to select a 64×64 PNG.'
              : 'The PNG is loaded. Pixel editing arrives in a later milestone.'}
          </p>
          <div className="file-actions" aria-label="File actions">
            {session === undefined ? (
              <button
                type="button"
                disabled={isBusy}
                onClick={() => void documentSessionController.open()}
              >
                Open PNG
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void documentSessionController.save()}
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void documentSessionController.saveAs()}
                >
                  Save As…
                </button>
              </>
            )}
          </div>
          {isBusy ? <p className="operation-status">Working…</p> : null}
          {error === undefined ? null : (
            <p className="file-error" role="alert">
              {error.message}
            </p>
          )}
        </section>
      </main>

      <footer className="status-bar" aria-label="Application status">
        {documentStatus}
      </footer>
    </div>
  );
}
