import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type {
  NativeSkinFileApi,
  NativeSkinLibraryApi,
  RecentSkinEntry,
  RecentSkinListResult,
  SkinLibraryActionResult,
  SkinLibraryCollectionMutationResult,
  SkinLibraryCollection,
  SkinLibraryEntry,
  SkinLibraryListResult,
  SkinLibraryMutationResult,
} from '../../../electron/fileContract';
import { encodeSkinPng } from '../../engine/png';
import { documentSessionController } from '../file-management/fileLifecycleStore';
import type { FileLifecycleError } from '../file-management/documentSession';

export const LOCAL_SKIN_LIBRARY_DRAG_TYPE =
  'application/x-minecraft-skin-library';

export interface LocalSkinLibraryState {
  readonly rootDisplayName: string;
  readonly entries: readonly SkinLibraryEntry[];
  readonly collections: readonly SkinLibraryCollection[];
  readonly recentEntries: readonly RecentSkinEntry[];
  readonly isBusy: boolean;
  readonly error?: FileLifecycleError;
}

const unavailableLibraryApi: NativeSkinLibraryApi = {
  async listLibrarySkins(): Promise<SkinLibraryListResult> {
    return {
      status: 'success',
      rootDisplayName: 'Application library',
      entries: [],
      collections: [],
    };
  },
  async openLibrarySkin(): Promise<never> {
    throw new Error('Native library access is unavailable.');
  },
  async renameLibrarySkin(): Promise<never> {
    throw new Error('Native library access is unavailable.');
  },
  async duplicateLibrarySkin(): Promise<never> {
    throw new Error('Native library access is unavailable.');
  },
  async deleteLibrarySkin(): Promise<never> {
    throw new Error('Native library access is unavailable.');
  },
  async copySkinToLibrary(): Promise<never> {
    throw new Error('Native library access is unavailable.');
  },
  async revealLibrarySkin(): Promise<never> {
    throw new Error('Native library access is unavailable.');
  },
  async createLibraryCollection(): Promise<never> {
    throw new Error('Native library access is unavailable.');
  },
  async renameLibraryCollection(): Promise<never> {
    throw new Error('Native library access is unavailable.');
  },
  async deleteLibraryCollection(): Promise<never> {
    throw new Error('Native library access is unavailable.');
  },
  async setLibraryEntryCollections(): Promise<never> {
    throw new Error('Native library access is unavailable.');
  },
};

const unavailableRecentResult: RecentSkinListResult = {
  status: 'success',
  entries: [],
};

const nativeLibrary = window.skinLibrary ?? unavailableLibraryApi;
const nativeFiles: NativeSkinFileApi | undefined = window.skinFiles;
const localSkinLibraryStore = createStore<LocalSkinLibraryState>(() => ({
  rootDisplayName: 'Application library',
  entries: [],
  collections: [],
  recentEntries: [],
  isBusy: false,
}));

function setState(next: Partial<LocalSkinLibraryState>): void {
  localSkinLibraryStore.setState(next);
}

function libraryError(message: string): FileLifecycleError {
  return { code: 'read_failed', message };
}

function applyListResult(result: SkinLibraryListResult): boolean {
  if (result.status === 'error') {
    setState({ error: result.error });
    return false;
  }
  setState({
    rootDisplayName: result.rootDisplayName,
    entries: result.entries,
    collections: result.collections,
    error: undefined,
  });
  return true;
}

function applyRecentResult(result: RecentSkinListResult): boolean {
  if (result.status === 'error') {
    setState({ error: result.error });
    return false;
  }
  setState({ recentEntries: result.entries });
  return true;
}

async function reloadRecentEntries(): Promise<boolean> {
  if (nativeFiles?.listRecentSkins === undefined) {
    return applyRecentResult(unavailableRecentResult);
  }
  try {
    return applyRecentResult(await nativeFiles.listRecentSkins());
  } catch {
    setState({
      error: libraryError(
        'Recent skins could not be reached. The local library is still available.',
      ),
    });
    return false;
  }
}

async function reloadEntries(): Promise<boolean> {
  let libraryOkay = false;
  try {
    libraryOkay = applyListResult(await nativeLibrary.listLibrarySkins());
  } catch {
    setState({
      error: libraryError(
        'The local skin library could not be reached. Try refreshing it.',
      ),
    });
  }
  const recentOkay = await reloadRecentEntries();
  return libraryOkay && recentOkay;
}

export function getLocalSkinLibraryState(): LocalSkinLibraryState {
  return localSkinLibraryStore.getState();
}

export function useLocalSkinLibrary(): LocalSkinLibraryState {
  return useStore(localSkinLibraryStore);
}

export async function refreshLibrary(): Promise<void> {
  if (getLocalSkinLibraryState().isBusy) return;
  setState({ isBusy: true, error: undefined });
  await reloadEntries();
  setState({ isBusy: false });
}

type LibraryOperationResult =
  | SkinLibraryMutationResult
  | SkinLibraryActionResult
  | SkinLibraryCollectionMutationResult;

function applyMutationError(result: LibraryOperationResult): boolean {
  if (result.status === 'error') {
    setState({ error: result.error });
    return false;
  }
  return true;
}

async function finishMutation(
  action: () => Promise<LibraryOperationResult>,
): Promise<boolean> {
  if (getLocalSkinLibraryState().isBusy) return false;
  setState({ isBusy: true, error: undefined });
  let succeeded = false;
  try {
    const result = await action();
    succeeded = applyMutationError(result);
    if (succeeded) await reloadEntries();
  } catch {
    setState({
      error: libraryError(
        'The local library operation failed. Try again or refresh the library.',
      ),
    });
  }
  setState({ isBusy: false });
  return succeeded;
}

export async function openLibraryEntry(entry: SkinLibraryEntry): Promise<void> {
  if (getLocalSkinLibraryState().isBusy) return;
  setState({ isBusy: true, error: undefined });
  try {
    const result = await nativeLibrary.openLibrarySkin(entry.filePath);
    if (result.status === 'error') {
      setState({ error: result.error });
    } else if (result.status === 'canceled') {
      setState({ error: undefined });
    } else {
      const outcome = await documentSessionController.openDroppedPng({
        displayName: result.displayName,
        filePath: result.filePath,
        readBytes: async () => new Uint8Array(result.bytes),
      });
      if (outcome.status === 'error') {
        setState({ error: outcome.error });
      } else {
        await reloadRecentEntries();
      }
    }
  } catch {
    setState({
      error: libraryError(
        'The selected library skin could not be opened. Try refreshing the library.',
      ),
    });
  }
  setState({ isBusy: false });
}

export async function openLibraryEntryByPath(filePath: string): Promise<void> {
  const entry = getLocalSkinLibraryState().entries.find(
    (candidate) => candidate.filePath === filePath,
  );
  if (entry !== undefined) await openLibraryEntry(entry);
}

export async function openRecentEntry(entry: RecentSkinEntry): Promise<void> {
  if (getLocalSkinLibraryState().isBusy) return;
  if (!entry.isAvailable || nativeFiles?.openRecentSkin === undefined) {
    setState({
      error: {
        code: 'read_failed',
        message:
          'This recent skin is no longer available. Remove it from the list.',
      },
    });
    return;
  }

  setState({ isBusy: true, error: undefined });
  try {
    const result = await nativeFiles.openRecentSkin(entry.filePath);
    if (result.status === 'error') {
      setState({ error: result.error });
    } else if (result.status === 'canceled') {
      setState({ error: undefined });
    } else {
      const outcome = await documentSessionController.openDroppedPng({
        displayName: result.displayName,
        filePath: result.filePath,
        readBytes: async () => new Uint8Array(result.bytes),
      });
      if (outcome.status === 'error') {
        setState({ error: outcome.error });
      } else {
        await reloadRecentEntries();
      }
    }
  } catch {
    setState({
      error: libraryError(
        'The selected recent skin could not be opened. Refresh the recent list and try again.',
      ),
    });
  }
  setState({ isBusy: false });
}

export async function removeRecentEntry(entry: RecentSkinEntry): Promise<void> {
  if (getLocalSkinLibraryState().isBusy) return;
  if (nativeFiles?.removeRecentSkin === undefined) return;
  setState({ isBusy: true, error: undefined });
  try {
    const result = await nativeFiles.removeRecentSkin(entry.filePath);
    if (result.status === 'error') setState({ error: result.error });
    else await reloadRecentEntries();
  } catch {
    setState({
      error: libraryError('The recent skin could not be removed. Try again.'),
    });
  }
  setState({ isBusy: false });
}

export async function renameLibraryEntry(
  entry: SkinLibraryEntry,
  displayName: string,
): Promise<boolean> {
  return finishMutation(async () => {
    const result = await nativeLibrary.renameLibrarySkin({
      filePath: entry.filePath,
      displayName,
    });
    if (result.status === 'success') {
      documentSessionController.updateFileMetadataForPath(
        entry.filePath,
        result.entry.filePath,
        result.entry.displayName,
      );
    }
    return result;
  });
}

export async function duplicateLibraryEntry(
  entry: SkinLibraryEntry,
): Promise<boolean> {
  let duplicate: SkinLibraryEntry | undefined;
  const succeeded = await finishMutation(async () => {
    const result = await nativeLibrary.duplicateLibrarySkin(entry.filePath);
    if (result.status === 'success') duplicate = result.entry;
    return result;
  });
  if (succeeded && duplicate !== undefined) await openLibraryEntry(duplicate);
  return succeeded;
}

export async function revealLibraryEntry(
  entry: SkinLibraryEntry,
): Promise<boolean> {
  return finishMutation(() => nativeLibrary.revealLibrarySkin(entry.filePath));
}

export async function deleteLibraryEntry(
  entry: SkinLibraryEntry,
): Promise<boolean> {
  return finishMutation(() => nativeLibrary.deleteLibrarySkin(entry.filePath));
}

export async function createLibraryCollection(
  displayName: string,
): Promise<boolean> {
  return finishMutation(() =>
    nativeLibrary.createLibraryCollection({ displayName }),
  );
}

export async function renameLibraryCollection(
  collection: SkinLibraryCollection,
  displayName: string,
): Promise<boolean> {
  return finishMutation(() =>
    nativeLibrary.renameLibraryCollection({
      collectionId: collection.id,
      displayName,
    }),
  );
}

export async function deleteLibraryCollection(
  collection: SkinLibraryCollection,
): Promise<boolean> {
  return finishMutation(() =>
    nativeLibrary.deleteLibraryCollection(collection.id),
  );
}

export async function setLibraryEntryCollections(
  entry: SkinLibraryEntry,
  collectionIds: readonly string[],
): Promise<boolean> {
  return finishMutation(() =>
    nativeLibrary.setLibraryEntryCollections({
      filePath: entry.filePath,
      collectionIds,
    }),
  );
}

export async function copyActiveDocumentToLibrary(): Promise<void> {
  if (getLocalSkinLibraryState().isBusy) return;
  const activeSession = documentSessionController.getState().session;
  if (activeSession === undefined) {
    setState({
      error: {
        code: 'no_document',
        message: 'Open a skin before copying it into the local library.',
      },
    });
    return;
  }

  let bytes: Uint8Array;
  try {
    bytes = encodeSkinPng(activeSession.document);
  } catch {
    setState({
      error: {
        code: 'invalid_png',
        message: 'The active skin could not be encoded for the library.',
      },
    });
    return;
  }

  await finishMutation(() =>
    nativeLibrary.copySkinToLibrary({
      suggestedName: activeSession.displayName,
      bytes,
    }),
  );
}
