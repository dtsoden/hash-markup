import { useEffect, useMemo, useState } from 'react';
import { TabManager } from './services/TabManager';
import { useTabs } from './hooks/useTabs';
import { MarkdownEditor, type EditorMode } from './components/MarkdownEditor';
import { Toolbar } from './components/Toolbar';
import { TabBar } from './components/TabBar';
import { Sidebar } from './components/Sidebar';
import { EmptyState } from './components/EmptyState';
import type { MenuAction } from '../../shared/ipc-channels';
import type { FolderNode } from '../../preload';

export type { EditorMode };

export function App() {
  const tabs = useMemo(() => {
    const mgr = new TabManager();
    mgr.createBlank();
    return mgr;
  }, []);
  const snap = useTabs(tabs);

  const [mode, setMode] = useState<EditorMode>('wysiwyg');
  const [folder, setFolder] = useState<FolderNode | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [spellcheck, setSpellcheck] = useState(true);
  const [sanitize, setSanitize] = useState(true);
  const [themePref, setThemePref] = useState<'auto' | 'light' | 'dark'>('auto');
  const [osDark, setOsDark] = useState(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const isDark = themePref === 'auto' ? osDark : themePref === 'dark';

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent): void => setOsDark(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-dark', isDark);
    root.classList.toggle('theme-light', !isDark);
  }, [isDark]);

  useEffect(() => {
    window.api.getSpellcheck().then(setSpellcheck);
    window.api.getTheme().then(setThemePref);
    window.api.getSanitizer().then(setSanitize);
  }, []);

  const openPath = async (p: string): Promise<void> => {
    const result = await window.api.openFileByPath(p);
    tabs.openLoaded(result.filePath, result.content);
  };

  const openDialog = async (): Promise<void> => {
    const result = await window.api.openFile();
    if (result) tabs.openLoaded(result.filePath, result.content);
  };

  const openFolder = async (): Promise<void> => {
    const tree = await window.api.openFolder();
    if (tree) {
      setFolder(tree);
      setSidebarOpen(true);
    }
  };

  const saveActive = async (): Promise<void> => {
    const doc = tabs.active;
    if (!doc) return;
    const result = await window.api.saveFile({ filePath: doc.filePath, content: doc.content });
    if (result) doc.markSaved(result.filePath);
  };

  const saveActiveAs = async (): Promise<void> => {
    const doc = tabs.active;
    if (!doc) return;
    const result = await window.api.saveFileAs(doc.content);
    if (result) doc.markSaved(result.filePath);
  };

  const exportPdf = async (): Promise<void> => {
    const doc = tabs.active;
    if (!doc) return;
    const result = await window.api.exportPdf({ content: doc.content, fileName: doc.fileName });
    if (result) alert(`Exported to ${result}`);
  };

  useEffect(() => {
    const offMenu = window.api.onMenuAction((action: MenuAction, payload?: unknown) => {
      switch (action) {
        case 'new': tabs.createBlank(); break;
        case 'open': openDialog(); break;
        case 'open-folder': openFolder(); break;
        case 'close-doc': if (snap.activeId) tabs.close(snap.activeId); break;
        case 'save': saveActive(); break;
        case 'save-as': saveActiveAs(); break;
        case 'export-pdf': exportPdf(); break;
        case 'toggle-mode': setMode((m) => (m === 'wysiwyg' ? 'markdown' : 'wysiwyg')); break;
        case 'toggle-wysiwyg': setMode('wysiwyg'); break;
        case 'toggle-markdown': setMode('markdown'); break;
        case 'toggle-sidebar': setSidebarOpen((v) => !v); break;
        case 'toggle-spellcheck': {
          const next = (payload as { enabled?: boolean } | undefined)?.enabled ?? !spellcheck;
          setSpellcheck(next);
          window.api.setSpellcheck(next);
          break;
        }
        case 'toggle-sanitizer': {
          const next = (payload as { enabled?: boolean } | undefined)?.enabled ?? !sanitize;
          setSanitize(next);
          window.api.setSanitizer(next);
          break;
        }
        case 'set-theme': {
          const next = (payload as { theme?: 'auto' | 'light' | 'dark' } | undefined)?.theme;
          if (next) { setThemePref(next); window.api.setTheme(next); }
          break;
        }
        case 'clear-recent': window.api.recentClear(); break;
      }
    });
    const offRecent = window.api.onOpenRecentPath(openPath);
    const offInitial = window.api.onInitialFile(openPath);
    return () => { offMenu(); offRecent(); offInitial(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, snap.activeId, spellcheck, sanitize]);

  useEffect(() => {
    const name = snap.active?.fileName ?? 'Hash Markup';
    const dirty = snap.active?.isDirty ? '• ' : '';
    document.title = `${dirty}${name} — Hash Markup`;
  }, [snap.active, snap.active?.fileName, snap.active?.isDirty]);

  const handleEditorChange = (next: string): void => {
    snap.active?.setContent(next);
  };

  return (
    <div className={`app ${sidebarOpen ? 'with-sidebar' : ''}`} spellCheck={spellcheck}>
      <Toolbar
        mode={mode}
        onNew={() => tabs.createBlank()}
        onOpen={openDialog}
        onSave={saveActive}
        onModeChange={setMode}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        sidebarOpen={sidebarOpen}
      />
      <TabBar
        tabs={tabs.tabs}
        activeId={snap.activeId}
        onSelect={(id) => tabs.setActive(id)}
        onClose={(id) => tabs.close(id)}
        onNew={() => tabs.createBlank()}
      />
      {sidebarOpen && (
        <Sidebar
          root={folder}
          activePath={snap.activeFilePath}
          onSelect={openPath}
          onOpenFolder={openFolder}
          onClose={() => setSidebarOpen(false)}
        />
      )}
      <main className="editor-container">
        {snap.active ? (
          <MarkdownEditor
            key={`${snap.activeId}-v${snap.activeLoadVersion}-${isDark ? 'd' : 'l'}-${sanitize ? 's' : 'u'}`}
            initialValue={snap.activeContent}
            mode={mode}
            dark={isDark}
            sanitize={sanitize}
            onChange={handleEditorChange}
          />
        ) : (
          <EmptyState onNew={() => tabs.createBlank()} onOpen={openDialog} />
        )}
      </main>
      <footer className="status-bar">
        <span>{mode === 'wysiwyg' ? 'WYSIWYG' : 'Markdown'}</span>
        <span>Spell: {spellcheck ? 'on' : 'off'}</span>
        <span>HTML: {sanitize ? 'safe' : 'raw'}</span>
        <span>{snap.activeContent.length} chars</span>
        <span>{snap.activeFilePath ?? 'Not saved'}</span>
      </footer>
    </div>
  );
}
