import type { EditorApi } from '../../../preload';

declare global {
  interface Window {
    api: EditorApi;
  }
}

export {};
