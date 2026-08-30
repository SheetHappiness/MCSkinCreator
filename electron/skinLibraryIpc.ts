import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { app, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';

import {
  SKIN_LIBRARY_CHANNELS,
  type CopySkinToLibraryRequest,
  type CreateSkinLibraryCollectionRequest,
  type NativeFileError,
  type OpenSkinPngResult,
  type RenameSkinLibraryCollectionRequest,
  type RenameSkinLibraryRequest,
  type SetSkinLibraryEntryCollectionsRequest,
  type SkinLibraryActionResult,
  type SkinLibraryCollection,
  type SkinLibraryCollectionMutationResult,
  type SkinLibraryEntry,
  type SkinLibraryListResult,
  type SkinLibraryMutationResult,
} from './fileContract';
import { removeRecentSkin, updateRecentSkinPath } from './recentSkinIpc';
import {
  getPngThumbnailDataUrl,
  invalidatePngThumbnail,
} from './skinThumbnail';

const E2E_MODE = process.env.MINECRAFT_SKIN_EDITOR_E2E === '1';
const MAX_ENCODED_SKIN_BYTES = 1024 * 1024;
const MAX_COLLECTIONS = 100;
const MAX_COLLECTION_NAME_LENGTH = 80;
const LIBRARY_METADATA_VERSION = 1 as const;
const LIBRARY_METADATA_FILE = '.minecraft-skin-editor-library.json';
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

interface PersistedLibraryCollection {
  readonly id: string;
  readonly displayName: string;
  readonly fileNames: readonly string[];
}

interface PersistedLibraryMetadata {
  readonly version: typeof LIBRARY_METADATA_VERSION;
  readonly collections: readonly PersistedLibraryCollection[];
}

interface LoadedLibraryMetadata {
  readonly metadata: PersistedLibraryMetadata;
  readonly exists: boolean;
}

function libraryRoot(): string {
  const testRoot = E2E_MODE
    ? process.env.MINECRAFT_SKIN_EDITOR_E2E_LIBRARY_DIR
    : undefined;
  return path.resolve(
    testRoot ?? path.join(app.getPath('userData'), 'library'),
  );
}

function metadataPath(root: string): string {
  return path.join(root, LIBRARY_METADATA_FILE);
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
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > 255 ||
    value !== value.trim() ||
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\') ||
    path.basename(value) !== value ||
    !hasPngExtension(value) ||
    hasControlCharacters(value) ||
    /[<>:"|?*]/.test(value) ||
    value.endsWith('.') ||
    value.endsWith(' ')
  ) {
    return false;
  }

  const deviceName = value.split('.')[0] ?? '';
  return !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(deviceName);
}

function normalizedPath(filePath: string): string {
  const normalized = path.resolve(filePath).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
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

function isSafeCollectionId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(value)
  );
}

function isSafeCollectionName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_COLLECTION_NAME_LENGTH &&
    value === value.trim() &&
    !hasControlCharacters(value)
  );
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) < 32) return true;
  }
  return false;
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

function emptyMetadata(): PersistedLibraryMetadata {
  return { version: LIBRARY_METADATA_VERSION, collections: [] };
}

function normalizedName(value: string): string {
  return value.toLocaleLowerCase();
}

function normalizeCollectionFileNames(fileNames: readonly string[]): string[] {
  const seen = new Set<string>();
  return fileNames.filter((fileName) => {
    if (!isSafeLibraryName(fileName)) return false;
    const key = normalizedName(fileName);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeMetadata(value: unknown): PersistedLibraryMetadata {
  if (typeof value !== 'object' || value === null) return emptyMetadata();
  const parsed = value as {
    version?: unknown;
    collections?: unknown;
  };
  if (
    parsed.version !== LIBRARY_METADATA_VERSION ||
    !Array.isArray(parsed.collections)
  ) {
    return emptyMetadata();
  }

  const seenIds = new Set<string>();
  const collections: PersistedLibraryCollection[] = [];
  for (const item of parsed.collections.slice(0, MAX_COLLECTIONS)) {
    if (typeof item !== 'object' || item === null) continue;
    const collection = item as Partial<PersistedLibraryCollection>;
    if (
      !isSafeCollectionId(collection.id) ||
      !isSafeCollectionName(collection.displayName) ||
      !Array.isArray(collection.fileNames) ||
      seenIds.has(collection.id)
    ) {
      continue;
    }
    seenIds.add(collection.id);
    collections.push({
      id: collection.id,
      displayName: collection.displayName,
      fileNames: normalizeCollectionFileNames(collection.fileNames),
    });
  }
  return { version: LIBRARY_METADATA_VERSION, collections };
}

async function readLibraryMetadata(
  root: string,
): Promise<LoadedLibraryMetadata> {
  try {
    const raw = await readFile(metadataPath(root), 'utf8');
    return {
      metadata: normalizeMetadata(JSON.parse(raw) as unknown),
      exists: true,
    };
  } catch {
    return { metadata: emptyMetadata(), exists: false };
  }
}

async function writeLibraryMetadata(
  root: string,
  metadata: PersistedLibraryMetadata,
): Promise<void> {
  const target = metadataPath(root);
  const temporaryPath = path.join(
    root,
    `.${LIBRARY_METADATA_FILE}.${randomUUID()}.tmp`,
  );
  await mkdir(root, { recursive: true });
  try {
    await writeFile(
      temporaryPath,
      JSON.stringify(normalizeMetadata(metadata)),
      { flag: 'wx' },
    );
    await rename(temporaryPath, target);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function collectionIdsForFile(
  metadata: PersistedLibraryMetadata,
  fileName: string,
): string[] {
  const key = normalizedName(fileName);
  return metadata.collections
    .filter((collection) =>
      collection.fileNames.some(
        (candidate) => normalizedName(candidate) === key,
      ),
    )
    .map((collection) => collection.id);
}

function toLibraryCollections(
  metadata: PersistedLibraryMetadata,
  entryNames: readonly string[],
): SkinLibraryCollection[] {
  const names = new Set(entryNames.map(normalizedName));
  return metadata.collections
    .map((collection) => ({
      id: collection.id,
      displayName: collection.displayName,
      entryCount: collection.fileNames.filter((fileName) =>
        names.has(normalizedName(fileName)),
      ).length,
    }))
    .sort(
      (left, right) =>
        left.displayName.localeCompare(right.displayName, undefined, {
          sensitivity: 'base',
        }) || left.displayName.localeCompare(right.displayName),
    );
}

async function ensureRoot(): Promise<string> {
  const root = libraryRoot();
  await mkdir(root, { recursive: true });
  return root;
}

async function libraryEntry(
  filePath: string,
  collectionIds: readonly string[],
): Promise<SkinLibraryEntry> {
  const metadata = await lstat(filePath);
  if (!metadata.isFile()) throw new Error('Library entry is not a file.');
  const thumbnailDataUrl = await getPngThumbnailDataUrl(filePath, metadata);
  return {
    filePath,
    displayName: path.basename(filePath),
    byteLength: metadata.size,
    collectionIds: [...collectionIds],
    ...(thumbnailDataUrl === undefined ? {} : { thumbnailDataUrl }),
  };
}

async function listLibrarySkins(): Promise<SkinLibraryListResult> {
  try {
    const root = await ensureRoot();
    const loaded = await readLibraryMetadata(root);
    const dirents = await readdir(root, { withFileTypes: true });
    const entries: SkinLibraryEntry[] = [];
    for (const dirent of dirents) {
      if (!dirent.isFile() || !hasPngExtension(dirent.name)) continue;
      try {
        entries.push(
          await libraryEntry(
            path.join(root, dirent.name),
            collectionIdsForFile(loaded.metadata, dirent.name),
          ),
        );
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
      collections: toLibraryCollections(
        loaded.metadata,
        entries.map((entry) => entry.displayName),
      ),
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
      'Choose a safe PNG filename within the application library.',
    );
  }

  try {
    const root = await ensureRoot();
    const sourceMetadata = await lstat(source);
    if (!sourceMetadata.isFile()) throw new Error('Source is not a file.');
    const target = path.join(root, request.displayName);
    const sourceName = path.basename(source);
    if (normalizedPath(target) !== normalizedPath(source)) {
      try {
        await lstat(target);
        return errorResult(
          'write_failed',
          'A library skin with that name already exists.',
        );
      } catch (targetError) {
        if (!isMissingFileError(targetError)) throw targetError;
      }
      // A same-directory rename is atomic. The explicit collision check keeps
      // the operation from replacing another library entry on Windows.
      await rename(source, target);
      invalidatePngThumbnail(source);

      try {
        const loaded = await readLibraryMetadata(root);
        const updated = renameFileInMetadata(
          loaded.metadata,
          sourceName,
          path.basename(target),
        );
        if (loaded.exists && updated.changed) {
          await writeLibraryMetadata(root, updated.metadata);
        }
      } catch (metadataError) {
        await rename(target, source).catch(() => undefined);
        invalidatePngThumbnail(target);
        throw metadataError;
      }
      await updateRecentSkinPath(source, target, path.basename(target)).catch(
        () => undefined,
      );
    }

    const loaded = await readLibraryMetadata(root);
    return {
      status: 'success',
      entry: await libraryEntry(
        target,
        collectionIdsForFile(loaded.metadata, path.basename(target)),
      ),
    };
  } catch {
    return errorResult(
      'write_failed',
      'The library skin could not be renamed. Check the filename and try again.',
    );
  }
}

function renameFileInMetadata(
  metadata: PersistedLibraryMetadata,
  previousName: string,
  nextName: string,
): { readonly metadata: PersistedLibraryMetadata; readonly changed: boolean } {
  const previousKey = normalizedName(previousName);
  let changed = false;
  const collections = metadata.collections.map((collection) => {
    const fileNames = collection.fileNames.map((fileName) => {
      if (normalizedName(fileName) !== previousKey) return fileName;
      changed = true;
      return nextName;
    });
    return { ...collection, fileNames };
  });
  return { metadata: { ...metadata, collections }, changed };
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
    const loaded = await readLibraryMetadata(root);
    const sourceName = path.basename(source);
    const sourceCollections = collectionIdsForFile(loaded.metadata, sourceName);
    const parsed = path.parse(sourceName);
    for (let index = 1; index <= 1000; index += 1) {
      const suffix = index === 1 ? ' Copy' : ` Copy ${index}`;
      const target = path.join(root, `${parsed.name}${suffix}.png`);
      try {
        await copyFile(source, target, constants.COPYFILE_EXCL);
        try {
          if (sourceCollections.length > 0) {
            const metadata = addFileToCollections(
              loaded.metadata,
              sourceCollections,
              path.basename(target),
            );
            await writeLibraryMetadata(root, metadata);
          }
        } catch (metadataError) {
          await unlink(target).catch(() => undefined);
          throw metadataError;
        }
        return {
          status: 'success',
          entry: await libraryEntry(target, sourceCollections),
        };
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

function addFileToCollections(
  metadata: PersistedLibraryMetadata,
  collectionIds: readonly string[],
  fileName: string,
): PersistedLibraryMetadata {
  const selected = new Set(collectionIds);
  return {
    ...metadata,
    collections: metadata.collections.map((collection) =>
      selected.has(collection.id) &&
      !collection.fileNames.some(
        (candidate) => normalizedName(candidate) === normalizedName(fileName),
      )
        ? { ...collection, fileNames: [...collection.fileNames, fileName] }
        : collection,
    ),
  };
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
    const root = await ensureRoot();
    const metadata = await lstat(filePath);
    if (!metadata.isFile()) throw new Error('Entry is not a file.');
    await unlink(filePath);
    invalidatePngThumbnail(filePath);

    const loaded = await readLibraryMetadata(root);
    const updated = removeFileFromMetadata(
      loaded.metadata,
      path.basename(filePath),
    );
    if (loaded.exists && updated.changed) {
      await writeLibraryMetadata(root, updated.metadata);
    }
    await removeRecentSkin(filePath).catch(() => undefined);
    return { status: 'success' };
  } catch {
    return errorResult(
      'write_failed',
      'The library skin could not be deleted. Check that it still exists.',
    );
  }
}

function removeFileFromMetadata(
  metadata: PersistedLibraryMetadata,
  fileName: string,
): { readonly metadata: PersistedLibraryMetadata; readonly changed: boolean } {
  const key = normalizedName(fileName);
  let changed = false;
  const collections = metadata.collections.map((collection) => {
    const fileNames = collection.fileNames.filter((candidate) => {
      const keep = normalizedName(candidate) !== key;
      if (!keep) changed = true;
      return keep;
    });
    return { ...collection, fileNames };
  });
  return { metadata: { ...metadata, collections }, changed };
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
        return {
          status: 'success',
          entry: await libraryEntry(target, []),
        };
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

async function revealLibrarySkin(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SkinLibraryActionResult> {
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
    if (!metadata.isFile()) throw new Error('Entry is not a file.');
    if (!E2E_MODE) shell.showItemInFolder(filePath);
    return { status: 'success' };
  } catch {
    return errorResult(
      'read_failed',
      'The library skin could not be revealed because it is no longer available.',
    );
  }
}

async function createLibraryCollection(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SkinLibraryCollectionMutationResult> {
  if (typeof value !== 'object' || value === null) {
    return errorResult('write_failed', 'The collection request was invalid.');
  }
  const request = value as Partial<CreateSkinLibraryCollectionRequest>;
  if (!isSafeCollectionName(request.displayName)) {
    return errorResult(
      'write_failed',
      'Choose a non-empty collection name without control characters.',
    );
  }

  try {
    const root = await ensureRoot();
    const loaded = await readLibraryMetadata(root);
    if (loaded.metadata.collections.length >= MAX_COLLECTIONS) {
      return errorResult(
        'write_failed',
        'The local library has reached its collection limit.',
      );
    }
    if (
      loaded.metadata.collections.some(
        (collection) =>
          normalizedName(collection.displayName) ===
          normalizedName(request.displayName!),
      )
    ) {
      return errorResult(
        'write_failed',
        'A collection with that name already exists.',
      );
    }
    const collection: PersistedLibraryCollection = {
      id: randomUUID(),
      displayName: request.displayName,
      fileNames: [],
    };
    await writeLibraryMetadata(root, {
      ...loaded.metadata,
      collections: [...loaded.metadata.collections, collection],
    });
    return {
      status: 'success',
      collection: {
        id: collection.id,
        displayName: collection.displayName,
        entryCount: 0,
      },
    };
  } catch {
    return errorResult(
      'write_failed',
      'The collection could not be created. Check that the library folder is accessible.',
    );
  }
}

async function renameLibraryCollection(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SkinLibraryCollectionMutationResult> {
  if (typeof value !== 'object' || value === null) {
    return errorResult(
      'write_failed',
      'The collection rename request was invalid.',
    );
  }
  const request = value as Partial<RenameSkinLibraryCollectionRequest>;
  if (
    !isSafeCollectionId(request.collectionId) ||
    !isSafeCollectionName(request.displayName)
  ) {
    return errorResult('write_failed', 'Choose a valid collection name.');
  }

  try {
    const root = await ensureRoot();
    const loaded = await readLibraryMetadata(root);
    const current = loaded.metadata.collections.find(
      (collection) => collection.id === request.collectionId,
    );
    if (current === undefined) {
      return errorResult(
        'write_failed',
        'The selected collection no longer exists.',
      );
    }
    if (
      loaded.metadata.collections.some(
        (collection) =>
          collection.id !== current.id &&
          normalizedName(collection.displayName) ===
            normalizedName(request.displayName!),
      )
    ) {
      return errorResult(
        'write_failed',
        'A collection with that name already exists.',
      );
    }
    const next = { ...current, displayName: request.displayName };
    await writeLibraryMetadata(root, {
      ...loaded.metadata,
      collections: loaded.metadata.collections.map((collection) =>
        collection.id === current.id ? next : collection,
      ),
    });
    return {
      status: 'success',
      collection: {
        id: next.id,
        displayName: next.displayName,
        entryCount: current.fileNames.length,
      },
    };
  } catch {
    return errorResult(
      'write_failed',
      'The collection could not be renamed. Check the library folder and try again.',
    );
  }
}

async function deleteLibraryCollection(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SkinLibraryActionResult> {
  if (!isSafeCollectionId(value)) {
    return errorResult('write_failed', 'The selected collection is invalid.');
  }

  try {
    const root = await ensureRoot();
    const loaded = await readLibraryMetadata(root);
    if (
      !loaded.metadata.collections.some((collection) => collection.id === value)
    ) {
      return errorResult(
        'write_failed',
        'The selected collection no longer exists.',
      );
    }
    await writeLibraryMetadata(root, {
      ...loaded.metadata,
      collections: loaded.metadata.collections.filter(
        (collection) => collection.id !== value,
      ),
    });
    return { status: 'success' };
  } catch {
    return errorResult(
      'write_failed',
      'The collection could not be deleted. Check the library folder and try again.',
    );
  }
}

async function setLibraryEntryCollections(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<SkinLibraryActionResult> {
  if (typeof value !== 'object' || value === null) {
    return errorResult(
      'write_failed',
      'The collection assignment was invalid.',
    );
  }
  const request = value as Partial<SetSkinLibraryEntryCollectionsRequest>;
  const filePath = resolveLibraryFilePath(request.filePath);
  const collectionIds = request.collectionIds;
  if (
    filePath === undefined ||
    !Array.isArray(collectionIds) ||
    collectionIds.length > MAX_COLLECTIONS ||
    !collectionIds.every(isSafeCollectionId) ||
    new Set(collectionIds).size !== collectionIds.length
  ) {
    return errorResult(
      'write_failed',
      'The collection assignment was invalid.',
    );
  }

  try {
    const root = await ensureRoot();
    const fileMetadata = await lstat(filePath);
    if (!fileMetadata.isFile()) throw new Error('Entry is not a file.');
    const loaded = await readLibraryMetadata(root);
    const knownIds = new Set(
      loaded.metadata.collections.map((collection) => collection.id),
    );
    if (collectionIds.some((collectionId) => !knownIds.has(collectionId))) {
      return errorResult(
        'write_failed',
        'One of the selected collections no longer exists.',
      );
    }
    const selected = new Set(collectionIds);
    const fileName = path.basename(filePath);
    await writeLibraryMetadata(root, {
      ...loaded.metadata,
      collections: loaded.metadata.collections.map((collection) => {
        const hasFile = collection.fileNames.some(
          (candidate) => normalizedName(candidate) === normalizedName(fileName),
        );
        if (selected.has(collection.id) && !hasFile) {
          return {
            ...collection,
            fileNames: [...collection.fileNames, fileName],
          };
        }
        if (!selected.has(collection.id) && hasFile) {
          return {
            ...collection,
            fileNames: collection.fileNames.filter(
              (candidate) =>
                normalizedName(candidate) !== normalizedName(fileName),
            ),
          };
        }
        return collection;
      }),
    });
    return { status: 'success' };
  } catch {
    return errorResult(
      'write_failed',
      'The skin could not be assigned to collections. Check the library folder and try again.',
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
  ipcMain.handle(SKIN_LIBRARY_CHANNELS.reveal, revealLibrarySkin);
  ipcMain.handle(
    SKIN_LIBRARY_CHANNELS.createCollection,
    createLibraryCollection,
  );
  ipcMain.handle(
    SKIN_LIBRARY_CHANNELS.renameCollection,
    renameLibraryCollection,
  );
  ipcMain.handle(
    SKIN_LIBRARY_CHANNELS.deleteCollection,
    deleteLibraryCollection,
  );
  ipcMain.handle(
    SKIN_LIBRARY_CHANNELS.setEntryCollections,
    setLibraryEntryCollections,
  );
}
