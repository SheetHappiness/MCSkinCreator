import type {
  NativeSkinEditApi,
  NativeSkinFileApi,
} from '../../../electron/fileContract';

declare global {
  interface Window {
    readonly skinFiles?: NativeSkinFileApi;
    readonly skinEdits?: NativeSkinEditApi;
  }
}

export {};
