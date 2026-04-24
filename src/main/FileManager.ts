import { dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'fs';
import path from 'path';
import type { OpenFileResult, SaveFileRequest, SaveFileResult } from '../shared/ipc-channels';
import type { RecentFiles } from './RecentFiles';

const MARKDOWN_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd'] },
  { name: 'All Files', extensions: ['*'] },
];

/**
 * Encapsulates all disk and native-dialog interactions for markdown files.
 * Owning this in one class keeps IPC handlers thin and file handling testable.
 */
export class FileManager {
  constructor(private readonly recent?: RecentFiles) {}

  async openWithDialog(window: BrowserWindow): Promise<OpenFileResult | null> {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: MARKDOWN_FILTERS,
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const opened = await this.readFile(result.filePaths[0]);
    await this.recent?.add(opened.filePath);
    return opened;
  }

  async readFile(filePath: string): Promise<OpenFileResult> {
    const content = await fs.readFile(filePath, 'utf-8');
    await this.recent?.add(filePath);
    return { filePath, content };
  }

  async save(window: BrowserWindow, request: SaveFileRequest): Promise<SaveFileResult | null> {
    const targetPath = request.filePath ?? (await this.promptSavePath(window));
    if (!targetPath) return null;
    await fs.writeFile(targetPath, request.content, 'utf-8');
    await this.recent?.add(targetPath);
    return { filePath: targetPath };
  }

  async saveAs(window: BrowserWindow, content: string): Promise<SaveFileResult | null> {
    const targetPath = await this.promptSavePath(window);
    if (!targetPath) return null;
    await fs.writeFile(targetPath, content, 'utf-8');
    await this.recent?.add(targetPath);
    return { filePath: targetPath };
  }

  private async promptSavePath(window: BrowserWindow): Promise<string | null> {
    const result = await dialog.showSaveDialog(window, {
      filters: MARKDOWN_FILTERS,
      defaultPath: 'Untitled.md',
    });
    if (result.canceled || !result.filePath) return null;
    return this.ensureMarkdownExtension(result.filePath);
  }

  private ensureMarkdownExtension(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    if (!ext) return `${filePath}.md`;
    return filePath;
  }
}
