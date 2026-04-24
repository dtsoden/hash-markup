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
  | 'clear-recent';

export type ThemePref = 'auto' | 'light' | 'dark';
