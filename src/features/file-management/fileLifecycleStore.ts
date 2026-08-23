import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

import type {
  FileCommand,
  NativeSkinFileApi,
} from '../../../electron/fileContract';
import {
  DocumentSessionController,
  type DocumentSessionState,
} from './documentSession';

const unavailableNativeApi: NativeSkinFileApi = {
  async openSkinPng() {
    return {
      status: 'error',
      error: {
        code: 'read_failed',
        message: 'Native file access is unavailable.',
      },
    };
  },
  async saveSkinPng() {
    return {
      status: 'error',
      error: {
        code: 'write_failed',
        message: 'Native file access is unavailable.',
      },
    };
  },
  async saveSkinPngAs() {
    return {
      status: 'error',
      error: {
        code: 'write_failed',
        message: 'Native file access is unavailable.',
      },
    };
  },
  onFileCommand() {
    return () => undefined;
  },
};

const nativeFiles = window.skinFiles ?? unavailableNativeApi;

export const documentSessionController = new DocumentSessionController(
  nativeFiles,
  () => crypto.randomUUID(),
);

const documentSessionStore = createStore<DocumentSessionState>(() =>
  documentSessionController.getState(),
);

documentSessionController.subscribe((state) => {
  documentSessionStore.setState(state, true);
});

function runFileCommand(command: FileCommand): void {
  if (command === 'open') {
    void documentSessionController.open();
  } else if (command === 'save') {
    void documentSessionController.save();
  } else {
    void documentSessionController.saveAs();
  }
}

nativeFiles.onFileCommand(runFileCommand);

export function useDocumentSessionState(): DocumentSessionState {
  return useStore(documentSessionStore);
}
