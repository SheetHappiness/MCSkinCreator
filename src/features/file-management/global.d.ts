import type {
  NativeAppLifecycleApi,
  NativeSkinEditApi,
  NativeSkinFileApi,
  NativeSkinLibraryApi,
  NativePreviewApi,
} from '../../../electron/fileContract';

declare global {
  interface Window {
    readonly skinFiles?: NativeSkinFileApi;
    readonly skinLibrary?: NativeSkinLibraryApi;
    readonly preview?: NativePreviewApi;
    readonly skinEdits?: NativeSkinEditApi;
    readonly appLifecycle?: NativeAppLifecycleApi;
  }
}

export {};
