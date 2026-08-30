import { useEffect, useState, type KeyboardEvent } from 'react';

import type {
  RecentSkinEntry,
  SkinLibraryCollection,
  SkinLibraryEntry,
} from '../../../electron/fileContract';
import { useDocumentSessionState } from '../file-management/fileLifecycleStore';
import {
  LOCAL_SKIN_LIBRARY_DRAG_TYPE,
  copyActiveDocumentToLibrary,
  createLibraryCollection,
  deleteLibraryCollection,
  deleteLibraryEntry,
  duplicateLibraryEntry,
  openLibraryEntry,
  openRecentEntry,
  refreshLibrary,
  removeRecentEntry,
  renameLibraryCollection,
  renameLibraryEntry,
  revealLibraryEntry,
  setLibraryEntryCollections,
  useLocalSkinLibrary,
} from './localSkinLibrary';
import {
  filterLibraryEntries,
  filterRecentEntries,
  updateCollectionSelection,
} from './libraryQueries';

interface LibraryPanelProps {
  readonly isExpanded?: boolean;
  readonly onExpandedChange?: (isExpanded: boolean) => void;
  readonly onCollapse?: () => void;
}

function formatByteLength(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  return `${Math.ceil(byteLength / 1024)} KB`;
}

function normalizedLibraryPath(filePath: string): string {
  return filePath.replaceAll('\\', '/').toLowerCase();
}

function Thumbnail({
  dataUrl,
  displayName,
}: {
  readonly dataUrl: string | undefined;
  readonly displayName: string;
}) {
  return dataUrl === undefined ? (
    <span
      className="library-thumbnail library-thumbnail--empty"
      aria-hidden="true"
    >
      —
    </span>
  ) : (
    <img
      className="library-thumbnail"
      src={dataUrl}
      alt={`${displayName} thumbnail`}
      draggable={false}
    />
  );
}

function CollectionAssignment({
  entry,
  collections,
  disabled,
  onChange,
}: {
  readonly entry: SkinLibraryEntry;
  readonly collections: readonly SkinLibraryCollection[];
  readonly disabled: boolean;
  readonly onChange: (collectionIds: readonly string[]) => void;
}) {
  if (collections.length === 0) return null;
  return (
    <details className="library-entry__collections">
      <summary>
        Collections
        {entry.collectionIds.length > 0
          ? ` · ${entry.collectionIds.length}`
          : ''}
      </summary>
      <div className="library-entry__collection-list">
        {collections.map((collection) => {
          const checked = entry.collectionIds.includes(collection.id);
          return (
            <label key={collection.id}>
              <input
                type="checkbox"
                aria-label={`${checked ? 'Remove' : 'Add'} ${entry.displayName} ${checked ? 'from' : 'to'} ${collection.displayName}`}
                checked={checked}
                disabled={disabled}
                onChange={(event) =>
                  onChange(
                    updateCollectionSelection(
                      entry.collectionIds,
                      collection.id,
                      event.target.checked,
                    ),
                  )
                }
              />
              <span>{collection.displayName}</span>
            </label>
          );
        })}
      </div>
    </details>
  );
}

function RecentEntry({
  entry,
  isBusy,
  isActive,
  onOpen,
  onRemove,
}: {
  readonly entry: RecentSkinEntry;
  readonly isBusy: boolean;
  readonly isActive: boolean;
  readonly onOpen: () => void;
  readonly onRemove: () => void;
}) {
  return (
    <li
      className={`recent-entry${isActive ? ' is-active' : ''}`}
      data-active={isActive ? 'true' : 'false'}
      data-testid="recent-entry"
    >
      <button
        type="button"
        className="recent-entry__open"
        aria-label={`Open recent ${entry.displayName}`}
        aria-current={isActive ? 'page' : undefined}
        disabled={isBusy || !entry.isAvailable}
        onClick={onOpen}
      >
        <Thumbnail
          dataUrl={entry.thumbnailDataUrl}
          displayName={entry.displayName}
        />
        <span className="recent-entry__name">{entry.displayName}</span>
        {isActive ? (
          <span className="recent-entry__active-state">Active</span>
        ) : null}
        {!entry.isAvailable ? (
          <span className="recent-entry__missing">Missing</span>
        ) : null}
      </button>
      <button
        type="button"
        className="recent-entry__remove ts-icon-button ts-icon-button--compact"
        aria-label={`Remove recent ${entry.displayName}`}
        title="Remove from recent skins"
        disabled={isBusy}
        onClick={onRemove}
      >
        ×
      </button>
    </li>
  );
}

export function LibraryPanel({
  isExpanded: expandedProp,
  onExpandedChange,
  onCollapse,
}: LibraryPanelProps = {}) {
  const {
    entries,
    collections,
    recentEntries,
    rootDisplayName,
    isBusy,
    error,
  } = useLocalSkinLibrary();
  const { session } = useDocumentSessionState();
  const [renamingPath, setRenamingPath] = useState<string | undefined>();
  const [renameValue, setRenameValue] = useState('');
  const [deletingPath, setDeletingPath] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCollectionId, setSelectedCollectionId] = useState<
    string | undefined
  >();
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [collectionValue, setCollectionValue] = useState('');
  const [renamingCollectionId, setRenamingCollectionId] = useState<
    string | undefined
  >();
  const [collectionRenameValue, setCollectionRenameValue] = useState('');
  const [deletingCollectionId, setDeletingCollectionId] = useState<
    string | undefined
  >();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expandedProp ?? internalExpanded;

  const toggleExpanded = () => {
    const next = !isExpanded;
    if (expandedProp === undefined) setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  useEffect(() => {
    void refreshLibrary();
  }, []);

  // A successful save of a library-backed tab changes the file bytes. Refresh
  // only on the clean transition so painting does not re-read every stroke.
  useEffect(() => {
    if (session?.filePath !== undefined && !session.document.isDirty) {
      void refreshLibrary();
    }
  }, [session?.filePath, session?.document.isDirty]);

  const effectiveSelectedCollectionId =
    selectedCollectionId !== undefined &&
    collections.some((collection) => collection.id === selectedCollectionId)
      ? selectedCollectionId
      : undefined;

  const visibleEntries = filterLibraryEntries(
    entries,
    collections,
    searchQuery,
    effectiveSelectedCollectionId,
  );
  const visibleRecentEntries = filterRecentEntries(recentEntries, searchQuery);
  const selectedCollection = collections.find(
    (collection) => collection.id === effectiveSelectedCollectionId,
  );
  const activeLibraryPath =
    session?.filePath === undefined
      ? undefined
      : normalizedLibraryPath(session.filePath);
  const activeLibraryEntry =
    activeLibraryPath === undefined
      ? undefined
      : entries.find(
          (entry) =>
            normalizedLibraryPath(entry.filePath) === activeLibraryPath,
        );
  const activeRecentEntry =
    activeLibraryPath === undefined
      ? undefined
      : recentEntries.find(
          (entry) =>
            normalizedLibraryPath(entry.filePath) === activeLibraryPath,
        );
  const activeDisplayName = session?.displayName ?? 'No skin open';
  const activeThumbnailDataUrl =
    activeLibraryEntry?.thumbnailDataUrl ?? activeRecentEntry?.thumbnailDataUrl;

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
    if (await renameLibraryEntry(entry, renameValue)) cancelRename();
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

  const submitCollection = async () => {
    if (await createLibraryCollection(collectionValue)) {
      setIsCreatingCollection(false);
      setCollectionValue('');
    }
  };

  const submitCollectionRename = async (collection: SkinLibraryCollection) => {
    if (await renameLibraryCollection(collection, collectionRenameValue)) {
      setRenamingCollectionId(undefined);
      setCollectionRenameValue('');
    }
  };

  const handleCollectionRenameKeyDown = (
    event: KeyboardEvent<HTMLInputElement>,
    collection: SkinLibraryCollection,
  ) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void submitCollectionRename(collection);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setRenamingCollectionId(undefined);
      setCollectionRenameValue('');
    }
  };

  return (
    <aside
      id="local-library-panel"
      className={`library-panel${isExpanded ? ' library-panel--expanded' : ' library-panel--compact'}`}
      aria-label="Local skin library"
    >
      <header className="library-panel__header">
        <div className="library-panel__header-copy">
          <h2>Library</h2>
          <span className="library-panel__count" title={rootDisplayName}>
            {entries.length} {entries.length === 1 ? 'item' : 'items'}
          </span>
        </div>
        <div className="library-panel__header-actions">
          <button
            type="button"
            className="library-panel__expand-button ts-icon-button ts-icon-button--compact"
            aria-label={isExpanded ? 'Collapse Library' : 'Expand Library'}
            aria-expanded={isExpanded}
            aria-controls="library-details"
            title={isExpanded ? 'Collapse Library' : 'Expand Library'}
            onClick={toggleExpanded}
          >
            {isExpanded ? '⌃' : '⌄'}
          </button>
          {onCollapse === undefined ? null : (
            <button
              type="button"
              className="library-panel__collapse-button ts-icon-button ts-icon-button--compact"
              aria-label="Collapse Local Library"
              title="Collapse Local Library"
              onClick={onCollapse}
            >
              ‹
            </button>
          )}
          <button
            type="button"
            className="ts-icon-button ts-icon-button--compact"
            aria-label="Refresh local library"
            title="Refresh local library"
            disabled={isBusy}
            onClick={() => void refreshLibrary()}
          >
            ↻
          </button>
        </div>
      </header>

      <div
        className="library-panel__active-skin"
        data-testid="library-active-skin"
        data-active={session === undefined ? 'false' : 'true'}
        data-dirty={session?.document.isDirty ? 'true' : 'false'}
      >
        <Thumbnail
          dataUrl={activeThumbnailDataUrl}
          displayName={activeDisplayName}
        />
        <div className="library-panel__active-skin-copy">
          <span className="library-panel__active-skin-label">Active skin</span>
          <div className="library-panel__active-skin-name">
            <strong title={activeDisplayName}>{activeDisplayName}</strong>
            {session?.document.isDirty ? (
              <span className="library-panel__active-skin-dirty">Unsaved</span>
            ) : null}
          </div>
        </div>
      </div>

      {isExpanded ? (
        <div id="library-details" className="library-panel__details">
          <div className="library-panel__toolbar">
            <label className="library-search library-filter-field">
              <span>Search</span>
              <input
                className="ts-field"
                aria-label="Search local library"
                type="search"
                value={searchQuery}
                placeholder="Filename or collection"
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <div className="library-collection-toolbar">
              <label className="library-filter-field library-filter-field--collection">
                <span>Collection</span>
                <select
                  className="ts-field"
                  aria-label="Filter local library by collection"
                  value={effectiveSelectedCollectionId ?? ''}
                  disabled={isBusy}
                  onChange={(event) =>
                    setSelectedCollectionId(event.target.value || undefined)
                  }
                >
                  <option value="">All skins</option>
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.displayName} ({collection.entryCount})
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="ts-icon-button ts-icon-button--compact"
                aria-label="Create library collection"
                disabled={isBusy}
                onClick={() => {
                  setRenamingCollectionId(undefined);
                  setDeletingCollectionId(undefined);
                  setIsCreatingCollection(true);
                }}
              >
                +
              </button>
            </div>
          </div>

          {isCreatingCollection ? (
            <div className="library-collection-form">
              <input
                className="ts-field"
                aria-label="New collection name"
                value={collectionValue}
                placeholder="Collection name"
                disabled={isBusy}
                onChange={(event) => setCollectionValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void submitCollection();
                  } else if (event.key === 'Escape') {
                    setIsCreatingCollection(false);
                    setCollectionValue('');
                  }
                }}
              />
              <button
                type="button"
                className="ts-button"
                aria-label="Create collection"
                disabled={isBusy}
                onClick={() => void submitCollection()}
              >
                Create
              </button>
              <button
                type="button"
                className="ts-button"
                aria-label="Cancel create collection"
                disabled={isBusy}
                onClick={() => {
                  setIsCreatingCollection(false);
                  setCollectionValue('');
                }}
              >
                Cancel
              </button>
            </div>
          ) : null}

          {selectedCollection !== undefined ? (
            <div className="library-selected-collection">
              {renamingCollectionId === selectedCollection.id ? (
                <>
                  <input
                    className="ts-field"
                    aria-label={`New name for collection ${selectedCollection.displayName}`}
                    value={collectionRenameValue}
                    disabled={isBusy}
                    onChange={(event) =>
                      setCollectionRenameValue(event.target.value)
                    }
                    onKeyDown={(event) =>
                      handleCollectionRenameKeyDown(event, selectedCollection)
                    }
                  />
                  <button
                    type="button"
                    className="ts-button"
                    aria-label={`Save rename for collection ${selectedCollection.displayName}`}
                    disabled={isBusy}
                    onClick={() =>
                      void submitCollectionRename(selectedCollection)
                    }
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="ts-button"
                    aria-label={`Cancel rename for collection ${selectedCollection.displayName}`}
                    disabled={isBusy}
                    onClick={() => {
                      setRenamingCollectionId(undefined);
                      setCollectionRenameValue('');
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : deletingCollectionId === selectedCollection.id ? (
                <>
                  <span>Delete “{selectedCollection.displayName}”?</span>
                  <button
                    type="button"
                    className="ts-button"
                    aria-label={`Confirm delete collection ${selectedCollection.displayName}`}
                    disabled={isBusy}
                    onClick={() => {
                      void deleteLibraryCollection(selectedCollection).then(
                        (ok) => {
                          if (ok) {
                            setDeletingCollectionId(undefined);
                            setSelectedCollectionId(undefined);
                          }
                        },
                      );
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    className="ts-button"
                    aria-label={`Cancel delete collection ${selectedCollection.displayName}`}
                    disabled={isBusy}
                    onClick={() => setDeletingCollectionId(undefined)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="library-selected-collection__name">
                    {selectedCollection.displayName}
                  </span>
                  <button
                    type="button"
                    className="ts-button"
                    aria-label={`Rename collection ${selectedCollection.displayName}`}
                    disabled={isBusy}
                    onClick={() => {
                      setRenamingCollectionId(selectedCollection.id);
                      setCollectionRenameValue(selectedCollection.displayName);
                    }}
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    className="ts-button"
                    aria-label={`Delete collection ${selectedCollection.displayName}`}
                    disabled={isBusy}
                    onClick={() =>
                      setDeletingCollectionId(selectedCollection.id)
                    }
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          ) : null}

          {error === undefined ? null : (
            <p className="library-panel__error" role="alert">
              {error.message}
            </p>
          )}

          <div className="library-panel__content">
            {visibleRecentEntries.length > 0 ? (
              <section
                className="library-section"
                aria-labelledby="recent-skins-heading"
              >
                <div className="library-section__header">
                  <h3 id="recent-skins-heading">Recently Opened</h3>
                  <span>{recentEntries.length}/12</span>
                </div>
                <ul className="recent-entry-list">
                  {visibleRecentEntries.map((entry) => (
                    <RecentEntry
                      key={entry.filePath}
                      entry={entry}
                      isBusy={isBusy}
                      isActive={
                        activeLibraryPath !== undefined &&
                        normalizedLibraryPath(entry.filePath) ===
                          activeLibraryPath
                      }
                      onOpen={() => void openRecentEntry(entry)}
                      onRemove={() => void removeRecentEntry(entry)}
                    />
                  ))}
                </ul>
              </section>
            ) : null}

            <section
              className="library-section"
              aria-labelledby="library-skins-heading"
            >
              <div className="library-section__header">
                <h3 id="library-skins-heading">
                  {selectedCollection === undefined
                    ? 'Library skins'
                    : selectedCollection.displayName}
                </h3>
                <span>{visibleEntries.length}</span>
              </div>
              {visibleEntries.length === 0 ? (
                <p className="library-panel__empty">
                  {isBusy
                    ? 'Refreshing…'
                    : entries.length === 0
                      ? 'No PNG skins in the library.'
                      : 'No skins match this view.'}
                </p>
              ) : (
                <ul className="library-entry-list">
                  {visibleEntries.map((entry) => {
                    const isRenaming = renamingPath === entry.filePath;
                    const isDeleting = deletingPath === entry.filePath;
                    const isActive =
                      activeLibraryPath !== undefined &&
                      normalizedLibraryPath(entry.filePath) ===
                        activeLibraryPath;
                    return (
                      <li
                        className={`library-entry${isActive ? ' is-active' : ''}`}
                        data-active={isActive ? 'true' : 'false'}
                        data-testid="library-entry"
                        key={entry.filePath}
                      >
                        {isRenaming ? (
                          <div className="library-entry__rename">
                            <input
                              className="ts-field"
                              aria-label={`New name for ${entry.displayName}`}
                              value={renameValue}
                              disabled={isBusy}
                              onChange={(event) =>
                                setRenameValue(event.target.value)
                              }
                              onKeyDown={(event) =>
                                handleRenameKeyDown(event, entry)
                              }
                            />
                            <button
                              type="button"
                              className="ts-button"
                              aria-label={`Save rename for ${entry.displayName}`}
                              disabled={isBusy}
                              onClick={() => void submitRename(entry)}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="ts-button"
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
                                aria-current={isActive ? 'page' : undefined}
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
                                <Thumbnail
                                  dataUrl={entry.thumbnailDataUrl}
                                  displayName={entry.displayName}
                                />
                                <span className="library-entry__name">
                                  {entry.displayName}
                                </span>
                                {isActive ? (
                                  <span className="library-entry__active-state">
                                    Active
                                  </span>
                                ) : null}
                              </button>
                              <span className="library-entry__meta">
                                {formatByteLength(entry.byteLength)}
                              </span>
                            </div>
                            <CollectionAssignment
                              entry={entry}
                              collections={collections}
                              disabled={isBusy}
                              onChange={(collectionIds) =>
                                void setLibraryEntryCollections(
                                  entry,
                                  collectionIds,
                                )
                              }
                            />
                            <div className="library-entry__actions">
                              <button
                                type="button"
                                className="ts-button library-entry__action"
                                aria-label={`Rename ${entry.displayName}`}
                                disabled={isBusy}
                                onClick={() => beginRename(entry)}
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                className="ts-button library-entry__action"
                                aria-label={`Duplicate ${entry.displayName}`}
                                disabled={isBusy}
                                onClick={() =>
                                  void duplicateLibraryEntry(entry)
                                }
                              >
                                Duplicate
                              </button>
                              <button
                                type="button"
                                className="ts-button library-entry__action"
                                aria-label={`Reveal ${entry.displayName}`}
                                disabled={isBusy}
                                onClick={() => void revealLibraryEntry(entry)}
                              >
                                Reveal
                              </button>
                              {isDeleting ? (
                                <>
                                  <button
                                    type="button"
                                    className="ts-button library-entry__action library-entry__action--danger"
                                    aria-label={`Confirm delete ${entry.displayName}`}
                                    disabled={isBusy}
                                    onClick={() => {
                                      void deleteLibraryEntry(entry).then(
                                        (ok) => {
                                          if (ok) setDeletingPath(undefined);
                                        },
                                      );
                                    }}
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className="ts-button library-entry__action"
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
                                  className="ts-button library-entry__action library-entry__action--danger"
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
            </section>
          </div>

          <footer className="library-panel__footer">
            <button
              type="button"
              className="ts-button ts-button--primary"
              disabled={isBusy || session === undefined}
              onClick={() => void copyActiveDocumentToLibrary()}
            >
              Add Active to Library
            </button>
          </footer>
        </div>
      ) : null}
    </aside>
  );
}
