import type { SkinDocument } from '../../engine/document';
import { encodeSkinPng } from '../../engine/png';
import type {
  NativePreviewApi,
  OpenPopoutPreviewRequest,
  OpenPopoutPreviewResult,
  PopoutPreviewState,
  PreviewVisibilityState,
  SavePreviewSnapshotRequest,
  SavePreviewSnapshotResult,
} from '../../../electron/fileContract';

const unavailablePreviewApi: NativePreviewApi = {
  async openPopoutPreview(): Promise<OpenPopoutPreviewResult> {
    return {
      status: 'error',
      error: {
        code: 'write_failed',
        message: 'Pop-out preview is unavailable in this environment.',
      },
    };
  },
  publishPopoutPreview() {},
  onPopoutPreviewState() {
    return () => undefined;
  },
  notifyPopoutPreviewReady() {},
  onPopoutPreviewClosed() {
    return () => undefined;
  },
  async savePreviewSnapshot(): Promise<SavePreviewSnapshotResult> {
    return {
      status: 'error',
      error: {
        code: 'write_failed',
        message: 'Preview snapshot export is unavailable in this environment.',
      },
    };
  },
};

const nativePreview = window.preview ?? unavailablePreviewApi;
let boundDocumentId: string | undefined;

nativePreview.onPopoutPreviewClosed(() => {
  boundDocumentId = undefined;
});

export function createPopoutPreviewState(
  document: SkinDocument,
  displayName: string,
  revision: number,
  visibility: PreviewVisibilityState,
): PopoutPreviewState {
  return {
    documentId: document.id,
    displayName,
    model: document.model,
    revision,
    pngBytes: encodeSkinPng(document),
    visibility: {
      bodyParts: { ...visibility.bodyParts },
      layers: { ...visibility.layers },
    },
  };
}

export function isPopoutBoundTo(documentId: string): boolean {
  return boundDocumentId === documentId;
}

export async function openPopoutPreview(
  state: PopoutPreviewState,
): Promise<OpenPopoutPreviewResult> {
  if (boundDocumentId !== undefined && boundDocumentId !== state.documentId) {
    return { status: 'already_open' };
  }

  const request: OpenPopoutPreviewRequest = {
    documentId: state.documentId,
    displayName: state.displayName,
  };
  const result = await nativePreview.openPopoutPreview(request);
  if (result.status === 'error') {
    boundDocumentId = undefined;
    return result;
  }

  boundDocumentId = state.documentId;
  nativePreview.publishPopoutPreview(state);
  return result;
}

export function publishPopoutPreview(state: PopoutPreviewState): void {
  if (boundDocumentId === state.documentId) {
    nativePreview.publishPopoutPreview(state);
  }
}

export async function savePreviewSnapshot(
  request: SavePreviewSnapshotRequest,
): Promise<SavePreviewSnapshotResult> {
  return nativePreview.savePreviewSnapshot(request);
}

export function subscribeToPopoutPreviewState(
  listener: (state: PopoutPreviewState) => void,
): () => void {
  return nativePreview.onPopoutPreviewState(listener);
}

export function notifyPopoutPreviewReady(): void {
  nativePreview.notifyPopoutPreviewReady();
}
