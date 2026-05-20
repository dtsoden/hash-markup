export const IpcChannels = {
  FileOpen: 'file:open',
  FileOpenPath: 'file:open-path',
  FileSave: 'file:save',
  FileSaveAs: 'file:save-as',
  FolderOpen: 'folder:open',
  FolderRead: 'folder:read',
  RecentList: 'recent:list',
  RecentAdd: 'recent:add',
  RecentClear: 'recent:clear',
  RecentChanged: 'recent:changed',
  SpellcheckSet: 'spellcheck:set',
  SpellcheckGet: 'spellcheck:get',
  ThemeGet: 'theme:get',
  ThemeSet: 'theme:set',
  SanitizerGet: 'sanitizer:get',
  SanitizerSet: 'sanitizer:set',
  ExportPdf: 'export:pdf',
  MenuAction: 'menu:action',
  OpenRecentPath: 'menu:open-recent-path',
  InitialFile: 'window:initial-file',
  ZoomGet: 'zoom:get',
  ZoomStep: 'zoom:step',
  ZoomChanged: 'zoom:changed',
  UpdateCheck: 'update:check',
  UpdateDownload: 'update:download',
  UpdateInstall: 'update:install',
  UpdateState: 'update:state',
  AppGetVersion: 'app:get-version',
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

export interface OpenFileResult {
  filePath: string;
  content: string;
}

export interface SaveFileRequest {
  filePath: string | null;
  content: string;
}

export interface SaveFileResult {
  filePath: string;
}

export type MenuAction =
  | 'new'
  | 'open'
  | 'open-folder'
  | 'close-doc'
  | 'save'
  | 'save-as'
  | 'export-pdf'
  | 'toggle-mode'
  | 'toggle-wysiwyg'
  | 'toggle-markdown'
  | 'toggle-sidebar'
  | 'toggle-spellcheck'
  | 'toggle-sanitizer'
  | 'set-theme'
  | 'clear-recent'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-reset'
  | 'open-about'
  | 'check-for-updates';

export type ZoomStepDirection = 'in' | 'out' | 'reset';

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking'; manual: boolean }
  | { kind: 'available'; version: string; releaseNotes?: string }
  | {
      kind: 'downloading';
      percent: number;
      transferred: number;
      total: number;
      bytesPerSecond: number;
    }
  | { kind: 'ready'; version: string }
  | { kind: 'none'; currentVersion: string }
  | { kind: 'error'; message: string };

export interface AppVersionInfo {
  version: string;
  buildHash: string;
  electronVersion: string;
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3.0;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1.0;

export type ThemePref = 'auto' | 'light' | 'dark';
