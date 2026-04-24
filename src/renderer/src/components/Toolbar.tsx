import type { EditorMode } from './MarkdownEditor';

interface Props {
  mode: EditorMode;
  sidebarOpen: boolean;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onModeChange: (mode: EditorMode) => void;
  onToggleSidebar: () => void;
}

export function Toolbar({
  mode,
  sidebarOpen,
  onNew,
  onOpen,
  onSave,
  onModeChange,
  onToggleSidebar,
}: Props) {
  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <button
          type="button"
          onClick={onToggleSidebar}
          title="Toggle folder sidebar"
          className={sidebarOpen ? 'active' : ''}
        >
          ☰
        </button>
        <button type="button" onClick={onNew} title="New (⌘N)">New</button>
        <button type="button" onClick={onOpen} title="Open (⌘O)">Open</button>
        <button type="button" onClick={onSave} title="Save (⌘S)">Save</button>
      </div>
      <div className="toolbar-right" role="tablist" aria-label="Editor mode">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'wysiwyg'}
          className={mode === 'wysiwyg' ? 'active' : ''}
          onClick={() => onModeChange('wysiwyg')}
        >
          WYSIWYG
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'markdown'}
          className={mode === 'markdown' ? 'active' : ''}
          onClick={() => onModeChange('markdown')}
        >
          Markdown
        </button>
      </div>
    </header>
  );
}
