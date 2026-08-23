import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

import type {
  EditCommand,
  FileCommand,
  NativeSkinEditApi,
  NativeSkinFileApi,
} from '../../../electron/fileContract';
import {
  DocumentSessionController,
  type DocumentSessionState,
} from './documentSession';
import { cancelActiveEditorInteraction } from '../editor/activeEditorInteraction';

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

const unavailableEditApi: NativeSkinEditApi = {
  setCommandState() {},
  onEditCommand() {
    return () => undefined;
  },
};

const nativeEdits = window.skinEdits ?? unavailableEditApi;

export const documentSessionController = new DocumentSessionController(
  nativeFiles,
  () => crypto.randomUUID(),
);

const documentSessionStore = createStore<DocumentSessionState>(() =>
  documentSessionController.getState(),
);

documentSessionController.subscribe((state) => {
  documentSessionStore.setState(state, true);
  nativeEdits.setCommandState({
    canUndo: state.canUndo,
    canRedo: state.canRedo,
  });
});

nativeEdits.setCommandState({ canUndo: false, canRedo: false });

function runFileCommand(command: FileCommand): void {
  cancelActiveEditorInteraction();
  if (command === 'open') {
    void documentSessionController.open();
  } else if (command === 'save') {
    void documentSessionController.save();
  } else {
    void documentSessionController.saveAs();
  }
}

nativeFiles.onFileCommand(runFileCommand);

function runEditCommand(command: EditCommand): void {
  cancelActiveEditorInteraction();
  if (command === 'undo') {
    documentSessionController.undo();
  } else {
    documentSessionController.redo();
  }
}

nativeEdits.onEditCommand(runEditCommand);

export function useDocumentSessionState(): DocumentSessionState {
  return useStore(documentSessionStore);
}
