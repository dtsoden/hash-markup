import { DocumentModel } from './DocumentModel';

export type TabsChangeListener = (mgr: TabManager) => void;

/**
 * Owns the list of open documents (tabs) and which one is active.
 * Exposes a tiny imperative API + subscribe() so React can bind with
 * useSyncExternalStore and non-React code can drive it too.
 */
export class TabManager {
  private _tabs: DocumentModel[] = [];
  private _activeId: string | null = null;
  private listeners = new Set<TabsChangeListener>();

  get tabs(): readonly DocumentModel[] {
    return this._tabs;
  }

  get activeId(): string | null {
    return this._activeId;
  }

  get active(): DocumentModel | null {
    return this._tabs.find((t) => t.id === this._activeId) ?? null;
  }

  /** Ensures at least one tab exists, returning the active one. */
  ensure(): DocumentModel {
    if (this._tabs.length === 0) return this.createBlank();
    return this.active ?? this._tabs[0];
  }

  createBlank(): DocumentModel {
    const doc = new DocumentModel();
    this._tabs.push(doc);
    this._activeId = doc.id;
    this.emit();
    return doc;
  }

  /** If the file is already open, focus it; otherwise add as a new tab. */
  openLoaded(filePath: string, content: string): DocumentModel {
    const existing = this._tabs.find((t) => t.filePath === filePath);
    if (existing) {
      existing.load(filePath, content);
      this._activeId = existing.id;
      this.emit();
      return existing;
    }
    // Replace a pristine blank "Untitled" if that's all we have.
    const blank = this._tabs.find((t) => t.filePath === null && !t.isDirty);
    if (blank && this._tabs.length === 1) {
      blank.load(filePath, content);
      this._activeId = blank.id;
      this.emit();
      return blank;
    }
    const doc = new DocumentModel({ filePath, content });
    this._tabs.push(doc);
    this._activeId = doc.id;
    this.emit();
    return doc;
  }

  setActive(id: string): void {
    if (!this._tabs.some((t) => t.id === id)) return;
    if (this._activeId === id) return;
    this._activeId = id;
    this.emit();
  }

  close(id: string): boolean {
    const idx = this._tabs.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    const doc = this._tabs[idx];
    if (doc.isDirty && !window.confirm(`Discard unsaved changes to ${doc.fileName}?`)) {
      return false;
    }
    this._tabs.splice(idx, 1);
    if (this._activeId === id) {
      const next = this._tabs[idx] ?? this._tabs[idx - 1] ?? null;
      this._activeId = next?.id ?? null;
    }
    this.emit();
    return true;
  }

  subscribe(cb: TabsChangeListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Call when a tab's internal state changed (e.g. content, dirty flag). */
  notifyDocChanged(): void {
    this.emit();
  }

  private emit(): void {
    for (const l of this.listeners) l(this);
  }
}
