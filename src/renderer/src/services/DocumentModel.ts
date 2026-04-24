export type DocumentChangeListener = (doc: DocumentModel) => void;

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx === -1 ? p : p.slice(idx + 1);
}

let nextId = 1;

/**
 * A single open document. A TabManager owns a list of these; the editor
 * binds to whichever is active. Uses a simple observer list so the same
 * model can be consumed from React or from any other UI layer.
 */
export class DocumentModel {
  readonly id: string;
  private _content: string;
  private _savedContent: string;
  private _filePath: string | null;
  private _loadVersion = 0;
  private listeners = new Set<DocumentChangeListener>();

  constructor(opts: { filePath?: string | null; content?: string } = {}) {
    this.id = `doc-${nextId++}`;
    this._content = opts.content ?? '';
    this._savedContent = this._content;
    this._filePath = opts.filePath ?? null;
  }

  get content(): string {
    return this._content;
  }

  get filePath(): string | null {
    return this._filePath;
  }

  get fileName(): string {
    return this._filePath ? basename(this._filePath) : 'Untitled.md';
  }

  get isDirty(): boolean {
    return this._content !== this._savedContent;
  }

  get loadVersion(): number {
    return this._loadVersion;
  }

  setContent(next: string): void {
    if (next === this._content) return;
    this._content = next;
    this.emit();
  }

  load(filePath: string, content: string): void {
    this._filePath = filePath;
    this._content = content;
    this._savedContent = content;
    this._loadVersion++;
    this.emit();
  }

  markSaved(filePath: string): void {
    this._filePath = filePath;
    this._savedContent = this._content;
    this.emit();
  }

  subscribe(listener: DocumentChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l(this);
  }
}
