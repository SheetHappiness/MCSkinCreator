import { contextBridge, ipcRenderer, webUtils } from 'electron';

import type {
  CloseRequestResponse,
  CopySkinToLibraryRequest,
  DocumentPresentationState,
  EditCommand,
  EditCommandState,
  FileCommand,
  NativeAppLifecycleApi,
  NativePreviewApi,
  NativeSkinEditApi,
  NativeSkinFileApi,
  NativeSkinLibraryApi,
  OpenSkinPngResult,
  OpenPopoutPreviewRequest,
  OpenPopoutPreviewResult,
  PopoutPreviewState,
  RenameSkinLibraryRequest,
  SaveSkinPngAsRequest,
  SaveSkinPngAsResult,
  SaveSkinPngRequest,
  SaveSkinPngResult,
  SavePreviewSnapshotRequest,
  SavePreviewSnapshotResult,
  SkinLibraryActionResult,
  SkinLibraryListResult,
  SkinLibraryMutationResult,
  UnsavedChangesDecision,
  UnsavedChangesRequest,
} from './fileContract';

// Sandboxed Electron preloads cannot require neighboring compiled modules.
// Keep channel values local while the imported shared types enforce the API.
const SKIN_FILE_CHANNELS = {
  open: 'skin-file:open',
  save: 'skin-file:save',
  saveAs: 'skin-file:save-as',
  command: 'skin-file:command',
} as const;

const SKIN_EDIT_CHANNELS = {
  command: 'skin-edit:command',
  state: 'skin-edit:state',
} as const;

const SKIN_LIBRARY_CHANNELS = {
  list: 'skin-library:list',
  open: 'skin-library:open',
  rename: 'skin-library:rename',
  duplicate: 'skin-library:duplicate',
  delete: 'skin-library:delete',
  copyIn: 'skin-library:copy-in',
} as const;

const PREVIEW_CHANNELS = {
  openPopout: 'preview:open-popout',
  publish: 'preview:publish',
  ready: 'preview:ready',
  update: 'preview:update',
  closed: 'preview:closed',
  saveSnapshot: 'preview:save-snapshot',
} as const;

const APP_LIFECYCLE_CHANNELS = {
  confirmUnsaved: 'app-lifecycle:confirm-unsaved',
  documentState: 'app-lifecycle:document-state',
  closeRequest: 'app-lifecycle:close-request',
  closeResponse: 'app-lifecycle:close-response',
} as const;

const skinFileApi: NativeSkinFileApi = {
  async openSkinPng(): Promise<OpenSkinPngResult> {
    return ipcRenderer.invoke(
      SKIN_FILE_CHANNELS.open,
    ) as Promise<OpenSkinPngResult>;
  },
  async saveSkinPng(request: SaveSkinPngRequest): Promise<SaveSkinPngResult> {
    return ipcRenderer.invoke(
      SKIN_FILE_CHANNELS.save,
      request,
    ) as Promise<SaveSkinPngResult>;
  },
  async saveSkinPngAs(
    request: SaveSkinPngAsRequest,
  ): Promise<SaveSkinPngAsResult> {
    return ipcRenderer.invoke(
      SKIN_FILE_CHANNELS.saveAs,
      request,
    ) as Promise<SaveSkinPngAsResult>;
  },
  getPathForDroppedFile(file: unknown): string {
    try {
      return webUtils.getPathForFile(
        file as Parameters<typeof webUtils.getPathForFile>[0],
      );
    } catch {
      return '';
    }
  },
  onFileCommand(listener: (command: FileCommand) => void): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      command: FileCommand,
    ) => {
      if (
        command === 'new' ||
        command === 'open' ||
        command === 'save' ||
        command === 'saveAs' ||
        command === 'saveAll'
      ) {
        listener(command);
      }
    };

    ipcRenderer.on(SKIN_FILE_CHANNELS.command, handler);
    return () => {
      ipcRenderer.removeListener(SKIN_FILE_CHANNELS.command, handler);
    };
  },
};

const skinLibraryApi: NativeSkinLibraryApi = {
  async listLibrarySkins(): Promise<SkinLibraryListResult> {
    return ipcRenderer.invoke(
      SKIN_LIBRARY_CHANNELS.list,
    ) as Promise<SkinLibraryListResult>;
  },
  async openLibrarySkin(filePath: string): Promise<OpenSkinPngResult> {
    return ipcRenderer.invoke(
      SKIN_LIBRARY_CHANNELS.open,
      filePath,
    ) as Promise<OpenSkinPngResult>;
  },
  async renameLibrarySkin(
    request: RenameSkinLibraryRequest,
  ): Promise<SkinLibraryMutationResult> {
    return ipcRenderer.invoke(
      SKIN_LIBRARY_CHANNELS.rename,
      request,
    ) as Promise<SkinLibraryMutationResult>;
  },
  async duplicateLibrarySkin(
    filePath: string,
  ): Promise<SkinLibraryMutationResult> {
    return ipcRenderer.invoke(
      SKIN_LIBRARY_CHANNELS.duplicate,
      filePath,
    ) as Promise<SkinLibraryMutationResult>;
  },
  async deleteLibrarySkin(filePath: string): Promise<SkinLibraryActionResult> {
    return ipcRenderer.invoke(
      SKIN_LIBRARY_CHANNELS.delete,
      filePath,
    ) as Promise<SkinLibraryActionResult>;
  },
  async copySkinToLibrary(
    request: CopySkinToLibraryRequest,
  ): Promise<SkinLibraryMutationResult> {
    return ipcRenderer.invoke(
      SKIN_LIBRARY_CHANNELS.copyIn,
      request,
    ) as Promise<SkinLibraryMutationResult>;
  },
};

function isPopoutPreviewState(value: unknown): value is PopoutPreviewState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<PopoutPreviewState>;
  if (
    typeof state.documentId !== 'string' ||
    typeof state.displayName !== 'string' ||
    (state.model !== 'classic' && state.model !== 'slim') ||
    !Number.isSafeInteger(state.revision) ||
    !(state.pngBytes instanceof Uint8Array) ||
    typeof state.visibility !== 'object' ||
    state.visibility === null
  ) {
    return false;
  }
  const visibility = state.visibility;
  const bodyParts = [
    'head',
    'torso',
    'rightArm',
    'leftArm',
    'rightLeg',
    'leftLeg',
  ] as const;
  const layers = ['base', 'outer'] as const;
  const visibilityRecord = visibility as {
    bodyParts?: Record<string, unknown>;
    layers?: Record<string, unknown>;
  };
  return (
    visibilityRecord.bodyParts !== undefined &&
    visibilityRecord.layers !== undefined &&
    bodyParts.every(
      (bodyPart) => typeof visibilityRecord.bodyParts?.[bodyPart] === 'boolean',
    ) &&
    layers.every(
      (layer) => typeof visibilityRecord.layers?.[layer] === 'boolean',
    )
  );
}

const previewApi: NativePreviewApi = {
  async openPopoutPreview(
    request: OpenPopoutPreviewRequest,
  ): Promise<OpenPopoutPreviewResult> {
    return ipcRenderer.invoke(
      PREVIEW_CHANNELS.openPopout,
      request,
    ) as Promise<OpenPopoutPreviewResult>;
  },
  publishPopoutPreview(state: PopoutPreviewState): void {
    ipcRenderer.send(PREVIEW_CHANNELS.publish, state);
  },
  onPopoutPreviewState(
    listener: (state: PopoutPreviewState) => void,
  ): () => void {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
      if (isPopoutPreviewState(value)) listener(value);
    };
    ipcRenderer.on(PREVIEW_CHANNELS.update, handler);
    return () => ipcRenderer.removeListener(PREVIEW_CHANNELS.update, handler);
  },
  notifyPopoutPreviewReady(): void {
    ipcRenderer.send(PREVIEW_CHANNELS.ready);
  },
  onPopoutPreviewClosed(listener: () => void): () => void {
    const handler = () => listener();
    ipcRenderer.on(PREVIEW_CHANNELS.closed, handler);
    return () => ipcRenderer.removeListener(PREVIEW_CHANNELS.closed, handler);
  },
  async savePreviewSnapshot(
    request: SavePreviewSnapshotRequest,
  ): Promise<SavePreviewSnapshotResult> {
    return ipcRenderer.invoke(
      PREVIEW_CHANNELS.saveSnapshot,
      request,
    ) as Promise<SavePreviewSnapshotResult>;
  },
};

const skinEditApi: NativeSkinEditApi = {
  setCommandState(state: EditCommandState): void {
    ipcRenderer.send(SKIN_EDIT_CHANNELS.state, state);
  },
  onEditCommand(listener: (command: EditCommand) => void): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      command: EditCommand,
    ) => {
      if (command === 'undo' || command === 'redo') {
        listener(command);
      }
    };

    ipcRenderer.on(SKIN_EDIT_CHANNELS.command, handler);
    return () => {
      ipcRenderer.removeListener(SKIN_EDIT_CHANNELS.command, handler);
    };
  },
};

const appLifecycleApi: NativeAppLifecycleApi = {
  async confirmUnsavedChanges(
    request: UnsavedChangesRequest,
  ): Promise<UnsavedChangesDecision> {
    return ipcRenderer.invoke(
      APP_LIFECYCLE_CHANNELS.confirmUnsaved,
      request,
    ) as Promise<UnsavedChangesDecision>;
  },
  setDocumentState(state: DocumentPresentationState): void {
    ipcRenderer.send(APP_LIFECYCLE_CHANNELS.documentState, state);
  },
  onCloseRequest(listener: (requestId: number) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
      if (Number.isSafeInteger(value) && Number(value) > 0) {
        listener(Number(value));
      }
    };
    ipcRenderer.on(APP_LIFECYCLE_CHANNELS.closeRequest, handler);
    return () => {
      ipcRenderer.removeListener(APP_LIFECYCLE_CHANNELS.closeRequest, handler);
    };
  },
  respondToCloseRequest(response: CloseRequestResponse): void {
    ipcRenderer.send(APP_LIFECYCLE_CHANNELS.closeResponse, response);
  },
};

contextBridge.exposeInMainWorld('skinFiles', skinFileApi);
contextBridge.exposeInMainWorld('skinLibrary', skinLibraryApi);
contextBridge.exposeInMainWorld('preview', previewApi);
contextBridge.exposeInMainWorld('skinEdits', skinEditApi);
contextBridge.exposeInMainWorld('appLifecycle', appLifecycleApi);
