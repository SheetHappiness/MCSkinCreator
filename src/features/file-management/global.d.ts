import type {
  NativeAppLifecycleApi,
  NativeSkinEditApi,
  NativeSkinFileApi,
} from '../../../electron/fileContract';

declare global {
  interface Window {
    readonly skinFiles?: NativeSkinFileApi;
    readonly skinEdits?: NativeSkinEditApi;
    readonly appLifecycle?: NativeAppLifecycleApi;
  }
}

export {};
