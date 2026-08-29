import type {
  NativeAppLifecycleApi,
  NativeSkinEditApi,
  NativeSkinFileApi,
  NativeSkinLibraryApi,
} from '../../../electron/fileContract';

declare global {
  interface Window {
    readonly skinFiles?: NativeSkinFileApi;
    readonly skinLibrary?: NativeSkinLibraryApi;
    readonly skinEdits?: NativeSkinEditApi;
    readonly appLifecycle?: NativeAppLifecycleApi;
  }
}

export {};
