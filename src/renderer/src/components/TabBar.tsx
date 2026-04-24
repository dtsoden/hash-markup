import type { DocumentModel } from '../services/DocumentModel';

interface Props {
  tabs: readonly DocumentModel[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

export function TabBar({ tabs, activeId, onSelect, onClose, onNew }: Props) {
  return (
    <div className="tab-bar" role="tablist">
      <div className="tabs-scroll">
        {tabs.map((t) => {
          const active = t.id === activeId;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              className={`tab ${active ? 'active' : ''} ${t.isDirty ? 'dirty' : ''}`}
              onMouseDown={(e) => {
                // Middle-click closes, like VS Code.
                if (e.button === 1) {
                  e.preventDefault();
                  onClose(t.id);
                } else if (e.button === 0) {
                  onSelect(t.id);
                }
              }}
              title={t.filePath ?? t.fileName}
            >
              <span className="tab-dot" aria-hidden="true">
                {t.isDirty ? '•' : ''}
              </span>
              <span className="tab-name">{t.fileName}</span>
              <button
                type="button"
                className="tab-close"
                title="Close"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <button type="button" className="tab-new" title="New document (⌘N)" onClick={onNew}>
        +
      </button>
    </div>
  );
}
