import { contextBridge, ipcRenderer } from 'electron';
import {
  IpcChannels,
  type OpenFileResult,
  type SaveFileRequest,
  type SaveFileResult,
  type MenuAction,
} from '../shared/ipc-channels';

interface FolderNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FolderNode[];
}

const api = {
  openFile: (): Promise<OpenFileResult | null> => ipcRenderer.invoke(IpcChannels.FileOpen),
  openFileByPath: (p: string): Promise<OpenFileResult> =>
    ipcRenderer.invoke(IpcChannels.FileOpenPath, p),
  saveFile: (req: SaveFileRequest): Promise<SaveFileResult | null> =>
    ipcRenderer.invoke(IpcChannels.FileSave, req),
  saveFileAs: (content: string): Promise<SaveFileResult | null> =>
    ipcRenderer.invoke(IpcChannels.FileSaveAs, content),

  openFolder: (): Promise<FolderNode | null> => ipcRenderer.invoke(IpcChannels.FolderOpen),
  readFolder: (p: string): Promise<FolderNode> => ipcRenderer.invoke(IpcChannels.FolderRead, p),

  recentList: (): Promise<string[]> => ipcRenderer.invoke(IpcChannels.RecentList),
  recentAdd: (p: string): Promise<string[]> => ipcRenderer.invoke(IpcChannels.RecentAdd, p),
  recentClear: (): Promise<string[]> => ipcRenderer.invoke(IpcChannels.RecentClear),

  getSpellcheck: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.SpellcheckGet),
  setSpellcheck: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.SpellcheckSet, enabled),

  getTheme: (): Promise<'auto' | 'light' | 'dark'> => ipcRenderer.invoke(IpcChannels.ThemeGet),
  setTheme: (theme: 'auto' | 'light' | 'dark'): Promise<'auto' | 'light' | 'dark'> =>
    ipcRenderer.invoke(IpcChannels.ThemeSet, theme),

  getSanitizer: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.SanitizerGet),
  setSanitizer: (enabled: boolean): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.SanitizerSet, enabled),

  exportPdf: (payload: { content: string; fileName: string }): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.ExportPdf, payload),

  onMenuAction: (handler: (action: MenuAction, payload?: unknown) => void): (() => void) => {
    const listener = (_: unknown, action: MenuAction, payload?: unknown): void =>
      handler(action, payload);
    ipcRenderer.on(IpcChannels.MenuAction, listener);
    return () => ipcRenderer.removeListener(IpcChannels.MenuAction, listener);
  },
  onOpenRecentPath: (handler: (p: string) => void): (() => void) => {
    const listener = (_: unknown, p: string): void => handler(p);
    ipcRenderer.on(IpcChannels.OpenRecentPath, listener);
    return () => ipcRenderer.removeListener(IpcChannels.OpenRecentPath, listener);
  },
  onRecentChanged: (handler: (list: string[]) => void): (() => void) => {
    const listener = (_: unknown, list: string[]): void => handler(list);
    ipcRenderer.on(IpcChannels.RecentChanged, listener);
    return () => ipcRenderer.removeListener(IpcChannels.RecentChanged, listener);
  },
  onInitialFile: (handler: (p: string) => void): (() => void) => {
    const listener = (_: unknown, p: string): void => handler(p);
    ipcRenderer.on(IpcChannels.InitialFile, listener);
    return () => ipcRenderer.removeListener(IpcChannels.InitialFile, listener);
  },

  platform: process.platform,
};

export type EditorApi = typeof api;
export type { FolderNode };

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api);
} else {
  (window as unknown as { api: EditorApi }).api = api;
}
