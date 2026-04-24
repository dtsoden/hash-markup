import { BrowserWindow, dialog } from 'electron';
import { promises as fs } from 'fs';
import { marked } from 'marked';
import path from 'path';

/**
 * Renders markdown → HTML in a hidden BrowserWindow, then uses
 * Chromium's printToPDF. Gives users professional PDF output that
 * matches the WYSIWYG look rather than the raw source.
 */
export class PdfExporter {
  async export(parent: BrowserWindow, markdown: string, suggestedName: string): Promise<string | null> {
    const save = await dialog.showSaveDialog(parent, {
      defaultPath: suggestedName.replace(/\.(md|markdown|mdown|mkd)$/i, '.pdf') || 'document.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (save.canceled || !save.filePath) return null;

    const html = this.wrap(await marked.parse(markdown));
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
    });

    try {
      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const buffer = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'Letter',
        margins: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 },
      });
      const outPath = save.filePath.endsWith('.pdf') ? save.filePath : save.filePath + '.pdf';
      await fs.writeFile(outPath, buffer);
      return outPath;
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy();
    }
  }

  private wrap(body: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color:#222; line-height:1.6; max-width: 7.5in; margin: 0 auto; padding: 0.25in; font-size: 11pt; }
      h1,h2,h3,h4 { page-break-after: avoid; color:#111; }
      h1 { font-size: 22pt; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      h2 { font-size: 17pt; }
      pre, code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 9.5pt; }
      pre { background: #f5f5f7; padding: 10px; border-radius: 4px; overflow:auto; page-break-inside: avoid; }
      code { background: #f5f5f7; padding: 1px 4px; border-radius: 3px; }
      pre code { background: transparent; padding: 0; }
      blockquote { border-left: 3px solid #ccc; margin: 0; padding: 4px 12px; color: #555; }
      table { border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 6px 10px; }
      th { background: #f5f5f7; }
      img { max-width: 100%; }
      a { color: #2563eb; }
    </style></head><body>${body}</body></html>`;
  }

  suggestedName(filePath: string | null): string {
    return filePath ? path.basename(filePath) : 'Untitled.md';
  }
}
