export const SKIN_FILE_CHANNELS = {
  open: 'skin-file:open',
  save: 'skin-file:save',
  saveAs: 'skin-file:save-as',
  listRecent: 'skin-file:list-recent',
  openRecent: 'skin-file:open-recent',
  removeRecent: 'skin-file:remove-recent',
  recordRecent: 'skin-file:record-recent',
  command: 'skin-file:command',
} as const;

export const SKIN_LIBRARY_CHANNELS = {
  list: 'skin-library:list',
  open: 'skin-library:open',
  rename: 'skin-library:rename',
  duplicate: 'skin-library:duplicate',
  delete: 'skin-library:delete',
  copyIn: 'skin-library:copy-in',
  reveal: 'skin-library:reveal',
  createCollection: 'skin-library:create-collection',
  renameCollection: 'skin-library:rename-collection',
  deleteCollection: 'skin-library:delete-collection',
  setEntryCollections: 'skin-library:set-entry-collections',
} as const;

export const PREVIEW_CHANNELS = {
  openPopout: 'preview:open-popout',
  publish: 'preview:publish',
  ready: 'preview:ready',
  update: 'preview:update',
  closed: 'preview:closed',
  saveSnapshot: 'preview:save-snapshot',
} as const;

export const APP_LIFECYCLE_CHANNELS = {
  confirmUnsaved: 'app-lifecycle:confirm-unsaved',
  documentState: 'app-lifecycle:document-state',
  closeRequest: 'app-lifecycle:close-request',
  closeResponse: 'app-lifecycle:close-response',
} as const;

export const MAX_RECENT_SKINS = 12 as const;

export const SKIN_EDIT_CHANNELS = {
  command: 'skin-edit:command',
  state: 'skin-edit:state',
} as const;

export type FileCommand = 'new' | 'open' | 'save' | 'saveAs' | 'saveAll';
export type EditCommand = 'undo' | 'redo' | 'copy' | 'cut' | 'paste' | 'delete';

export interface EditCommandState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export interface NativeFileError {
  readonly code: 'read_failed' | 'write_failed';
  readonly message: string;
}

export type OpenSkinPngResult =
  | { readonly status: 'canceled' }
  | {
      readonly status: 'success';
      readonly filePath: string;
      readonly displayName: string;
      readonly bytes: Uint8Array;
    }
  | { readonly status: 'error'; readonly error: NativeFileError };

export interface SaveSkinPngRequest {
  readonly filePath: string;
  readonly bytes: Uint8Array;
}

export type SaveSkinPngResult =
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly error: NativeFileError };

export interface SaveSkinPngAsRequest {
  readonly suggestedName: string;
  readonly bytes: Uint8Array;
}

export type SaveSkinPngAsResult =
  | { readonly status: 'canceled' }
  | {
      readonly status: 'success';
      readonly filePath: string;
      readonly displayName: string;
    }
  | { readonly status: 'error'; readonly error: NativeFileError };

export interface NativeSkinFileApi {
  openSkinPng(): Promise<OpenSkinPngResult>;
  saveSkinPng(request: SaveSkinPngRequest): Promise<SaveSkinPngResult>;
  saveSkinPngAs(request: SaveSkinPngAsRequest): Promise<SaveSkinPngAsResult>;
  listRecentSkins?(): Promise<RecentSkinListResult>;
  openRecentSkin?(filePath: string): Promise<OpenSkinPngResult>;
  removeRecentSkin?(filePath: string): Promise<SkinLibraryActionResult>;
  recordRecentSkin?(
    request: RecordRecentSkinRequest,
  ): Promise<SkinLibraryActionResult>;
  /** Resolves an OS-backed dropped File path without exposing file access. */
  getPathForDroppedFile?(file: unknown): string;
  onFileCommand(listener: (command: FileCommand) => void): () => void;
}

export interface SkinLibraryEntry {
  readonly filePath: string;
  readonly displayName: string;
  readonly byteLength: number;
  /** Derived display data; never used as document authority. */
  readonly thumbnailDataUrl?: string;
  readonly collectionIds: readonly string[];
}

export interface SkinLibraryCollection {
  readonly id: string;
  readonly displayName: string;
  readonly entryCount: number;
}

export type SkinLibraryListResult =
  | {
      readonly status: 'success';
      readonly rootDisplayName: string;
      readonly entries: readonly SkinLibraryEntry[];
      readonly collections: readonly SkinLibraryCollection[];
    }
  | { readonly status: 'error'; readonly error: NativeFileError };

export type SkinLibraryMutationResult =
  | { readonly status: 'success'; readonly entry: SkinLibraryEntry }
  | { readonly status: 'error'; readonly error: NativeFileError };

export interface RenameSkinLibraryRequest {
  readonly filePath: string;
  readonly displayName: string;
}

export interface CopySkinToLibraryRequest {
  readonly suggestedName: string;
  readonly bytes: Uint8Array;
}

export interface CreateSkinLibraryCollectionRequest {
  readonly displayName: string;
}

export interface RenameSkinLibraryCollectionRequest {
  readonly collectionId: string;
  readonly displayName: string;
}

export interface SetSkinLibraryEntryCollectionsRequest {
  readonly filePath: string;
  readonly collectionIds: readonly string[];
}

export type SkinLibraryCollectionMutationResult =
  | { readonly status: 'success'; readonly collection: SkinLibraryCollection }
  | { readonly status: 'error'; readonly error: NativeFileError };

export type SkinLibraryActionResult =
  | { readonly status: 'success' }
  | { readonly status: 'error'; readonly error: NativeFileError };

export interface RecentSkinEntry {
  readonly filePath: string;
  readonly displayName: string;
  readonly lastOpenedAt: number;
  readonly isAvailable: boolean;
  /** Derived display data; never used as document authority. */
  readonly thumbnailDataUrl?: string;
}

export type RecentSkinListResult =
  | { readonly status: 'success'; readonly entries: readonly RecentSkinEntry[] }
  | { readonly status: 'error'; readonly error: NativeFileError };

export interface RecordRecentSkinRequest {
  readonly filePath: string;
  readonly displayName: string;
}

export interface NativeSkinLibraryApi {
  listLibrarySkins(): Promise<SkinLibraryListResult>;
  openLibrarySkin(filePath: string): Promise<OpenSkinPngResult>;
  renameLibrarySkin(
    request: RenameSkinLibraryRequest,
  ): Promise<SkinLibraryMutationResult>;
  duplicateLibrarySkin(filePath: string): Promise<SkinLibraryMutationResult>;
  deleteLibrarySkin(filePath: string): Promise<SkinLibraryActionResult>;
  copySkinToLibrary(
    request: CopySkinToLibraryRequest,
  ): Promise<SkinLibraryMutationResult>;
  revealLibrarySkin(filePath: string): Promise<SkinLibraryActionResult>;
  createLibraryCollection(
    request: CreateSkinLibraryCollectionRequest,
  ): Promise<SkinLibraryCollectionMutationResult>;
  renameLibraryCollection(
    request: RenameSkinLibraryCollectionRequest,
  ): Promise<SkinLibraryCollectionMutationResult>;
  deleteLibraryCollection(
    collectionId: string,
  ): Promise<SkinLibraryActionResult>;
  setLibraryEntryCollections(
    request: SetSkinLibraryEntryCollectionsRequest,
  ): Promise<SkinLibraryActionResult>;
}

export type PreviewBodyPart =
  'head' | 'torso' | 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
export type PreviewSkinLayer = 'base' | 'outer';
export type PreviewSkinModel = 'classic' | 'slim';

export interface PreviewVisibilityState {
  readonly bodyParts: Readonly<Record<PreviewBodyPart, boolean>>;
  readonly layers: Readonly<Record<PreviewSkinLayer, boolean>>;
}

export interface PopoutPreviewState {
  readonly documentId: string;
  readonly displayName: string;
  readonly model: PreviewSkinModel;
  readonly revision: number;
  readonly pngBytes: Uint8Array;
  readonly visibility: PreviewVisibilityState;
}

export interface OpenPopoutPreviewRequest {
  readonly documentId: string;
  readonly displayName: string;
}

export type OpenPopoutPreviewResult =
  | { readonly status: 'opened' }
  | { readonly status: 'already_open' }
  | { readonly status: 'error'; readonly error: NativeFileError };

export interface SavePreviewSnapshotRequest {
  readonly suggestedName: string;
  readonly dataUrl: string;
}

export type SavePreviewSnapshotResult =
  | { readonly status: 'canceled' }
  | {
      readonly status: 'success';
      readonly filePath: string;
      readonly displayName: string;
    }
  | { readonly status: 'error'; readonly error: NativeFileError };

export interface NativePreviewApi {
  openPopoutPreview(
    request: OpenPopoutPreviewRequest,
  ): Promise<OpenPopoutPreviewResult>;
  publishPopoutPreview(state: PopoutPreviewState): void;
  onPopoutPreviewState(
    listener: (state: PopoutPreviewState) => void,
  ): () => void;
  notifyPopoutPreviewReady(): void;
  onPopoutPreviewClosed(listener: () => void): () => void;
  savePreviewSnapshot(
    request: SavePreviewSnapshotRequest,
  ): Promise<SavePreviewSnapshotResult>;
}

export interface NativeSkinEditApi {
  setCommandState(state: EditCommandState): void;
  onEditCommand(listener: (command: EditCommand) => void): () => void;
}

export type UnsavedChangesDecision = 'save' | 'discard' | 'cancel';

export interface UnsavedChangesRequest {
  readonly displayName: string;
}

export interface DocumentPresentationState {
  readonly hasDocument: boolean;
  readonly displayName?: string;
  readonly isDirty: boolean;
  readonly hasDirtyDocuments: boolean;
  readonly isBusy: boolean;
}

export interface CloseRequestResponse {
  readonly requestId: number;
  readonly shouldClose: boolean;
}

export interface NativeAppLifecycleApi {
  confirmUnsavedChanges(
    request: UnsavedChangesRequest,
  ): Promise<UnsavedChangesDecision>;
  setDocumentState(state: DocumentPresentationState): void;
  onCloseRequest(listener: (requestId: number) => void): () => void;
  respondToCloseRequest(response: CloseRequestResponse): void;
}
