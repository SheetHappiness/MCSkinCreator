import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  SKIN_FILE_CHANNELS,
  type OpenSkinPngResult,
  type SaveSkinPngAsRequest,
  type SaveSkinPngAsResult,
  type SaveSkinPngRequest,
  type SaveSkinPngResult,
} from './fileContract';

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_ENCODED_SKIN_BYTES = 1024 * 1024;
const E2E_MODE = process.env.MINECRAFT_SKIN_EDITOR_E2E === '1';

function hasPngExtension(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.png';
}

function ensurePngExtension(filePath: string): string {
  return hasPngExtension(filePath) ? filePath : `${filePath}.png`;
}

function isPngBytes(value: unknown): value is Uint8Array {
  if (!(value instanceof Uint8Array)) {
    return false;
  }

  if (
    value.byteLength < PNG_SIGNATURE.length ||
    value.byteLength > MAX_ENCODED_SKIN_BYTES
  ) {
    return false;
  }

  return PNG_SIGNATURE.every((byte, index) => value[index] === byte);
}

function isSaveRequest(value: unknown): value is SaveSkinPngRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const request = value as Record<string, unknown>;
  return (
    typeof request.filePath === 'string' &&
    request.filePath.length > 0 &&
    hasPngExtension(request.filePath) &&
    isPngBytes(request.bytes)
  );
}

function isSaveAsRequest(value: unknown): value is SaveSkinPngAsRequest {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const request = value as Record<string, unknown>;
  return (
    typeof request.suggestedName === 'string' &&
    request.suggestedName.trim().length > 0 &&
    path.basename(request.suggestedName) === request.suggestedName &&
    isPngBytes(request.bytes)
  );
}

function invalidWriteRequest(): {
  readonly status: 'error';
  readonly error: {
    readonly code: 'write_failed';
    readonly message: string;
  };
} {
  return {
    status: 'error',
    error: {
      code: 'write_failed',
      message:
        'The PNG could not be saved because the save request was invalid.',
    },
  };
}

async function openSkinPng(
  event: IpcMainInvokeEvent,
): Promise<OpenSkinPngResult> {
  try {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const testPath = E2E_MODE
      ? process.env.MINECRAFT_SKIN_EDITOR_E2E_OPEN_PATH
      : undefined;
    let filePath: string | undefined;

    if (testPath !== undefined) {
      filePath = testPath;
    } else {
      const result = owner
        ? await dialog.showOpenDialog(owner, {
            properties: ['openFile'],
            filters: [{ name: 'PNG images', extensions: ['png'] }],
          })
        : await dialog.showOpenDialog({
            properties: ['openFile'],
            filters: [{ name: 'PNG images', extensions: ['png'] }],
          });

      if (result.canceled || result.filePaths.length === 0) {
        return { status: 'canceled' };
      }

      [filePath] = result.filePaths;
    }

    if (filePath === undefined) {
      return { status: 'canceled' };
    }

    const bytes = await readFile(filePath);
    return {
      status: 'success',
      filePath,
      displayName: path.basename(filePath),
      bytes: new Uint8Array(bytes),
    };
  } catch {
    return {
      status: 'error',
      error: {
        code: 'read_failed',
        message:
          'The selected file could not be read. Check that it still exists and is accessible.',
      },
    };
  }
}

async function persistPng(
  filePath: string,
  bytes: Uint8Array,
): Promise<SaveSkinPngResult> {
  try {
    await writeFile(filePath, bytes);
    return { status: 'success' };
  } catch {
    return {
      status: 'error',
      error: {
        code: 'write_failed',
        message:
          'The PNG could not be saved. Check the destination and try again.',
      },
    };
  }
}

async function saveSkinPng(value: unknown): Promise<SaveSkinPngResult> {
  if (!isSaveRequest(value)) {
    return invalidWriteRequest();
  }

  return persistPng(value.filePath, value.bytes);
}

async function saveSkinPngAs(
  event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SaveSkinPngAsResult> {
  if (!isSaveAsRequest(value)) {
    return invalidWriteRequest();
  }

  try {
    const owner = BrowserWindow.fromWebContents(event.sender) ?? undefined;
    const testPath = E2E_MODE
      ? process.env.MINECRAFT_SKIN_EDITOR_E2E_SAVE_AS_PATH
      : undefined;
    let selectedPath: string | undefined;

    if (testPath !== undefined) {
      selectedPath = testPath;
    } else {
      const options = {
        defaultPath: ensurePngExtension(value.suggestedName),
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

    const filePath = ensurePngExtension(selectedPath);
    const result = await persistPng(filePath, value.bytes);

    if (result.status === 'error') {
      return result;
    }

    return {
      status: 'success',
      filePath,
      displayName: path.basename(filePath),
    };
  } catch {
    return {
      status: 'error',
      error: {
        code: 'write_failed',
        message:
          'The PNG could not be saved. Check the destination and try again.',
      },
    };
  }
}

export function registerSkinFileIpc(): void {
  ipcMain.handle(SKIN_FILE_CHANNELS.open, openSkinPng);
  ipcMain.handle(SKIN_FILE_CHANNELS.save, (_event, value: unknown) =>
    saveSkinPng(value),
  );
  ipcMain.handle(SKIN_FILE_CHANNELS.saveAs, saveSkinPngAs);
}
