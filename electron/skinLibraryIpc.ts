import { constants } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  SKIN_LIBRARY_CHANNELS,
  type CopySkinToLibraryRequest,
  type NativeFileError,
  type OpenSkinPngResult,
  type RenameSkinLibraryRequest,
  type SkinLibraryActionResult,
  type SkinLibraryEntry,
  type SkinLibraryListResult,
  type SkinLibraryMutationResult,
} from './fileContract';

const E2E_MODE = process.env.MINECRAFT_SKIN_EDITOR_E2E === '1';
const MAX_ENCODED_SKIN_BYTES = 1024 * 1024;
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

function libraryRoot(): string {
  const testRoot = E2E_MODE
    ? process.env.MINECRAFT_SKIN_EDITOR_E2E_LIBRARY_DIR
    : undefined;
  return path.resolve(
    testRoot ?? path.join(app.getPath('userData'), 'library'),
  );
}

function hasPngExtension(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.png';
}

function isPngBytes(value: unknown): value is Uint8Array {
  if (!(value instanceof Uint8Array)) return false;
  if (
    value.byteLength < PNG_SIGNATURE.length ||
    value.byteLength > MAX_ENCODED_SKIN_BYTES
  ) {
    return false;
  }
  return PNG_SIGNATURE.every((byte, index) => value[index] === byte);
}

function isSafeLibraryName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 260 &&
    value === value.trim() &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('/') &&
    !value.includes('\\') &&
    path.basename(value) === value &&
    hasPngExtension(value)
  );
}

function resolveLibraryFilePath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  const root = libraryRoot();
  const resolved = path.resolve(value);
  const relative = path.relative(root, resolved);
  if (
    relative.length === 0 ||
    path.isAbsolute(relative) ||
    relative.startsWith(`..${path.sep}`) ||
    relative === '..' ||
    path.dirname(relative) !== '.' ||
    !hasPngExtension(resolved)
  ) {
    return undefined;
  }
  return resolved;
}

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

async function ensureRoot(): Promise<string> {
  const root = libraryRoot();
  await mkdir(root, { recursive: true });
  return root;
}

async function libraryEntry(filePath: string): Promise<SkinLibraryEntry> {
  const metadata = await stat(filePath);
  if (!metadata.isFile()) throw new Error('Library entry is not a file.');
  return {
    filePath,
    displayName: path.basename(filePath),
    byteLength: metadata.size,
  };
}

async function listLibrarySkins(): Promise<SkinLibraryListResult> {
  try {
    const root = await ensureRoot();
    const dirents = await readdir(root, { withFileTypes: true });
    const entries: SkinLibraryEntry[] = [];
    for (const dirent of dirents) {
      if (!dirent.isFile() || !hasPngExtension(dirent.name)) continue;
      try {
        entries.push(await libraryEntry(path.join(root, dirent.name)));
      } catch {
        // Ignore a file that disappeared or became unreadable during refresh.
      }
    }
    entries.sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName, undefined, {
          sensitivity: 'base',
        }) || left.displayName.localeCompare(right.displayName),
    );
    return {
      status: 'success',
      rootDisplayName: 'Application library',
      entries,
    };
  } catch {
    return errorResult(
      'read_failed',
      'The local skin library could not be read. Check that its folder is accessible.',
    );
  }
}

async function openLibrarySkin(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<OpenSkinPngResult> {
  const filePath = resolveLibraryFilePath(value);
  if (filePath === undefined) {
    return errorResult(
      'read_failed',
      'The selected library entry is not a valid PNG in the application library.',
    );
  }

  try {
    await ensureRoot();
    const metadata = await lstat(filePath);
    if (!metadata.isFile() || metadata.size > MAX_ENCODED_SKIN_BYTES) {
      return errorResult(
        'read_failed',
        'The selected library entry is not a readable PNG skin.',
      );
    }
    const bytes = new Uint8Array(await readFile(filePath));
    return {
      status: 'success',
      filePath,
      displayName: path.basename(filePath),
      bytes,
    };
  } catch {
    return errorResult(
      'read_failed',
      'The selected library skin could not be read. Check that it still exists.',
    );
  }
}

async function renameLibrarySkin(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SkinLibraryMutationResult> {
  if (typeof value !== 'object' || value === null) {
    return errorResult(
      'write_failed',
      'The library rename request was invalid.',
    );
  }
  const request = value as Partial<RenameSkinLibraryRequest>;
  const source = resolveLibraryFilePath(request.filePath);
  if (source === undefined || !isSafeLibraryName(request.displayName)) {
    return errorResult(
      'write_failed',
      'Choose a PNG filename within the application library.',
    );
  }

  try {
    const root = await ensureRoot();
    const sourceMetadata = await lstat(source);
    if (!sourceMetadata.isFile()) throw new Error('Source is not a file.');
    const target = path.join(root, request.displayName);
    if (path.resolve(target) !== source) {
      try {
        await lstat(target);
        return errorResult(
          'write_failed',
          'A library skin with that name already exists.',
        );
      } catch (targetError) {
        if (!isMissingFileError(targetError)) throw targetError;
      }
      await rename(source, target);
    }
    return { status: 'success', entry: await libraryEntry(target) };
  } catch {
    return errorResult(
      'write_failed',
      'The library skin could not be renamed. Check the filename and try again.',
    );
  }
}

async function duplicateLibrarySkin(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SkinLibraryMutationResult> {
  const source = resolveLibraryFilePath(value);
  if (source === undefined) {
    return errorResult(
      'write_failed',
      'The selected library entry is invalid.',
    );
  }

  try {
    const root = await ensureRoot();
    const sourceMetadata = await lstat(source);
    if (!sourceMetadata.isFile()) throw new Error('Source is not a file.');
    const parsed = path.parse(path.basename(source));
    for (let index = 1; index <= 1000; index += 1) {
      const suffix = index === 1 ? ' Copy' : ` Copy ${index}`;
      const target = path.join(root, `${parsed.name}${suffix}.png`);
      try {
        await copyFile(source, target, constants.COPYFILE_EXCL);
        return { status: 'success', entry: await libraryEntry(target) };
      } catch (copyError) {
        if (!isAlreadyExistsError(copyError)) throw copyError;
      }
    }
    throw new Error('Could not find an available copy name.');
  } catch {
    return errorResult(
      'write_failed',
      'The library skin could not be duplicated. Check the library folder and try again.',
    );
  }
}

async function deleteLibrarySkin(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SkinLibraryActionResult> {
  const filePath = resolveLibraryFilePath(value);
  if (filePath === undefined) {
    return errorResult(
      'write_failed',
      'The selected library entry is invalid.',
    );
  }

  try {
    await ensureRoot();
    const metadata = await lstat(filePath);
    if (!metadata.isFile()) throw new Error('Entry is not a file.');
    await unlink(filePath);
    return { status: 'success' };
  } catch {
    return errorResult(
      'write_failed',
      'The library skin could not be deleted. Check that it still exists.',
    );
  }
}

async function copySkinToLibrary(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SkinLibraryMutationResult> {
  if (typeof value !== 'object' || value === null) {
    return errorResult('write_failed', 'The library copy request was invalid.');
  }
  const request = value as Partial<CopySkinToLibraryRequest>;
  if (!isSafeLibraryName(request.suggestedName) || !isPngBytes(request.bytes)) {
    return errorResult(
      'write_failed',
      'Only a valid PNG and a safe PNG filename can be copied into the library.',
    );
  }

  try {
    const root = await ensureRoot();
    const parsed = path.parse(request.suggestedName);
    for (let index = 0; index <= 1000; index += 1) {
      const suffix =
        index === 0 ? '' : index === 1 ? ' Copy' : ` Copy ${index}`;
      const target = path.join(root, `${parsed.name}${suffix}.png`);
      try {
        await writeFile(target, request.bytes, { flag: 'wx' });
        return { status: 'success', entry: await libraryEntry(target) };
      } catch (writeError) {
        if (!isAlreadyExistsError(writeError)) throw writeError;
      }
    }
    throw new Error('Could not find an available library name.');
  } catch {
    return errorResult(
      'write_failed',
      'The current skin could not be copied into the local library.',
    );
  }
}

function isMissingFileError(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === 'ENOENT'
  );
}

function isAlreadyExistsError(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    value.code === 'EEXIST'
  );
}

export function registerSkinLibraryIpc(): void {
  ipcMain.handle(SKIN_LIBRARY_CHANNELS.list, listLibrarySkins);
  ipcMain.handle(SKIN_LIBRARY_CHANNELS.open, openLibrarySkin);
  ipcMain.handle(SKIN_LIBRARY_CHANNELS.rename, renameLibrarySkin);
  ipcMain.handle(SKIN_LIBRARY_CHANNELS.duplicate, duplicateLibrarySkin);
  ipcMain.handle(SKIN_LIBRARY_CHANNELS.delete, deleteLibrarySkin);
  ipcMain.handle(SKIN_LIBRARY_CHANNELS.copyIn, copySkinToLibrary);
}
