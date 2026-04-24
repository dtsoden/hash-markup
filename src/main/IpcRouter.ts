import { ipcMain, BrowserWindow, session } from 'electron';
import { IpcChannels, type SaveFileRequest } from '../shared/ipc-channels';
import type { FileManager } from './FileManager';
import type { RecentFiles } from './RecentFiles';
import type { FolderService } from './FolderService';
import type { PdfExporter } from './PdfExporter';

export interface IpcServices {
  fileManager: FileManager;
  recent: RecentFiles;
  folders: FolderService;
  pdf: PdfExporter;
}

/**
 * Thin wiring layer: IPC channel → service method. Keeping this as a class
 * means services can be stubbed for tests.
 */
export class IpcRouter {
  constructor(
    private readonly getWindow: () => BrowserWindow,
    private readonly services: IpcServices,
  ) {}

  register(): void {
    const { fileManager, recent, folders, pdf } = this.services;

    ipcMain.handle(IpcChannels.FileOpen, () => fileManager.openWithDialog(this.getWindow()));
    ipcMain.handle(IpcChannels.FileOpenPath, (_e, filePath: string) =>
      fileManager.readFile(filePath),
    );
    ipcMain.handle(IpcChannels.FileSave, (_e, request: SaveFileRequest) =>
      fileManager.save(this.getWindow(), request),
    );
    ipcMain.handle(IpcChannels.FileSaveAs, (_e, content: string) =>
      fileManager.saveAs(this.getWindow(), content),
    );

    ipcMain.handle(IpcChannels.FolderOpen, () => folders.openDialog(this.getWindow()));
    ipcMain.handle(IpcChannels.FolderRead, (_e, p: string) => folders.readTree(p));

    ipcMain.handle(IpcChannels.RecentList, () => recent.prune());
    ipcMain.handle(IpcChannels.RecentAdd, (_e, p: string) => recent.add(p));
    ipcMain.handle(IpcChannels.RecentClear, () => {
      recent.clear();
      return [];
    });

    ipcMain.handle(IpcChannels.SpellcheckGet, () => recent.getSpellcheck());
    ipcMain.handle(IpcChannels.SpellcheckSet, (_e, enabled: boolean) => {
      recent.setSpellcheck(enabled);
      session.defaultSession.setSpellCheckerEnabled(enabled);
      return enabled;
    });

    ipcMain.handle(IpcChannels.ThemeGet, () => recent.getTheme());
    ipcMain.handle(IpcChannels.ThemeSet, (_e, theme: 'auto' | 'light' | 'dark') => {
      recent.setTheme(theme);
      return theme;
    });

    ipcMain.handle(IpcChannels.SanitizerGet, () => recent.getSanitizer());
    ipcMain.handle(IpcChannels.SanitizerSet, (_e, enabled: boolean) => {
      recent.setSanitizer(enabled);
      return enabled;
    });

    ipcMain.handle(
      IpcChannels.ExportPdf,
      (_e, payload: { content: string; fileName: string }) =>
        pdf.export(this.getWindow(), payload.content, payload.fileName),
    );
  }
}
