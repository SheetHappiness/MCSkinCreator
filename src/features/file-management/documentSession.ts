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

export type SaveAllOutcome =
  | {
      readonly status: 'success';
      readonly savedDocumentIds: readonly string[];
    }
  | {
      readonly status: 'canceled';
      readonly savedDocumentIds: readonly string[];
    }
  | {
      readonly status: 'error';
      readonly error: FileLifecycleError;
      readonly savedDocumentIds: readonly string[];
    }
  | { readonly status: 'ignored'; readonly savedDocumentIds: readonly [] };

export interface DocumentSessionState {
  readonly sessions: readonly DocumentSession[];
  readonly activeDocumentId?: string;
  /** Convenience alias for the active session used by the editor shell. */
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

function normalizedFilePath(filePath: string): string {
  return filePath.replaceAll('\\', '/').toLowerCase();
}

/**
 * Owns all open document sessions and serializes destructive lifecycle work.
 * Each session retains its own SkinDocument and DocumentHistory; the active
 * session is only a derived selection for the editor shell.
 */
export class DocumentSessionController {
  private sessions: readonly DocumentSession[] = [];
  private activeDocumentId: string | undefined;
  private readonly listeners = new Set<DocumentSessionListener>();
  private readonly unsubscribeHistories = new Map<string, () => void>();
  private state: DocumentSessionState = {
    sessions: [],
    activeDocumentId: undefined,
    session: undefined,
    isBusy: false,
    canUndo: false,
    canRedo: false,
  };

  constructor(
    private readonly nativeFiles: NativeSkinFileApi,
    private readonly createDocumentId: () => string,
    private readonly confirmUnsavedChanges: ConfirmUnsavedChanges = async () =>
      'cancel',
    initialSession?: DocumentSession,
  ) {
    if (initialSession !== undefined) {
      this.sessions = [initialSession];
      this.activeDocumentId = initialSession.document.id;
      this.attachHistory(initialSession);
      this.state = this.snapshotState();
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
    for (const listener of this.listeners) listener(next);
  }

  private activeSession(): DocumentSession | undefined {
    return this.sessions.find(
      (session) => session.document.id === this.activeDocumentId,
    );
  }

  private findSession(documentId: string): DocumentSession | undefined {
    return this.sessions.find((session) => session.document.id === documentId);
  }

  private findSessionByPath(filePath: string): DocumentSession | undefined {
    const normalized = normalizedFilePath(filePath);
    return this.sessions.find(
      (session) =>
        session.filePath !== undefined &&
        normalizedFilePath(session.filePath) === normalized,
    );
  }

  private snapshotState(
    overrides: {
      readonly error?: FileLifecycleError;
      readonly isBusy?: boolean;
      readonly clearError?: boolean;
    } = {},
  ): DocumentSessionState {
    const active = this.activeSession();
    return {
      sessions: this.sessions,
      activeDocumentId: this.activeDocumentId,
      session: active,
      ...(overrides.clearError === true
        ? { error: undefined }
        : { error: overrides.error ?? this.state.error }),
      isBusy: overrides.isBusy ?? this.state.isBusy,
      canUndo: active?.history.canUndo ?? false,
      canRedo: active?.history.canRedo ?? false,
    };
  }

  private publishSessionState(
    overrides: {
      readonly error?: FileLifecycleError;
      readonly isBusy?: boolean;
      readonly clearError?: boolean;
    } = {},
  ): void {
    this.publish(this.snapshotState(overrides));
  }

  private beginOperation(): boolean {
    if (this.state.isBusy) return false;
    this.activeSession()?.history.cancelActiveTransaction();
    this.publishSessionState({ isBusy: true, clearError: true });
    return true;
  }

  private finishCanceled(): FileCommandOutcome {
    this.publishSessionState({ isBusy: false, clearError: true });
    return { status: 'canceled' };
  }

  private fail(error: FileLifecycleError): FileCommandOutcome {
    this.publishSessionState({ isBusy: false, error });
    return { status: 'error', error };
  }

  private attachHistory(session: DocumentSession): void {
    this.unsubscribeHistories.get(session.document.id)?.();
    const unsubscribe = session.history.subscribe(() => {
      this.publishSessionState();
    });
    this.unsubscribeHistories.set(session.document.id, unsubscribe);
  }

  private detachHistory(session: DocumentSession): void {
    this.unsubscribeHistories.get(session.document.id)?.();
    this.unsubscribeHistories.delete(session.document.id);
  }

  private addSession(session: DocumentSession): FileCommandOutcome {
    this.sessions = [...this.sessions, session];
    this.activeDocumentId = session.document.id;
    this.attachHistory(session);
    this.publishSessionState({ isBusy: false, clearError: true });
    return { status: 'success' };
  }

  private replaceSessionMetadata(
    session: DocumentSession,
    nextSession: DocumentSession,
  ): void {
    this.sessions = this.sessions.map((candidate) =>
      candidate.document.id === session.document.id ? nextSession : candidate,
    );
  }

  private replaceOrActivatePng(source: {
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

    const existing =
      source.filePath === undefined
        ? undefined
        : this.findSessionByPath(source.filePath);
    if (existing !== undefined) {
      this.activeDocumentId = existing.document.id;
      this.publishSessionState({ isBusy: false, clearError: true });
      return { status: 'success' };
    }

    return this.addSession({
      document,
      history: new DocumentHistory(document),
      ...(source.filePath === undefined ? {} : { filePath: source.filePath }),
      displayName: source.displayName,
    });
  }

  private async persistSession(
    session: DocumentSession,
    forceSaveAs: boolean,
    keepBusyAfterSuccess: boolean,
  ): Promise<FileCommandOutcome> {
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

      if (result.status === 'canceled') return this.finishCanceled();
      if (result.status === 'error') return this.fail(result.error);

      this.replaceSessionMetadata(session, {
        document: session.document,
        history: session.history,
        filePath: result.filePath,
        displayName: result.displayName,
      });
      session.document.markSaved();
      session.history.markSavedCheckpoint();
      this.publishSessionState({
        isBusy: keepBusyAfterSuccess,
        clearError: true,
      });
      return { status: 'success' };
    }

    const result = await this.nativeFiles.saveSkinPng({
      filePath: session.filePath,
      bytes,
    });
    if (result.status === 'error') return this.fail(result.error);

    session.document.markSaved();
    session.history.markSavedCheckpoint();
    this.publishSessionState({
      isBusy: keepBusyAfterSuccess,
      clearError: true,
    });
    return { status: 'success' };
  }

  private async guardSessionUnsavedChanges(
    session: DocumentSession,
  ): Promise<FileCommandOutcome | undefined> {
    if (!session.document.isDirty) return undefined;

    let decision: UnsavedChangesDecision;
    try {
      decision = await this.confirmUnsavedChanges(session.displayName);
    } catch {
      return this.finishCanceled();
    }

    if (decision === 'cancel') return this.finishCanceled();
    if (decision === 'discard') return undefined;

    const saveOutcome = await this.persistSession(session, false, true);
    return saveOutcome.status === 'success' ? undefined : saveOutcome;
  }

  async open(): Promise<FileCommandOutcome> {
    if (!this.beginOperation()) return { status: 'ignored' };

    const result = await this.nativeFiles.openSkinPng();
    if (result.status === 'canceled') return this.finishCanceled();
    if (result.status === 'error') return this.fail(result.error);

    return this.replaceOrActivatePng({
      bytes: new Uint8Array(result.bytes),
      filePath: result.filePath,
      displayName: result.displayName,
    });
  }

  async newSkin(model: SkinModel): Promise<FileCommandOutcome> {
    if (!this.beginOperation()) return { status: 'ignored' };

    const document = SkinDocument.createBlank({
      id: this.createDocumentId(),
      model,
    });
    return this.addSession({
      document,
      history: new DocumentHistory(document),
      displayName: 'Untitled.png',
    });
  }

  async openDroppedPng(source: DroppedPngSource): Promise<FileCommandOutcome> {
    if (this.state.isBusy) return { status: 'ignored' };

    if (
      typeof source.displayName !== 'string' ||
      !isPngDisplayName(source.displayName)
    ) {
      return this.fail({
        code: 'unsupported_file',
        message: 'Only .png files can be opened as Minecraft skins.',
      });
    }

    if (!this.beginOperation()) return { status: 'ignored' };

    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await source.readBytes());
    } catch {
      return this.fail({
        code: 'read_failed',
        message: 'The dropped PNG could not be read.',
      });
    }

    return this.replaceOrActivatePng({
      bytes,
      filePath: source.filePath,
      displayName: source.displayName,
    });
  }

  activateDocument(documentId: string): boolean {
    if (this.state.isBusy) return false;
    const session = this.findSession(documentId);
    if (session === undefined) return false;
    if (this.activeDocumentId === documentId) return true;

    this.activeSession()?.history.cancelActiveTransaction();
    this.activeDocumentId = documentId;
    this.publishSessionState({ isBusy: false, clearError: true });
    return true;
  }

  async closeDocument(documentId?: string): Promise<FileCommandOutcome> {
    if (this.state.isBusy) return { status: 'ignored' };
    const targetId = documentId ?? this.activeDocumentId;
    const target =
      targetId === undefined ? undefined : this.findSession(targetId);
    if (target === undefined) {
      return this.fail({
        code: 'no_document',
        message: 'There is no open document to close.',
      });
    }
    if (!this.beginOperation()) return { status: 'ignored' };
    target.history.cancelActiveTransaction();

    const guardedOutcome = await this.guardSessionUnsavedChanges(target);
    if (guardedOutcome !== undefined) return guardedOutcome;

    const targetIndex = this.sessions.findIndex(
      (session) => session.document.id === target.document.id,
    );
    this.detachHistory(target);
    this.sessions = this.sessions.filter(
      (session) => session.document.id !== target.document.id,
    );
    if (this.activeDocumentId === target.document.id) {
      const fallback =
        this.sessions[targetIndex - 1] ?? this.sessions[targetIndex];
      this.activeDocumentId = fallback?.document.id;
    }
    this.publishSessionState({ isBusy: false, clearError: true });
    return { status: 'success' };
  }

  updateFileMetadataForPath(
    previousPath: string,
    nextPath: string,
    displayName: string,
  ): boolean {
    const session = this.findSessionByPath(previousPath);
    if (session === undefined) return false;
    this.replaceSessionMetadata(session, {
      document: session.document,
      history: session.history,
      filePath: nextPath,
      displayName,
    });
    this.publishSessionState({ clearError: true });
    return true;
  }

  undo(): boolean {
    if (this.state.isBusy) return false;
    const session = this.activeSession();
    if (session === undefined) return false;
    session.history.cancelActiveTransaction();
    return session.history.undo();
  }

  redo(): boolean {
    if (this.state.isBusy) return false;
    const session = this.activeSession();
    if (session === undefined) return false;
    session.history.cancelActiveTransaction();
    return session.history.redo();
  }

  async save(): Promise<FileCommandOutcome> {
    if (!this.beginOperation()) return { status: 'ignored' };

    const session = this.activeSession();
    if (session === undefined) {
      return this.fail({
        code: 'no_document',
        message: 'Open a PNG before saving.',
      });
    }
    if (!session.document.isDirty) {
      this.publishSessionState({ isBusy: false, clearError: true });
      return { status: 'ignored' };
    }

    return this.persistSession(session, false, false);
  }

  async saveAs(): Promise<FileCommandOutcome> {
    if (!this.beginOperation()) return { status: 'ignored' };
    const session = this.activeSession();
    if (session === undefined) {
      return this.fail({
        code: 'no_document',
        message: 'Open a PNG before saving.',
      });
    }
    return this.persistSession(session, true, false);
  }

  async saveAll(): Promise<SaveAllOutcome> {
    if (!this.beginOperation()) {
      return { status: 'ignored', savedDocumentIds: [] };
    }

    const dirtySessions = this.sessions.filter(
      (session) => session.document.isDirty,
    );
    if (dirtySessions.length === 0) {
      this.publishSessionState({ isBusy: false, clearError: true });
      return { status: 'ignored', savedDocumentIds: [] };
    }

    const savedDocumentIds: string[] = [];
    for (const session of dirtySessions) {
      const outcome = await this.persistSession(session, false, true);
      if (outcome.status === 'success') {
        savedDocumentIds.push(session.document.id);
        continue;
      }
      if (outcome.status === 'canceled') {
        return { status: 'canceled', savedDocumentIds };
      }
      if (outcome.status === 'error') {
        return { status: 'error', error: outcome.error, savedDocumentIds };
      }
      return { status: 'canceled', savedDocumentIds };
    }

    this.publishSessionState({ isBusy: false, clearError: true });
    return { status: 'success', savedDocumentIds };
  }

  /** Resolves true only when a native close may resume. */
  async prepareToClose(): Promise<boolean> {
    if (!this.beginOperation()) return false;

    const dirtySessions = this.sessions.filter(
      (session) => session.document.isDirty,
    );
    for (const session of dirtySessions) {
      const guardedOutcome = await this.guardSessionUnsavedChanges(session);
      if (guardedOutcome !== undefined) return false;
    }

    this.publishSessionState({ isBusy: false, clearError: true });
    return true;
  }
}
