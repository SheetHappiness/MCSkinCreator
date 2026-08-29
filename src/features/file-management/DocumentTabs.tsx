import type { DocumentSession } from './documentSession';

interface DocumentTabsProps {
  readonly sessions: readonly DocumentSession[];
  readonly activeDocumentId: string | undefined;
  readonly onActivate: (documentId: string) => void;
  readonly onClose: (documentId: string) => void;
}

export function DocumentTabs({
  sessions,
  activeDocumentId,
  onActivate,
  onClose,
}: DocumentTabsProps) {
  return (
    <nav className="document-tabs" aria-label="Open documents">
      <div className="document-tabs__list" role="tablist">
        {sessions.map((session) => {
          const documentId = session.document.id;
          const isActive = documentId === activeDocumentId;
          const closeLabel = `Close ${session.displayName}`;
          return (
            <div
              className={`document-tab${isActive ? ' is-active' : ''}`}
              key={documentId}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls="active-document-panel"
                className="document-tab__select"
                title={session.filePath ?? session.displayName}
                onClick={() => onActivate(documentId)}
              >
                <span className="document-tab__name">
                  {session.displayName}
                </span>
                {session.document.isDirty ? (
                  <span className="document-tab__dirty" aria-label="Dirty">
                    •
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className="document-tab__close"
                aria-label={closeLabel}
                title={closeLabel}
                onClick={() => onClose(documentId)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </nav>
  );
}
