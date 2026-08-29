import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';

import {
  APP_LIFECYCLE_CHANNELS,
  SKIN_EDIT_CHANNELS,
  SKIN_FILE_CHANNELS,
  type CloseRequestResponse,
  type DocumentPresentationState,
  type EditCommand,
  type EditCommandState,
  type FileCommand,
  type UnsavedChangesDecision,
  type UnsavedChangesRequest,
} from './fileContract';
import { registerSkinFileIpc } from './skinFileIpc';
import { WindowCloseCoordinator } from './windowCloseCoordinator';

const DEVELOPMENT_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const E2E_MODE = process.env.MINECRAFT_SKIN_EDITOR_E2E === '1';
const APPLICATION_TITLE = 'Minecraft Skin Editor';

interface WindowLifecycleState {
  readonly window: BrowserWindow;
  readonly closeCoordinator: WindowCloseCoordinator;
  presentation?: DocumentPresentationState;
}

const windowLifecycleStates = new Map<number, WindowLifecycleState>();

async function createMainWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    show: false,
    backgroundColor: '#202225',
    title: APPLICATION_TITLE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const lifecycleState: WindowLifecycleState = {
    window: mainWindow,
    closeCoordinator: new WindowCloseCoordinator(),
  };
  const webContentsId = mainWindow.webContents.id;
  windowLifecycleStates.set(webContentsId, lifecycleState);

  mainWindow.on('close', (event) => {
    if (lifecycleState.presentation?.isDirty !== true) {
      return;
    }

    const attempt = lifecycleState.closeCoordinator.handleCloseAttempt();
    if (!attempt.preventDefault) {
      return;
    }

    event.preventDefault();
    if (attempt.requestId !== undefined) {
      mainWindow.webContents.send(
        APP_LIFECYCLE_CHANNELS.closeRequest,
        attempt.requestId,
      );
    }
  });
  mainWindow.on('closed', () => {
    windowLifecycleStates.delete(webContentsId);
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (DEVELOPMENT_SERVER_URL !== undefined) {
    await mainWindow.loadURL(DEVELOPMENT_SERVER_URL);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function sendFileCommand(command: FileCommand): void {
  const targetWindow =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  targetWindow?.webContents.send(SKIN_FILE_CHANNELS.command, command);
}

function sendEditCommand(command: EditCommand): void {
  const targetWindow =
    BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  targetWindow?.webContents.send(SKIN_EDIT_CHANNELS.command, command);
}

function setEditCommandState(state: EditCommandState): void {
  const menu = Menu.getApplicationMenu();
  const undo = menu?.getMenuItemById('edit-undo');
  const redo = menu?.getMenuItemById('edit-redo');

  if (undo != null) {
    undo.enabled = state.canUndo;
  }
  if (redo != null) {
    redo.enabled = state.canRedo;
  }
}

function setDocumentPresentationState(
  targetWindow: BrowserWindow,
  state: DocumentPresentationState,
): void {
  const lifecycleState = windowLifecycleStates.get(targetWindow.webContents.id);
  if (lifecycleState !== undefined) {
    lifecycleState.presentation = state;
  }

  const menu = Menu.getApplicationMenu();
  const save = menu?.getMenuItemById('file-save');
  const saveAs = menu?.getMenuItemById('file-save-as');
  if (save != null) {
    save.enabled = state.hasDocument && state.isDirty && !state.isBusy;
  }
  if (saveAs != null) {
    saveAs.enabled = state.hasDocument && !state.isBusy;
  }

  const documentName = state.hasDocument ? state.displayName : undefined;
  targetWindow.setTitle(
    documentName === undefined
      ? APPLICATION_TITLE
      : `${documentName}${state.isDirty ? ' •' : ''} — ${APPLICATION_TITLE}`,
  );
}

function isEditCommandState(value: unknown): value is EditCommandState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const state = value as Partial<EditCommandState>;
  return (
    typeof state.canUndo === 'boolean' && typeof state.canRedo === 'boolean'
  );
}

function isDocumentPresentationState(
  value: unknown,
): value is DocumentPresentationState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const state = value as Partial<DocumentPresentationState>;
  return (
    typeof state.hasDocument === 'boolean' &&
    typeof state.isDirty === 'boolean' &&
    typeof state.isBusy === 'boolean' &&
    (state.displayName === undefined ||
      (typeof state.displayName === 'string' &&
        state.displayName.length > 0 &&
        state.displayName.length <= 260)) &&
    (!state.hasDocument || state.displayName !== undefined)
  );
}

function isUnsavedChangesRequest(
  value: unknown,
): value is UnsavedChangesRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const request = value as Partial<UnsavedChangesRequest>;
  return (
    typeof request.displayName === 'string' &&
    request.displayName.trim().length > 0 &&
    request.displayName.length <= 260
  );
}

function isCloseRequestResponse(value: unknown): value is CloseRequestResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const response = value as Partial<CloseRequestResponse>;
  return (
    Number.isSafeInteger(response.requestId) &&
    Number(response.requestId) > 0 &&
    typeof response.shouldClose === 'boolean'
  );
}

function e2eUnsavedDecision(): UnsavedChangesDecision | undefined {
  const decision = process.env.MINECRAFT_SKIN_EDITOR_E2E_UNSAVED_DECISION;
  return decision === 'save' || decision === 'discard' || decision === 'cancel'
    ? decision
    : undefined;
}

function registerAppLifecycleIpc(): void {
  ipcMain.handle(
    APP_LIFECYCLE_CHANNELS.confirmUnsaved,
    async (event, value: unknown): Promise<UnsavedChangesDecision> => {
      if (!isUnsavedChangesRequest(value)) {
        return 'cancel';
      }

      if (E2E_MODE) {
        return e2eUnsavedDecision() ?? 'cancel';
      }

      const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
      const options = {
        type: 'warning' as const,
        buttons: ['Save', "Don't Save", 'Cancel'],
        defaultId: 0,
        cancelId: 2,
        noLink: true,
        title: 'Unsaved changes',
        message: `Save changes to ${value.displayName}?`,
        detail: 'Your changes will be lost if you continue without saving.',
      };
      const result = owner
        ? await dialog.showMessageBox(owner, options)
        : await dialog.showMessageBox(options);
      return result.response === 0
        ? 'save'
        : result.response === 1
          ? 'discard'
          : 'cancel';
    },
  );

  ipcMain.on(APP_LIFECYCLE_CHANNELS.documentState, (event, value: unknown) => {
    if (!isDocumentPresentationState(value)) {
      return;
    }
    const targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (targetWindow !== null) {
      setDocumentPresentationState(targetWindow, value);
    }
  });

  ipcMain.on(APP_LIFECYCLE_CHANNELS.closeResponse, (event, value: unknown) => {
    if (!isCloseRequestResponse(value)) {
      return;
    }
    const lifecycleState = windowLifecycleStates.get(event.sender.id);
    if (
      lifecycleState !== undefined &&
      lifecycleState.closeCoordinator.resolve(
        value.requestId,
        value.shouldClose,
      )
    ) {
      lifecycleState.window.close();
    }
  });
}

function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? ([{ role: 'appMenu' }] satisfies MenuItemConstructorOptions[])
      : []),
    {
      label: 'File',
      submenu: [
        {
          id: 'file-new',
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendFileCommand('new'),
        },
        {
          id: 'file-open',
          label: 'Open…',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendFileCommand('open'),
        },
        { type: 'separator' },
        {
          id: 'file-save',
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          enabled: false,
          click: () => sendFileCommand('save'),
        },
        {
          id: 'file-save-as',
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          enabled: false,
          click: () => sendFileCommand('saveAs'),
        },
        ...(process.platform === 'darwin'
          ? []
          : ([
              { type: 'separator' },
              { role: 'quit' },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },
    {
      label: 'Edit',
      submenu: [
        {
          id: 'edit-undo',
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          enabled: false,
          click: () => sendEditCommand('undo'),
        },
        {
          id: 'edit-redo',
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Y',
          enabled: false,
          click: () => sendEditCommand('redo'),
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(async () => {
  registerSkinFileIpc();
  registerAppLifecycleIpc();
  installApplicationMenu();
  ipcMain.on(SKIN_EDIT_CHANNELS.state, (_event, value: unknown) => {
    if (isEditCommandState(value)) {
      setEditCommandState(value);
    }
  });
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
