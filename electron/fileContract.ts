export const SKIN_FILE_CHANNELS = {
  open: 'skin-file:open',
  save: 'skin-file:save',
  saveAs: 'skin-file:save-as',
  command: 'skin-file:command',
} as const;

export const APP_LIFECYCLE_CHANNELS = {
  confirmUnsaved: 'app-lifecycle:confirm-unsaved',
  documentState: 'app-lifecycle:document-state',
  closeRequest: 'app-lifecycle:close-request',
  closeResponse: 'app-lifecycle:close-response',
} as const;

export const SKIN_EDIT_CHANNELS = {
  command: 'skin-edit:command',
  state: 'skin-edit:state',
} as const;

export type FileCommand = 'open' | 'save' | 'saveAs';
export type EditCommand = 'undo' | 'redo';

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
  onFileCommand(listener: (command: FileCommand) => void): () => void;
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
