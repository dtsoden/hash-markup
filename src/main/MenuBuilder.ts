import { Menu, BrowserWindow, MenuItemConstructorOptions, app, shell } from 'electron';
import { IpcChannels, type MenuAction } from '../shared/ipc-channels';
import type { RecentFiles } from './RecentFiles';

/**
 * Builds the native application menu. Menu events are forwarded to the
 * renderer as abstract `MenuAction` strings — main process doesn't know
 * editor state. Recent files and spellcheck are re-rendered on change.
 */
export class MenuBuilder {
  constructor(private readonly recent: RecentFiles) {}

  private focused(): BrowserWindow | null {
    return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
  }

  build(): Menu {
    const isMac = process.platform === 'darwin';
    const recentItems = this.buildRecentSubmenu();
    const spellcheckEnabled = this.recent.getSpellcheck();

    const template: MenuItemConstructorOptions[] = [];

    if (isMac) {
      template.push({
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' },
        ],
      });
    }

    template.push({
      label: '&File',
      submenu: [
        { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => this.send('new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => this.send('open') },
        {
          label: 'Open Folder…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => this.send('open-folder'),
        },
        { label: 'Open Recent', submenu: recentItems },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => this.send('save') },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => this.send('save-as'),
        },
        { type: 'separator' },
        {
          label: 'Export as PDF…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => this.send('export-pdf'),
        },
        { type: 'separator' },
        {
          label: 'Close Document',
          accelerator: 'CmdOrCtrl+W',
          click: () => this.send('close-doc'),
        },
        { type: 'separator' },
        isMac ? { label: 'Close Window', accelerator: 'CmdOrCtrl+Shift+W', role: 'close' } : { role: 'quit' },
      ],
    });

    template.push({
      label: '&Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    });

    template.push({
      label: '&View',
      submenu: [
        {
          label: 'Toggle WYSIWYG / Markdown',
          accelerator: 'CmdOrCtrl+/',
          click: () => this.send('toggle-mode'),
        },
        {
          label: 'WYSIWYG Mode',
          accelerator: 'CmdOrCtrl+1',
          click: () => this.send('toggle-wysiwyg'),
        },
        {
          label: 'Markdown Mode',
          accelerator: 'CmdOrCtrl+2',
          click: () => this.send('toggle-markdown'),
        },
        { type: 'separator' },
        {
          label: 'Toggle Folder Sidebar',
          accelerator: 'CmdOrCtrl+B',
          click: () => this.send('toggle-sidebar'),
        },
        {
          label: 'Spell Check',
          type: 'checkbox',
          checked: spellcheckEnabled,
          click: (item) => this.send('toggle-spellcheck', { enabled: item.checked }),
        },
        {
          label: 'Sanitize HTML (safe mode)',
          type: 'checkbox',
          checked: this.recent.getSanitizer(),
          click: (item) => this.send('toggle-sanitizer', { enabled: item.checked }),
        },
        { type: 'separator' },
        {
          label: 'Appearance',
          submenu: this.buildThemeSubmenu(),
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    });

    template.push({
      label: '&Window',
      submenu: isMac
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }],
    });

    template.push({
      role: 'help',
      submenu: [
        {
          label: 'Markdown Guide',
          click: () => shell.openExternal('https://www.markdownguide.org/basic-syntax/'),
        },
      ],
    });

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
    return menu;
  }

  /** Rebuild the menu — called when recent list or spellcheck changes. */
  refresh(): void {
    this.build();
  }

  private buildThemeSubmenu(): MenuItemConstructorOptions[] {
    const current = this.recent.getTheme();
    const opts: Array<{ label: string; value: 'auto' | 'light' | 'dark'; accel?: string }> = [
      { label: 'Follow System', value: 'auto' },
      { label: 'Light', value: 'light' },
      { label: 'Dark', value: 'dark' },
    ];
    return opts.map((o) => ({
      label: o.label,
      type: 'radio',
      checked: current === o.value,
      click: () => this.send('set-theme', { theme: o.value }),
    }));
  }

  private buildRecentSubmenu(): MenuItemConstructorOptions[] {
    const paths = this.recent.list();
    if (paths.length === 0) {
      return [{ label: '(No recent files)', enabled: false }];
    }
    const items: MenuItemConstructorOptions[] = paths.map((p) => ({
      label: p,
      click: () => this.sendOpenRecent(p),
    }));
    items.push({ type: 'separator' });
    items.push({
      label: 'Clear Recent',
      click: () => this.send('clear-recent'),
    });
    return items;
  }

  private send(action: MenuAction, payload?: unknown): void {
    const w = this.focused();
    if (!w || w.isDestroyed()) return;
    w.webContents.send(IpcChannels.MenuAction, action, payload);
  }

  private sendOpenRecent(filePath: string): void {
    const w = this.focused();
    if (!w || w.isDestroyed()) return;
    w.webContents.send(IpcChannels.OpenRecentPath, filePath);
  }
}
