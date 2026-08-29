import type {
  NativeFileError,
  NativeSkinFileApi,
  UnsavedChangesDecision,
} from '../../../electron/fileContract';
import { SkinDocument, type SkinModel } from '../../engine/document';
import { DocumentHistory } from '../../engine/history';
import {
  SkinPngError,
  decodeSkinPng,
  encodeSkinPng,
  type SkinPngErrorCode,
} from '../../engine/png';

export interface DocumentSession {
  readonly document: SkinDocument;
  readonly history: DocumentHistory;
  readonly filePath?: string;
  readonly displayName: string;
}

export type FileLifecycleErrorCode =
  | NativeFileError['code']
  | SkinPngErrorCode
  | 'no_document'
  | 'unsupported_file';

export interface FileLifecycleError {
  readonly code: FileLifecycleErrorCode;
  readonly message: string;
}

export type FileCommandOutcome =
  | { readonly status: 'success' }
  | { readonly status: 'canceled' }
  | { readonly status: 'error'; readonly error: FileLifecycleError }
  | { readonly status: 'ignored' };

export interface DocumentSessionState {
  readonly session?: DocumentSession;
  readonly error?: FileLifecycleError;
  readonly isBusy: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

export type DocumentSessionListener = (state: DocumentSessionState) => void;
export type ConfirmUnsavedChanges = (
  displayName: string,
) => Promise<UnsavedChangesDecision>;

export interface DroppedPngSource {
  readonly displayName: string;
  readonly filePath?: string;
  readonly readBytes: () => Promise<Uint8Array>;
}

function toLifecycleError(error: unknown): FileLifecycleError {
  if (error instanceof SkinPngError) {
    return { code: error.code, message: error.message };
  }

  return {
    code: 'invalid_png',
    message: 'The selected file could not be decoded as a valid PNG.',
  };
}

function ensurePngName(displayName: string): string {
  return displayName.toLowerCase().endsWith('.png')
    ? displayName
    : `${displayName}.png`;
}

function isPngDisplayName(displayName: string): boolean {
  return displayName.trim().toLowerCase().endsWith('.png');
}

/**
 * Owns document-session metadata and serializes destructive lifecycle work.
 * SkinDocument remains the only editable pixel authority; a replacement is
 * published only after prompting, optional persistence, reading, and decoding
 * have all completed successfully.
 */
export class DocumentSessionController {
  private state: DocumentSessionState = {
    isBusy: false,
    canUndo: false,
    canRedo: false,
  };
  private readonly listeners = new Set<DocumentSessionListener>();
  private unsubscribeHistory: (() => void) | undefined;

  constructor(
    private readonly nativeFiles: NativeSkinFileApi,
    private readonly createDocumentId: () => string,
    private readonly confirmUnsavedChanges: ConfirmUnsavedChanges = async () =>
      'cancel',
    initialSession?: DocumentSession,
  ) {
    if (initialSession !== undefined) {
      this.state = {
        session: initialSession,
        isBusy: false,
        ...initialSession.history.getState(),
      };
      this.attachHistory(initialSession);
    }
  }

  getState(): DocumentSessionState {
    return this.state;
  }

  subscribe(listener: DocumentSessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private publish(next: DocumentSessionState): void {
    this.state = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  private beginOperation(): boolean {
    if (this.state.isBusy) {
      return false;
    }

    this.state.session?.history.cancelActiveTransaction();
    this.publish({ ...this.state, error: undefined, isBusy: true });
    return true;
  }

  private finishCanceled(): FileCommandOutcome {
    this.publish({ ...this.state, error: undefined, isBusy: false });
    return { status: 'canceled' };
  }

  private fail(error: FileLifecycleError): FileCommandOutcome {
    this.publish({ ...this.state, error, isBusy: false });
    return { status: 'error', error };
  }

  private attachHistory(session: DocumentSession): void {
    this.unsubscribeHistory?.();
    this.unsubscribeHistory = session.history.subscribe((historyState) => {
      this.publish({ ...this.state, ...historyState });
    });
  }

  private replaceSessionFromPng(source: {
    readonly bytes: Uint8Array;
    readonly filePath?: string;
    readonly displayName: string;
  }): FileCommandOutcome {
    let document: SkinDocument;
    try {
      document = decodeSkinPng(source.bytes, {
        id: this.createDocumentId(),
        model: 'classic',
      });
    } catch (error) {
      return this.fail(toLifecycleError(error));
    }

    const session: DocumentSession = {
      document,
      history: new DocumentHistory(document),
      ...(source.filePath === undefined ? {} : { filePath: source.filePath }),
      displayName: source.displayName,
    };
    this.attachHistory(session);
    this.publish({
      session,
      error: undefined,
      isBusy: false,
      canUndo: false,
      canRedo: false,
    });
    return { status: 'success' };
  }

  private async persistCurrent(
    forceSaveAs: boolean,
    keepBusyAfterSuccess: boolean,
  ): Promise<FileCommandOutcome> {
    const session = this.state.session;
    if (session === undefined) {
      return this.fail({
        code: 'no_document',
        message: 'Open a PNG before saving.',
      });
    }

    let bytes: Uint8Array;
    try {
      bytes = encodeSkinPng(session.document);
    } catch (error) {
      return this.fail(toLifecycleError(error));
    }

    if (forceSaveAs || session.filePath === undefined) {
      const result = await this.nativeFiles.saveSkinPngAs({
        suggestedName: ensurePngName(session.displayName),
        bytes,
      });

      if (result.status === 'canceled') {
        return this.finishCanceled();
      }
      if (result.status === 'error') {
        return this.fail(result.error);
      }

      const nextSession: DocumentSession = {
        document: session.document,
        history: session.history,
        filePath: result.filePath,
        displayName: result.displayName,
      };
      session.document.markSaved();
      session.history.markSavedCheckpoint();
      this.publish({
        ...this.state,
        session: nextSession,
        error: undefined,
        isBusy: keepBusyAfterSuccess,
      });
      return { status: 'success' };
    }

    const result = await this.nativeFiles.saveSkinPng({
      filePath: session.filePath,
      bytes,
    });
    if (result.status === 'error') {
      return this.fail(result.error);
    }

    session.document.markSaved();
    session.history.markSavedCheckpoint();
    this.publish({
      ...this.state,
      session,
      error: undefined,
      isBusy: keepBusyAfterSuccess,
    });
    return { status: 'success' };
  }

  /**
   * Returns undefined when the destructive action may proceed. Any returned
   * outcome aborts it without replacing or clearing the active session.
   */
  private async guardUnsavedChanges(): Promise<FileCommandOutcome | undefined> {
    const session = this.state.session;
    if (session === undefined || !session.document.isDirty) {
      return undefined;
    }

    let decision: UnsavedChangesDecision;
    try {
      decision = await this.confirmUnsavedChanges(session.displayName);
    } catch {
      return this.finishCanceled();
    }

    if (decision === 'cancel') {
      return this.finishCanceled();
    }
    if (decision === 'discard') {
      return undefined;
    }

    const saveOutcome = await this.persistCurrent(false, true);
    return saveOutcome.status === 'success' ? undefined : saveOutcome;
  }

  async open(): Promise<FileCommandOutcome> {
    if (!this.beginOperation()) {
      return { status: 'ignored' };
    }

    const guardedOutcome = await this.guardUnsavedChanges();
    if (guardedOutcome !== undefined) {
      return guardedOutcome;
    }

    const result = await this.nativeFiles.openSkinPng();
    if (result.status === 'canceled') {
      return this.finishCanceled();
    }
    if (result.status === 'error') {
      return this.fail(result.error);
    }

    return this.replaceSessionFromPng({
      bytes: new Uint8Array(result.bytes),
      filePath: result.filePath,
      displayName: result.displayName,
    });
  }

  async newSkin(model: SkinModel): Promise<FileCommandOutcome> {
    if (!this.beginOperation()) {
      return { status: 'ignored' };
    }

    const guardedOutcome = await this.guardUnsavedChanges();
    if (guardedOutcome !== undefined) {
      return guardedOutcome;
    }

    const document = SkinDocument.createBlank({
      id: this.createDocumentId(),
      model,
    });
    const session: DocumentSession = {
      document,
      history: new DocumentHistory(document),
      displayName: 'Untitled.png',
    };
    this.attachHistory(session);
    this.publish({
      session,
      error: undefined,
      isBusy: false,
      canUndo: false,
      canRedo: false,
    });
    return { status: 'success' };
  }

  async openDroppedPng(source: DroppedPngSource): Promise<FileCommandOutcome> {
    if (this.state.isBusy) {
      return { status: 'ignored' };
    }

    if (
      typeof source.displayName !== 'string' ||
      !isPngDisplayName(source.displayName)
    ) {
      return this.fail({
        code: 'unsupported_file',
        message: 'Only .png files can be opened as Minecraft skins.',
      });
    }

    if (!this.beginOperation()) {
      return { status: 'ignored' };
    }

    const guardedOutcome = await this.guardUnsavedChanges();
    if (guardedOutcome !== undefined) {
      return guardedOutcome;
    }

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await source.readBytes());
    } catch {
      return this.fail({
        code: 'read_failed',
        message: 'The dropped PNG could not be read.',
      });
    }

    return this.replaceSessionFromPng({
      bytes,
      filePath: source.filePath,
      displayName: source.displayName,
    });
  }

  /** Resolves true only when a native close may resume. */
  async prepareToClose(): Promise<boolean> {
    if (!this.beginOperation()) {
      return false;
    }

    const guardedOutcome = await this.guardUnsavedChanges();
    if (guardedOutcome !== undefined) {
      return false;
    }

    this.publish({ ...this.state, error: undefined, isBusy: false });
    return true;
  }

  undo(): boolean {
    if (this.state.isBusy || this.state.session === undefined) {
      return false;
    }

    this.state.session.history.cancelActiveTransaction();
    return this.state.session.history.undo();
  }

  redo(): boolean {
    if (this.state.isBusy || this.state.session === undefined) {
      return false;
    }

    this.state.session.history.cancelActiveTransaction();
    return this.state.session.history.redo();
  }

  async save(): Promise<FileCommandOutcome> {
    if (!this.beginOperation()) {
      return { status: 'ignored' };
    }

    const session = this.state.session;
    if (session === undefined) {
      return this.fail({
        code: 'no_document',
        message: 'Open a PNG before saving.',
      });
    }
    if (!session.document.isDirty) {
      this.publish({ ...this.state, error: undefined, isBusy: false });
      return { status: 'ignored' };
    }

    return this.persistCurrent(false, false);
  }

  async saveAs(): Promise<FileCommandOutcome> {
    if (!this.beginOperation()) {
      return { status: 'ignored' };
    }
    return this.persistCurrent(true, false);
  }
}
