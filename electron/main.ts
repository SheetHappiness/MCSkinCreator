import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';

import {
  SKIN_EDIT_CHANNELS,
  SKIN_FILE_CHANNELS,
  type EditCommand,
  type EditCommandState,
  type FileCommand,
} from './fileContract';
import { registerSkinFileIpc } from './skinFileIpc';

const DEVELOPMENT_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

async function createMainWindow(): Promise<void> {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 800,
    minHeight: 560,
    show: false,
    backgroundColor: '#202225',
    title: 'Minecraft Skin Editor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
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

function isEditCommandState(value: unknown): value is EditCommandState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const state = value as Partial<EditCommandState>;
  return (
    typeof state.canUndo === 'boolean' && typeof state.canRedo === 'boolean'
  );
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
          click: () => sendFileCommand('save'),
        },
        {
          id: 'file-save-as',
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
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
