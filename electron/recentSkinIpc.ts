import { randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import { app, ipcMain, type IpcMainInvokeEvent } from 'electron';

import {
  MAX_RECENT_SKINS,
  SKIN_FILE_CHANNELS,
  type NativeFileError,
  type OpenSkinPngResult,
  type RecentSkinEntry,
  type RecentSkinListResult,
  type RecordRecentSkinRequest,
  type SkinLibraryActionResult,
} from './fileContract';
import { getPngThumbnailDataUrl } from './skinThumbnail';

const MAX_ENCODED_SKIN_BYTES = 1024 * 1024;
const RECENT_FILE_VERSION = 1 as const;
const MAX_STORED_RECENT_PATHS = 64;

interface StoredRecentSkin {
  readonly filePath: string;
  readonly displayName: string;
  readonly lastOpenedAt: number;
}

let recentOperationTail: Promise<void> = Promise.resolve();

function recentStorePath(): string {
  const configuredPath = process.env.MINECRAFT_SKIN_EDITOR_RECENTS_PATH;
  return configuredPath !== undefined && configuredPath.length > 0
    ? path.resolve(configuredPath)
    : path.join(app.getPath('userData'), 'recent-skins.json');
}

function normalizedPath(filePath: string): string {
  const normalized = path.resolve(filePath).replaceAll('\\', '/');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function isPngPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 32767 &&
    path.isAbsolute(value) &&
    path.extname(value).toLowerCase() === '.png'
  );
}

function safeDisplayName(value: unknown, filePath: string): string {
  if (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 260 &&
    value === value.trim() &&
    path.basename(value) === value &&
    !hasControlCharacters(value)
  ) {
    return value;
  }
  return path.basename(filePath);
}

function isStoredRecentSkin(value: unknown): value is StoredRecentSkin {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Partial<StoredRecentSkin>;
  return (
    isPngPath(entry.filePath) &&
    typeof entry.displayName === 'string' &&
    entry.displayName.length > 0 &&
    entry.displayName.length <= 260 &&
    entry.displayName === entry.displayName.trim() &&
    path.basename(entry.displayName) === entry.displayName &&
    !hasControlCharacters(entry.displayName) &&
    Number.isFinite(entry.lastOpenedAt) &&
    Number(entry.lastOpenedAt) > 0
  );
}

function hasControlCharacters(value: string): boolean {
  for (const character of value) {
    if (character.charCodeAt(0) < 32) return true;
  }
  return false;
}

function deduplicateRecentSkins(
  entries: readonly StoredRecentSkin[],
): StoredRecentSkin[] {
  const seen = new Set<string>();
  return entries
    .slice()
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
    .filter((entry) => {
      const key = normalizedPath(entry.filePath);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_STORED_RECENT_PATHS);
}

async function readRecentSkins(): Promise<StoredRecentSkin[]> {
  try {
    const parsed: unknown = JSON.parse(
      await readFile(recentStorePath(), 'utf8'),
    );
    if (typeof parsed !== 'object' || parsed === null) return [];
    const value = parsed as { version?: unknown; entries?: unknown };
    if (
      value.version !== RECENT_FILE_VERSION ||
      !Array.isArray(value.entries)
    ) {
      return [];
    }
    return deduplicateRecentSkins(value.entries.filter(isStoredRecentSkin));
  } catch {
    return [];
  }
}

async function writeRecentSkins(
  entries: readonly StoredRecentSkin[],
): Promise<void> {
  const filePath = recentStorePath();
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${randomUUID()}.tmp`,
  );

  await mkdir(directory, { recursive: true });
  try {
    await writeFile(
      temporaryPath,
      JSON.stringify({
        version: RECENT_FILE_VERSION,
        entries: deduplicateRecentSkins(entries).slice(0, MAX_RECENT_SKINS),
      }),
      { flag: 'wx' },
    );
    await rename(temporaryPath, filePath);
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }
}

function enqueueRecentOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = recentOperationTail.then(operation, operation);
  recentOperationTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
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

async function availableFile(filePath: string): Promise<boolean> {
  try {
    const metadata = await lstat(filePath);
    return metadata.isFile() && metadata.size <= MAX_ENCODED_SKIN_BYTES;
  } catch {
    return false;
  }
}

export function recordRecentSkin(
  request: RecordRecentSkinRequest,
): Promise<SkinLibraryActionResult> {
  return enqueueRecentOperation(async () => {
    if (!isPngPath(request.filePath)) {
      return errorResult(
        'write_failed',
        'The recent skin request did not contain a valid PNG path.',
      );
    }
    if (!(await availableFile(request.filePath))) {
      return errorResult(
        'write_failed',
        'The recent skin could not be found or is too large to index.',
      );
    }

    const filePath = path.resolve(request.filePath);
    const current = await readRecentSkins();
    const next: StoredRecentSkin = {
      filePath,
      displayName: safeDisplayName(request.displayName, filePath),
      lastOpenedAt: Date.now(),
    };
    await writeRecentSkins([
      next,
      ...current.filter(
        (entry) => normalizedPath(entry.filePath) !== normalizedPath(filePath),
      ),
    ]);
    return { status: 'success' };
  });
}

export function updateRecentSkinPath(
  previousPath: string,
  nextPath: string,
  displayName: string,
): Promise<SkinLibraryActionResult> {
  return enqueueRecentOperation(async () => {
    if (!isPngPath(previousPath) || !isPngPath(nextPath)) {
      return errorResult('write_failed', 'The recent skin path is invalid.');
    }
    const current = await readRecentSkins();
    const match = current.find(
      (entry) =>
        normalizedPath(entry.filePath) === normalizedPath(previousPath),
    );
    if (match === undefined) return { status: 'success' };

    const resolvedNextPath = path.resolve(nextPath);
    await writeRecentSkins(
      current.map((entry) =>
        entry === match
          ? {
              filePath: resolvedNextPath,
              displayName: safeDisplayName(displayName, resolvedNextPath),
              lastOpenedAt: entry.lastOpenedAt,
            }
          : entry,
      ),
    );
    return { status: 'success' };
  });
}

export function removeRecentSkin(
  filePath: string,
): Promise<SkinLibraryActionResult> {
  return enqueueRecentOperation(async () => {
    if (!isPngPath(filePath)) {
      return errorResult('write_failed', 'The recent skin path is invalid.');
    }
    const current = await readRecentSkins();
    const next = current.filter(
      (entry) => normalizedPath(entry.filePath) !== normalizedPath(filePath),
    );
    if (next.length !== current.length) await writeRecentSkins(next);
    return { status: 'success' };
  });
}

async function listRecentSkins(): Promise<RecentSkinListResult> {
  return enqueueRecentOperation(async () => {
    try {
      const stored = await readRecentSkins();
      const entries: RecentSkinEntry[] = [];
      for (const entry of stored.slice(0, MAX_RECENT_SKINS)) {
        const isAvailable = await availableFile(entry.filePath);
        const thumbnailDataUrl = isAvailable
          ? await getPngThumbnailDataUrl(entry.filePath)
          : undefined;
        entries.push({
          ...entry,
          isAvailable,
          ...(thumbnailDataUrl === undefined ? {} : { thumbnailDataUrl }),
        });
      }
      return { status: 'success', entries };
    } catch {
      return errorResult(
        'read_failed',
        'Recent skins could not be read. You can continue using the library.',
      );
    }
  });
}

async function openRecentSkin(
  _event: IpcMainInvokeEvent,
  value: unknown,
): Promise<OpenSkinPngResult> {
  return enqueueRecentOperation(async () => {
    if (!isPngPath(value)) {
      return errorResult(
        'read_failed',
        'The selected recent skin is not a valid PNG path.',
      );
    }

    const current = await readRecentSkins();
    const trusted = current.find(
      (entry) => normalizedPath(entry.filePath) === normalizedPath(value),
    );
    if (trusted === undefined) {
      return errorResult(
        'read_failed',
        'The selected recent skin is no longer in the recent list.',
      );
    }

    try {
      const metadata = await lstat(trusted.filePath);
      if (!metadata.isFile() || metadata.size > MAX_ENCODED_SKIN_BYTES) {
        return errorResult(
          'read_failed',
          'The selected recent skin is no longer available.',
        );
      }
      const bytes = new Uint8Array(await readFile(trusted.filePath));
      return {
        status: 'success',
        filePath: trusted.filePath,
        displayName: path.basename(trusted.filePath),
        bytes,
      };
    } catch {
      return errorResult(
        'read_failed',
        'The selected recent skin could not be read. Check that it still exists.',
      );
    }
  });
}

export function registerRecentSkinIpc(): void {
  ipcMain.handle(SKIN_FILE_CHANNELS.listRecent, listRecentSkins);
  ipcMain.handle(SKIN_FILE_CHANNELS.openRecent, openRecentSkin);
  ipcMain.handle(SKIN_FILE_CHANNELS.removeRecent, (_event, value: unknown) =>
    removeRecentSkin(value as string),
  );
  ipcMain.handle(SKIN_FILE_CHANNELS.recordRecent, (_event, value: unknown) => {
    if (typeof value !== 'object' || value === null) {
      return errorResult(
        'write_failed',
        'The recent skin request was invalid.',
      );
    }
    return recordRecentSkin(value as RecordRecentSkinRequest);
  });
}
