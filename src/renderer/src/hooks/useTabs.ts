import { useSyncExternalStore } from 'react';
import type { TabManager } from '../services/TabManager';
import type { DocumentModel } from '../services/DocumentModel';

export interface TabSnapshot {
  tabs: readonly { id: string; fileName: string; isDirty: boolean; filePath: string | null }[];
  activeId: string | null;
  active: DocumentModel | null;
  activeContent: string;
  activeFilePath: string | null;
  activeIsDirty: boolean;
  activeLoadVersion: number;
}

let cached: { src: TabManager; value: TabSnapshot } | null = null;

function take(mgr: TabManager): TabSnapshot {
  const tabs = mgr.tabs.map((t) => ({
    id: t.id,
    fileName: t.fileName,
    isDirty: t.isDirty,
    filePath: t.filePath,
  }));
  const active = mgr.active;
  const next: TabSnapshot = {
    tabs,
    activeId: mgr.activeId,
    active,
    activeContent: active?.content ?? '',
    activeFilePath: active?.filePath ?? null,
    activeIsDirty: active?.isDirty ?? false,
    activeLoadVersion: active?.loadVersion ?? 0,
  };
  if (
    cached &&
    cached.src === mgr &&
    cached.value.activeId === next.activeId &&
    cached.value.tabs.length === next.tabs.length &&
    cached.value.activeContent === next.activeContent &&
    cached.value.activeIsDirty === next.activeIsDirty &&
    cached.value.activeLoadVersion === next.activeLoadVersion &&
    cached.value.tabs.every(
      (t, i) =>
        t.id === next.tabs[i].id &&
        t.fileName === next.tabs[i].fileName &&
        t.isDirty === next.tabs[i].isDirty,
    )
  ) {
    return cached.value;
  }
  cached = { src: mgr, value: next };
  return next;
}

/**
 * React binding for TabManager. Subscribes to the manager AND to each doc
 * individually so dirty/filename/content changes re-render the UI.
 */
export function useTabs(mgr: TabManager): TabSnapshot {
  return useSyncExternalStore(
    (cb) => {
      const offMgr = mgr.subscribe(() => cb());
      const offDocs = mgr.tabs.map((t) => t.subscribe(() => cb()));
      return () => {
        offMgr();
        offDocs.forEach((f) => f());
      };
    },
    () => take(mgr),
    () => take(mgr),
  );
}
