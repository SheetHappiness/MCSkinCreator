import { useEffect, useState, type KeyboardEvent } from 'react';

import type { SkinLibraryEntry } from '../../../electron/fileContract';
import { useDocumentSessionState } from '../file-management/fileLifecycleStore';
import {
  LOCAL_SKIN_LIBRARY_DRAG_TYPE,
  copyActiveDocumentToLibrary,
  deleteLibraryEntry,
  duplicateLibraryEntry,
  openLibraryEntry,
  refreshLibrary,
  renameLibraryEntry,
  useLocalSkinLibrary,
} from './localSkinLibrary';

interface LibraryPanelProps {
  readonly onCollapse?: () => void;
}

function formatByteLength(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  return `${Math.ceil(byteLength / 1024)} KB`;
}

export function LibraryPanel({ onCollapse }: LibraryPanelProps = {}) {
  const { entries, rootDisplayName, isBusy, error } = useLocalSkinLibrary();
  const { session } = useDocumentSessionState();
  const [renamingPath, setRenamingPath] = useState<string | undefined>();
  const [renameValue, setRenameValue] = useState('');
  const [deletingPath, setDeletingPath] = useState<string | undefined>();

  useEffect(() => {
    void refreshLibrary();
  }, []);

  const beginRename = (entry: SkinLibraryEntry) => {
    setDeletingPath(undefined);
    setRenamingPath(entry.filePath);
    setRenameValue(entry.displayName);
  };

  const cancelRename = () => {
    setRenamingPath(undefined);
    setRenameValue('');
  };

  const submitRename = async (entry: SkinLibraryEntry) => {
    await renameLibraryEntry(entry, renameValue);
    cancelRename();
  };

  const handleRenameKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    entry: SkinLibraryEntry,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitRename(entry);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelRename();
    }
  };

  return (
    <aside
      id="local-library-panel"
      className="library-panel"
      aria-label="Local skin library"
    >
      <header className="library-panel__header">
        <div>
          <h2>Local Library</h2>
          <span>{rootDisplayName}</span>
        </div>
        <div className="library-panel__header-actions">
          {onCollapse === undefined ? null : (
            <button
              type="button"
              className="library-panel__collapse-button"
              aria-label="Collapse Local Library"
              title="Collapse Local Library"
              onClick={onCollapse}
            >
              ‹
            </button>
          )}
          <button
            type="button"
            aria-label="Refresh local library"
            title="Refresh local library"
            disabled={isBusy}
            onClick={() => void refreshLibrary()}
          >
            ↻
          </button>
        </div>
      </header>

      {error === undefined ? null : (
        <p className="library-panel__error" role="alert">
          {error.message}
        </p>
      )}

      <div className="library-panel__content">
        {entries.length === 0 ? (
          <p className="library-panel__empty">
            {isBusy ? 'Refreshing…' : 'No PNG skins in the library.'}
          </p>
        ) : (
          <ul className="library-entry-list">
            {entries.map((entry) => {
              const isRenaming = renamingPath === entry.filePath;
              const isDeleting = deletingPath === entry.filePath;
              return (
                <li
                  className="library-entry"
                  data-testid="library-entry"
                  key={entry.filePath}
                >
                  {isRenaming ? (
                    <div className="library-entry__rename">
                      <input
                        aria-label={`New name for ${entry.displayName}`}
                        value={renameValue}
                        disabled={isBusy}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={(event) => handleRenameKeyDown(event, entry)}
                      />
                      <button
                        type="button"
                        aria-label={`Save rename for ${entry.displayName}`}
                        disabled={isBusy}
                        onClick={() => void submitRename(entry)}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        aria-label={`Cancel rename for ${entry.displayName}`}
                        disabled={isBusy}
                        onClick={cancelRename}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="library-entry__summary">
                        <button
                          type="button"
                          className="library-entry__open"
                          draggable
                          aria-label={`Open ${entry.displayName}`}
                          disabled={isBusy}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'copy';
                            event.dataTransfer.setData(
                              LOCAL_SKIN_LIBRARY_DRAG_TYPE,
                              entry.filePath,
                            );
                            event.dataTransfer.setData(
                              'text/plain',
                              `minecraft-skin-library:${entry.filePath}`,
                            );
                          }}
                          onClick={() => void openLibraryEntry(entry)}
                        >
                          {entry.displayName}
                        </button>
                        <span>{formatByteLength(entry.byteLength)}</span>
                      </div>
                      <div className="library-entry__actions">
                        <button
                          type="button"
                          aria-label={`Rename ${entry.displayName}`}
                          disabled={isBusy}
                          onClick={() => beginRename(entry)}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          aria-label={`Duplicate ${entry.displayName}`}
                          disabled={isBusy}
                          onClick={() => void duplicateLibraryEntry(entry)}
                        >
                          Duplicate
                        </button>
                        {isDeleting ? (
                          <>
                            <button
                              type="button"
                              aria-label={`Confirm delete ${entry.displayName}`}
                              disabled={isBusy}
                              onClick={() => {
                                setDeletingPath(undefined);
                                void deleteLibraryEntry(entry);
                              }}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              aria-label={`Cancel delete ${entry.displayName}`}
                              disabled={isBusy}
                              onClick={() => setDeletingPath(undefined)}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Delete ${entry.displayName}`}
                            disabled={isBusy}
                            onClick={() => {
                              setRenamingPath(undefined);
                              setDeletingPath(entry.filePath);
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="library-panel__footer">
        <button
          type="button"
          disabled={isBusy || session === undefined}
          onClick={() => void copyActiveDocumentToLibrary()}
        >
          Add Active to Library
        </button>
      </footer>
    </aside>
  );
}
