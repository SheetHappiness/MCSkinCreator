import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type {
  NativeSkinLibraryApi,
  SkinLibraryActionResult,
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
  readonly isBusy: boolean;
  readonly error?: FileLifecycleError;
}

const unavailableLibraryApi: NativeSkinLibraryApi = {
  async listLibrarySkins(): Promise<SkinLibraryListResult> {
    return {
      status: 'success',
      rootDisplayName: 'Application library',
      entries: [],
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
};

const nativeLibrary = window.skinLibrary ?? unavailableLibraryApi;
const localSkinLibraryStore = createStore<LocalSkinLibraryState>(() => ({
  rootDisplayName: 'Application library',
  entries: [],
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
    error: undefined,
  });
  return true;
}

async function reloadEntries(): Promise<boolean> {
  try {
    return applyListResult(await nativeLibrary.listLibrarySkins());
  } catch {
    setState({
      error: libraryError(
        'The local skin library could not be reached. Try refreshing it.',
      ),
    });
    return false;
  }
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

function applyMutationError(
  result: SkinLibraryMutationResult | SkinLibraryActionResult,
): boolean {
  if (result.status === 'error') {
    setState({ error: result.error });
    return false;
  }
  return true;
}

async function finishMutation(
  action: () => Promise<SkinLibraryMutationResult | SkinLibraryActionResult>,
): Promise<void> {
  if (getLocalSkinLibraryState().isBusy) return;
  setState({ isBusy: true, error: undefined });
  try {
    const result = await action();
    if (applyMutationError(result)) await reloadEntries();
  } catch {
    setState({
      error: libraryError(
        'The local skin library operation failed. Try again or refresh the library.',
      ),
    });
  }
  setState({ isBusy: false });
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

export async function renameLibraryEntry(
  entry: SkinLibraryEntry,
  displayName: string,
): Promise<void> {
  await finishMutation(async () => {
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
): Promise<void> {
  await finishMutation(() =>
    nativeLibrary.duplicateLibrarySkin(entry.filePath),
  );
}

export async function deleteLibraryEntry(
  entry: SkinLibraryEntry,
): Promise<void> {
  await finishMutation(() => nativeLibrary.deleteLibrarySkin(entry.filePath));
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
