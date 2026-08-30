import { type Stats } from 'node:fs';
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_ENCODED_SKIN_BYTES = 1024 * 1024;
const MAX_CACHE_ENTRIES = 512;

const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

interface ThumbnailCacheEntry {
  readonly modifiedTimeMs: number;
  readonly byteLength: number;
  readonly dataUrl?: string;
}

const thumbnailCache = new Map<string, ThumbnailCacheEntry>();

function cacheKey(filePath: string): string {
  const resolved = path.resolve(filePath).replaceAll('\\', '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isSupportedPng(bytes: Uint8Array): boolean {
  if (
    bytes.byteLength < PNG_SIGNATURE.length ||
    bytes.byteLength > MAX_ENCODED_SKIN_BYTES ||
    !PNG_SIGNATURE.every((byte, index) => bytes[index] === byte) ||
    bytes.length < 24 ||
    bytes[12] !== 73 ||
    bytes[13] !== 72 ||
    bytes[14] !== 68 ||
    bytes[15] !== 82
  ) {
    return false;
  }
  const width =
    bytes[16]! * 0x1000000 +
    bytes[17]! * 0x10000 +
    bytes[18]! * 0x100 +
    bytes[19]!;
  const height =
    bytes[20]! * 0x1000000 +
    bytes[21]! * 0x10000 +
    bytes[22]! * 0x100 +
    bytes[23]!;
  return width === 64 && height === 64;
}

function cacheThumbnail(
  filePath: string,
  metadata: Stats,
  dataUrl: string | undefined,
): string | undefined {
  const key = cacheKey(filePath);
  thumbnailCache.delete(key);
  thumbnailCache.set(key, {
    modifiedTimeMs: metadata.mtimeMs,
    byteLength: metadata.size,
    ...(dataUrl === undefined ? {} : { dataUrl }),
  });
  while (thumbnailCache.size > MAX_CACHE_ENTRIES) {
    const oldest = thumbnailCache.keys().next().value;
    if (oldest === undefined) break;
    thumbnailCache.delete(oldest);
  }
  return dataUrl;
}

/**
 * Returns a stable, derived preview URL for a library PNG. The original
 * source pixels remain the only editable authority; mtime and size invalidate
 * this cache after a saved or externally changed file.
 */
export async function getPngThumbnailDataUrl(
  filePath: string,
  metadata?: Stats,
): Promise<string | undefined> {
  let currentMetadata: Stats;
  try {
    currentMetadata = metadata ?? (await lstat(filePath));
  } catch {
    return undefined;
  }

  if (
    !currentMetadata.isFile() ||
    currentMetadata.size > MAX_ENCODED_SKIN_BYTES
  ) {
    return undefined;
  }

  const key = cacheKey(filePath);
  const cached = thumbnailCache.get(key);
  if (
    cached !== undefined &&
    cached.modifiedTimeMs === currentMetadata.mtimeMs &&
    cached.byteLength === currentMetadata.size
  ) {
    thumbnailCache.delete(key);
    thumbnailCache.set(key, cached);
    return cached.dataUrl;
  }

  try {
    const bytes = new Uint8Array(await readFile(filePath));
    if (!isSupportedPng(bytes)) {
      return cacheThumbnail(filePath, currentMetadata, undefined);
    }
    return cacheThumbnail(
      filePath,
      currentMetadata,
      `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`,
    );
  } catch {
    return cacheThumbnail(filePath, currentMetadata, undefined);
  }
}

export function invalidatePngThumbnail(filePath: string): void {
  thumbnailCache.delete(cacheKey(filePath));
}
