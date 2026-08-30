import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

import type {
  EditCommand,
  FileCommand,
  NativeAppLifecycleApi,
  NativeSkinEditApi,
  NativeSkinFileApi,
} from '../../../electron/fileContract';
import {
  DocumentSessionController,
  type FileCommandOutcome,
  type DocumentSessionState,
} from './documentSession';
import {
  cancelActiveEditorInteraction,
  dispatchActiveEditorCommand,
} from '../editor/activeEditorInteraction';
import { shouldRouteEditorCommandToCanvas } from '../editor/editorShortcuts';

interface NewSkinDialogState {
  readonly isOpen: boolean;
}

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

const unavailableLifecycleApi: NativeAppLifecycleApi = {
  async confirmUnsavedChanges() {
    return 'cancel';
  },
  setDocumentState() {},
  onCloseRequest() {
    return () => undefined;
  },
  respondToCloseRequest() {},
};

const nativeLifecycle = window.appLifecycle ?? unavailableLifecycleApi;

export const documentSessionController = new DocumentSessionController(
  nativeFiles,
  () => crypto.randomUUID(),
  (displayName) => nativeLifecycle.confirmUnsavedChanges({ displayName }),
);

const documentSessionStore = createStore<DocumentSessionState>(() =>
  documentSessionController.getState(),
);

const newSkinDialogStore = createStore<NewSkinDialogState>(() => ({
  isOpen: false,
}));

export function requestNewSkin(): void {
  newSkinDialogStore.setState({ isOpen: true });
}

export function closeNewSkinDialog(): void {
  newSkinDialogStore.setState({ isOpen: false });
}

documentSessionController.subscribe((state) => {
  documentSessionStore.setState(state, true);
  nativeEdits.setCommandState({
    canUndo: state.canUndo,
    canRedo: state.canRedo,
  });
  nativeLifecycle.setDocumentState({
    hasDocument: state.session !== undefined,
    ...(state.session === undefined
      ? {}
      : { displayName: state.session.displayName }),
    isDirty: state.session?.document.isDirty ?? false,
    hasDirtyDocuments: state.sessions.some(
      (session) => session.document.isDirty,
    ),
    isBusy: state.isBusy,
  });
});

nativeEdits.setCommandState({ canUndo: false, canRedo: false });
nativeLifecycle.setDocumentState({
  hasDocument: false,
  isDirty: false,
  hasDirtyDocuments: false,
  isBusy: false,
});

function runFileCommand(command: FileCommand): void {
  cancelActiveEditorInteraction();
  if (command === 'new') {
    requestNewSkin();
  } else if (command === 'open') {
    void documentSessionController.open();
  } else if (command === 'save') {
    void documentSessionController.save();
  } else if (command === 'saveAll') {
    void documentSessionController.saveAll();
  } else {
    void documentSessionController.saveAs();
  }
}

nativeFiles.onFileCommand(runFileCommand);

function runEditCommand(command: EditCommand): void {
  if (!shouldRouteEditorCommandToCanvas(document.activeElement)) return;

  if (command === 'undo') {
    cancelActiveEditorInteraction();
    documentSessionController.undo();
  } else if (command === 'redo') {
    cancelActiveEditorInteraction();
    documentSessionController.redo();
  } else {
    dispatchActiveEditorCommand(command);
  }
}

nativeEdits.onEditCommand(runEditCommand);

nativeLifecycle.onCloseRequest((requestId) => {
  cancelActiveEditorInteraction();
  void documentSessionController.prepareToClose().then((shouldClose) => {
    nativeLifecycle.respondToCloseRequest({ requestId, shouldClose });
  });
});

export function useDocumentSessionState(): DocumentSessionState {
  return useStore(documentSessionStore);
}

export function useNewSkinDialogOpen(): boolean {
  return useStore(newSkinDialogStore, (state) => state.isOpen);
}

export function activateDocument(documentId: string): boolean {
  cancelActiveEditorInteraction();
  return documentSessionController.activateDocument(documentId);
}

export function closeDocument(documentId: string): Promise<FileCommandOutcome> {
  cancelActiveEditorInteraction();
  return documentSessionController.closeDocument(documentId);
}
