import { BrowserWindow, shell, app, nativeImage } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';

const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(__dirname, '../../build/icon.png');

/**
 * Represents a single editor BrowserWindow. Multiple instances exist when
 * the user has more than one document open. Each window is fully self-
 * contained — its own renderer, its own document state.
 */
export class AppWindow {
  private window: BrowserWindow | null = null;

  create(): BrowserWindow {
    this.window = new BrowserWindow({
      width: 1100,
      height: 760,
      minWidth: 640,
      minHeight: 400,
      show: false,
      title: 'Hash Markup',
      titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
      backgroundColor: '#ffffff',
      icon: nativeImage.createFromPath(iconPath),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: true,
      },
    });

    this.window.on('ready-to-show', () => this.window?.show());

    this.window.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      return { action: 'deny' };
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.window.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      this.window.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return this.window;
  }

  get browserWindow(): BrowserWindow {
    if (!this.window) throw new Error('Window not created');
    return this.window;
  }
}
