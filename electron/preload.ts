import { contextBridge, ipcRenderer } from 'electron';

import type {
  FileCommand,
  NativeSkinFileApi,
  OpenSkinPngResult,
  SaveSkinPngAsRequest,
  SaveSkinPngAsResult,
  SaveSkinPngRequest,
  SaveSkinPngResult,
} from './fileContract';

// Sandboxed Electron preloads cannot require neighboring compiled modules.
// Keep channel values local while the imported shared types enforce the API.
const SKIN_FILE_CHANNELS = {
  open: 'skin-file:open',
  save: 'skin-file:save',
  saveAs: 'skin-file:save-as',
  command: 'skin-file:command',
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

contextBridge.exposeInMainWorld('skinFiles', skinFileApi);
