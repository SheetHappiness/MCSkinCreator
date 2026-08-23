import { contextBridge, ipcRenderer } from 'electron';

import type {
  CloseRequestResponse,
  DocumentPresentationState,
  EditCommand,
  EditCommandState,
  FileCommand,
  NativeAppLifecycleApi,
  NativeSkinEditApi,
  NativeSkinFileApi,
  OpenSkinPngResult,
  SaveSkinPngAsRequest,
  SaveSkinPngAsResult,
  SaveSkinPngRequest,
  SaveSkinPngResult,
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
  onFileCommand(listener: (command: FileCommand) => void): () => void {
    const handler = (
      _event: Electron.IpcRendererEvent,
      command: FileCommand,
    ) => {
      if (command === 'open' || command === 'save' || command === 'saveAs') {
        listener(command);
      }
    };

    ipcRenderer.on(SKIN_FILE_CHANNELS.command, handler);
    return () => {
      ipcRenderer.removeListener(SKIN_FILE_CHANNELS.command, handler);
    };
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
contextBridge.exposeInMainWorld('skinEdits', skinEditApi);
contextBridge.exposeInMainWorld('appLifecycle', appLifecycleApi);
