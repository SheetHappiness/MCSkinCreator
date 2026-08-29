import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  PREVIEW_CHANNELS,
  type NativeFileError,
  type OpenPopoutPreviewRequest,
  type OpenPopoutPreviewResult,
  type PopoutPreviewState,
  type PreviewBodyPart,
  type SavePreviewSnapshotRequest,
  type SavePreviewSnapshotResult,
} from './fileContract';

const DEVELOPMENT_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const E2E_MODE = process.env.MINECRAFT_SKIN_EDITOR_E2E === '1';
const MAX_PREVIEW_PNG_BYTES = 16 * 1024 * 1024;
const MAX_PREVIEW_DATA_URL_LENGTH = 24 * 1024 * 1024;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PREVIEW_BODY_PARTS: readonly PreviewBodyPart[] = [
  'head',
  'torso',
  'rightArm',
  'leftArm',
  'rightLeg',
  'leftLeg',
];

interface PopoutInstance {
  readonly ownerWebContentsId: number;
  readonly boundDocumentId: string;
  readonly window: BrowserWindow;
  latestState?: PopoutPreviewState;
}

const popoutInstances = new Map<number, PopoutInstance>();

function error(
  code: NativeFileError['code'],
  message: string,
): NativeFileError {
  return { code, message };
}

function errorResult<T extends 'read_failed' | 'write_failed'>(
  code: T,
  message: string,
): { readonly status: 'error'; readonly error: NativeFileError } {
  return { status: 'error', error: error(code, message) };
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= PNG_SIGNATURE.length &&
    PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)
  );
}

function isOpenRequest(value: unknown): value is OpenPopoutPreviewRequest {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Partial<OpenPopoutPreviewRequest>;
  return (
    typeof request.documentId === 'string' &&
    request.documentId.length > 0 &&
    request.documentId.length <= 128 &&
    typeof request.displayName === 'string' &&
    request.displayName.trim().length > 0 &&
    request.displayName.length <= 260
  );
}

function isVisibilityState(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const visibility = value as Partial<PopoutPreviewState['visibility']>;
  if (
    typeof visibility.bodyParts !== 'object' ||
    visibility.bodyParts === null ||
    typeof visibility.layers !== 'object' ||
    visibility.layers === null
  ) {
    return false;
  }

  return (
    PREVIEW_BODY_PARTS.every(
      (bodyPart) => typeof visibility.bodyParts?.[bodyPart] === 'boolean',
    ) &&
    typeof visibility.layers.base === 'boolean' &&
    typeof visibility.layers.outer === 'boolean'
  );
}

function isPreviewState(value: unknown): value is PopoutPreviewState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Partial<PopoutPreviewState>;
  return (
    typeof state.documentId === 'string' &&
    state.documentId.length > 0 &&
    state.documentId.length <= 128 &&
    typeof state.displayName === 'string' &&
    state.displayName.trim().length > 0 &&
    state.displayName.length <= 260 &&
    (state.model === 'classic' || state.model === 'slim') &&
    Number.isSafeInteger(state.revision) &&
    Number(state.revision) >= 0 &&
    state.pngBytes instanceof Uint8Array &&
    state.pngBytes.byteLength > PNG_SIGNATURE.length &&
    state.pngBytes.byteLength <= MAX_PREVIEW_PNG_BYTES &&
    hasPngSignature(state.pngBytes) &&
    isVisibilityState(state.visibility)
  );
}

function clonePreviewState(state: PopoutPreviewState): PopoutPreviewState {
  return {
    documentId: state.documentId,
    displayName: state.displayName,
    model: state.model,
    revision: state.revision,
    pngBytes: new Uint8Array(state.pngBytes),
    visibility: {
      bodyParts: { ...state.visibility.bodyParts },
      layers: { ...state.visibility.layers },
    },
  };
}

function sendLatestState(instance: PopoutInstance): void {
  if (instance.latestState === undefined || instance.window.isDestroyed()) {
    return;
  }
  instance.window.webContents.send(
    PREVIEW_CHANNELS.update,
    instance.latestState,
  );
}

function configurePopoutWindow(popout: BrowserWindow): void {
  popout.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  popout.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  popout.once('ready-to-show', () => popout.show());
}

async function loadPopoutWindow(popout: BrowserWindow): Promise<void> {
  if (DEVELOPMENT_SERVER_URL !== undefined) {
    const separator = DEVELOPMENT_SERVER_URL.includes('?') ? '&' : '?';
    await popout.loadURL(`${DEVELOPMENT_SERVER_URL}${separator}popout=1`);
    return;
  }

  await popout.loadFile(path.join(__dirname, '../renderer/index.html'), {
    query: { popout: '1' },
  });
}

async function openPopoutPreview(
  event: IpcMainInvokeEvent,
  value: unknown,
): Promise<OpenPopoutPreviewResult> {
  if (!isOpenRequest(value)) {
    return errorResult(
      'write_failed',
      'The pop-out preview request was invalid.',
    );
  }

  const owner = BrowserWindow.fromWebContents(event.sender);
  if (owner === null) {
    return errorResult(
      'write_failed',
      'The pop-out preview could not identify its owner window.',
    );
  }

  const ownerWebContentsId = owner.webContents.id;
  const existing = popoutInstances.get(ownerWebContentsId);
  if (existing !== undefined) {
    if (!existing.window.isDestroyed()) {
      existing.window.focus();
      return { status: 'already_open' };
    }
    popoutInstances.delete(ownerWebContentsId);
  }

  const popout = new BrowserWindow({
    width: 760,
    height: 680,
    minWidth: 420,
    minHeight: 360,
    show: false,
    backgroundColor: '#1b1d20',
    title: `${value.displayName} — 3D Preview`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const instance: PopoutInstance = {
    ownerWebContentsId,
    boundDocumentId: value.documentId,
    window: popout,
  };
  popoutInstances.set(ownerWebContentsId, instance);
  configurePopoutWindow(popout);
  popout.webContents.on('did-finish-load', () => sendLatestState(instance));
  popout.on('closed', () => {
    if (popoutInstances.get(ownerWebContentsId)?.window !== popout) return;
    popoutInstances.delete(ownerWebContentsId);
    if (!owner.webContents.isDestroyed()) {
      owner.webContents.send(PREVIEW_CHANNELS.closed);
    }
  });

  try {
    await loadPopoutWindow(popout);
    return { status: 'opened' };
  } catch {
    popoutInstances.delete(ownerWebContentsId);
    if (!popout.isDestroyed()) popout.destroy();
    return errorResult(
      'write_failed',
      'The pop-out preview window could not be opened.',
    );
  }
}

function handlePublishedPreview(
  event: Electron.IpcMainEvent,
  value: unknown,
): void {
  if (!isPreviewState(value)) return;
  const instance = popoutInstances.get(event.sender.id);
  if (instance === undefined || value.documentId !== instance.boundDocumentId) {
    return;
  }
  instance.latestState = clonePreviewState(value);
  sendLatestState(instance);
}

function findInstanceForPopout(senderId: number): PopoutInstance | undefined {
  return [...popoutInstances.values()].find(
    (instance) => instance.window.webContents.id === senderId,
  );
}

function handlePopoutReady(event: Electron.IpcMainEvent): void {
  const instance = findInstanceForPopout(event.sender.id);
  if (instance !== undefined) sendLatestState(instance);
}

function isSafeSnapshotName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 260 &&
    value === value.trim() &&
    path.basename(value) === value &&
    path.extname(value).toLowerCase() === '.png'
  );
}

function decodeSnapshotDataUrl(value: unknown): Uint8Array | undefined {
  if (
    typeof value !== 'string' ||
    value.length > MAX_PREVIEW_DATA_URL_LENGTH ||
    !value.startsWith('data:image/png;base64,')
  ) {
    return undefined;
  }
  const encoded = value.slice('data:image/png;base64,'.length);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) return undefined;
  const bytes = new Uint8Array(Buffer.from(encoded, 'base64'));
  return hasPngSignature(bytes) && bytes.byteLength <= MAX_PREVIEW_PNG_BYTES
    ? bytes
    : undefined;
}

function isSnapshotRequest(
  value: unknown,
): value is SavePreviewSnapshotRequest {
  if (typeof value !== 'object' || value === null) return false;
  const request = value as Partial<SavePreviewSnapshotRequest>;
  return (
    isSafeSnapshotName(request.suggestedName) &&
    decodeSnapshotDataUrl(request.dataUrl) !== undefined
  );
}

async function savePreviewSnapshot(
  event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SavePreviewSnapshotResult> {
  if (!isSnapshotRequest(value)) {
    return errorResult(
      'write_failed',
      'The preview snapshot request was invalid.',
    );
  }

  if (
    E2E_MODE &&
    process.env.MINECRAFT_SKIN_EDITOR_E2E_SNAPSHOT_CANCEL === '1'
  ) {
    return { status: 'canceled' };
  }

  const bytes = decodeSnapshotDataUrl(value.dataUrl);
  if (bytes === undefined) {
    return errorResult(
      'write_failed',
      'The preview snapshot data was invalid.',
    );
  }

  try {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const testPath = E2E_MODE
      ? process.env.MINECRAFT_SKIN_EDITOR_E2E_SNAPSHOT_PATH
      : undefined;
    let selectedPath: string | undefined;
    if (testPath !== undefined) {
      selectedPath = testPath;
    } else {
      const options = {
        defaultPath: value.suggestedName,
        filters: [{ name: 'PNG images', extensions: ['png'] }],
      };
      const result = owner
        ? await dialog.showSaveDialog(owner, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || result.filePath === undefined) {
        return { status: 'canceled' };
      }
      selectedPath = result.filePath;
    }

    const filePath =
      path.extname(selectedPath).toLowerCase() === '.png'
        ? selectedPath
        : `${selectedPath}.png`;
    await writeFile(filePath, bytes);
    return {
      status: 'success',
      filePath,
      displayName: path.basename(filePath),
    };
  } catch {
    return errorResult(
      'write_failed',
      'The preview snapshot could not be saved. Check the destination and try again.',
    );
  }
}

export function closePopoutForOwner(ownerWebContentsId: number): void {
  const instance = popoutInstances.get(ownerWebContentsId);
  if (instance === undefined) return;
  if (instance.window.isDestroyed()) {
    popoutInstances.delete(ownerWebContentsId);
    return;
  }
  instance.window.close();
}

export function registerPreviewIpc(): void {
  ipcMain.handle(PREVIEW_CHANNELS.openPopout, openPopoutPreview);
  ipcMain.on(PREVIEW_CHANNELS.publish, handlePublishedPreview);
  ipcMain.on(PREVIEW_CHANNELS.ready, handlePopoutReady);
  ipcMain.handle(PREVIEW_CHANNELS.saveSnapshot, savePreviewSnapshot);
}
