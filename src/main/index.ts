import { app, BrowserWindow, session } from 'electron';
import { electronApp, optimizer } from '@electron-toolkit/utils';
import { AppWindow } from './AppWindow';
import { MenuBuilder } from './MenuBuilder';
import { FileManager } from './FileManager';
import { IpcRouter } from './IpcRouter';
import { RecentFiles } from './RecentFiles';
import { FolderService } from './FolderService';
import { PdfExporter } from './PdfExporter';
import { IpcChannels } from '../shared/ipc-channels';

const MD_EXT = /\.(md|markdown|mdown|mkd)$/i;

/**
 * Single-window, tab-based Hash Markup.
 *
 * - The app holds exactly one BrowserWindow.
 * - Every document opened from anywhere (CLI args, `open-file` event,
 *   second launches, File > Open, recent list, sidebar) becomes a tab
 *   in that window's renderer.
 * - A single-instance lock means a second launch forwards its file path
 *   to the running copy instead of spinning up a duplicate app.
 */
class Application {
  private appWindow: AppWindow | null = null;
  private recent = new RecentFiles();
  private folders = new FolderService();
  private pdf = new PdfExporter();
  private fileManager = new FileManager(this.recent);
  private menu: MenuBuilder | null = null;
  private pendingMacFiles: string[] = [];

  async start(): Promise<void> {
    const gotLock = app.requestSingleInstanceLock();
    if (!gotLock) {
      app.quit();
      return;
    }

    app.on('second-instance', (_event, argv) => {
      const files = this.filesFromArgv(argv);
      files.forEach((f) => this.sendFile(f));
      this.focusWindow();
    });

    // macOS: Finder/Dock/OS may send open-file before app.ready. Buffer
    // until ready, then replay. Both event paths funnel into sendFile.
    app.on('open-file', (event, filePath) => {
      event.preventDefault();
      if (!app.isReady()) this.pendingMacFiles.push(filePath);
      else this.sendFile(filePath);
    });

    await app.whenReady();

    app.setName('Hash Markup');
    electronApp.setAppUserModelId('com.davidsoden.hashmarkup');
    session.defaultSession.setSpellCheckerEnabled(this.recent.getSpellcheck());
    app.on('browser-window-created', (_, w) => optimizer.watchWindowShortcuts(w));

    this.menu = new MenuBuilder(this.recent);
    this.menu.build();
    this.recent.onChange(() => this.menu?.refresh());

    const router = new IpcRouter(() => this.getOrCreateWindow(), {
      fileManager: this.fileManager,
      recent: this.recent,
      folders: this.folders,
      pdf: this.pdf,
    });
    router.register();

    const initial = [...this.filesFromArgv(process.argv), ...this.pendingMacFiles];
    this.pendingMacFiles = [];

    const bw = this.getOrCreateWindow();
    // Replay initial file list after the renderer is ready.
    if (initial.length > 0) {
      const send = (): void => initial.forEach((f) => bw.webContents.send(IpcChannels.InitialFile, f));
      if (bw.webContents.isLoading()) {
        bw.webContents.once('did-finish-load', send);
      } else {
        send();
      }
    }

    app.on('activate', () => this.getOrCreateWindow());

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  }

  private getOrCreateWindow(): BrowserWindow {
    if (this.appWindow) {
      const bw = this.appWindow.browserWindow;
      if (!bw.isDestroyed()) return bw;
    }
    this.appWindow = new AppWindow();
    const bw = this.appWindow.create();
    bw.on('closed', () => {
      this.appWindow = null;
    });
    return bw;
  }

  private sendFile(filePath: string): void {
    const bw = this.getOrCreateWindow();
    const deliver = (): void => bw.webContents.send(IpcChannels.InitialFile, filePath);
    if (bw.webContents.isLoading()) bw.webContents.once('did-finish-load', deliver);
    else deliver();
    if (bw.isMinimized()) bw.restore();
    bw.focus();
  }

  private focusWindow(): void {
    const bw = this.appWindow?.browserWindow;
    if (bw && !bw.isDestroyed()) {
      if (bw.isMinimized()) bw.restore();
      bw.focus();
    }
  }

  private filesFromArgv(argv: readonly string[]): string[] {
    return argv.slice(1).filter((a) => !a.startsWith('-') && MD_EXT.test(a));
  }
}

new Application().start().catch((err) => {
  console.error('Fatal startup error', err);
  app.exit(1);
});
