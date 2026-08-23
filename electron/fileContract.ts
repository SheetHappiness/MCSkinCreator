export const SKIN_FILE_CHANNELS = {
  open: 'skin-file:open',
  save: 'skin-file:save',
  saveAs: 'skin-file:save-as',
  command: 'skin-file:command',
} as const;

export type FileCommand = 'open' | 'save' | 'saveAs';

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
