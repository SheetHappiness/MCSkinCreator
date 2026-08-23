import { describe, expect, it, vi } from 'vitest';

import type {
  NativeSkinFileApi,
  OpenSkinPngResult,
  SaveSkinPngAsRequest,
  SaveSkinPngAsResult,
  SaveSkinPngRequest,
  SaveSkinPngResult,
} from '../../../electron/fileContract';
import { SkinDocument, TRANSPARENT_RGBA } from '../../engine/document';
import { DocumentHistory } from '../../engine/history';
import { encodeSkinPng } from '../../engine/png';
import {
  DocumentSessionController,
  type ConfirmUnsavedChanges,
  type DocumentSession,
} from './documentSession';

function validPng(): Uint8Array {
  return encodeSkinPng(SkinDocument.createBlank({ id: 'source' }));
}

function openedFile(
  filePath = 'C:\\skins\\skin.png',
  displayName = 'skin.png',
): OpenSkinPngResult {
  return {
    status: 'success',
    filePath,
    displayName,
    bytes: validPng(),
  };
}

interface NativeFileMock extends NativeSkinFileApi {
  openSkinPng: ReturnType<typeof vi.fn<() => Promise<OpenSkinPngResult>>>;
  saveSkinPng: ReturnType<
    typeof vi.fn<(request: SaveSkinPngRequest) => Promise<SaveSkinPngResult>>
  >;
  saveSkinPngAs: ReturnType<
    typeof vi.fn<
      (request: SaveSkinPngAsRequest) => Promise<SaveSkinPngAsResult>
    >
  >;
}

function nativeFileMock(): NativeFileMock {
  return {
    openSkinPng: vi.fn(async () => ({ status: 'canceled' })),
    saveSkinPng: vi.fn(async () => ({ status: 'success' })),
    saveSkinPngAs: vi.fn(async () => ({ status: 'canceled' })),
    onFileCommand: vi.fn(() => () => undefined),
  };
}

function controller(
  nativeFiles: NativeSkinFileApi,
  confirmUnsavedChanges: ConfirmUnsavedChanges = async () => 'discard',
  initialSession?: DocumentSession,
): DocumentSessionController {
  let id = 0;
  return new DocumentSessionController(
    nativeFiles,
    () => `document-${++id}`,
    confirmUnsavedChanges,
    initialSession,
  );
}

function untitledSession(): DocumentSession {
  const document = SkinDocument.createBlank({ id: 'untitled' });
  return {
    document,
    history: new DocumentHistory(document),
    displayName: 'Untitled.png',
  };
}

async function openCurrentSession(
  manager: DocumentSessionController,
  nativeFiles: NativeFileMock,
): Promise<void> {
  nativeFiles.openSkinPng.mockResolvedValueOnce(openedFile());
  expect(await manager.open()).toEqual({ status: 'success' });
}

describe('document Open lifecycle', () => {
  it('creates a clean session only after a valid PNG is decoded', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    nativeFiles.openSkinPng.mockResolvedValueOnce(openedFile());

    expect(await manager.open()).toEqual({ status: 'success' });

    const session = manager.getState().session;
    expect(session?.filePath).toBe('C:\\skins\\skin.png');
    expect(session?.displayName).toBe('skin.png');
    expect(session?.document.model).toBe('classic');
    expect(session?.document.isDirty).toBe(false);
  });

  it('treats cancellation as normal and leaves the current session unchanged', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const current = manager.getState().session;
    nativeFiles.openSkinPng.mockResolvedValueOnce({ status: 'canceled' });

    expect(await manager.open()).toEqual({ status: 'canceled' });
    expect(manager.getState().session).toBe(current);
    expect(manager.getState().error).toBeUndefined();
  });

  it('keeps the current session atomic when decode fails', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const current = manager.getState().session;
    nativeFiles.openSkinPng.mockResolvedValueOnce({
      status: 'success',
      filePath: 'C:\\skins\\broken.png',
      displayName: 'broken.png',
      bytes: new Uint8Array([1, 2, 3]),
    });

    const outcome = await manager.open();

    expect(outcome.status).toBe('error');
    expect(manager.getState().error?.code).toBe('invalid_png');
    expect(manager.getState().session).toBe(current);
  });

  it('keeps the current session when privileged reading fails', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const current = manager.getState().session;
    nativeFiles.openSkinPng.mockResolvedValueOnce({
      status: 'error',
      error: { code: 'read_failed', message: 'Could not read.' },
    });

    await manager.open();

    expect(manager.getState().session).toBe(current);
    expect(manager.getState().error?.code).toBe('read_failed');
  });

  it('creates new history only after a replacement document opens successfully', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const previous = manager.getState().session!;
    previous.history.editPixel(1, 1, { r: 1, g: 2, b: 3, a: 4 });
    expect(manager.getState().canUndo).toBe(true);

    nativeFiles.openSkinPng.mockResolvedValueOnce(
      openedFile('C:\\skins\\other.png', 'other.png'),
    );
    expect(await manager.open()).toEqual({ status: 'success' });

    const current = manager.getState().session!;
    expect(current).not.toBe(previous);
    expect(current.history).not.toBe(previous.history);
    expect(manager.getState()).toMatchObject({
      canUndo: false,
      canRedo: false,
    });
    expect(manager.undo()).toBe(false);
    expect(current.document.readPixel(1, 1)).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });

    previous.history.undo();
    expect(current.document.readPixel(1, 1)).toEqual({
      r: 0,
      g: 0,
      b: 0,
      a: 0,
    });
  });

  it('preserves active history when replacement Open is canceled', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const current = manager.getState().session!;
    current.history.editPixel(2, 2, { r: 10, g: 20, b: 30, a: 40 });
    nativeFiles.openSkinPng.mockResolvedValueOnce({ status: 'canceled' });

    await manager.open();

    expect(manager.getState().session).toBe(current);
    expect(manager.getState().canUndo).toBe(true);
    expect(manager.undo()).toBe(true);
  });

  it('rolls back an unfinished edit before attempting document replacement', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const current = manager.getState().session!;
    const transaction = current.history.beginTransaction();
    transaction.writePixel(2, 2, { r: 10, g: 20, b: 30, a: 40 });
    nativeFiles.openSkinPng.mockResolvedValueOnce({ status: 'canceled' });

    await manager.open();

    expect(transaction.isActive).toBe(false);
    expect(current.document.readPixel(2, 2)).toEqual(TRANSPARENT_RGBA);
    expect(current.document.isDirty).toBe(false);
    expect(current.history.canUndo).toBe(false);
  });

  it('preserves active history when replacement Open fails validation', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const current = manager.getState().session!;
    current.history.editPixel(2, 2, { r: 10, g: 20, b: 30, a: 40 });
    nativeFiles.openSkinPng.mockResolvedValueOnce({
      status: 'success',
      filePath: 'C:\\skins\\broken.png',
      displayName: 'broken.png',
      bytes: new Uint8Array([1, 2, 3]),
    });

    await manager.open();

    expect(manager.getState().session).toBe(current);
    expect(manager.getState().canUndo).toBe(true);
    expect(manager.undo()).toBe(true);
  });
});

describe('document Save lifecycle', () => {
  it('writes encoded content and marks the document clean after success', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const document = manager.getState().session!.document;
    document.writePixel(4, 5, { r: 1, g: 2, b: 3, a: 4 });

    expect(await manager.save()).toEqual({ status: 'success' });

    expect(nativeFiles.saveSkinPng).toHaveBeenCalledWith({
      filePath: 'C:\\skins\\skin.png',
      bytes: expect.any(Uint8Array),
    });
    expect(document.isDirty).toBe(false);
  });

  it('does not mark the document saved until persistence has succeeded', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const document = manager.getState().session!.document;
    document.writePixel(1, 1, { r: 10, g: 20, b: 30, a: 40 });
    let dirtyDuringWrite: boolean | undefined;
    nativeFiles.saveSkinPng.mockImplementationOnce(async () => {
      dirtyDuringWrite = document.isDirty;
      return { status: 'success' };
    });

    await manager.save();

    expect(dirtyDuringWrite).toBe(true);
    expect(document.isDirty).toBe(false);
  });

  it('keeps the document dirty when writing fails', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const session = manager.getState().session!;
    session.document.writePixel(2, 2, { r: 50, g: 60, b: 70, a: 80 });
    nativeFiles.saveSkinPng.mockResolvedValueOnce({
      status: 'error',
      error: { code: 'write_failed', message: 'Could not write.' },
    });

    await manager.save();

    expect(session.document.isDirty).toBe(true);
    expect(manager.getState().session).toBe(session);
    expect(manager.getState().error?.code).toBe('write_failed');
  });

  it('keeps Undo history across Save and derives dirty state from content', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const session = manager.getState().session!;

    session.history.editPixel(4, 4, { r: 1, g: 2, b: 3, a: 4 });
    await manager.save();
    expect(session.document.isDirty).toBe(false);
    expect(manager.getState().canUndo).toBe(true);

    session.history.editPixel(4, 4, { r: 5, g: 6, b: 7, a: 8 });
    expect(session.document.isDirty).toBe(true);
    expect(manager.undo()).toBe(true);
    expect(session.document.isDirty).toBe(false);

    expect(manager.undo()).toBe(true);
    expect(session.document.isDirty).toBe(true);
    expect(manager.redo()).toBe(true);
    expect(session.document.isDirty).toBe(false);
  });
});

describe('document Save As lifecycle', () => {
  it('updates path and name and marks saved only after successful persistence', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const document = manager.getState().session!.document;
    document.writePixel(3, 3, { r: 90, g: 91, b: 92, a: 93 });
    let dirtyDuringWrite: boolean | undefined;
    nativeFiles.saveSkinPngAs.mockImplementationOnce(async () => {
      dirtyDuringWrite = document.isDirty;
      return {
        status: 'success',
        filePath: 'C:\\exports\\renamed.png',
        displayName: 'renamed.png',
      };
    });

    expect(await manager.saveAs()).toEqual({ status: 'success' });

    expect(dirtyDuringWrite).toBe(true);
    expect(manager.getState().session).toMatchObject({
      filePath: 'C:\\exports\\renamed.png',
      displayName: 'renamed.png',
    });
    expect(document.isDirty).toBe(false);
  });

  it('leaves path, name, and dirty state unchanged when canceled', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const current = manager.getState().session!;
    current.document.writePixel(5, 5, { r: 11, g: 22, b: 33, a: 44 });
    nativeFiles.saveSkinPngAs.mockResolvedValueOnce({ status: 'canceled' });

    expect(await manager.saveAs()).toEqual({ status: 'canceled' });

    expect(manager.getState().session).toBe(current);
    expect(current.filePath).toBe('C:\\skins\\skin.png');
    expect(current.displayName).toBe('skin.png');
    expect(current.document.isDirty).toBe(true);
  });

  it('leaves path, name, and dirty state unchanged when writing fails', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles);
    await openCurrentSession(manager, nativeFiles);
    const current = manager.getState().session!;
    current.document.writePixel(6, 6, { r: 44, g: 55, b: 66, a: 77 });
    nativeFiles.saveSkinPngAs.mockResolvedValueOnce({
      status: 'error',
      error: { code: 'write_failed', message: 'Could not write.' },
    });

    await manager.saveAs();

    expect(manager.getState().session).toBe(current);
    expect(current.filePath).toBe('C:\\skins\\skin.png');
    expect(current.displayName).toBe('skin.png');
    expect(current.document.isDirty).toBe(true);
  });
});

describe('unsaved destructive lifecycle', () => {
  it('keeps dirty A untouched when replacement Open is canceled', async () => {
    const nativeFiles = nativeFileMock();
    const confirm = vi.fn(async () => 'cancel' as const);
    const manager = controller(nativeFiles, confirm);
    await openCurrentSession(manager, nativeFiles);
    const current = manager.getState().session!;
    current.history.editPixel(1, 1, { r: 1, g: 2, b: 3, a: 4 });

    expect(await manager.open()).toEqual({ status: 'canceled' });

    expect(confirm).toHaveBeenCalledWith('skin.png');
    expect(nativeFiles.openSkinPng).toHaveBeenCalledTimes(1);
    expect(manager.getState().session).toBe(current);
    expect(current.document.isDirty).toBe(true);
    expect(manager.getState().canUndo).toBe(true);
  });

  it("opens B after Don't Save without mutating A first", async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles, async () => 'discard');
    await openCurrentSession(manager, nativeFiles);
    const previous = manager.getState().session!;
    previous.history.editPixel(1, 1, { r: 1, g: 2, b: 3, a: 4 });
    nativeFiles.openSkinPng.mockResolvedValueOnce(
      openedFile('C:\\skins\\b.png', 'b.png'),
    );

    expect(await manager.open()).toEqual({ status: 'success' });

    expect(manager.getState().session?.displayName).toBe('b.png');
    expect(previous.document.isDirty).toBe(true);
  });

  it('saves dirty A before atomically opening B', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles, async () => 'save');
    await openCurrentSession(manager, nativeFiles);
    const previous = manager.getState().session!;
    previous.history.editPixel(1, 1, { r: 1, g: 2, b: 3, a: 4 });
    nativeFiles.openSkinPng.mockResolvedValueOnce(
      openedFile('C:\\skins\\b.png', 'b.png'),
    );

    expect(await manager.open()).toEqual({ status: 'success' });

    expect(nativeFiles.saveSkinPng).toHaveBeenCalledTimes(1);
    expect(previous.document.isDirty).toBe(false);
    expect(manager.getState().session?.displayName).toBe('b.png');
  });

  it('aborts replacement and preserves dirty A when Save fails', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles, async () => 'save');
    await openCurrentSession(manager, nativeFiles);
    const current = manager.getState().session!;
    current.history.editPixel(1, 1, { r: 1, g: 2, b: 3, a: 4 });
    nativeFiles.saveSkinPng.mockResolvedValueOnce({
      status: 'error',
      error: { code: 'write_failed', message: 'Disk is unavailable.' },
    });
    nativeFiles.openSkinPng.mockResolvedValueOnce(
      openedFile('C:\\skins\\b.png', 'b.png'),
    );

    expect((await manager.open()).status).toBe('error');

    expect(nativeFiles.openSkinPng).toHaveBeenCalledTimes(1);
    expect(manager.getState().session).toBe(current);
    expect(current.document.isDirty).toBe(true);
    expect(manager.getState().error?.message).toBe('Disk is unavailable.');
  });

  it('aborts when dirty untitled Save requires a canceled Save As', async () => {
    const nativeFiles = nativeFileMock();
    const session = untitledSession();
    session.history.editPixel(2, 2, { r: 4, g: 3, b: 2, a: 1 });
    const manager = controller(nativeFiles, async () => 'save', session);

    expect(await manager.prepareToClose()).toBe(false);

    expect(nativeFiles.saveSkinPng).not.toHaveBeenCalled();
    expect(nativeFiles.saveSkinPngAs).toHaveBeenCalledTimes(1);
    expect(manager.getState().session).toBe(session);
    expect(session.document.isDirty).toBe(true);
  });
});

describe('window-close preparation', () => {
  it('allows a clean close without prompting', async () => {
    const nativeFiles = nativeFileMock();
    const confirm = vi.fn(async () => 'cancel' as const);
    const manager = controller(nativeFiles, confirm);
    await openCurrentSession(manager, nativeFiles);

    expect(await manager.prepareToClose()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it.each([
    ['cancel', false, true],
    ['discard', true, true],
    ['save', true, false],
  ] as const)(
    'handles dirty close decision %s',
    async (decision, expectedClose, expectedDirty) => {
      const nativeFiles = nativeFileMock();
      const manager = controller(nativeFiles, async () => decision);
      await openCurrentSession(manager, nativeFiles);
      const session = manager.getState().session!;
      session.history.editPixel(3, 3, { r: 9, g: 8, b: 7, a: 6 });

      expect(await manager.prepareToClose()).toBe(expectedClose);
      expect(session.document.isDirty).toBe(expectedDirty);
    },
  );

  it('keeps the window open after a failed close-time Save', async () => {
    const nativeFiles = nativeFileMock();
    const manager = controller(nativeFiles, async () => 'save');
    await openCurrentSession(manager, nativeFiles);
    const session = manager.getState().session!;
    session.history.editPixel(3, 3, { r: 9, g: 8, b: 7, a: 6 });
    nativeFiles.saveSkinPng.mockResolvedValueOnce({
      status: 'error',
      error: { code: 'write_failed', message: 'Write failed.' },
    });

    expect(await manager.prepareToClose()).toBe(false);
    expect(session.document.isDirty).toBe(true);
    expect(manager.getState().error?.message).toBe('Write failed.');
  });
});
