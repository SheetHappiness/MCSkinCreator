import type {
  NativeFileError,
  NativeSkinFileApi,
} from '../../../electron/fileContract';
import { SkinDocument } from '../../engine/document';
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
  NativeFileError['code'] | SkinPngErrorCode | 'no_document';

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

/**
 * Owns document-session metadata and coordinates atomic native persistence.
 * SkinDocument remains the only editable pixel authority; paths and names never
 * enter the domain model.
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
  ) {}

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

  private begin(): boolean {
    if (this.state.isBusy) {
      return false;
    }

    this.state.session?.history.cancelActiveTransaction();

    this.publish({ ...this.state, error: undefined, isBusy: true });
    return true;
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

  async open(): Promise<FileCommandOutcome> {
    if (!this.begin()) {
      return { status: 'ignored' };
    }

    const result = await this.nativeFiles.openSkinPng();

    if (result.status === 'canceled') {
      this.publish({ ...this.state, isBusy: false });
      return { status: 'canceled' };
    }

    if (result.status === 'error') {
      return this.fail(result.error);
    }

    let document: SkinDocument;
    try {
      document = decodeSkinPng(new Uint8Array(result.bytes), {
        id: this.createDocumentId(),
        model: 'classic',
      });
    } catch (error) {
      return this.fail(toLifecycleError(error));
    }

    const session: DocumentSession = {
      document,
      history: new DocumentHistory(document),
      filePath: result.filePath,
      displayName: result.displayName,
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
    if (!this.begin()) {
      return { status: 'ignored' };
    }

    const session = this.state.session;
    if (session?.filePath === undefined) {
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

    const result = await this.nativeFiles.saveSkinPng({
      filePath: session.filePath,
      bytes,
    });

    if (result.status === 'error') {
      return this.fail(result.error);
    }

    session.document.markSaved();
    this.publish({ ...this.state, session, error: undefined, isBusy: false });
    return { status: 'success' };
  }

  async saveAs(): Promise<FileCommandOutcome> {
    if (!this.begin()) {
      return { status: 'ignored' };
    }

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

    const result = await this.nativeFiles.saveSkinPngAs({
      suggestedName: ensurePngName(session.displayName),
      bytes,
    });

    if (result.status === 'canceled') {
      this.publish({ ...this.state, isBusy: false });
      return { status: 'canceled' };
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
    this.publish({
      ...this.state,
      session: nextSession,
      error: undefined,
      isBusy: false,
    });
    return { status: 'success' };
  }
}
