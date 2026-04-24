import { useState } from 'react';
import type { FolderNode } from '../../../preload';

interface Props {
  root: FolderNode | null;
  activePath: string | null;
  onSelect: (path: string) => void;
  onOpenFolder: () => void;
  onClose: () => void;
}

export function Sidebar({ root, activePath, onSelect, onOpenFolder, onClose }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span>Folder</span>
        <div className="sidebar-actions">
          <button type="button" onClick={onOpenFolder} title="Open folder">📁</button>
          <button type="button" onClick={onClose} title="Hide sidebar">×</button>
        </div>
      </div>
      <div className="sidebar-body">
        {!root ? (
          <div className="sidebar-empty">
            <p>No folder open.</p>
            <button type="button" onClick={onOpenFolder}>Open Folder…</button>
          </div>
        ) : (
          <TreeNode node={root} activePath={activePath} onSelect={onSelect} depth={0} />
        )}
      </div>
    </aside>
  );
}

interface TreeProps {
  node: FolderNode;
  activePath: string | null;
  onSelect: (path: string) => void;
  depth: number;
}

function TreeNode({ node, activePath, onSelect, depth }: TreeProps) {
  const [open, setOpen] = useState(depth < 1);

  if (!node.isDirectory) {
    const isActive = activePath === node.path;
    return (
      <div
        className={`tree-file ${isActive ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => onSelect(node.path)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSelect(node.path);
        }}
      >
        📄 {node.name}
      </div>
    );
  }

  return (
    <div className="tree-dir">
      <div
        className="tree-dir-label"
        style={{ paddingLeft: 4 + depth * 12 }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`chevron ${open ? 'open' : ''}`}>▸</span> {node.name}
      </div>
      {open && node.children?.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          activePath={activePath}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
