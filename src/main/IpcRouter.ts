import { ipcMain, BrowserWindow, app, session, shell } from 'electron';
import {
  IpcChannels,
  ZOOM_MIN,
  ZOOM_MAX,
  ZOOM_STEP,
  ZOOM_DEFAULT,
  type AppVersionInfo,
  type SaveFileRequest,
  type ZoomStepDirection,
} from '../shared/ipc-channels';
import type { FileManager } from './FileManager';
import type { RecentFiles } from './RecentFiles';
import type { FolderService } from './FolderService';
import type { PdfExporter } from './PdfExporter';
import type { UpdaterService } from './UpdaterService';
import { BUILD_HASH } from '../shared/build-info';

export interface IpcServices {
  fileManager: FileManager;
  recent: RecentFiles;
  folders: FolderService;
  pdf: PdfExporter;
  updater: UpdaterService;
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

    const { updater } = this.services;
    ipcMain.handle(IpcChannels.UpdateCheck, (_e, manual: boolean) =>
      updater.checkForUpdates(manual),
    );
    ipcMain.handle(IpcChannels.UpdateDownload, () => updater.downloadUpdate());
    ipcMain.handle(IpcChannels.UpdateInstall, () => updater.quitAndInstall());

    ipcMain.handle(
      IpcChannels.AppGetVersion,
      (): AppVersionInfo => ({
        version: app.getVersion(),
        buildHash: BUILD_HASH,
        electronVersion: process.versions.electron,
      }),
    );

    // Find-in-page using Chromium's built-in highlight, scoped to the
    // current window's webContents. Works across WYSIWYG and Raw mode
    // since both are rendered DOM.
    ipcMain.handle(
      IpcChannels.FindStart,
      (_e, query: string, options?: { forward?: boolean; findNext?: boolean }) => {
        const w = this.getWindow();
        if (!w || w.isDestroyed() || !query) return;
        w.webContents.findInPage(query, {
          forward: options?.forward ?? true,
          findNext: options?.findNext ?? false,
          matchCase: false,
        });
      },
    );
    ipcMain.handle(IpcChannels.FindStop, () => {
      const w = this.getWindow();
      if (!w || w.isDestroyed()) return;
      w.webContents.stopFindInPage('clearSelection');
    });

    // Open a link in the user's default browser (anchor click hook in the
    // editor calls this so URLs go to Chrome/Safari/etc., not the app).
    ipcMain.handle(IpcChannels.OpenExternal, (_e, url: string) => {
      if (!url) return;
      if (/^(https?|mailto):/i.test(url)) {
        void shell.openExternal(url);
      }
    });

    ipcMain.handle(IpcChannels.ZoomGet, () => recent.getZoom());
    ipcMain.handle(IpcChannels.ZoomStep, (_e, direction: ZoomStepDirection) => {
      const current = recent.getZoom();
      const next =
        direction === 'reset'
          ? ZOOM_DEFAULT
          : clamp(
              round1(current + (direction === 'in' ? ZOOM_STEP : -ZOOM_STEP)),
              ZOOM_MIN,
              ZOOM_MAX,
            );
      recent.setZoom(next);
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.setZoomFactor(next);
        w.webContents.send(IpcChannels.ZoomChanged, next);
      }
      return next;
    });
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  // Snap to 0.1 grid so floating-point drift doesn't turn 1.3 into 1.2999999.
  return Math.round(n * 10) / 10;
}
