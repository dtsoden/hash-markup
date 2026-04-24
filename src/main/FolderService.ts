import { dialog, BrowserWindow } from 'electron';
import { promises as fs, Dirent } from 'fs';
import path from 'path';

export interface FolderNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FolderNode[];
}

const MD_EXT = new Set(['.md', '.markdown', '.mdown', '.mkd']);
const IGNORED_DIRS = new Set(['node_modules', '.git', '.DS_Store', '.idea', '.vscode', 'dist', 'out', 'release']);

/**
 * Reads filesystem folder trees for the sidebar. Filters to markdown
 * files and common directories; skips obviously uninteresting folders.
 */
export class FolderService {
  async openDialog(window: BrowserWindow): Promise<FolderNode | null> {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return this.readTree(result.filePaths[0]);
  }

  async readTree(root: string, depth = 0): Promise<FolderNode> {
    const name = path.basename(root) || root;
    const node: FolderNode = { name, path: root, isDirectory: true, children: [] };
    if (depth > 6) return node;

    let entries: Dirent[];
    try {
      entries = (await fs.readdir(root, { withFileTypes: true })) as Dirent[];
    } catch {
      return node;
    }

    const dirs: FolderNode[] = [];
    const files: FolderNode[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const child = await this.readTree(path.join(root, entry.name), depth + 1);
        if (child.children && child.children.length > 0) dirs.push(child);
      } else if (entry.isFile()) {
        if (!MD_EXT.has(path.extname(entry.name).toLowerCase())) continue;
        files.push({
          name: entry.name,
          path: path.join(root, entry.name),
          isDirectory: false,
        });
      }
    }
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    node.children = [...dirs, ...files];
    return node;
  }
}
