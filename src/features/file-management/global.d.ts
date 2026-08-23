import type { NativeSkinFileApi } from '../../../electron/fileContract';

declare global {
  interface Window {
    readonly skinFiles?: NativeSkinFileApi;
  }
}

export {};
