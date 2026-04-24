import Store from 'electron-store';
import { BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import { IpcChannels } from '../shared/ipc-channels';

const MAX = 10;

export type ThemePref = 'auto' | 'light' | 'dark';

interface Schema {
  recent: string[];
  spellcheckEnabled: boolean;
  theme: ThemePref;
  sanitizerEnabled: boolean;
}

/**
 * Persistent recent-files list and spellcheck preference.
 * Stored in the OS user-data directory via electron-store.
 */
export class RecentFiles {
  private store = new Store<Schema>({
    defaults: {
      recent: [],
      spellcheckEnabled: true,
      theme: 'auto',
      // Safe default: sanitize HTML. Users flip this off to unlock
      // color-syntax / chart / UML plugins that write raw HTML.
      sanitizerEnabled: true,
    },
  });
  private changeListeners = new Set<(list: string[]) => void>();

  onChange(cb: (list: string[]) => void): () => void {
    this.changeListeners.add(cb);
    return () => this.changeListeners.delete(cb);
  }

  list(): string[] {
    return this.store.get('recent');
  }

  async add(filePath: string): Promise<string[]> {
    const current = this.list().filter((p) => p !== filePath);
    current.unshift(filePath);
    const trimmed = current.slice(0, MAX);
    this.store.set('recent', trimmed);
    this.broadcast();
    return trimmed;
  }

  async prune(): Promise<string[]> {
    const existing: string[] = [];
    for (const p of this.list()) {
      try {
        await fs.access(p);
        existing.push(p);
      } catch {
        // file is gone — drop it
      }
    }
    if (existing.length !== this.list().length) {
      this.store.set('recent', existing);
      this.broadcast();
    }
    return existing;
  }

  clear(): void {
    this.store.set('recent', []);
    this.broadcast();
  }

  getSpellcheck(): boolean {
    return this.store.get('spellcheckEnabled');
  }

  setSpellcheck(enabled: boolean): void {
    this.store.set('spellcheckEnabled', enabled);
  }

  getTheme(): ThemePref {
    return this.store.get('theme');
  }

  setTheme(theme: ThemePref): void {
    this.store.set('theme', theme);
    for (const cb of this.changeListeners) cb(this.list());
  }

  getSanitizer(): boolean {
    return this.store.get('sanitizerEnabled');
  }

  setSanitizer(enabled: boolean): void {
    this.store.set('sanitizerEnabled', enabled);
    for (const cb of this.changeListeners) cb(this.list());
  }

  private broadcast(): void {
    const list = this.list();
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(IpcChannels.RecentChanged, list);
    }
    for (const cb of this.changeListeners) cb(list);
  }
}
